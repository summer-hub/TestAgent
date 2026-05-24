import { TestCase } from './test-case.type';

/**
 * 步骤执行状态枚举
 */
export enum StepStatus {
  PENDING = 'pending',
  THINKING = 'thinking',
  ACTING = 'acting',
  OBSERVING = 'observing',
  FIXING = 'fixing',
  SUCCESS = 'success',
  FAILED = 'failed',
  FIXED = 'fixed',
  SKIPPED = 'skipped',
}

/**
 * 步骤历史记录
 */
export interface StepHistory {
  /** 步骤唯一标识 */
  stepId: string;
  /** 步骤序号 */
  stepNumber: number;
  /** 执行状态 */
  status: StepStatus;
  /** 思考内容 */
  thought: string;
  /** 选择的工具 */
  chosenTool: string;
  /** 工具参数 */
  toolParams: Record<string, any>;
  /** 工具执行结果 */
  toolResult: any;
  /** 观察结果 */
  observation: string;
  /** 是否通过 */
  passed: boolean;
  /** 是否尝试修复 */
  fixAttempted: boolean;
  /** 修复结果 */
  fixResult?: string;
  /** 错误信息 */
  error?: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * 执行上下文
 * 记录测试用例执行过程中的所有状态
 */
export interface ExecutionContext {
  /** 关联的测试用例 */
  testCase: TestCase;
  /** 步骤执行历史 */
  steps: StepHistory[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 执行状态 */
  status: 'running' | 'passed' | 'failed' | 'stopped';
  /** 错误信息 */
  error?: string;
  /** 变量映射 */
  variables?: Record<string, any>;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 执行报告
 * 批量执行测试用例后的汇总报告
 */
export interface ExecutionReport {
  /** 总用例数 */
  total: number;
  /** 通过数 */
  passed: number;
  /** 失败数 */
  failed: number;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 各用例执行结果 */
  results: ExecutionContext[];
  /** 汇总描述 */
  summary: string;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * Agent 状态枚举
 */
export enum AgentStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  EXECUTING = 'executing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** 每步最大重试次数 */
  maxRetriesPerStep: number;
  /** 最大总步数 */
  maxTotalSteps: number;
  /** 思考超时时间（毫秒） */
  thinkTimeout: number;
  /** 行动超时时间（毫秒） */
  actTimeout: number;
  /** 观察超时时间（毫秒） */
  observeTimeout: number;
  /** 是否启用修复 */
  enableFixer: boolean;
  /** 是否保存历史 */
  saveHistory: boolean;
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** AI 模型 */
  model: string;
  /** 温度参数 */
  temperature: number;
}

/**
 * Agent 统计信息
 */
export interface AgentStatistics {
  /** 总步骤数 */
  totalSteps: number;
  /** 成功步骤数 */
  successSteps: number;
  /** 失败步骤数 */
  failedSteps: number;
  /** 修复步骤数 */
  fixedSteps: number;
  /** 平均步骤耗时（毫秒） */
  averageStepDuration: number;
  /** 总修复尝试次数 */
  totalFixAttempts: number;
  /** 成功修复次数 */
  successFixAttempts: number;
}
