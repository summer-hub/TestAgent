/**
 * LLM Provider 体系
 * 定义 LLM 提供者基类和适配器
 */

/**
 * LLM 消息角色
 */
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'function';

/**
 * LLM 消息
 */
export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
  name?: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
}

/**
 * LLM 函数定义
 */
export interface LLMFunctionDef {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/**
 * LLM 思考结果
 */
export interface LLMThinkResult {
  /** 思考内容 */
  content: string;
  /** 函数调用（如果有） */
  functionCall?: {
    name: string;
    arguments: Record<string, any>;
  };
  /** 使用的 token 数 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 模型信息 */
  model?: string;
  /** 完成原因 */
  finishReason?: string;
}

/**
 * LLM 嵌入结果
 */
export interface LLMEmbedResult {
  /** 嵌入向量 */
  embedding: number[];
  /** 使用的 token 数 */
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * LLM 流式响应块
 */
export interface LLMStreamChunk {
  /** 增量内容 */
  delta: string;
  /** 是否结束 */
  done: boolean;
  /** 函数调用增量 */
  functionCallDelta?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * LLM Provider 配置
 */
export interface LLMProviderConfig {
  /** API Key */
  apiKey: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 模型名称 */
  model: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔（毫秒） */
  retryInterval?: number;
}

/**
 * LLMProvider - LLM 提供者基类
 * 所有 LLM 适配器必须继承此类
 */
export abstract class LLMProvider {
  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  /**
   * 思考（推理）
   * @param messages 消息列表
   * @param functions 可用函数列表
   */
  abstract think(messages: LLMMessage[], functions?: LLMFunctionDef[]): Promise<LLMThinkResult>;

  /**
   * 流式思考
   * @param messages 消息列表
   * @param functions 可用函数列表
   * @param onChunk 流式回调
   */
  abstract streamThink(
    messages: LLMMessage[],
    functions?: LLMFunctionDef[],
    onChunk?: (chunk: LLMStreamChunk) => void
  ): Promise<LLMThinkResult>;

  /**
   * 嵌入（向量化）
   * @param text 输入文本
   */
  abstract embed(text: string): Promise<LLMEmbedResult>;

  /**
   * 获取模型信息
   */
  abstract getModelInfo(): { provider: string; model: string; maxTokens: number };

  /**
   * 测试连接
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * 带重试的请求
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries?: number,
    retryInterval?: number
  ): Promise<T> {
    const retries = maxRetries ?? this.config.maxRetries ?? 2;
    const interval = retryInterval ?? this.config.retryInterval ?? 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 不可重试的错误
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < retries) {
          await this.delay(interval * (attempt + 1));
        }
      }
    }

    throw lastError!;
  }

  /**
   * 判断是否为不可重试的错误
   */
  protected isNonRetryableError(error: any): boolean {
    if (error?.status === 401 || error?.status === 403) return true;
    if (error?.status === 400) return true;
    return false;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
