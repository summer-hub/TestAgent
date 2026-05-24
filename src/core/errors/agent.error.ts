import { BaseError } from './base.error';

/**
 * Agent 执行错误
 */
export class AgentExecutionError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AGENT_EXECUTION_ERROR', 500, details);
  }
}

/**
 * 步骤执行超时错误
 */
export class StepTimeoutError extends BaseError {
  constructor(stepNumber: number, timeout: number) {
    super(
      `Step ${stepNumber} timed out after ${timeout}ms`,
      'STEP_TIMEOUT',
      408,
      { stepNumber, timeout }
    );
  }
}

/**
 * 最大重试次数 exceeded
 */
export class MaxRetriesExceededError extends BaseError {
  constructor(stepNumber: number, maxRetries: number) {
    super(
      `Step ${stepNumber} exceeded max retries (${maxRetries})`,
      'MAX_RETRIES_EXCEEDED',
      429,
      { stepNumber, maxRetries }
    );
  }
}

/**
 * 测试用例格式错误
 */
export class TestCaseFormatError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'TEST_CASE_FORMAT_ERROR', 400, details);
  }
}

/**
 * Agent 未初始化错误
 */
export class AgentNotInitializedError extends BaseError {
  constructor() {
    super('Agent not initialized', 'AGENT_NOT_INITIALIZED', 503);
  }
}
