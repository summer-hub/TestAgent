# Automation Analysis

Name: `automation-analysis`
Description: 分析 HarmonyOS 应用自动化测试中「可自动化验证」的三层判定模型，指导 .xlsx 中「可自动化验证」列的填写。

---

## When to Use

- 评估测试用例能否通过代码自动验证时
- 分析 `uitest`／`HDC` 工具的自动化能力边界时
- 判定「预期结果」的验证手段时
- 编写测试套件、区分全自动/半自动/手动用例时

---

## 三层判定模型

### Layer 1: UI 结构可见性（能否读到）

**能自动验证的：**
- 页面标题文本（`Text("xxx")`）
- 按钮标签（`Button($r('app.string.xxx'))` → 在 UI Dump 中解析为可读文本）
- 列表项内容（`ListItem` → `Text`）
- 状态文本（`@State statusText` 的值）
- 滑块数值（`Text(this.radius.toString())`）
- Image 占位区域（存在像素数据）

**验证方式：** `uitest dumpLayout -b ${PACKAGE_NAME}` → JSON 树 → `attributes.text`

### Layer 2: 可操作性（能否 UI 交互）

| 操作 | HDC 命令 | 可靠性 | 备注 |
|------|----------|--------|------|
| 列表项导航 | `uitest uiInput click ${cx} ${cy}` | ✅ 可靠 | ListItem/Row clickable=true |
| 按钮点击 | `uitest uiInput click ${cx} ${cy}` | ✅ 可靠（Phase 1 已修复） | 必须用 `uitest` 而非 `input` 命令 |
| 滑块拖动 | `uitest uiInput swipe ...` | ❌ 不可靠 | 需 Phase 3 RPC 协议调用 `Slider.setProgress()` |
| 输入文本 | `uitest uiInput text "xxx"` | ✅ 可靠 | |
| 返回键 | `uitest uiInput keyEvent Back` | ✅ 可靠 | |
| 截图 | `snapshot_display` | ✅ 可靠 | 返回 JPEG |

**原因分析（基于 hypium Python 框架解读）：**

Python hypium 框架的 `UiComponent.click()` 通过 `hypium_rpc`（RPC 协议）调用设备端 `uitest` 代理，直接执行 ArkUI 组件上的 `click()` 方法。这绕过了触摸事件注入，直接触发 `Button.onClick` 回调。

我们的 TS HypiumDriver 仅通过 HDC shell 注入坐标触摸事件，不实现 RPC 协议。

### Layer 3: 预期结果断言（能否验证）

| 断言类型 | 方法 | 可自动 |
|----------|------|--------|
| 文本匹配 | `getUiTexts().some(t => t.includes('xxx'))` | ✅ 是 |
| 图片非空 | 截图 Base64 长度 > 0 | ✅ 是 |
| 文件存在 | `hdc shell ls ${path}` | ✅ 是 |
| 模糊效果 | 截图前后像素对比（PSNR/SSIM） | ⚠ 部分（需 opencv） |
| 性能耗时 | 读取状态文本中的毫秒数 | ✅ 是 |
| 边界行为 | 检测 "null"/"提前返回" 等文本 | ✅ 是 |
| 视觉一致性 | Qwen3-VL-Flash 截图分析 | ⚠ 部分 |

---

---

## 测试脚本编写规范

### 规范 1：冷启动 — 脚本最开头必须先 kill 再 launch

**为什么：** 保证每次测试从干净的冷状态开始，避免：
- 上一次测试留下的状态/弹窗干扰
- 页面缓存导致 UI 结构变化
- `@State` 变量遗留值影响预期结果判断

**标准写法：**

```typescript
// 脚本入口第一步：冷启动
await hdc('shell aa force-stop com.example.stackblur');
await sleep(1000);
await hdc('shell aa start -b com.example.stackblur');
await sleep(3000);

// 第二步：关闭启动可能出现的系统弹窗
await hdc('shell uitest uiInput keyEvent Back');
await sleep(500);

// 开始测试...
```

**在 HypiumDriver 中的实现建议：**
```typescript
// 自定义冷启动方法
async coldStart(bundleName: string, abilityName?: string): Promise<void> {
  await this.stopApp(bundleName);               // force-stop
  await this.sleep(1000);                        // 等进程彻底退出
  await this.startApp(bundleName, abilityName);  // aa start
  await this.sleep(2000);                        // 等页面渲染
  // 尝试关闭系统弹窗
  await this.pressBack();
  await this.sleep(500);
}
```

### 规范 2：每步操作后显式等待

```
click → sleep(500~1000) → assert
swipe → sleep(800~1200) → assert
```

避免直接用固定大延时（如 `sleep(5000)`），改用 `waitForElement()` + 短延时兜底。

### 规范 3：全链路超时报错

每个 `sleep`/`waitForElement`/`executeCommand` 都应设定超时（默认 10s），超时即失败并截图保存现场。

---

## 自愈修复系统（项目已有）

`ai-test-agent-ts` 项目内置了一套完整的自愈修复引擎，位于 `src/fixer/`：

### 架构

```
测试失败
  → ErrorClassifier（分类：40+ 正则 × 8 种失败类型）
  → FailureDiagnoser（诊断：匹配错误文本）
  → FixDecisionEngine（决策：加权评分选择最佳策略）
  → FixExecutor（执行：按策略修复并重试）
```

### 5 种修复策略

| 策略 | 触发场景 | 行为 |
|------|----------|------|
| `RESTART_APP` | 应用崩溃/ANR/状态异常 | `force-stop` → 等待 3s → `startApp` → 重试 |
| `RETRY` | 网络错误/瞬态失败 | 直接重试上一次操作 |
| `WAIT_AND_RETRY` | 元素未出现/超时 | 梯度等待 [1s, 2s, 5s] → 每次重试 |
| `SCROLL_AND_RETRY` | 元素在视口外 | 滚动到元素坐标 → 重试 |
| `ALTERNATIVE_LOCATOR` | 选择器未找到 | 3 级降级链：Text → ID → XPath |

### 设备级弹性

- **连接池**：多连接管理 + 健康检查（60s ping）+ 空闲回收（5min）
- **心跳监控**：30s ping，3 次失败自动重连
- **状态机**：`ERROR → CONNECTING` 自动重连路径
- **断言自动重试**：所有 7 种 `assert*` 方法默认 3 次重试

### 使用方式

```typescript
import { FixExecutor } from '../src/fixer/executor/fix-executor';

const fixer = new FixExecutor(driver, mcpClient);
const result = await fixer.execute({
  error: 'ElementNotFound: 性能对比',
  observation: '页面状态: StackBlur Demo',
  locator: { type: 'text', value: '性能对比' },
});
// result.fixed = true/false, result.strategy = 'WAIT_AND_RETRY'
```

---

## 判定流程

```
源码分析 → 提取 @State/Button/Slider/statusText
     │
     ▼
对每个测试用例依次检查：
  ├─ 前置条件能否 HDC 完成？
  │   └─ 否 → 标记 "否"
  ├─ 步骤是否依赖 Button.onClick？
  │   └─ 是 → 标记 "部分"（需 RPC 协议）
  ├─ 步骤是否依赖 Slider 拖动？
  │   └─ 是 → 标记 "部分"（需 RPC 协议）
  ├─ 预期结果是否 == 文本匹配？
  │   └─ 是 → 标记 "是"
  ├─ 预期结果是否 == 图片变化？
  │   └─ 是 → 标记 "部分"
  └─ 其他 → 标记 "否"
```

---

## HarmonyOS 6.1.0 已知限制

| 限制 | 影响 | 解决方案 |
|------|------|----------|
| `uitest uiInput click` 不触发 Button.onClick | 按钮交互测试不可靠 | 改用坐标点击 + 后续期待 RPC 协议 |
| `uitest` 无 Slider.setProgress | 滑块无法程序化设置 | 暂用拖拽模拟 (`swipe` + 坐标精度) |
| `snapshot_display` 格式为 JPEG | 截图有损 | 接受 JPEG，PSNR 时降低阈值 |
| `uitest` 视口外元素无 bounds | Scroll 容器内不可点击 | `scrollToElement` 先滚至视图再操作 |
| `bm dump -a` 无法区分系统/第三方 | 批量查询需逐个解析 | `AppManager.listApps()` 按包名前缀启发式过滤 |

---

## Python hypium vs TS Hypium 能力对比

| 能力 | Python hypium | TS Hypium (当前) |
|------|---------------|-------------------|
| RPC 协议调用组件方法 | ✅ `do_hypium_rpc` | ⚠ shell 命令替代 (Phase 3) |
| 组件级 click（触 onClick） | ✅ `UiComponent.click()` | ⚠ 坐标点击 + `uitest uiInput click` |
| PointerMatrix 多点触控 | ✅ 支持 | ✅ `PointerMatrix` 类 + `GestureBuilder.pinchIn/Out/Rotate()` |
| Gesture 构建器 | ✅ 支持 | ✅ `GestureBuilder` 流式 API (Phase 4) |
| `waitForComponent` 超时 | ✅ 支持 | ✅ `HypiumDriver.waitForComponent()` 轮询 |
| 多策略组件查找 | ✅ uitree+uitest | ✅ `By.text/id/clickable` 复合选择器 (Phase 2) |
| App 信息解析 | ✅ bm dump + hap 解压 | ✅ `AppManager.getAppInfo()` 完整 JSON 解析 (Phase 5) |
| App 生命周期 | ✅ aa start/force-stop | ✅ `AppManager.start/stop/restart/clearData` (Phase 5) |
| 滑动/拖拽 | ✅ Gesture API | ✅ `HypiumDriver.swipe()` + `GestureBuilder.swipe/drag` |
| 截图 | ✅ snapshot_display | ✅ `HypiumDriver.takeScreenshot()` → JPEG Buffer |
| UI 树解析 | ✅ uiautomator/uitest | ✅ `uitest dumpLayout` → JSON → `UiTree` (Phase 2) |
| CI/CD 集成 | ❌ 无 | ✅ GitHub Actions + 飞书通知 + E2E 测试 (Phase 6) |
