# application/

本目录用于存放 TestAgent 的示例被测应用（Sample Applications），为测试 Agent、UI 自动化、性能基准等场景提供可执行的 HarmonyOS 应用样本。

## 目录用途

- **被测应用源** — 供 HypiumDriver、ReAct Loop、3D 可视化等模块进行端到端 UI 自动化测试
- **性能基准** — 提供标准化的渲染 / 计算负载（如模糊、滤镜、列表滚动等）用于性能回归
- **演示与培训** — 作为新成员上手 TestAgent 的最小可运行示例

## 命名约定

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| 示例应用 | `<feature>-app` | `blurdemo-app` |
| 公共库 | `<feature>-lib` | `stackblur-lib` |
| 性能基准 | `benchmark-<feature>` | `benchmark-blur` |

## 子项目结构建议

每个示例项目推荐遵循标准 HarmonyOS 工程结构：

```
<project>/
├── AppScope/                 # 应用级配置（图标、签名、包名）
├── entry/                    # 主模块
│   └── src/main/ets/         # ArkTS 源码
├── library/                  # 公共库（可选）
├── build-profile.json5
├── hvigorfile.ts
└── oh-package.json5
```

## 添加新示例

1. 在本目录下新建子目录，遵循上述命名约定
2. 保持工程自包含：每个示例项目应能独立编译、独立运行
3. 在 `demo/` 下补充对应的测试脚本
4. 在本目录 README 末尾的「示例项目清单」中登记

## 示例项目清单

> 当前无示例项目。新增示例时请在此登记：项目名、用途、对应测试脚本路径。

## 参考文档

- 项目架构：[`docs/architecture/`](../docs/architecture/)
- TestAgent 使用：[`USAGE.md`](../USAGE.md)
