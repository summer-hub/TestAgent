# StackBlur Test Case Generator

Name: `stackblur-testgen`
Description: 从 HarmonyOS 应用的 ArkTS 源码自动生成 .xlsx 测试用例表格，包含前置条件、UI 可操作步骤、清晰预期结果、可自动化验证判定。

---

## When to Use

- 需要从 ArkTS 页面源码生成结构化测试用例时
- 需要评估每个测试用例的可自动化程度时
- 测试用例要求「预期结果」清晰具体、不模糊时

## Input

源码目录: `application/stackblur/entry/src/main/ets/pages/` 下的 `.ets` 文件。

## Output

`stackblur_test_cases.xlsx`，每个页面一个 Sheet，结构:

| 用例编号 | 所属模块 | 测试点 | 前置条件 | 测试步骤 | 预期结果 | 可自动化验证 | 备注 |
|----------|----------|--------|----------|----------|----------|--------------|------|

## 生成规则

1. **前置条件** 统一为 "1. 安装 hap 包" + 当前上下文
2. **测试步骤** 必须基于 UI 可见可操作的元素（按钮文字、列表项、滑块标签）
3. **预期结果** 必须具体可验证（硬编码的状态文本、图片变化、数值变化），禁止 "正常显示""应有"
4. **可自动化验证** 列按三层判定模型标记：
   - `是`: UI Dump 文本匹配 + HDC 命令可完成
   - `部分`: 需要截图对比/Qwen 视觉分析
   - `否`: 需要主观判断/不在 UI 中暴露
5. **编号规则**: `TC-SB-{页码}-{序号}` (页码 001/002/003/004/BM)

## 实现方式

运行 `scripts/generate-test-cases.ts`:

```bash
npx tsx scripts/generate-test-cases.ts
```

该脚本读取每个 `.ets` 文件的源码：
- 解析 `Button($r('...'))` → 提取按钮标签
- 解析 `Slider({min, max, value})` → 提取滑块范围
- 解析 `this.statusText = '...'` → 提取预期状态文本
- 解析 `aboutToAppear()` 中的自动操作 → 提取自动加载行为

然后按模块分组输出到 .xlsx，每个模块一个 Sheet。
