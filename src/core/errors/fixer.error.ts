import { BaseError } from './base.error';

/**
 * 修复失败错误
 */
export class FixFailedError extends BaseError {
  constructor(failureType: string, strategy: string, details?: Record<string, any>) {
    super(
      `Fix failed for ${failureType} using strategy ${strategy}`,
      'FIX_FAILED',
      500,
      { failureType, strategy, ...details }
    );
  }
}

/**
 * 无法诊断错误
 */
export class UndiagnosableError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'UNDIAGNOSABLE_ERROR', 400, details);
  }
}

/**
 * 修复策略不支持错误
 */
export class StrategyNotSupportedError extends BaseError {
  constructor(strategy: string) {
    super(`Fix strategy not supported: ${strategy}`, 'STRATEGY_NOT_SUPPORTED', 400, { strategy });
  }
}

/**
 * 修复超时错误
 */
export class FixTimeoutError extends BaseError {
  constructor(strategy: string, timeout: number) {
    super(
      `Fix strategy ${strategy} timed out after ${timeout}ms`,
      'FIX_TIMEOUT',
      408,
      { strategy, timeout }
    );
  }
}
