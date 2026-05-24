/**
 * 事件系统
 * 支持 step:start/end, fix:start/end, agent:error/complete 事件
 * 通配符监听、优先级
 */

/**
 * 事件类型
 */
export enum AgentEventType {
  /** 步骤开始 */
  STEP_START = 'step:start',
  /** 步骤结束 */
  STEP_END = 'step:end',
  /** 修复开始 */
  FIX_START = 'fix:start',
  /** 修复结束 */
  FIX_END = 'fix:end',
  /** Agent 错误 */
  AGENT_ERROR = 'agent:error',
  /** Agent 完成 */
  AGENT_COMPLETE = 'agent:complete',
}

/**
 * 事件数据
 */
export interface AgentEvent {
  /** 事件类型 */
  type: AgentEventType | string;
  /** 事件数据 */
  data: any;
  /** 时间戳 */
  timestamp: number;
  /** 事件来源 */
  source?: string;
}

/**
 * 事件监听器
 */
export interface EventListener {
  /** 监听的事件类型（支持通配符 '*'） */
  eventType: AgentEventType | string;
  /** 回调函数 */
  handler: (event: AgentEvent) => void | Promise<void>;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 是否只监听一次 */
  once: boolean;
  /** 监听器 ID */
  id: string;
}

/**
 * EventSystem - Agent 事件系统
 * 提供事件发布/订阅机制
 */
export class EventSystem {
  private listeners: Map<string, EventListener[]> = new Map();
  private wildcardListeners: EventListener[] = [];
  private listenerIdCounter = 0;
  private eventHistory: AgentEvent[] = [];
  private maxHistorySize = 1000;

  /**
   * 注册事件监听器
   * @param eventType 事件类型，'*' 表示监听所有事件
   * @param handler 回调函数
   * @param options 选项
   */
  on(
    eventType: AgentEventType | string,
    handler: (event: AgentEvent) => void | Promise<void>,
    options?: { priority?: number; once?: boolean }
  ): string {
    const id = `listener-${++this.listenerIdCounter}`;
    const listener: EventListener = {
      eventType,
      handler,
      priority: options?.priority ?? 10,
      once: options?.once ?? false,
      id,
    };

    if (eventType === '*') {
      this.wildcardListeners.push(listener);
      this.wildcardListeners.sort((a, b) => a.priority - b.priority);
    } else {
      const listeners = this.listeners.get(eventType) || [];
      listeners.push(listener);
      listeners.sort((a, b) => a.priority - b.priority);
      this.listeners.set(eventType, listeners);
    }

    return id;
  }

  /**
   * 注册一次性事件监听器
   */
  once(
    eventType: AgentEventType | string,
    handler: (event: AgentEvent) => void | Promise<void>,
    options?: { priority?: number }
  ): string {
    return this.on(eventType, handler, { ...options, once: true });
  }

  /**
   * 移除事件监听器
   */
  off(listenerId: string): boolean {
    // 搜索常规监听器
    for (const [type, listeners] of this.listeners.entries()) {
      const index = listeners.findIndex(l => l.id === listenerId);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.listeners.delete(type);
        }
        return true;
      }
    }

    // 搜索通配符监听器
    const wildcardIndex = this.wildcardListeners.findIndex(l => l.id === listenerId);
    if (wildcardIndex !== -1) {
      this.wildcardListeners.splice(wildcardIndex, 1);
      return true;
    }

    return false;
  }

  /**
   * 发射事件
   */
  async emit(type: AgentEventType | string, data: any, source?: string): Promise<void> {
    const event: AgentEvent = {
      type,
      data,
      timestamp: Date.now(),
      source,
    };

    // 记录事件历史
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // 通知通配符监听器
    await this.notifyListeners(this.wildcardListeners, event);

    // 通知特定类型监听器
    const listeners = this.listeners.get(type) || [];
    await this.notifyListeners(listeners, event);
  }

  /**
   * 获取事件历史
   */
  getHistory(eventType?: AgentEventType | string): AgentEvent[] {
    if (eventType) {
      return this.eventHistory.filter(e => e.type === eventType);
    }
    return [...this.eventHistory];
  }

  /**
   * 清空事件历史
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.wildcardListeners = [];
  }

  /**
   * 获取监听器数量
   */
  get listenerCount(): number {
    let count = this.wildcardListeners.length;
    for (const listeners of this.listeners.values()) {
      count += listeners.length;
    }
    return count;
  }

  // ============ 私有方法 ============

  private async notifyListeners(listeners: EventListener[], event: AgentEvent): Promise<void> {
    const toRemove: string[] = [];

    for (const listener of listeners) {
      try {
        await listener.handler(event);
      } catch (error) {
        // 监听器错误不应阻断其他监听器
        console.error(`Event listener error [${listener.id}]:`, error);
      }

      if (listener.once) {
        toRemove.push(listener.id);
      }
    }

    // 移除一次性监听器
    for (const id of toRemove) {
      this.off(id);
    }
  }
}
