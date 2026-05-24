/**
 * Logger - 基于 Pino 的日志封装
 * 支持多级别、子日志、可选 pretty 打印、文件输出
 */

import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

/**
 * 日志级别
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

/**
 * Logger 配置
 */
export interface LoggerConfig {
  /** 日志级别 */
  level?: LogLevel;
  /** 是否使用 pretty 打印（开发环境推荐） */
  pretty?: boolean;
  /** 日志输出文件路径 */
  filePath?: string;
  /** Logger 名称 */
  name?: string;
  /** 基础字段 */
  base?: Record<string, any>;
  /** 时间戳格式 */
  timestamp?: boolean;
}

/**
 * Logger 封装
 */
export class Logger {
  private logger: PinoLogger;

  constructor(config: LoggerConfig = {}) {
    const opts: LoggerOptions = {
      level: config.level ?? 'info',
      name: config.name,
      base: config.base ?? {},
      timestamp: config.timestamp !== false ? pino.stdTimeFunctions.isoTime : false,
    };

    if (config.pretty) {
      this.logger = pino({
        ...opts,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      });
    } else if (config.filePath) {
      this.logger = pino(opts, pino.destination(config.filePath));
    } else {
      this.logger = pino(opts);
    }
  }

  trace(msgOrObj: string | object, ...args: any[]): void {
    this.logger.trace(msgOrObj as any, ...args);
  }

  debug(msgOrObj: string | object, ...args: any[]): void {
    this.logger.debug(msgOrObj as any, ...args);
  }

  info(msgOrObj: string | object, ...args: any[]): void {
    this.logger.info(msgOrObj as any, ...args);
  }

  warn(msgOrObj: string | object, ...args: any[]): void {
    this.logger.warn(msgOrObj as any, ...args);
  }

  error(msgOrObj: string | object | Error, ...args: any[]): void {
    if (msgOrObj instanceof Error) {
      this.logger.error({ err: msgOrObj }, msgOrObj.message);
    } else {
      this.logger.error(msgOrObj as any, ...args);
    }
  }

  fatal(msgOrObj: string | object | Error, ...args: any[]): void {
    if (msgOrObj instanceof Error) {
      this.logger.fatal({ err: msgOrObj }, msgOrObj.message);
    } else {
      this.logger.fatal(msgOrObj as any, ...args);
    }
  }

  /**
   * 创建带额外字段的子 logger
   */
  child(bindings: Record<string, any>): Logger {
    const child = Object.create(this) as Logger;
    child.logger = this.logger.child(bindings);
    return child;
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  /**
   * 获取当前级别
   */
  getLevel(): string {
    return this.logger.level;
  }

  /**
   * 是否启用某级别
   */
  isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(level);
  }
}

// 默认全局 Logger 实例
let defaultLogger: Logger | null = null;

/**
 * 获取默认 Logger
 */
export function getLogger(name?: string): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger({
      level: (process.env['LOG_LEVEL'] as LogLevel) || 'info',
      pretty: process.env['NODE_ENV'] !== 'production',
    });
  }
  if (name) return defaultLogger.child({ name });
  return defaultLogger;
}

/**
 * 设置默认 Logger
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}
