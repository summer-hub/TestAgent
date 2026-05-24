import { DeviceConnectionError } from '@core/errors';
import type { ConnectionHandle } from './connection-pool';

/**
 * 命令队列项
 */
interface CommandQueueItem {
  /** 命令内容 */
  command: string;
  /** 超时时间 */
  timeout: number;
  /** 执行结果回调 */
  resolve: (result: string) => void;
  /** 错误回调 */
  reject: (error: Error) => void;
}

/**
 * 命令队列配置
 */
export interface CommandQueueConfig {
  /** 最大并发数 */
  maxConcurrency: number;
  /** 命令超时（毫秒） */
  commandTimeout: number;
}

/**
 * 设备命令队列
 * 串行化设备命令执行，避免并发冲突
 */
export class CommandQueue {
  private config: CommandQueueConfig;
  private queue: CommandQueueItem[] = [];
  private activeCount = 0;
  private processing = false;

  constructor(config: CommandQueueConfig) {
    this.config = config;
  }

  /**
   * 入队并执行命令
   */
  async execute(command: string, handle: ConnectionHandle, timeout?: number): Promise<string> {
    const cmdTimeout = timeout || this.config.commandTimeout;

    return new Promise<string>((resolve, reject) => {
      this.queue.push({ command, timeout: cmdTimeout, resolve, reject });
      this.process(handle);
    });
  }

  /**
   * 清空队列
   */
  clear(): void {
    const pending = this.queue.splice(0);
    for (const item of pending) {
      item.reject(new DeviceConnectionError('Command queue cleared'));
    }
    this.activeCount = 0;
    this.processing = false;
  }

  /**
   * 获取队列长度
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * 获取活跃命令数
   */
  get active(): number {
    return this.activeCount;
  }

  // ============ 私有方法 ============

  private async process(handle: ConnectionHandle): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.config.maxConcurrency) {
      const item = this.queue.shift();
      if (!item) break;

      this.activeCount++;

      // 异步执行，不阻塞队列处理
      this.executeCommand(item, handle).finally(() => {
        this.activeCount--;
        // 继续处理队列
        if (this.queue.length > 0) {
          this.process(handle);
        }
      });
    }

    this.processing = false;
  }

  private async executeCommand(item: CommandQueueItem, handle: ConnectionHandle): Promise<void> {
    const timer = setTimeout(() => {
      item.reject(new DeviceConnectionError(
        `Command timeout after ${item.timeout}ms: ${item.command}`
      ));
    }, item.timeout);

    try {
      const result = await handle.execute(item.command, item.timeout);
      clearTimeout(timer);
      item.resolve(result);
    } catch (error) {
      clearTimeout(timer);
      item.reject(
        error instanceof Error
          ? error
          : new DeviceConnectionError(String(error))
      );
    }
  }
}
