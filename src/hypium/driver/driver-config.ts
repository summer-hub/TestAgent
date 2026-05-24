import { z } from 'zod';

/**
 * Hypium 驱动配置 Schema
 */
export const HypiumDriverConfigSchema = z.object({
  /** 设备 ID */
  deviceId: z.string().optional(),
  /** 默认超时时间（毫秒） */
  defaultTimeout: z.number().default(10000),
  /** 默认重试次数 */
  defaultRetryCount: z.number().default(3),
  /** HDC 工具路径 */
  hdcPath: z.string().default('hdc'),
  /** 是否启用截图缓存 */
  enableScreenshotCache: z.boolean().default(false),
  /** 日志级别 */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** 连接池配置 */
  connectionPool: z.object({
    /** 最小连接数 */
    minConnections: z.number().default(1),
    /** 最大连接数 */
    maxConnections: z.number().default(5),
    /** 获取连接超时（毫秒） */
    acquireTimeout: z.number().default(10000),
    /** 空闲超时（毫秒） */
    idleTimeout: z.number().default(300000),
    /** 是否懒加载 */
    lazyLoad: z.boolean().default(true),
    /** 健康检查间隔（毫秒） */
    healthCheckInterval: z.number().default(60000),
  }).default({}),
  /** 心跳配置 */
  heartbeat: z.object({
    /** 是否启用心跳 */
    enabled: z.boolean().default(true),
    /** 心跳间隔（毫秒） */
    interval: z.number().default(30000),
  }).default({}),
  /** 命令队列配置 */
  commandQueue: z.object({
    /** 最大并发数 */
    maxConcurrency: z.number().default(1),
    /** 命令超时（毫秒） */
    commandTimeout: z.number().default(30000),
  }).default({}),
});

export type HypiumDriverConfig = z.infer<typeof HypiumDriverConfigSchema>;

/**
 * 默认驱动配置
 */
export const DEFAULT_DRIVER_CONFIG: HypiumDriverConfig = {
  defaultTimeout: 10000,
  defaultRetryCount: 3,
  hdcPath: 'hdc',
  enableScreenshotCache: false,
  logLevel: 'info',
  connectionPool: {
    minConnections: 1,
    maxConnections: 5,
    acquireTimeout: 10000,
    idleTimeout: 300000,
    lazyLoad: true,
    healthCheckInterval: 60000,
  },
  heartbeat: {
    enabled: true,
    interval: 30000,
  },
  commandQueue: {
    maxConcurrency: 1,
    commandTimeout: 30000,
  },
};
