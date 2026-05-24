import { DeviceStatus } from '@core/types/element.type';
import { DeviceConnectionError } from '@core/errors';
import type { HypiumDriverConfig } from './driver-config';

/**
 * 连接池中的连接条目
 */
export interface PoolEntry {
  /** 设备 ID */
  deviceId: string;
  /** 连接状态 */
  status: DeviceStatus;
  /** 最后活跃时间 */
  lastActiveTime: number;
  /** 创建时间 */
  createTime: number;
  /** 是否正在使用 */
  inUse: boolean;
  /** 连接句柄（用于执行命令） */
  handle: ConnectionHandle;
}

/**
 * 连接句柄 - 封装与设备的通信通道
 */
export interface ConnectionHandle {
  /** 执行 HDC 命令 */
  execute(command: string, timeout?: number): Promise<string>;
  /** 关闭连接 */
  close(): Promise<void>;
  /** 健康检查 */
  ping(): Promise<boolean>;
}

/**
 * 连接池配置
 */
export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  idleTimeout: number;
  lazyLoad: boolean;
  healthCheckInterval: number;
}

/**
 * 等待获取连接的 Promise 回调
 */
interface WaitingAcquire {
  resolve: (entry: PoolEntry) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * 设备连接池
 * 管理与 HarmonyOS 设备的多个连接
 */
export class ConnectionPool {
  private config: ConnectionPoolConfig;
  private hdcPath: string;
  private pool: Map<string, PoolEntry> = new Map();
  private nextKeyId = 0;
  private waitQueue: WaitingAcquire[] = [];
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(poolConfig: ConnectionPoolConfig, hdcPath: string = 'hdc') {
    this.config = poolConfig;
    this.hdcPath = hdcPath;
  }

  /**
   * 初始化连接池
   */
  async initialize(deviceId: string): Promise<void> {
    if (this.initialized) return;

    if (!this.config.lazyLoad) {
      // 非懒加载模式：预创建最小连接数
      for (let i = 0; i < this.config.minConnections; i++) {
        const entry = await this.createConnection(deviceId);
        const key = `${deviceId}-${this.nextKeyId++}`;
        this.pool.set(key, entry);
      }
    }

    // 启动健康检查
    this.startHealthCheck();
    // 启动空闲连接清理
    this.startIdleCheck();
    this.initialized = true;
  }

  /**
   * 获取一个可用连接
   */
  async acquire(deviceId: string, timeout?: number): Promise<PoolEntry> {
    const acquireTimeout = timeout || this.config.acquireTimeout;

    // 尝试从池中获取空闲连接
    const idleEntry = this.findIdleEntry(deviceId);
    if (idleEntry) {
      idleEntry.inUse = true;
      idleEntry.lastActiveTime = Date.now();
      return idleEntry;
    }

    // 池未满时创建新连接
    if (this.pool.size < this.config.maxConnections) {
      const entry = await this.createConnection(deviceId);
      entry.inUse = true;
      const key = `${deviceId}-${this.nextKeyId++}`;
      this.pool.set(key, entry);
      return entry;
    }

    // 等待其他连接释放
    return new Promise<PoolEntry>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waitQueue.splice(idx, 1);
        reject(new DeviceConnectionError(
          `Connection pool acquire timeout after ${acquireTimeout}ms`
        ));
      }, acquireTimeout);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  /**
   * 释放连接回池
   */
  release(entry: PoolEntry): void {
    entry.inUse = false;
    entry.lastActiveTime = Date.now();

    // 检查是否有等待的请求
    const waiting = this.waitQueue.shift();
    if (waiting) {
      clearTimeout(waiting.timer);
      entry.inUse = true;
      waiting.resolve(entry);
    }
  }

  /**
   * 关闭所有连接并销毁池
   */
  async destroy(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }

    // 拒绝所有等待的请求
    for (const waiting of this.waitQueue) {
      clearTimeout(waiting.timer);
      waiting.reject(new DeviceConnectionError('Connection pool is being destroyed'));
    }
    this.waitQueue = [];

    // 关闭所有连接
    for (const entry of this.pool.values()) {
      try {
        await entry.handle.close();
      } catch {
        // 忽略关闭错误
      }
    }
    this.pool.clear();
    this.initialized = false;
  }

  /**
   * 获取池状态
   */
  getStats(): { total: number; inUse: number; idle: number; waiting: number } {
    let inUse = 0;
    for (const entry of this.pool.values()) {
      if (entry.inUse) inUse++;
    }
    return {
      total: this.pool.size,
      inUse,
      idle: this.pool.size - inUse,
      waiting: this.waitQueue.length,
    };
  }

  // ============ 私有方法 ============

  private findIdleEntry(deviceId: string): PoolEntry | null {
    for (const entry of this.pool.values()) {
      if (entry.deviceId === deviceId && !entry.inUse && entry.status === DeviceStatus.CONNECTED) {
        return entry;
      }
    }
    return null;
  }

  private async createConnection(deviceId: string): Promise<PoolEntry> {
    const handle = new HdcConnectionHandle(this.hdcPath, deviceId);
    const connected = await handle.connect();
    if (!connected) {
      throw new DeviceConnectionError(`Failed to create connection to device: ${deviceId}`);
    }

    return {
      deviceId,
      status: DeviceStatus.CONNECTED,
      lastActiveTime: Date.now(),
      createTime: Date.now(),
      inUse: false,
      handle,
    };
  }

  private startHealthCheck(): void {
    if (this.config.healthCheckInterval <= 0) return;

    this.healthCheckTimer = setInterval(async () => {
      for (const [key, entry] of this.pool.entries()) {
        if (entry.inUse) continue;
        try {
          const alive = await entry.handle.ping();
          if (!alive) {
            entry.status = DeviceStatus.ERROR;
            await entry.handle.close();
            this.pool.delete(key);
          }
        } catch {
          entry.status = DeviceStatus.ERROR;
          this.pool.delete(key);
        }
      }
    }, this.config.healthCheckInterval);
  }

  private startIdleCheck(): void {
    // 每 60 秒检查一次空闲连接
    this.idleCheckTimer = setInterval(async () => {
      if (this.pool.size <= this.config.minConnections) return;

      const now = Date.now();
      for (const [key, entry] of this.pool.entries()) {
        if (entry.inUse) continue;
        if (now - entry.lastActiveTime > this.config.idleTimeout) {
          if (this.pool.size > this.config.minConnections) {
            try {
              await entry.handle.close();
            } catch {
              // 忽略关闭错误
            }
            this.pool.delete(key);
          }
        }
      }
    }, 60000);
  }
}

/**
 * HDC 连接句柄实现
 * 通过 child_process 执行 HDC 命令
 */
export class HdcConnectionHandle implements ConnectionHandle {
  private hdcPath: string;
  private deviceId: string;
  private connected = false;

  constructor(hdcPath: string, deviceId: string) {
    this.hdcPath = hdcPath;
    this.deviceId = deviceId;
  }

  /**
   * 建立连接
   */
  async connect(): Promise<boolean> {
    try {
      const result = await this.executeRaw(`list targets`, 10000);
      // 检查设备是否在列表中
      // 当 hdc list targets 返回空时输出包含 '[empty]'；否则包含设备 ID
      const isEmpty = result.includes('[empty]');
      if (result.includes(this.deviceId) && !isEmpty) {
        this.connected = true;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 执行 HDC 命令
   */
  async execute(command: string, timeout?: number): Promise<string> {
    if (!this.connected) {
      throw new DeviceConnectionError('Connection handle is not connected');
    }
    return this.executeRaw(command, timeout);
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    this.connected = false;
  }

  /**
   * 健康检查
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.executeRaw(`shell echo ping`, 5000);
      return result.includes('ping');
    } catch {
      return false;
    }
  }

  /**
   * 原始命令执行
   */
  private executeRaw(command: string, timeout?: number): Promise<string> {
    const cmdTimeout = timeout || 30000;
    const fullCommand = `${this.hdcPath} -t ${this.deviceId} ${command}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new DeviceConnectionError(`HDC command timeout: ${fullCommand}`));
      }, cmdTimeout);

      try {
        // 使用 dynamic import 避免在非 Node.js 环境报错
        const { exec } = require('child_process') as typeof import('child_process');
        exec(fullCommand, { timeout: cmdTimeout }, (error, stdout, stderr) => {
          clearTimeout(timer);
          if (error) {
            reject(new DeviceConnectionError(
              `HDC command failed: ${error.message}`,
              { command: fullCommand, stderr }
            ));
            return;
          }
          resolve(stdout.trim());
        });
      } catch {
        // 在非 Node.js 环境或测试环境下降级为模拟
        clearTimeout(timer);
        resolve(`[HDC-MOCK] ${fullCommand}`);
      }
    });
  }
}
