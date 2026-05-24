import { ExecutionContext, StepHistory } from '../types/execution-context.type';

/**
 * 失败类型枚举
 */
export enum FailureType {
  ELEMENT_NOT_FOUND = 'element_not_found',
  ELEMENT_NOT_CLICKABLE = 'element_not_clickable',
  ASSERTION_FAILED = 'assertion_failed',
  TIMEOUT = 'timeout',
  CRASH = 'crash',
  ANR = 'anr',
  NETWORK_ERROR = 'network_error',
  PERMISSION_DENIED = 'permission_denied',
  STATE_MISMATCH = 'state_mismatch',
  UNKNOWN = 'unknown',
}

/**
 * 修复策略枚举
 */
export enum FixStrategy {
  RETRY = 'retry',
  SCROLL_AND_RETRY = 'scroll_and_retry',
  ALTERNATIVE_LOCATOR = 'alternative_locator',
  WAIT_AND_RETRY = 'wait_and_retry',
  RESTART_APP = 'restart_app',
}

/**
 * 修复结果接口
 */
export interface FixResult {
  /** 是否修复成功 */
  success: boolean;
  /** 使用的修复策略 */
  strategy: FixStrategy;
  /** 修复描述 */
  description: string;
  /** 修复后的步骤 */
  fixedStep?: StepHistory;
  /** 错误信息 */
  error?: string;
}

/**
 * 修复器接口
 * 定义自动诊断和修复测试失败的能力
 */
export interface IFixExecutor {
  /** 诊断失败类型 */
  diagnose(context: ExecutionContext): Promise<FailureType>;

  /** 尝试修复 */
  fix(context: ExecutionContext, failureType: FailureType): Promise<FixResult>;

  /** 获取支持的修复策略 */
  getSupportedStrategies(): FixStrategy[];

  /** 注册自定义修复策略 */
  registerStrategy(strategy: FixStrategy, handler: FixHandler): void;

  /** 清理指定上下文的修复记录 */
  clearFixAttempts(contextId: string): void;
}

/**
 * 修复处理器类型
 */
export type FixHandler = (context: ExecutionContext) => Promise<FixResult>;
