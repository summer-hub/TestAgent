/**
 * 基础错误类
 * 所有自定义错误的基类
 */
export class BaseError extends Error {
  /** 错误码 */
  public readonly code: string;
  /** HTTP 状态码 */
  public readonly statusCode: number;
  /** 错误详情 */
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}
