/**
 * 评测框架类型定义
 */

import type { TestCase } from '@core/types/test-case.type';
import type { ExecutionContext, StepHistory } from '@core/types/execution-context.type';
import type { UiTree, Locator } from '@core/types/element.type';
import type { FailureType, FixStrategy } from '@core/interfaces/fixer.interface';

// ============================================================
// 评测样本
// ============================================================

/** 评测难度 */
export type EvalDifficulty = 'L0' | 'L1' | 'L2' | 'L3';

/** 期望动作 */
export interface ExpectedAction {
  /** 动作序号 */
  order: number;
  /** 期望调用的工具名 */
  toolName: string;
  /** 期望的工具参数 */
  params?: Record<string, any>;
  /** 期望的定位器 */
  locator?: Locator;
  /** 关键描述 */
  description: string;
}

/** 金标准定义 */
export interface GroundTruth {
  /** 期望的最终状态 */
  expectedStatus: 'passed' | 'failed';
  /** 期望调用的工具列表（有序） */
  expectedTools: string[];
  /** 期望使用的定位器 */
  expectedLocators: Locator[];
  /** 必须操作的关键元素 ID */
  criticalElements: string[];
  /** 不应执行的操作 */
  forbiddenActions?: string[];
  /** 期望的步骤数范围 [min, max] */
  expectedStepRange?: [number, number];
  /** 期望的断言结果 */
  expectedAssertions?: Array<{ text: string; shouldPass: boolean }>;
}

/** 错误注入配置（L3 难度专用） */
export interface ErrorInjection {
  /** 在第几步注入错误 */
  stepIndex: number;
  /** 注入的错误类型 */
  errorType: FailureType;
  /** 错误消息 */
  errorMessage: string;
  /** 期望触发的修复策略 */
  expectedFixStrategy?: FixStrategy;
}

/** 评测样本 */
export interface EvalSample {
  /** 样本 ID */
  id: string;
  /** 难度 */
  difficulty: EvalDifficulty;
  /** 分类 */
  category: string;
  /** 权重（用于加权计算总分，默认 1） */
  weight?: number;

  /** 初始状态 */
  setup: {
    /** 应用状态描述 */
    appState: string;
    /** 模拟的 UI 树 */
    mockUiTree: UiTree;
    /** 初始变量 */
    variables?: Record<string, any>;
  };

  /** 任务定义 */
  task: {
    /** 自然语言任务描述 */
    description: string;
    /** 期望的动作序列 */
    expectedActions: ExpectedAction[];
    /** 对应的 TestCase（可直接喂给 Agent） */
    testCase: TestCase;
  };

  /** 金标准 */
  groundTruth: GroundTruth;

  /** 错误注入（L2/L3） */
  errorInjection?: ErrorInjection;
}

// ============================================================
// 步骤级对比结果
// ============================================================

/** 单步对比结果 */
export interface StepComparison {
  /** 步骤序号 */
  stepNumber: number;
  /** Agent 实际选择的工具 */
  actualTool: string;
  /** 期望的工具 */
  expectedTool: string;
  /** 工具选择是否正确 */
  toolMatch: boolean;
  /** 参数余弦相似度（定位器匹配） */
  locatorMatch: boolean;
  /** 实际的定位器 */
  actualLocator?: Locator;
  /** 期望的定位器 */
  expectedLocator?: Locator;
  /** 实际工具参数 */
  actualParams: Record<string, any>;
  /** 期望的工具参数 */
  expectedParams?: Record<string, any>;
  /** 参数匹配详情（键级别对比） */
  paramDetails: Array<{
    key: string;
    actual: any;
    expected: any;
    match: boolean;
  }>;
  /** 步骤状态 */
  status: 'success' | 'failed' | 'fixed' | 'skipped';
  /** 是否触发自愈 */
  fixTriggered: boolean;
  /** 自愈是否成功 */
  fixSuccess?: boolean;
  /** 耗时 */
  duration: number;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// 样本级评测结果
// ============================================================

/** 单样本评测结果 */
export interface EvalSampleResult {
  /** 样本 ID */
  sampleId: string;
  /** 难度 */
  difficulty: EvalDifficulty;
  /** 分类 */
  category: string;
  /** 最终状态是否与金标准一致 */
  statusMatch: boolean;
  /** 期望状态 */
  expectedStatus: 'passed' | 'failed';
  /** 实际状态 */
  actualStatus: 'passed' | 'failed' | 'stopped';

  /** 逐步骤对比 */
  stepComparisons: StepComparison[];

  /** 派生指标 */
  scores: {
    /** 步骤成功率 */
    stepPassRate: number;
    /** 工具选择准确率 */
    toolAccuracy: number;
    /** 定位器准确率 */
    locatorAccuracy: number;
    /** 参数准确率 */
    paramAccuracy: number;
    /** 综合得分 */
    composite: number;
  };

  /** 是否触发自愈 */
  fixTriggered: boolean;
  /** 自愈是否成功 */
  fixSuccess?: boolean;
  /** 耗时 */
  duration: number;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// 汇总评测报告
// ============================================================

/** 分层得分 */
export interface LevelScores {
  L0: { count: number; scores: EvalSampleResult['scores'] };
  L1: { count: number; scores: EvalSampleResult['scores'] };
  L2: { count: number; scores: EvalSampleResult['scores'] };
  L3: { count: number; scores: EvalSampleResult['scores'] };
}

/** 分类得分 */
export interface CategoryScores {
  [category: string]: {
    count: number;
    scores: EvalSampleResult['scores'];
  };
}

/** 评测报告 */
export interface EvalReport {
  /** 报告 ID */
  id: string;
  /** 评测时间 */
  timestamp: number;
  /** 评测版本 */
  version: string;
  /** 总样本数 */
  totalSamples: number;
  /** 总耗时 */
  totalDuration: number;

  /** 全局指标 */
  metrics: EvalMetrics;

  /** 分层得分 */
  levelScores: LevelScores;

  /** 分类得分 */
  categoryScores: CategoryScores;

  /** 每个样本的详细结果 */
  details: EvalSampleResult[];

  /** 生成的摘要文本 */
  summary: string;
}

// ============================================================
// 全部评测指标
// ============================================================

/** 评测指标集 */
export interface EvalMetrics {
  // 任务成功
  /** 用例通过率 (Case Pass Rate) */
  casePassRate: number;
  /** 步骤通过率 (Step Pass Rate) */
  stepPassRate: number;
  /** 一次通过率（不需要自愈） */
  firstAttemptRate: number;

  // 自愈
  /** 自愈触发率 */
  fixTriggerRate: number;
  /** 自愈成功率 */
  fixSuccessRate: number;
  /** 自愈开销（自愈样本的额外耗时均值） */
  fixOverheadMs: number;

  // 效率
  /** 平均每用例步数 */
  avgStepsPerCase: number;
  /** 平均 Think 耗时 (ms) */
  avgThinkLatencyMs: number;
  /** 平均 Act 耗时 (ms) */
  avgActLatencyMs: number;
  /** 平均每用例耗时 (ms) */
  avgCaseDurationMs: number;

  // 正确性
  /** 工具选择准确率 */
  toolAccuracy: number;
  /** 定位器准确率 */
  locatorAccuracy: number;
  /** 参数准确率 */
  paramAccuracy: number;
  /** 断言准确率 */
  assertionAccuracy: number;

  // 加权综合
  /** 加权综合得分 (0-100) */
  weightedScore: number;
}

// ============================================================
// 评测运行配置
// ============================================================

/** 评测运行配置 */
export interface EvalConfig {
  /** 评测名称 */
  name?: string;
  /** 数据集路径或样本列表 */
  dataset: EvalSample[];
  /** 是否输出详细对比 */
  verbose?: boolean;
  /** 是否并行执行 */
  parallel?: boolean;
  /** 并行数 */
  concurrency?: number;
  /** 超时（单样本，ms） */
  sampleTimeout?: number;
  /** 评测版本号 */
  version?: string;
}

/** 指标权重配置 */
export interface MetricWeights {
  taskSuccess: number;    // default 0.30
  fixCapability: number;  // default 0.20
  efficiency: number;     // default 0.20
  correctness: number;    // default 0.30
}
