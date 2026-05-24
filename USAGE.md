# AI Test Agent - 使用手册

## 目录

1. [环境准备](#1-环境准备)
2. [安装](#2-安装)
3. [快速启动](#3-快速启动)
4. [核心概念](#4-核心概念)
5. [配置详解](#5-配置详解)
6. [编写测试用例](#6-编写测试用例)
7. [运行测试](#7-运行测试)
8. [高级用法](#8-高级用法)
9. [模块参考](#9-模块参考)
10. [常见问题](#10-常见问题)

---

## 1. 环境准备

### 系统要求

| 项目 | 要求 |
|------|------|
| Node.js | >= 20.0.0 |
| npm | >= 10.0.0 |
| TypeScript | >= 5.0.0（可选，已内置） |
| 操作系统 | Windows / macOS / Linux |

### HarmonyOS 设备连接（真机测试）

如需连接真实 HarmonyOS 设备，需要安装 **HDC (HarmonyOS Device Connector)**：

1. 下载 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)。
2. HDC 工具位于安装目录下的 `sdk/default/openharmony/toolchains/hdc`。
3. 将 HDC 所在目录添加到系统 PATH，或在配置中指定 `hdcPath`。

验证 HDC 可用：

```bash
hdc list targets
```

如果没有 HarmonyOS 设备，项目会自动降级为 **模拟模式**（Mock Mode），无需额外配置。

---

## 2. 安装

```bash
# 克隆项目（如果还没有）
git clone https://github.com/summer-hub/ai-test-agent-ts.git
cd ai-test-agent-ts

# 安装依赖
npm install

# 验证安装
npx tsc --noEmit          # 类型检查，应零错误
npx vitest run tests/unit  # 运行单元测试，168 测试全部通过
```

---

## 3. 快速启动

### 3.1 最简示例（模拟模式，无需设备）

创建一个文件 `demo/quick-start.ts`：

```typescript
import {
  HypiumDriver,
  MCPClient,
  MCPServer,
  FixExecutor,
  TestAgent,
  createDefaultSkillRegistry,
  createKnowledgeBase,
} from '../src';

async function main() {
  // ========== 1. 创建驱动（模拟模式） ==========
  const driver = new HypiumDriver();
  await driver.connect();
  console.log('驱动已连接 (模拟模式)');

  // ========== 2. 创建 MCP 服务端和客户端 ==========
  const server = new MCPServer({
    name: 'ai-test-agent',
    version: '1.0.0',
    capabilities: { tools: true },
  });

  // 注册 14 个预定义工具
  const { createPredefinedToolHandlers } = await import('../src/mcp/tools/predefined-tools');
  const handlers = createPredefinedToolHandlers(driver);
  for (const [name, handler] of handlers) {
    server.registerTool({
      name,
      description: `Tool: ${name}`,
      inputSchema: { type: 'object', properties: {} },
    }, handler);
  }

  const client = new MCPClient();
  await client.connect({ serverName: 'ai-test-agent' });
  console.log('MCP 已就绪');

  // ========== 3. 创建自愈修复器 ==========
  const fixer = new FixExecutor({
    maxFixAttempts: 3,
    fixTimeout: 30000,
    enabled: true,
  });

  // ========== 4. 创建并初始化智能体 ==========
  const agent = new TestAgent(driver, client, fixer);
  await agent.initialize({
    enableFixer: true,
    maxRetriesPerStep: 3,
    logLevel: 'info',
  });
  console.log('Agent 已就绪');

  // ========== 5. 定义测试用例 ==========
  const testCase = {
    id: 'demo-001',
    title: '登录页面测试',
    description: '验证登录功能是否正常',
    category: 'positive',
    priority: 'P0',
    steps: [
      '启动应用 com.example.app',
      '点击登录按钮',
      '输入用户名 admin',
      '输入密码 123456',
      '点击确定按钮',
      '验证出现"登录成功"提示',
    ],
    expectedResult: '用户成功登录，跳转到主页',
    tags: ['login', 'smoke'],
  };

  // ========== 6. 执行测试 ==========
  console.log(`\n开始执行测试: ${testCase.title}`);
  const result = await agent.execute(testCase);

  // ========== 7. 查看结果 ==========
  console.log(`\n测试结果: ${result.status}`);
  console.log(`步骤总数: ${result.steps.length}`);
  console.log(`耗时: ${result.endTime! - result.startTime}ms`);

  if (result.error) {
    console.log(`错误: ${result.error}`);
  }

  // 输出每个步骤的详情
  for (const step of result.steps) {
    console.log(`\n--- 步骤: ${step.stepId} ---`);
    console.log(`  状态: ${step.status}`);
    console.log(`  动作: ${step.action}`);
    if (step.observation) {
      console.log(`  观察: ${step.observation}`);
    }
    if (step.error) {
      console.log(`  错误: ${step.error}`);
    }
  }

  // ========== 8. 清理 ==========
  await driver.disconnect();
  console.log('\n执行完毕');
}

main().catch(console.error);
```

### 3.2 运行

```bash
npx tsx demo/quick-start.ts
```

---

## 4. 核心概念

### 4.1 四层架构

```
┌──────────────────────────────┐
│   Agent 智能体层              │  ← ReAct 循环 (Think→Act→Observe)
│   调用 LLM 推理 + 工具调用     │
├──────────────────────────────┤
│   MCP 协议层                  │  ← JSON-RPC 2.0，工具注册/调用
│   标准化工具接口               │
├──────────────────────────────┤
│   Skills 技能层               │  ← 登录、表单、导航、滚动、截图
│   可组合的高级操作             │
├──────────────────────────────┤
│   Hypium 驱动层               │  ← HDC 连接、屏幕操作、UI树
│   与 HarmonyOS 设备直接交互    │
└──────────────────────────────┘
```

### 4.2 关键组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `TestAgent` | `src/agent/test-agent.ts` | 核心调度器，管理执行流程 |
| `ReActProcessor` | `src/agent/react-loop/react-processor.ts` | Think→Act→Observe 循环 |
| `MCPServer` | `src/mcp/server/mcp-server.ts` | JSON-RPC 服务端，注册工具 |
| `MCPClient` | `src/mcp/client/mcp-client.ts` | JSON-RPC 客户端，调用工具 |
| `HypiumDriver` | `src/hypium/driver/hypium-driver.ts` | 设备驱动，含连接池/心跳/状态机 |
| `FixExecutor` | `src/fixer/executor/fix-executor.ts` | 自愈引擎，自动修复测试失败 |
| `SkillRegistry` | `src/skills/skill-registry.ts` | 技能注册中心 |
| `KnowledgeStore` | `src/knowledge/knowledge-store.ts` | 知识库，支持语义+关键词检索 |

### 4.3 ReAct 循环

每个测试步骤都经过一个三阶段循环：

```
Think → 分析当前页面，决定下一步动作
  ↓
Act   → 调用 MCP 工具（点击、输入、滑动等）
  ↓
Observe → 获取 UI 树、截图、检查断言
  ↓
(如果失败 → Fixer 自动修复 → 重试)
```

### 4.4 自愈机制

当测试步骤失败时，Fixer 自动介入：

1. **ErrorClassifier** — 分析错误信息，匹配 30+ 条正则规则，识别 10 种失败类型
2. **FixDecisionEngine** — 根据置信度(0.5)、历史成功率(0.3)、上下文(0.2)做加权评分
3. **FixStrategy** — 执行对应的修复策略：
   - `SELECTOR` — 换用备用定位器（Text→ID→XPath 三级回退）
   - `AUTH` — 重新登录/刷新 Token
   - `ASSERTION` — 放宽断言条件
   - `DATA` — 清理/重置数据
   - `WAIT` — 梯度等待/显式轮询

---

## 5. 配置详解

### 5.1 Agent 配置

```typescript
await agent.initialize({
  maxRetriesPerStep: 3,    // 每步最大重试次数
  maxTotalSteps: 50,        // 测试用例最大步数
  thinkTimeout: 30000,      // Think 阶段超时(ms)
  actTimeout: 30000,        // Act 阶段超时(ms)
  observeTimeout: 30000,    // Observe 阶段超时(ms)
  enableFixer: true,        // 是否启用自愈
  saveHistory: true,        // 是否保存执行历史
  logLevel: 'info',         // debug | info | warn | error
  model: 'gpt-4',           // LLM 模型名称
  temperature: 0.7,         // LLM 温度参数
});
```

### 5.2 驱动配置

```typescript
const driver = new HypiumDriver({
  deviceId: 'your-device-id',     // 目标设备，不填则连第一个
  defaultTimeout: 10000,          // 默认超时(ms)
  defaultRetryCount: 3,           // 默认重试次数
  hdcPath: 'hdc',                 // HDC 可执行文件路径
  logLevel: 'info',
  connectionPool: {
    minConnections: 1,            // 最小连接数
    maxConnections: 5,            // 最大连接数
    acquireTimeout: 10000,        // 获取连接超时(ms)
    idleTimeout: 300000,          // 空闲连接超时(ms)
    lazyLoad: true,               // 延迟加载
  },
  heartbeat: {
    enabled: true,                // 是否启用心跳
    interval: 30000,              // 心跳间隔(ms)
  },
  commandQueue: {
    maxConcurrency: 1,            // 命令并发数
    commandTimeout: 30000,        // 命令超时(ms)
  },
});
```

### 5.3 YAML/JSON 配置文件

使用 `ConfigManager` 从文件加载配置：

```typescript
import { ConfigManager } from './src/utils/config';

// 加载 YAML 配置
const config = await ConfigManager.load({
  filePaths: ['./config/default.yaml', './config/local.yaml'],
  envOverride: true,         // 允许环境变量覆盖
  envPrefix: 'AI_TEST_',     // 环境变量前缀
  defaults: {                // 默认值
    logLevel: 'info',
  },
});

// 点号路径读取
const timeout = config.get('driver.defaultTimeout', 10000);
const maxConn = config.get('driver.connectionPool.max', 5);
```

环境变量覆盖示例：

```bash
# AI_TEST_ 前缀 + 路径小写 + 下划线分隔
export AI_TEST_DRIVER_DEFAULT_TIMEOUT=15000
export AI_TEST_LOG_LEVEL=debug
```

---

## 6. 编写测试用例

### 6.1 TestCase 接口

```typescript
interface TestCase {
  id: string;                    // 唯一标识，如 'login-001'
  title: string;                 // 用例标题，如 '登录功能测试'
  description?: string;          // 详细描述
  category: string;              // 分类：positive | negative | edge | smoke
  priority: string;              // 优先级：P0 | P1 | P2 | P3
  precondition?: string;         // 前置条件描述
  steps: string[];               // 自然语言步骤列表
  expectedResult: string;        // 预期结果
  testData?: Record<string, any>; // 测试数据
  tags?: string[];               // 标签
  timeout?: number;              // 用例超时(ms)，默认 120000
  retry?: number;                // 用例级重试，默认 0
  metadata?: Record<string, any>; // 扩展元数据
}
```

### 6.2 示例用例集

```typescript
const testCases = [
  // P0 - 正向用例
  {
    id: 'login-p0-001',
    title: '正确账号密码登录',
    category: 'positive',
    priority: 'P0',
    precondition: '用户已注册',
    steps: [
      '打开登录页面',
      '输入用户名 test@example.com',
      '输入密码 Test@123',
      '点击登录按钮',
      '验证页面出现"欢迎回来"',
    ],
    expectedResult: '登录成功，跳转到主页',
    tags: ['login', 'smoke'],
    testData: {
      username: 'test@example.com',
      password: 'Test@123',
    },
  },

  // P1 - 异常用例
  {
    id: 'login-p1-001',
    title: '错误密码登录',
    category: 'negative',
    priority: 'P1',
    steps: [
      '打开登录页面',
      '输入用户名 test@example.com',
      '输入密码 wrongpassword',
      '点击登录按钮',
      '验证出现"密码错误"提示',
    ],
    expectedResult: '提示密码错误，停留在登录页',
    tags: ['login', 'negative'],
  },

  // P2 - 边界用例
  {
    id: 'login-p2-001',
    title: '空密码登录',
    category: 'edge',
    priority: 'P2',
    steps: [
      '打开登录页面',
      '输入用户名 test@example.com',
      '不输入密码',
      '验证登录按钮不可点击或置灰',
    ],
    expectedResult: '登录按钮禁用',
    tags: ['login', 'edge'],
  },
];
```

---

## 7. 运行测试

### 7.1 单个用例

```typescript
const result = await agent.execute(testCase);
console.log(result.status); // 'passed' | 'failed' | 'stopped'
```

### 7.2 批量执行

```typescript
const report = await agent.executeBatch(testCases);

console.log(`总数: ${report.total}`);
console.log(`通过: ${report.passed}`);
console.log(`失败: ${report.failed}`);
console.log(`耗时: ${report.duration}ms`);
console.log(`摘要: ${report.summary}`);

// 逐个查看结果
for (const ctx of report.results) {
  console.log(`${ctx.testCase.title}: ${ctx.status}`);
}
```

### 7.3 运行时控制

```typescript
// 暂停
await agent.pause();

// 恢复
await agent.resume();

// 停止
await agent.stop();

// 查询状态
const status = agent.getStatus(); // 'idle' | 'running' | 'paused' | 'stopped'

// 获取统计
const stats = agent.getStatistics();
console.log(stats);
// { totalSteps, successSteps, failedSteps, fixedSteps,
//   averageStepDuration, totalFixAttempts, successFixAttempts }

// 重置（清除历史、恢复空闲）
agent.reset();
```

### 7.4 事件监听

在执行过程中监听关键事件：

```typescript
import { EventSystem, AgentEventType } from './src/agent';

const events = new EventSystem();

// 监听步骤开始
events.on(AgentEventType.STEP_START, (event) => {
  console.log(`[开始] 步骤: ${event.data.stepId}`);
});

// 监听步骤完成
events.on(AgentEventType.STEP_END, (event) => {
  console.log(`[完成] 状态: ${event.data.status}`);
});

// 监听自愈
events.on(AgentEventType.FIX_START, (event) => {
  console.log(`[修复] 正在处理: ${event.data.error}`);
});

events.on(AgentEventType.FIX_END, (event) => {
  console.log(`[修复] ${event.data.success ? '成功' : '失败'}`);
});

// 监听所有事件
events.on('*', (event) => {
  console.log(`[${event.type}]`, event.data);
});
```

---

## 8. 高级用法

### 8.1 使用技能注册中心

```typescript
import { SkillRegistry, LoginSkill, FormFillSkill, createDefaultSkillRegistry } from './src/skills';

// 方式1：使用预配置的注册中心
const registry = createDefaultSkillRegistry();

// 方式2：手动注册
const registry = new SkillRegistry();
registry.register(new LoginSkill(), {
  namespace: 'harmony',
  aliases: ['login', 'signin'],
});

// 执行技能
const result = await registry.execute('harmony.login', {
  loginType: 'account',
  username: 'admin',
  password: 'pass123',
}, {
  driver,
  variables: {},
});
```

### 8.2 技能组合（原子操作编排）

```typescript
// 注册组合："登录后填表"
registry.registerComposition({
  name: 'login-and-fill',
  description: '先登录再填表',
  steps: [
    { skillName: 'login', params: { loginType: 'account', username: 'u', password: 'p' } },
    { skillName: 'form_fill', params: { autoSubmit: true, fields: [
      { name: '姓名', type: 'text', value: '张三' },
      { name: '邮箱', type: 'email', value: 'test@test.com' },
    ] } },
  ],
});

await registry.executeComposition('login-and-fill', { driver });
```

### 8.3 知识库检索

```typescript
import { createKnowledgeBase } from './src/knowledge';

const { store, retriever } = createKnowledgeBase({
  filePath: './data/knowledge.json',
  // embeddingProvider: myEmbedding,  // 可选，提供后启用语义检索
});

// 添加知识
await store.add({
  title: '登录按钮位置',
  content: '登录按钮在首页右上角，蓝色背景，白色文字"登录/注册"。',
  category: 'ui',
  tags: ['login', 'button'],
});

// 检索相关知识
const results = await retriever.retrieve({
  text: '如何找到登录入口',
  limit: 5,
  minScore: 0.3,
});

for (const r of results) {
  console.log(`[${r.matchType}] ${r.entry.title} (score: ${r.score.toFixed(2)})`);
  console.log(`  ${r.entry.content}`);
}
```

### 8.4 自定义修复策略

```typescript
import { FixStrategy } from './src/core';

fixer.registerStrategy(FixStrategy.RETRY, async (context) => {
  // 自定义重试逻辑
  console.log('执行自定义重试...');
  const lastStep = context.steps[context.steps.length - 1];
  // ... 执行修复逻辑 ...
  return {
    success: true,
    strategy: FixStrategy.RETRY,
    description: '自定义重试成功',
  };
});
```

### 8.5 历史记录与导出

```typescript
import { HistoryTracker } from './src/agent';

const tracker = new HistoryTracker(1000); // 最多保存 1000 次

// 每次执行完记录
tracker.record(testCase, result);

// 导出 JSON
const json = tracker.exportJson();
await fs.writeFile('reports/history.json', json);

// 导出 CSV
const csv = tracker.exportCsv();
await fs.writeFile('reports/history.csv', csv);

// 查看统计
console.log('平均步数:', tracker.getAverageSteps());
console.log('平均耗时:', tracker.getAverageDuration(), 'ms');
console.log('成功率:', (tracker.getSuccessRate() * 100).toFixed(1) + '%');
```

### 8.6 日志系统

```typescript
import { Logger, getLogger } from './src/utils/logger';

// 全局 Logger
const logger = getLogger('agent');

// 带上下文的子 Logger
const ctxLogger = logger.child({ testCaseId: 'tc-001' });
ctxLogger.info('开始执行测试');
ctxLogger.error(new Error('连接超时'));

// 自定义 Logger 实例（写入文件）
const fileLogger = new Logger({
  level: 'debug',
  filePath: './logs/agent.log',
  name: 'ai-test-agent',
});

fileLogger.trace('详细追踪信息');
fileLogger.debug({ step: 1 }, '调试信息');
fileLogger.info('正常运行时信息');
fileLogger.warn('警告信息');
fileLogger.error(new Error('错误信息'));
fileLogger.fatal(new Error('致命错误'));
```

---

## 9. 模块参考

### 9.1 导入路径

```typescript
// 核心类型和接口
import { IDriver, ITestAgent, IFixExecutor, IMCPClient } from 'ai-test-agent-ts';
import { Element, Locator, LocatorType, UiTree, DeviceInfo } from 'ai-test-agent-ts';

// 驱动
import { HypiumDriver, HypiumDriverConfig } from 'ai-test-agent-ts';

// MCP
import { MCPClient, MCPServer, JSONRPCCodec } from 'ai-test-agent-ts';

// 自愈
import { FixExecutor, ErrorClassifier, FixDecisionEngine } from 'ai-test-agent-ts';

// Agent
import { TestAgent, ReActProcessor } from 'ai-test-agent-ts';

// 技能
import { Skill, SkillRegistry, LoginSkill, FormFillSkill,
         NavigationSkill, ScrollSkill, ScreenshotSkill } from 'ai-test-agent-ts';

// 知识库
import { KnowledgeStore, SemanticRetriever, KeywordRetriever,
         HybridRetriever } from 'ai-test-agent-ts';

// 工具
import { Logger, ConfigManager, sleep, retry, deepClone } from 'ai-test-agent-ts';
```

### 9.2 错误类型

```typescript
import {
  AppError, ConfigError, DriverError, MCPError,
  AgentError, FixerError, SkillError, KnowledgeError,
} from 'ai-test-agent-ts';

// 所有错误继承自 AppError
// AppError 包含 code、category、cause、metadata、timestamp
```

### 9.3 Enum 参考

```typescript
// 定位器类型
LocatorType.TEXT | LocatorType.ID | LocatorType.XPATH | LocatorType.COORDINATE | LocatorType.VISION

// 失败类型
FailureType.ELEMENT_NOT_FOUND | FailureType.ELEMENT_NOT_CLICKABLE | FailureType.ASSERTION_FAILED
  | FailureType.TIMEOUT | FailureType.CRASH | FailureType.ANR
  | FailureType.NETWORK_ERROR | FailureType.PERMISSION_DENIED
  | FailureType.STATE_MISMATCH | FailureType.UNKNOWN

// 修复策略
FixStrategy.RETRY | FixStrategy.SCROLL_AND_RETRY | FixStrategy.ALTERNATIVE_LOCATOR
  | FixStrategy.WAIT_AND_RETRY | FixStrategy.RESTART_APP

// Agent 事件
AgentEventType.STEP_START | AgentEventType.STEP_END | AgentEventType.FIX_START
  | AgentEventType.FIX_END | AgentEventType.AGENT_ERROR | AgentEventType.AGENT_COMPLETE

// 步骤状态
StepStatus.RUNNING | StepStatus.SUCCESS | StepStatus.FAILED | StepStatus.FIXING | StepStatus.FIXED
```

---

## 10. 常见问题

### Q: 没有 HarmonyOS 设备怎么用？

A: 项目内置模拟模式。不传 `deviceId` 时，驱动会自动使用 Mock 连接，返回模拟的 UI 树和元素。这适用于：
- 本地开发和调试
- 编写和测试用例设计
- CI/CD 流水线中的单元测试

### Q: 如何连接真实设备？

A: 确保 HDC 已安装且在 PATH 中，然后：

```typescript
const driver = new HypiumDriver({ deviceId: 'your-device-id', hdcPath: '/path/to/hdc' });
await driver.connect();
```

`deviceId` 可通过 `hdc list targets` 获取。

### Q: LLM 如何配置？

A: 项目支持三个 LLM Provider：
- **OpenAI**：设置环境变量 `OPENAI_API_KEY`，默认模型 `gpt-4`
- **Qwen (通义千问)**：设置 `DASHSCOPE_API_KEY`
- **Gemini**：设置 `GEMINI_API_KEY`

初始化 Agent 时指定模型：

```typescript
await agent.initialize({ model: 'qwen-turbo' });
```

### Q: 如何只运行特定模块的测试？

```bash
npm run test:unit                      # 所有单元测试
npx vitest run tests/unit/agent        # 只测 Agent
npx vitest run tests/unit/knowledge    # 只测 Knowledge
npx vitest run tests/unit/utils        # 只测 Utils
```

### Q: 项目构建产物在哪？

```bash
npm run build          # tsup 构建，输出到 dist/
npm run dev            # tsx 开发模式运行 src/index.ts
```

### Q: 如何添加自定义技能？

1. 继承 `Skill` 基类，实现 `metadata` 和 `execute`。
2. 通过 `SkillRegistry.register()` 注册。
3. 可直接调用或通过 Agent 的 ReAct 循环调用。

```typescript
class MyCustomSkill extends Skill {
  readonly metadata: SkillMetadata = {
    name: 'my_skill',
    description: '我的自定义技能',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  };

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    // 实现你的逻辑
    return { success: true, message: 'OK' };
  }
}
```
