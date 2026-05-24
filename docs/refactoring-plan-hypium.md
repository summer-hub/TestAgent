# Hypium TS 重构计划

## 背景

当前 `src/hypium/` 中 `HypiumDriver` 使用 Android 兼容命令（`shell input tap`、`shell uiautomator dump`），在 HarmonyOS 6.1.0 上：
- **Button.onClick 不触发**：因为 `shell input tap` 是触控坐标注入，不经过 ArkUI 的 Button 事件分发
- **Slider 无法拖动**：没有调用 `Slider.setProgress()` 的接口
- **UI 树不兼容**：`uiautomator dump` 在 OHOS 上不存在

Python hypium 框架通过 **hypium_rpc** 解决这些问题：它向设备上的 `uitest` 代理发送 JSON-RPC 请求，直接调用 ArkUI 组件方法。

## Python hypium RPC 架构

```
测试脚本 (Python)
  → hypium_rpc (JSON-RPC over HDC proxy)
    → 设备端 proxy agent (port 8012)
      → ArkUiDriver / UiComponent
        → ArkUI 运行时 API
```

RPC 消息格式：
```json
{
  "module": "com.ohos.devicetest.hypiumApiHelper",
  "method": "callHypiumApi",
  "params": { "apiName": "UiDriver.waitForComponent", ... },
  "request_id": "20230523143000000000"
}
```

## 分步计划

### Phase 1: 命令层修复（低风险，当前可用）
修复现有 HDC 命令，让基本功能在 HarmonyOS 6.1.0 上跑通。

| 当前命令 | 应改为 | 文件 |
|----------|--------|------|
| `shell input tap x y` | `shell uitest uiInput click x y` | `hypium-driver.ts:click()` |
| `shell input swipe x1 y1 x2 y2 t` | `shell uitest uiInput swipe x1 y1 x2 y2 t` | `hypium-driver.ts:swipe()` |
| `shell uiautomator dump` | `shell uitest dumpLayout -p /tmp/dump.json -b pkg` | `hypium-driver.ts:getUiTree()` |
| `shell screencap -p` | `shell snapshot_display -f /tmp/ss.jpg` | `hypium-driver.ts:takeScreenshot()` |

### Phase 2: 组件查找（中风险）
`uitest dumpLayout` JSON 解析器替代 Android `uiautomator` XML 解析。

OHOS 格式：
```json
{ "attributes": { "text": "xxx", "clickable": true, "bounds": "[0,0][100,50]" }, "children": [...] }
```

### Phase 3: RPC 协议层（高风险，核心）[需 HAP agent 框架 — 搁置]
> **协议已完全逆向**（基于 xdevice 5.0.7 + devicetest + ohos 源码分析）。
> 协议为**纯文本 JSON**（非二进制），`hdc fport` 可用，TCP 可连接。
> 限制: 设备端 `com.ohos.devicetest` ServiceAbility HAP 未启动，
> agent 收到 JSON 消息后立即关闭连接 (ECONNRESET)。
> 独立 TS 驱动难以复制 xdevice 框架的 HAP agent 部署流程。
> 所有 RPC 能力通过 shell `uitest` 命令已有完全替代（见下）。

**协议规范（三层架构）：**

```
[hypium] 内层:    { api, this, args, message_type }
[hypium] 外层:    { module, method, params:<内层>, request_id }
[rpc_for_hypium]: 添加 call:"xdevice"
[_safe_send]:     添加 client:"127.0.0.1"
[_send]:
  bin 模式 → JSON + '\n'
  hap 模式 → "1" + JSON + '\n'
```

**进度：**
1. `hdc fport tcp:PORT tcp:8012` — ✅ 语法: `fport tcp:LOCAL tcp:REMOTE`
2. TCP 连接 — ✅
3. JSON 发送 — ✅ 格式正确
4. 设备回复 — ❌ ECONNRESET（需 xdevice 框架部署 HAP agent）
5. 协议规范 — ✅ `src/hypium/rpc/hypium-rpc.ts` 完整文档 + 常量

**当前替代方案（全部可用）：**

| RPC 能力 | 替代方式 | 状态 |
|----------|---------|------|
| UiComponent.click() | `uitest uiInput click x y` | ✅ Phase 1 |
| UiComponent.getText() | UI dump JSON → `element.text` | ✅ Phase 2 |
| UiComponent.getBounds() | UI dump JSON → `element.bounds` | ✅ Phase 2 |
| UiDriver.waitForComponent() | `getUiTree()` + findElement 轮询 | ✅ Phase 2 |
| UiComponent.scrollTo() | `uitest uiInput swipe` 滚动 | ✅ Phase 1 |
| UiComponent.longClick() | `uitest uiInput swipe x y x y t` | ✅ Phase 1 |
| Slider.setProgress() | `uitest uiInput swipe` 拖动滑块 + GestureBuilder | ✅ Phase 4 |

### Phase 4: Gesture + PointerMatrix（已完成 ✅）
多点触控手势：swipe/drag/pinch/rotate，通过 shell uitest 命令实现。

**交付成果：**

| 文件 | 作用 |
|------|------|
| `src/hypium/gesture/pointer-matrix.ts` | PointerMatrix 多指矩阵 + createPinchMatrix / createRotateMatrix |
| `src/hypium/gesture/gesture-builder.ts` | GestureBuilder 流式动作链 API（tap/swipe/longPress/pinch/rotate/pressBack/...） |
| `src/hypium/gesture/index.ts` | 模块导出 |

**Drivers 更新：**
- `GestureType.PINCH_OUT` + `GestureType.ROTATE` 新枚举值
- `HypiumDriver._ohosPinch()` 增强：可配 steps、pinchOut 支持
- `HypiumDriver._ohosRotate()` 新增：16 步双指旋转模拟
- `HypiumDriver.executeCommand()` protected → GestureBuilder 可访问

**手势能力：**

| 手势 | 实现 | 方法 |
|------|------|------|
| 单击 | `uitest uiInput click` | `HypiumDriver.click()` |
| 双击 | 两次 click+120ms | `HypiumDriver.doubleClick()` |
| 长按 | 0 长度 swipe + duration | `HypiumDriver.longClick()` |
| 滑动 | `uitest uiInput swipe` | `HypiumDriver.swipe()` |
| 拖拽 | swipe 500ms | `HypiumDriver.gesture(DRAG)` |
| 捏合缩小 | 8 步双指 swipe → 中心 | `GestureBuilder.pinchIn()` |
| 捏合放大 | 8 步双指 swipe ← 中心 | `GestureBuilder.pinchOut()` |
| 旋转 | 16 步双指轨迹插值 | `GestureBuilder.rotate()` |
| 动作链 | GestureBuilder 流式组合 | `GestureBuilder.create().tap().wait().swipe().execute()` |

**验证：** `scripts/verify-phase4.ts` — 所有手势 14/14 测试通过 ✅

### Phase 5: App Manager（已完成 ✅）
bm dump、hap 信息解析、Ability 自动检测。

**交付成果：**

| 文件 | 作用 |
|------|------|
| `src/core/types/app-info.type.ts` | AppInfo / AbilityInfo / HapModuleInfo / AppProcessStatus 等类型 |
| `src/hypium/app/app-manager.ts` | AppManager 类：应用信息查询、生命周期、安装/卸载、运行状态 |
| `scripts/verify-phase5.ts` | 全链路验证脚本 |

**AppManager API：**

| 方法 | 底层命令 | 功能 |
|------|---------|------|
| `getAppInfo(bundle)` | `bm dump -n` | 解析完整 JSON → AppInfo |
| `listApps(query)` | `bm dump -a` + 并发 | 列出第三方/系统应用 |
| `start(bundle, ability?)` | `aa start -a -b` | 启动应用 (自动检测 mainAbility) |
| `stop(bundle)` | `aa force-stop` | 停止应用 |
| `restart(bundle)` | stop + start | 重启应用 |
| `clearData(bundle)` | `pm clear` | 清除应用数据 |
| `getAppStatus(bundle)` | `ps -ef` + `aa dump -f` | 检测前台/后台/未运行 |
| `getRunningApps()` | `ps -ef` | 获取所有运行进程 |
| `install(hapPaths)` | `bm install -p` | 安装 HAP 包 |
| `uninstall(bundle)` | `bm uninstall -n` | 卸载应用 |
| `clearCache(bundle?)` | — | 清除内存缓存 |

**类型系统：**
- `AppInfo` — 完整应用信息 (含 modules / abilities / mainAbility)
- `AbilityInfo` — Ability 详情 (type / visibility / launchType / skills)
- `HapModuleInfo` — 模块信息
- `AppProcessStatus` — 运行状态枚举
- `AppRuntimeInfo` — 进程运行时信息

**集成：** `HypiumDriver.getAppManager()` 返回 AppManager 实例；`startApp`/`stopApp` 已委托给 AppManager

**验证：** `scripts/verify-phase5.ts` — 17/17 测试通过 ✅

### Phase 6: CI/CD 全链路监控（已完成 ✅）
将自动化测试接入 CI/CD 流水线，实现全链路追踪和前端可视化。

**交付成果：**

| 文件 | 作用 |
|------|------|
| `.github/workflows/test.yml` | GitHub Actions 流水线定义 |
| `scripts/reset-device.ts` | CI/CD 前置：设备/应用状态重置 |
| `scripts/capture-failure.ts` | CI/CD 失败：截图 + UI tree + 日志收集 |
| `scripts/notify-feishu.ts` | CI/CD 通知：飞书 Webhook |
| `tests/e2e/hypium-driver.e2e.test.ts` | E2E 测试套件 (Vitest) |

**流水线架构：**

```
Git push / PR merge
  → Checkout + Node setup + npm ci
  → tsc --noEmit (类型检查)
  → vitest unit tests (单元测试)
  → HDC 连接检查
  → reset-device (清理现场)
  → vitest e2e tests (E2E 全链路, 真机)
     ├── ✅ 成功 → 收集报告 (JSON)
     └── ❌ 失败 → capture-failure (截图+UI dump+日志)
                    → upload artifacts (14 天保留)
  → notify-feishu (飞书 Webhook 通知)
```

**新增 npm scripts：**

| 脚本 | 功能 |
|------|------|
| `test:ci` | CI 全量测试 (含 e2e) |
| `test:e2e:ci` | E2E 测试 + JSON 报告 |
| `ci:reset-device` | 设备重置 |
| `ci:capture-failure` | 失败截图/取证 |
| `ci:notify` | 飞书通知 |

**验证：** `npx vitest run tests/e2e --config vitest.config.ts`
| Notification | Slack / 飞书 Webhook 推送失败 |

**不急于集成的理由：**
- 5 个 Phase 重构完成前，测试用例和驱动不稳定，CI 结果无意义
- HDC 设备需要在 Actions Runner 上稳定连接（需 self-hosted runner 或 USB/IP 方案）
- Report Portal 需要部署服务端

## 风险

| 阶段 | 风险 | 工作量估计 |
|------|------|-----------|
| Phase 1 | 低 | ~2 小时 |
| Phase 2 | 中 | ~4 小时 |
| Phase 3 | 高 | ~40 小时 |
| Phase 4 | 中 | ~8 小时 |
| Phase 5 | 低 | ~3 小时 |
