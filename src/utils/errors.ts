/**
 * 错误工具：基础异常类、错误归一化
 */

/**
 * AppError 构造选项
 */
export interface AppErrorOptions {
  code?: string;
  category?: string;
  cause?: unknown;
  metadata?: Record<string, any>;
}

/**
 * 应用基础错误类
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly category: string;
  public override cause?: unknown;
  public readonly metadata?: Record<string, any>;
  public readonly timestamp: number;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? 'APP_ERROR';
    this.category = options.category ?? 'general';
    this.cause = options.cause;
    this.metadata = options.metadata;
    this.timestamp = Date.now();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      metadata: this.metadata,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

/**
 * 配置错误
 */
export class ConfigError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, 'category'> = {}) {
    super(message, { ...options, category: 'config', code: options.code ?? 'CONFIG_ERROR' });
  }
}

/**
 * 驱动错误
 */
export class DriverError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, 'category'> = {}) {
    super(message, { ...options, category: 'driver', code: options.code ?? 'DRIVER_ERROR' });
  }
}

/**
 * MCP 协议错误
 */
export class MCPError extends AppError {
  public readonly jsonRpcCode?: number;
  constructor(
    message: string,
    options: Omit<AppErrorOptions, 'category'> & { jsonRpcCode?: number } = {}
  ) {
    super(message, { ...options, category: 'mcp', code: options.code ?? 'MCP_ERROR' });
    this.jsonRpcCode = (options as any).jsonRpcCode;
  }
}

/**
 * Agent 错误
 */
export class AgentError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, 'category'> = {}) {
    super(message, { ...options, category: 'agent', code: options.code ?? 'AGENT_ERROR' });
  }
}

/**
 * 修复错误
 */
export class FixerError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, 'category'> = {}) {
    super(message, { ...options, category: 'fixer', code: options.code ?? 'FIXER_ERROR' });
  }
}

/**
 * 技能错误
 */
export class SkillError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, 'category'> = {}) {
    super(message, { ...options, category: 'skill', code: options.code ?? 'SKILL_ERROR' });
  }
}

/**
 * 知识库错误
 */
export class KnowledgeError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, 'category'> = {}) {
    super(message, { ...options, category: 'knowledge', code: options.code ?? 'KNOWLEDGE_ERROR' });
  }
}

/**
 * 标准化错误对象
 */
export function normalizeError(err: unknown): {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  category?: string;
} {
  if (err instanceof AppError) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      category: err.category,
    };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === 'string') {
    return { name: 'Error', message: err };
  }
  return { name: 'UnknownError', message: String(err) };
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('timeout')) return true;
    if (msg.includes('econnreset')) return true;
    if (msg.includes('etimedout')) return true;
    if (msg.includes('econnrefused')) return true;
    if (msg.includes('socket hang up')) return true;
    if (msg.includes('network')) return true;
    if (msg.includes('unauthorized')) return false;
    if (msg.includes('forbidden')) return false;
    if (msg.includes('not found')) return false;
    if (msg.includes('bad request')) return false;
  }
  return false;
}
