# TestAgent

简体中文 | [English](./README_en.md)

## 项目简介

TestAgent 是一个面向 HarmonyOS 的智能化测试系统，提供 AI 驱动的自动化测试、自愈修复、知识积累等核心能力。基于 TypeScript 构建，拥有完整的 Web 仪表盘和 AI 自然语言交互界面。

### 核心功能

- **智能测试执行** — 基于 AI 决策 (ReAct Loop) 的自动化测试用例执行
- **自动故障修复** — 测试失败后自动诊断并执行修复（支持 10+ 失败类型、5 种修复策略）
- **MCP 协议支持** — 标准化的 JSON-RPC 2.0 工具调用接口
- **知识库积累** — 自动沉淀修复经验和领域知识，持续提升修复成功率
- **Web 仪表盘** — 实时监控测试运行状态、会话记录、日志流
- **3D 可视化** — Three.js 真 3D 场景，直观展示设备集群与测试结果
- **SSE 实时日志** — 服务端推送日志流，零刷新监控

### 技术架构

系统采用四层架构 + Web 可视化层：

```
┌─────────────────────────────────────────────────────────────┐
│                   Web Dashboard (SPA + 3D)                   │
│        CSS3 3D 效果 · Three.js · Canvas 粒子 · SSE 实时      │
├─────────────────────────────────────────────────────────────┤
│                    Agent Layer (ReAct Loop)                  │
│              智能决策 · 自愈修复 · 批量执行                   │
├─────────────────────────────────────────────────────────────┤
│                      MCP Layer (JSON-RPC 2.0)                │
│               MCPServer · MCPClient · 14+ 工具               │
├─────────────────────────────────────────────────────────────┤
│                         Skills Layer                         │
│              可组合技能 · SkillRegistry · HarmonyOS          │
├─────────────────────────────────────────────────────────────┤
│                      HypiumDriver Layer                      │
│     设备连接 · 元素定位 · 手势操作 · UI树 · 断言            │
└─────────────────────────────────────────────────────────────┘
```

## 项目文档

完整文档位于 `docs/` 目录下：

| 文档 | 说明 |
|------|------|
| **架构方案** | [docs/architecture/架构方案.md](docs/architecture/架构方案.md) |
| **需求规格说明书** | [docs/srs/需求规格说明书.md](docs/srs/需求规格说明书.md) |
| **功能规格说明书** | [docs/fds/功能规格说明书.md](docs/fds/功能规格说明书.md) |
| **开发计划** | [docs/development-plan/开发计划.md](docs/development-plan/开发计划.md) |
| **测试方案** | [docs/test-plan/测试方案.md](docs/test-plan/测试方案.md) |
| **测试执行计划** | [docs/test-plan/测试执行计划.md](docs/test-plan/测试执行计划.md) |
| **Hypium 重构记录** | [docs/refactoring-plan-hypium.md](docs/refactoring-plan-hypium.md) |

## 设计系统

| 文档 | 说明 |
|------|------|
| **DESIGN_SYSTEM.md** | 色彩/排版/间距/阴影令牌，3 主题（Dark/Light/OLED） |
| **COMPONENT_SPEC.md** | 7 个核心组件完整规格（StatusBar / MetricPanel / TestCard 等） |
| **3D_UX_GUIDE.md** | CSS3 伪 3D + WebGL 真 3D 设计哲学与落地策略 |

## 目录结构

```
ai-test-agent-ts/
├── dashboard/                    # 前端 SPA 仪表盘
│   ├── index.html               # 主入口（三主题、粒子背景、设置面板）
│   ├── style.css                # 设计系统样式（CSS3 3D 效果）
│   ├── api.js                   # API 客户端
│   ├── app.js                   # 应用主逻辑
│   ├── 3d.html                  # Three.js 真 3D 场景页
│   ├── 3d-scene.js              # 3D 场景模块
│   └── 3d-panel.js              # 3D Mini 面板组件
│
├── server/                       # Express API Server
│   ├── index.ts                 # 服务入口（端口 3001）
│   ├── api/                     # REST API 路由
│   │   ├── metrics.ts           # GET /api/metrics
│   │   ├── sessions.ts          # GET /api/sessions[/:id]
│   │   ├── tests.ts             # GET /api/tests/:id
│   │   └── logs.ts              # GET /api/logs + SSE /api/logs/stream
│   └── data/
│       └── mock-data.ts         # 数据层（可替换为真实库调用）
│
├── src/                          # 核心源代码
│   ├── core/                    # 核心接口和类型
│   ├── hypium/                  # HarmonyOS 驱动
│   │   ├── driver/             # HypiumDriver (shell 驱动)
│   │   ├── gesture/            # PointerMatrix + GestureBuilder
│   │   ├── app/                # AppManager
│   │   ├── selectors/          # By 选择器
│   │   ├── actions/            # 动作链
│   │   ├── assertions/         # 断言库
│   │   └── rpc/                # RPC 协议 (搁置)
│   ├── fixer/                   # 自愈修复模块
│   ├── mcp/                     # MCP 协议层
│   ├── agent/                   # AI 智能体
│   ├── skills/                  # 技能模块
│   ├── knowledge/               # 知识库
│   └── utils/                   # 工具函数
│
├── scripts/                      # CI/CD + 验证
│   ├── reset-device.ts         # 设备/应用重置
│   ├── capture-failure.ts      # 失败截图+取证
│   ├── notify-feishu.ts        # 飞书通知
│   ├── verify-phase4.ts        # 手势验证
│   └── verify-phase5.ts        # AppManager 验证
│
├── .github/workflows/            # CI/CD 流水线
│   └── test.yml                 # GitHub Actions
│
├── docs/                         # 项目文档
├── tests/                        # 测试代码
│   ├── unit/                    # 单元测试 (8 文件, 168 用例)
│   └── e2e/                     # 端到端测试 (真机)
│
├── DESIGN_SYSTEM.md              # 设计系统规范
├── COMPONENT_SPEC.md             # 组件规格说明
└── 3D_UX_GUIDE.md                # 3D 设计哲学
```

## 技术栈

### 后端核心

| 技术 | 用途 |
|------|------|
| TypeScript 5.4 | 类型安全开发 |
| Node.js 20+ | 运行时环境 |
| Express | REST API + SSE 服务 |
| Pino | 高性能日志 |
| Zod | 运行时类型验证 |
| Vitest | 测试框架 |

### 前端/可视化

| 技术 | 用途 |
|------|------|
| CSS3 3D Transforms | 卡片翻转、Z 轴层叠、翻页动画 |
| Three.js | 真 3D 渲染（设备模型、数据球、粒子系统） |
| Canvas 2D | 粒子背景系统 |
| Server-Sent Events | 实时日志流 |

### 构建工具

tsup · tsx · Vitest · ESLint · Prettier

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- npm >= 10.0.0

### 安装依赖

```bash
npm install
```

### 启动 Web 仪表盘

```bash
# 启动 API Server + 前端静态文件服务
npm run dev:server

# 打开浏览器访问
# http://localhost:3001       → 仪表盘主页
# http://localhost:3001/3d.html → 真 3D 场景
```

### 开发模式

```bash
# 类型检查
npm run typecheck

# 运行单元测试（168 个测试全部通过）
npm run test:unit

# 全部测试
npm test
```

### 构建

```bash
npm run build
```

## 仪表盘特性

| 特性 | 说明 |
|------|------|
| 🎨 **三主题** | Dark / Light / OLED，一键切换（自动记忆） |
| ✨ **粒子背景** | Canvas 驱动，鼠标排斥 + 互连效果 |
| 🌀 **3D 视差** | 鼠标位置驱动仪表盘 3D 空间旋转 |
| 🔄 **卡片翻转** | 指标卡片 hover 翻到背面查看趋势图 |
| 📚 **翻页时间线** | 测试步骤展开时绕 Z 轴旋转动画 |
| 📋 **SSE 实时日志** | 服务端推送日志流，支持级别过滤 |
| 📊 **3D 数据球** | Three.js 渲染，测试结果驱动球面颜色分布 |
| 📱 **响应式** | 375px → 1440px 全自适应 |

## 核心模块

### HypiumDriver

HarmonyOS 设备驱动模块，基于 `uitest` shell 命令实现完整的设备交互能力。

**6 个开发阶段全部完成 ✅**

| Phase | 内容 | 交付 |
|-------|------|------|
| **Phase 1** | Shell 驱动重构 | `uitest uiInput click/swipe/text` 替代废弃命令 |
| **Phase 2** | UI 树 + 元素查找 | `dumpLayout` 解析 → `By.text/id` 选择器 |
| **Phase 3** | RPC 协议替代 | 7 个 RPC 方法全部用 shell 命令覆盖 |
| **Phase 4** | 多点触控手势 | `GestureBuilder` + `PointerMatrix` + pinch/rotate |
| **Phase 5** | App 管理 | `AppManager` — bm dump / aa / pm 全封装 |
| **Phase 6** | CI/CD 全链路 | GitHub Actions + 飞书通知 + E2E 测试套件 |

**核心模块：**

| 模块 | 文件 | 功能 |
|------|------|------|
| `HypiumDriver` | `src/hypium/driver/` | 设备连接、UI 树、点击/滑动/截图 |
| `GestureBuilder` | `src/hypium/gesture/` | 流式动作链 — tap/swipe/pinch/rotate |
| `PointerMatrix` | `src/hypium/gesture/` | 多指手势矩阵 + 工厂函数 |
| `AppManager` | `src/hypium/app/` | 应用信息/生命周期/安装卸载 |
| `By` 选择器 | `src/hypium/selectors/` | `By.text()/id().clickable(true)` |
| `HypiumActions` | `src/hypium/actions/` | 高级操作链 |

### Fixer

自愈修复模块，实现故障诊断（10 种失败类型）、修复决策（5 种策略）和自动修复。

### MCP

MCP 协议模块，实现 JSON-RPC 2.0，提供标准化的 14+ 工具调用接口。

### Agent

测试智能体模块，实现 ReAct 循环，整合 LLM 决策和 Fixer 自愈能力。

### CI/CD 通知配置

项目支持在 CI/CD 流水线中通过飞书发送测试结果通知。支持两种模式：

#### 方式 1：群机器人 Webhook（推荐）

```bash
# 飞书群设置 → 群机器人 → 添加自定义机器人 → 复制 Webhook URL
export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx"

# 发送测试通知
npx tsx scripts/notify-feishu.ts --pass 17 --fail 0 --duration 150 --branch main
```

#### 方式 2：应用机器人 App

```bash
# 需要在飞书开放平台创建应用机器人，获取 App ID / Secret
# 将机器人添加到目标群聊，获取 chat_id
export FEISHU_APP_ID="cli_xxxxxxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxx"
export FEISHU_CHAT_ID="oc_xxxxxxxxxxxxx"

# 发送测试通知
npx tsx scripts/notify-feishu.ts --pass 17 --fail 0 --duration 150 --branch main
```

> **注意：** 所有凭据仅通过环境变量传入，不要在代码中硬编码。
> 正式 CI/CD 中通过 GitHub Secrets 安全注入：`Settings → Secrets and variables → Actions`

#### GitHub Actions 集成

仓库已预置 `.github/workflows/test.yml`，CI 流水线在 E2E 测试执行完毕后自动调用飞书通知。你只需在 GitHub 仓库设置中添加以下 Secrets：

| Secret | 说明 |
|--------|------|
| `DEVICE_ID` | 测试机的 HDC 序列号 |
| `FEISHU_WEBHOOK_URL` | 飞书 Webhook URL（方式 1） |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 飞书应用凭证（方式 2） |
| `FEISHU_CHAT_ID` | 群聊 ID（方式 2 必填） |

## 测试覆盖

| 模块 | 测试用例数 | 状态 |
|------|-----------|------|
| Event System | 15 | ✅ 全部通过 |
| Skill Registry | 23 | ✅ 全部通过 |
| JSON-RPC | 19 | ✅ 全部通过 |
| Knowledge Store | 18 | ✅ 全部通过 |
| Retrievers | 13 | ✅ 全部通过 |
| Error Classifier | 9 | ✅ 全部通过 |
| **总计** | **168** | **✅ 8 个文件全部通过** |

## 性能指标

| 指标 | 目标值 |
|------|--------|
| 单步骤响应时间 | < 500ms |
| 修复流程响应时间 | < 5s |
| 修复成功率 | > 80% |
| 代码覆盖率 | > 80% |

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 代码规范

- 遵循 TypeScript 编码规范
- 所有代码必须通过 ESLint 检查
- 新增代码需有对应单元测试

## 许可证

本项目采用 MIT 许可证 — 详见 [LICENSE](LICENSE)

---

**AI Test Agent - 让测试更智能，让维护更简单**
