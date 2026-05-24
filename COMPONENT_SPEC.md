# AI Test Agent — Component Specification

> 基于 DESIGN_SYSTEM.md 令牌体系 · 面向测试仪表盘 Web 界面

---

## 1. 布局架构

```
┌─────────────────────────────────────────────────┐
│  StatusBar                                       │
│  [Status indicator] [Session info] [Settings]    │
├─────────────────────────────────────────────────┤
│                                                   │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ MetricPanel   │  │ TestStatusCard 列表       │  │
│  │ ┌───────────┐ │  │ ┌──────────────────────┐ │  │
│  │ │ Pass Rate  │ │  │ │ [icon] TC-001 Login  │ │  │
│  │ │  98.5%    │ │  │ │ passed · 1.2s         │ │  │
│  │ └───────────┘ │  │ └──────────────────────┘ │  │
│  │ ┌───────────┐ │  │ ┌──────────────────────┐ │  │
│  │ │ Duration  │ │  │ │ [icon] TC-002 Signup │ │  │
│  │ │  12.3s   │ │  │ │ failed · 3.5s         │ │  │
│  │ └───────────┘ │  │ │ ! element not found  │ │  │
│  │ ┌───────────┐ │  │ └──────────────────────┘ │  │
│  │ │ Fix Rate  │ │  │ ┌──────────────────────┐ │  │
│  │ │  87.5%   │ │  │ │ [icon] TC-003 Checkout│ │  │
│  │ └───────────┘ │  │ │ fixed · 5.1s          │ │  │
│  └──────────────┘  │ └──────────────────────┘  │
│                    │ ┌──────────────────────┐  │
│  ┌──────────────┐  │ │ [icon] TC-004 Search │  │
│  │ ActivityLog  │  │ │ running · 2.3s        │  │
│  │ 实时日志流    │  │ │ ▓▓▓▓▓▓░░░░ 62%       │  │
│  └──────────────┘  │ └──────────────────────┘  │
│                    │   ... 更多测试用例         │
│                    └──────────────────────────┘  │
│                                                   │
│  ┌──────────────────────────────────────────┐    │
│  │ StepTimeline （选中测试的展开视图）         │    │
│  │ ┌──── Step 1: click login button         │    │
│  │ │  ✔ success  0.3s                       │    │
│  │ ├──── Step 2: input username              │    │
│  │ │  ✔ success  0.5s                       │    │
│  │ ├──── Step 3: input password              │    │
│  │ │  ✗ failed   2.1s — element not found   │    │
│  │ │  ↻ Fix: alternative locator → fixed    │    │
│  │ └──── Step 4: click submit               │    │
│  │    ✔ fixed   0.4s                         │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## 2. 组件规格

### 2.1 StatusBar（全局状态栏）

**用途：** 始终固定在页面顶部，显示系统运行状态概览

```
┌─────────────────────────────────────────────────────┐
│ ● Running    AI Test Agent v1.0   Session #42     ⚙ │
│  3 completed · 1 running · 1 failed · 89.3% pass   │
└─────────────────────────────────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| 高度 | 56px |
| 背景 | `--surface` |
| 底部边框 | 1px `--border` |
| 层级 | `z-index: 10` |
| 内边距 | `--space-4` |

**状态：**
| 状态 | 颜色 | 动画 |
|------|------|------|
| Idle | `--text-muted` | 无 |
| Running | `--color-info` | 呼吸脉冲 1.5s |
| Completed | `--color-success` | 无 |
| Error | `--color-error` | 无 |

**可访问性：** `role="status"` `aria-live="polite"`，状态变化时屏幕阅读器可感知。

---

### 2.2 MetricPanel（指标面板）

**用途：** 展示关键统计数据卡片网格

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ 98.5%    │ │ 12.3s    │ │ 87.5%    │ │ 42       │
│ Pass Rate │ │ Duration  │ │ Fix Rate  │ │ Total    │
│ ↑ 2.1%   │ │ -1.2s    │ │ ↑ 5.0%   │ │ Tests    │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

| 属性 | 值 |
|------|-----|
| 尺寸 | 可选 1-4 列网格 |
| 间距 | `gap: --space-4` |
| 卡片背景 | `--surface` |
| 圆角 | `--radius-md` |
| 内边距 | `--space-4` |
| 数值字号 | `--text-3xl` / `--weight-bold` |
| 标签字号 | `--text-sm` / `--text-secondary` |
| 趋势指示 | `↑↓` + 文本 + 颜色（绿/红） |

**状态：**
- **normal** — 正常显示
- **loading** — `.metric-value` 替换为脉动骨架 `animate-pulse`
- **error** — 数值显示 `--`，标签变红

---

### 2.3 TestStatusCard（测试用例卡片）

**用途：** 每个测试用例以卡片形式展示，包含状态、耗时、缩略信息

```
┌────────────────────────────────────────────────┐
│ ✓ TC-042  User Login Flow                     │
│  passed · 1.2s  · 4 steps · auth-service      │
└────────────────────────────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| 高度 | 64px |
| 背景 | `--surface` |
| 圆角 | `--radius-md` |
| 底部边框 | 1px `--border` |
| 内边距 | `--space-3` `--space-4` |
| 光标 | `cursor: pointer` |
| Hover | `background: --surface-elevated` + `scale(1.01)` 200ms |

**状态指示：**
| 状态 | 图标 | 颜色 | 说明 |
|------|------|------|------|
| passed | `✓` | `--color-success` | 全部步骤通过 |
| failed | `✗` | `--color-error` | 某步骤失败 |
| running | `⟳` | `--color-info` | 执行中 |
| fixed | `↻` | `--color-fix` | 自愈修复后通过 |
| skipped | `−` | `--text-muted` | 跳过 |
| pending | `○` | `--text-muted` | 等待执行 |

**交互：**
- 点击展开下方 `StepTimeline` 视图
- 双击跳转到测试详细报告页

---

### 2.4 StepTimeline（步骤时间线）

**用途：** 展开显示单个测试用例的逐步执行详情

```
┌──────────────────────────────────────────────────────┐
│ StepTimeline · TC-042 User Login Flow                │
│                                                      │
│  ── Step 1:  navigate_to_url(/login)                 │
│   ✔  success  0.3s  [page loaded in 287ms]           │
│                                                      │
│  ── Step 2:  input_text(login-input, "admin")        │
│   ✔  success  0.2s  [element found by ID]            │
│                                                      │
│  ── Step 3:  input_text(password-input, "***")       │
│   ✗  failed   2.1s  [ElementNotFoundError]            │
│   ↻  Fix: alternative_locator → found by XPATH       │
│   ✔  fixed   0.4s  [fix attempt #1 succeeded]         │
│                                                      │
│  ── Step 4:  click(submit-button)                    │
│   ✔  fixed   0.3s  [element found]                   │
│                                                      │
│   Summary: 4 steps · 3 passed · 1 fixed · 3.2s total │
│   ↻ 1 fix attempt · 100% fix success rate             │
└──────────────────────────────────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| 背景 | `--surface` |
| 圆角 | `--radius-lg` |
| 内边距 | `--space-6` |
| 左侧边框 | 2px 时间线竖线 `--border` |
| 行高 | 32px |
| 步骤间距 | `--space-3` |

**每行元素：**
| 字段 | 格式 |
|------|------|
| 状态图标 | `✔`(绿) / `✗`(红) / `⟳`(蓝) / `↻`(紫) |
| 步骤名称 | `--text-base` / `--weight-medium` / `font-mono` |
| 状态文字 | `success` `failed` `fixed` |
| 耗时 | `0.3s` `--text-sm` `--text-secondary` |
| 错误/修复信息 | 第二行缩进，`--text-sm`，语义色 |

---

### 2.5 LogViewer（日志查看器）

**用途：** 实时流式显示系统日志

```
┌──────────────────────────────────────────────────────┐
│ Log Viewer                                     📋    │
│                                                      │
│  [14:23:01] INFO   Session started: session_42       │
│  [14:23:02] DEBUG  Connecting to device emulator-01  │
│  [14:23:03] INFO   Running TC-042 User Login Flow    │
│  [14:23:03] DEBUG  navigate_to_url(/login)           │
│  [14:23:04] INFO   ✓ Step 1 passed (287ms)           │
│  [14:23:04] DEBUG  input_text(login-input, "admin")  │
│  [14:23:05] INFO   ✓ Step 2 passed (215ms)           │
│  [14:23:05] ERROR  ✗ Step 3 failed: ElementNotFound  │
│  [14:23:05] WARN   ↻ Triggering fix: alt_locator     │
│  [14:23:06] INFO   ✓ Step 3 fixed (412ms)            │
│  [14:23:07] INFO   ✓ TC-042 passed (3.2s)            │
│                                                      │
│  81 lines · Filter: [All ▾]  ⋮ auto-scroll ✓        │
└──────────────────────────────────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| 背景 | `#0A0F1D`（比背景更深） |
| 圆角 | `--radius-md` |
| 内边距 | `--space-3` |
| 字体 | `--font-mono` / `--text-sm` |
| 最大高度 | 400px（可滚动） |
| 行高 | 20px |

**日志级别颜色：**
| 级别 | 颜色 |
|------|------|
| INFO | `--color-info` |
| DEBUG | `--text-secondary` |
| WARN | `--color-warning` |
| ERROR | `--color-error` |

**交互：**
- 自动滚动到底部（可切换）
- 过滤下拉：All / INFO / WARN / ERROR / DEBUG
- 复制按钮 📋 复制当前可见日志
- `role="log"` `aria-live="polite"` 屏幕阅读器支持

---

### 2.6 SessionList（测试会话列表）

**用途：** 展示历史运行记录列表

```
┌──────────────────────────────────────────────────────┐
│  Test Sessions                                 [+新] │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ #42  2m ago  12 tests  98.5% pass  ✓       │    │
│  │ tags: regression, nightly                    │    │
│  ├──────────────────────────────────────────────┤    │
│  │ #41  25m ago 12 tests  92.3% pass  ✓       │    │
│  │ tags: smoke, feature-auth                    │    │
│  ├──────────────────────────────────────────────┤    │
│  │ #40  1h ago  8 tests   62.5% pass  ✗       │    │
│  │ tags: integration · 3 failures               │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| 列表项间距 | `--space-2` |
| 每项高度 | 72px |
| 圆角 | `--radius-sm` |
| 内边距 | `--space-3` |

---

### 2.7 Button（按钮组件）

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Run All   │ │ Run      │ │ Fix Now  │ │ + New    │
│ primary   │ │ outline  │ │ danger   │ │ ghost    │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

| 变体 | 背景 | 文字 | 边框 | Hover |
|------|------|------|------|-------|
| primary | `--color-info` | `white` | 无 | `brightness(1.1)` |
| success | `--color-success` | `white` | 无 | `brightness(1.1)` |
| danger | `--color-error` | `white` | 无 | `brightness(1.1)` |
| outline | 透明 | `--text-primary` | `1px --border` | `bg: --surface` |
| ghost | 透明 | `--text-secondary` | 无 | `bg: --surface` |

| 属性 | 值 |
|------|-----|
| 内边距 | `--space-3 --space-4` |
| 圆角 | `--radius-md` |
| 字号 | `--text-sm` / `--weight-medium` |
| 光标 | `pointer` |
| 过渡 | 200ms ease |
| disabled | `opacity: 0.5` `cursor: not-allowed` |
| loading | 前置旋转 spinner |

```css
.btn:active { transform: scale(0.97); }
.btn:hover:not(:disabled) { transform: scale(1.02); }
```

---

## 3. 空状态 / 加载 / 错误状态

### 3.1 Empty State（空状态）

```
┌──────────────────────────────────────────────┐
│                                              │
│           ┌──────────────────┐               │
│           │  📋 (icon)       │               │
│           └──────────────────┘               │
│         No test results yet                   │
│    Run your first test session to see         │
│         results appear here                   │
│                                              │
│          [ Run Your First Test ]              │
│                                              │
└──────────────────────────────────────────────┘
```

### 3.2 Loading Skeleton（骨架屏）

```
┌──────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  → .animate-pulse
│ ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│ │ ▓▓▓▓▓▓▓  │  │ ▓▓▓▓▓▓▓  │  │ ▓▓▓▓▓▓▓  │   │
│ │ ▓▓▓      │  │ ▓▓▓      │  │ ▓▓▓      │   │
│ └──────────┘  └──────────┘  └──────────┘   │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓         │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                 │
└──────────────────────────────────────────────┘
```

### 3.3 Error State（错误状态）

```
┌──────────────────────────────────────────────┐
│  ⚠ Connection Lost                           │
│  Unable to reach device emulator-01           │
│  [ Retry ]  [ Check Connection ]             │
└──────────────────────────────────────────────┘
```

---

## 4. 交互规范总表

| 组件 | Click | Hover | Active | Focus | Disabled |
|------|-------|-------|--------|-------|----------|
| Button | 执行操作 | scale 1.02 | scale 0.97 | ring-2 | opacity 0.5 |
| TestStatusCard | 展开详情 | bg 提亮 | — | ring-2 | — |
| MetricPanel | 跳转筛选 | bg 提亮 | — | — | — |
| LogViewer | — | 行高亮 | — | — | — |
| SessionList 项 | 跳转会话 | bg 提亮 | — | ring-2 | — |

---

## 5. 主题变量汇总（CSS）

```css
:root {
  /* Backgrounds */
  --bg: #020617;
  --surface: #0F172A;
  --surface-elevated: #1E293B;
  --border: #334155;

  /* Text */
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;

  /* Semantic */
  --success: #22C55E;
  --error: #EF4444;
  --warning: #F59E0B;
  --info: #3B82F6;
  --fix: #A855F7;

  /* Typography */
  --font-heading: 'Fira Code', monospace;
  --font-body: 'Fira Sans', sans-serif;
  --font-mono: 'Fira Code', monospace;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 30px;
  --text-4xl: 36px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.4);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.5);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;
}
```

---

*Generated by UI/UX Pro Max Design System Generator · Component Specification v1.0*
