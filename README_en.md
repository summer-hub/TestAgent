# TestAgent

[简体中文](./README.md)

## Overview

AI Test Agent is an intelligent testing system for HarmonyOS, providing AI-driven test automation, self-healing repair, knowledge accumulation, and more. Built with TypeScript, it features a complete Web dashboard and 3D visualization.

### Key Features

- **Intelligent Test Execution** — AI-driven test case execution via ReAct Loop
- **Auto Self-Healing** — Automatic diagnosis and repair on test failure (10+ failure types, 5 repair strategies)
- **MCP Protocol** — Standard JSON-RPC 2.0 tool-calling interface
- **Knowledge Base** — Accumulates repair experience and domain knowledge for continuous improvement
- **Web Dashboard** — Real-time monitoring of test runs, sessions, and log streams
- **3D Visualization** — Three.js-powered 3D scenes showing device clusters and test results
- **SSE Real-time Logs** — Server-sent event log streaming with zero-refresh monitoring

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Web Dashboard (SPA + 3D)                   │
│       CSS3 3D Effects · Three.js · Canvas Particles · SSE    │
├─────────────────────────────────────────────────────────────┤
│                    Agent Layer (ReAct Loop)                  │
│             AI Decision · Self-Healing · Batch Execution      │
├─────────────────────────────────────────────────────────────┤
│                      MCP Layer (JSON-RPC 2.0)                │
│                MCPServer · MCPClient · 14+ Tools              │
├─────────────────────────────────────────────────────────────┤
│                         Skills Layer                         │
│           Composable Skills · SkillRegistry · HarmonyOS      │
├─────────────────────────────────────────────────────────────┤
│                      HypiumDriver Layer                      │
│     Device Connection · Element Locator · Gestures · UI Tree │
└─────────────────────────────────────────────────────────────┘
```

## Documentation

Full documentation is located in the `docs/` directory:

| Document | Description |
|----------|-------------|
| **Architecture** | [docs/architecture/架构方案.md](docs/architecture/架构方案.md) |
| **SRS** | [docs/srs/需求规格说明书.md](docs/srs/需求规格说明书.md) |
| **FDS** | [docs/fds/功能规格说明书.md](docs/fds/功能规格说明书.md) |
| **Development Plan** | [docs/development-plan/开发计划.md](docs/development-plan/开发计划.md) |
| **Test Plan** | [docs/test-plan/测试方案.md](docs/test-plan/测试方案.md) |
| **Test Execution Plan** | [docs/test-plan/测试执行计划.md](docs/test-plan/测试执行计划.md) |
| **Hypium Refactoring** | [docs/refactoring-plan-hypium.md](docs/refactoring-plan-hypium.md) |

## Design System

| Document | Description |
|----------|-------------|
| **DESIGN_SYSTEM.md** | Color/typography/spacing/shadow tokens, 3 themes (Dark/Light/OLED) |
| **COMPONENT_SPEC.md** | Complete specs for 7 core components (StatusBar, MetricPanel, TestCard, etc.) |
| **3D_UX_GUIDE.md** | CSS3 pseudo-3D + WebGL true 3D design philosophy and implementation |

## Directory Structure

```
ai-test-agent-ts/
├── dashboard/                    # Frontend SPA Dashboard
│   ├── index.html               # Main entry (3 themes, particle bg, settings panel)
│   ├── style.css                # Design system styles (CSS3 3D effects)
│   ├── api.js                   # API client
│   ├── app.js                   # App main logic
│   ├── 3d.html                  # Three.js 3D scene page
│   ├── 3d-scene.js              # 3D scene module
│   └── 3d-panel.js              # 3D Mini panel component
│
├── server/                       # Express API Server
│   ├── index.ts                 # Entry (port 3001)
│   ├── api/                     # REST API routes
│   │   ├── metrics.ts           # GET /api/metrics
│   │   ├── sessions.ts          # GET /api/sessions[/:id]
│   │   ├── tests.ts             # GET /api/tests/:id
│   │   └── logs.ts              # GET /api/logs + SSE /api/logs/stream
│   └── data/
│       └── mock-data.ts         # Data layer (replaceable with real DB)
│
├── src/                          # Core source code
│   ├── core/                    # Core interfaces and types
│   ├── hypium/                  # HarmonyOS driver
│   │   ├── driver/             # HypiumDriver (shell-based)
│   │   ├── gesture/            # PointerMatrix + GestureBuilder
│   │   ├── app/                # AppManager
│   │   ├── selectors/          # By selectors
│   │   ├── actions/            # Action chain
│   │   ├── assertions/         # Assertion library
│   │   └── rpc/                # RPC protocol (on hold)
│   ├── fixer/                   # Self-healing module
│   ├── mcp/                     # MCP protocol layer
│   ├── agent/                   # AI agent
│   ├── skills/                  # Skills module
│   ├── knowledge/               # Knowledge base
│   └── utils/                   # Utility functions
│
├── scripts/                      # CI/CD + verification
│   ├── reset-device.ts         # Device/app reset
│   ├── capture-failure.ts      # Failure screenshot + evidence
│   ├── notify-feishu.ts        # Feishu notification
│   ├── verify-phase4.ts        # Gesture verification
│   └── verify-phase5.ts        # AppManager verification
│
├── .github/workflows/            # CI/CD pipeline
│   └── test.yml                 # GitHub Actions
│
├── docs/                         # Project documents
├── tests/                        # Test code
│   ├── unit/                    # Unit tests (8 files, 168 cases)
│   └── e2e/                     # End-to-end tests (real device)
│
├── DESIGN_SYSTEM.md              # Design system spec
├── COMPONENT_SPEC.md             # Component specs
└── 3D_UX_GUIDE.md                # 3D design guide
```

## Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| TypeScript 5.4 | Type-safe development |
| Node.js 20+ | Runtime |
| Express | REST API + SSE |
| Pino | High-performance logging |
| Zod | Runtime type validation |
| Vitest | Test framework |

### Frontend / Visualization

| Technology | Purpose |
|------------|---------|
| CSS3 3D Transforms | Card flip, Z-axis stacking, page turn animation |
| Three.js | True 3D rendering (device models, data spheres, particle systems) |
| Canvas 2D | Particle background system |
| Server-Sent Events | Real-time log streaming |

### Build Tools

tsup · tsx · Vitest · ESLint · Prettier

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Install Dependencies

```bash
npm install
```

### Launch Web Dashboard

```bash
# Start API Server + frontend static file service
npm run dev:server

# Open browser
# http://localhost:3001       → Dashboard main page
# http://localhost:3001/3d.html → True 3D scene
```

### Development

```bash
# Type check
npm run typecheck

# Run unit tests (168 tests, all passing)
npm run test:unit

# All tests
npm test
```

### Build

```bash
npm run build
```

## Dashboard Features

| Feature | Description |
|---------|-------------|
| 🎨 **3 Themes** | Dark / Light / OLED, one-click switch (auto-saved) |
| ✨ **Particle Background** | Canvas-driven, mouse repulsion + connection effects |
| 🌀 **3D Parallax** | Mouse-driven 3D space rotation |
| 🔄 **Card Flip** | Metric cards flip on hover to show trend charts |
| 📚 **Page Turn Timeline** | Z-axis rotation animation for expanded test steps |
| 📋 **SSE Real-time Logs** | Server-pushed log stream with level filtering |
| 📊 **3D Data Sphere** | Three.js rendering, color distribution driven by test results |
| 📱 **Responsive** | 375px → 1440px full adaptive |

## Core Modules

### HypiumDriver

HarmonyOS device driver module based on `uitest` shell commands.

**All 6 development phases completed ✅**

| Phase | Content | Deliverable |
|-------|---------|-------------|
| **Phase 1** | Shell driver rewrite | `uitest uiInput click/swipe/text` replaces deprecated commands |
| **Phase 2** | UI tree + element finding | `dumpLayout` parsing → `By.text/id` selectors |
| **Phase 3** | RPC protocol replacement | All 7 RPC methods covered by shell commands |
| **Phase 4** | Multi-touch gestures | `GestureBuilder` + `PointerMatrix` + pinch/rotate |
| **Phase 5** | App management | `AppManager` — bm dump / aa / pm wrapper |
| **Phase 6** | CI/CD pipeline | GitHub Actions + Feishu notification + E2E tests |

**Core modules:**

| Module | Source | Purpose |
|--------|--------|---------|
| `HypiumDriver` | `src/hypium/driver/` | Device connection, UI tree, click/swipe/screenshot |
| `GestureBuilder` | `src/hypium/gesture/` | Fluent action chain — tap/swipe/pinch/rotate |
| `PointerMatrix` | `src/hypium/gesture/` | Multi-finger gesture matrix + factory functions |
| `AppManager` | `src/hypium/app/` | App info / lifecycle / install & uninstall |
| `By` selectors | `src/hypium/selectors/` | `By.text()/id().clickable(true)` |
| `HypiumActions` | `src/hypium/actions/` | High-level action chains |

### Fixer

Self-healing module with failure diagnosis (10 failure types), decision engine (5 strategies), and automatic repair.

### MCP

MCP protocol module implementing JSON-RPC 2.0 with 14+ standardized tools.

### Agent

Test agent implementing ReAct Loop, integrating LLM decision-making and Fixer self-healing.

### CI/CD Notification Setup

The project supports sending test result notifications to Feishu (Lark) via CI/CD pipelines. Two modes available:

#### Method 1: Group Bot Webhook (Recommended)

```bash
# Feishu group settings → Group bots → Add custom bot → Copy Webhook URL
export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx"

# Send test notification
npx tsx scripts/notify-feishu.ts --pass 17 --fail 0 --duration 150 --branch main
```

#### Method 2: App Bot

```bash
# Create an app bot on Feishu Open Platform, get App ID / Secret
# Add the bot to your target group, get chat_id
export FEISHU_APP_ID="cli_xxxxxxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxx"
export FEISHU_CHAT_ID="oc_xxxxxxxxxxxxx"

# Send test notification
npx tsx scripts/notify-feishu.ts --pass 17 --fail 0 --duration 150 --branch main
```

> **Note:** All credentials are passed via environment variables only — never hardcode them.
> In CI/CD, inject them securely via GitHub Secrets: `Settings → Secrets and variables → Actions`

#### GitHub Actions Integration

The repository comes with `.github/workflows/test.yml` pre-configured. CI automatically calls Feishu notification after E2E tests complete. Set up these Secrets in your GitHub repository:

| Secret | Description |
|--------|-------------|
| `DEVICE_ID` | HDC device serial number |
| `FEISHU_WEBHOOK_URL` | Feishu Webhook URL (Method 1) |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | Feishu app credentials (Method 2) |
| `FEISHU_CHAT_ID` | Group chat ID (required for Method 2) |

## Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| Event System | 15 | ✅ All passing |
| Skill Registry | 23 | ✅ All passing |
| JSON-RPC | 19 | ✅ All passing |
| Knowledge Store | 18 | ✅ All passing |
| Retrievers | 13 | ✅ All passing |
| Error Classifier | 9 | ✅ All passing |
| **Total** | **168** | **✅ 8 files, all passing** |

## Performance Targets

| Metric | Target |
|--------|--------|
| Single step response time | < 500ms |
| Repair flow response time | < 5s |
| Repair success rate | > 80% |
| Code coverage | > 80% |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards

- Follow TypeScript coding conventions
- All code must pass ESLint checks
- New code must include corresponding unit tests

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

**AI Test Agent — Smarter Testing, Simpler Maintenance**
