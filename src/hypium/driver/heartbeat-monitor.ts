import type { ConnectionHandle } from './connection-pool';

/**
 * 心跳监控配置
 */
export interface HeartbeatConfig {
  /** 是否启用心跳 */
  enabled: boolean;
  /** 心跳间隔（毫秒） */
  interval: number;
}

/**
 * 心跳监控器
 * 定期检测设备连接状态
 */
export class HeartbeatMonitor {
  private config: HeartbeatConfig;
  private handle: ConnectionHandle | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failureCount = 0;
  private readonly maxFailures = 3;
  private onDisconnected: (() => void) | null = null;

  constructor(config: HeartbeatConfig) {
    this.config = config;
  }

  /**
   * 启动心跳监控
   */
  start(handle: ConnectionHandle, onDisconnected: () => void): void {
    if (!this.config.enabled) return;

    this.handle = handle;
    this.onDisconnected = onDisconnected;
    this.failureCount = 0;

    this.timer = setInterval(async () => {
      await this.check();
    }, this.config.interval);
  }

  /**
   * 停止心跳监控
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.handle = null;
    this.onDisconnected = null;
    this.failureCount = 0;
  }

  /**
   * 获取连续失败次数
   */
  get failures(): number {
    return this.failureCount;
  }

  // ============ 私有方法 ============

  private async check(): Promise<void> {
    if (!this.handle) return;

    try {
      const alive = await this.handle.ping();
      if (alive) {
        this.failureCount = 0;
      } else {
        this.failureCount++;
        if (this.failureCount >= this.maxFailures) {
          this.stop();
          this.onDisconnected?.();
        }
      }
    } catch {
      this.failureCount++;
      if (this.failureCount >= this.maxFailures) {
        this.stop();
        this.onDisconnected?.();
      }
    }
  }
}
