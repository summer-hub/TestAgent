import {
  LLMProvider,
  LLMProviderConfig,
  LLMMessage,
  LLMFunctionDef,
  LLMThinkResult,
  LLMEmbedResult,
  LLMStreamChunk,
} from './llm-provider';

/**
 * OpenAI Provider 配置
 */
export interface OpenAIProviderConfig extends LLMProviderConfig {
  /** 模型: gpt-4, gpt-4-turbo, gpt-3.5-turbo */
  model: string;
  /** 组织 ID */
  organizationId?: string;
}

/**
 * OpenAI 模型信息
 */
const OPENAI_MODELS: Record<string, { maxTokens: number; contextWindow: number }> = {
  'gpt-4': { maxTokens: 8192, contextWindow: 8192 },
  'gpt-4-turbo': { maxTokens: 4096, contextWindow: 128000 },
  'gpt-4o': { maxTokens: 4096, contextWindow: 128000 },
  'gpt-4o-mini': { maxTokens: 4096, contextWindow: 128000 },
  'gpt-3.5-turbo': { maxTokens: 4096, contextWindow: 16385 },
  'text-embedding-3-small': { maxTokens: 8191, contextWindow: 8191 },
  'text-embedding-3-large': { maxTokens: 8191, contextWindow: 8191 },
  'text-embedding-ada-002': { maxTokens: 8191, contextWindow: 8191 },
};

/**
 * OpenAI Provider - OpenAI API 适配器
 * 支持 GPT-4, GPT-3.5-Turbo 等模型
 */
export class OpenAIProvider extends LLMProvider {
  private openaiConfig: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.openaiConfig = config;
    this.config.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async think(messages: LLMMessage[], functions?: LLMFunctionDef[]): Promise<LLMThinkResult> {
    return this.withRetry(async () => {
      const body: Record<string, any> = {
        model: this.openaiConfig.model,
        messages: this.formatMessages(messages),
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 2048,
      };

      if (functions && functions.length > 0) {
        body.functions = this.formatFunctions(functions);
        body.function_call = 'auto';
      }

      const response = await this.request('POST', '/chat/completions', body);
      const choice = response.choices?.[0];

      if (!choice) {
        throw new Error('No response from OpenAI');
      }

      const result: LLMThinkResult = {
        content: choice.message?.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
        model: response.model,
        finishReason: choice.finish_reason,
      };

      if (choice.message?.function_call) {
        result.functionCall = {
          name: choice.message.function_call.name,
          arguments: this.parseJson(choice.message.function_call.arguments),
        };
      }

      return result;
    });
  }

  async streamThink(
    messages: LLMMessage[],
    functions?: LLMFunctionDef[],
    onChunk?: (chunk: LLMStreamChunk) => void
  ): Promise<LLMThinkResult> {
    const body: Record<string, any> = {
      model: this.openaiConfig.model,
      messages: this.formatMessages(messages),
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 2048,
      stream: true,
    };

    if (functions && functions.length > 0) {
      body.functions = this.formatFunctions(functions);
      body.function_call = 'auto';
    }

    let fullContent = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;
              onChunk?.({ delta: delta.content, done: false });
            }

            if (delta?.function_call?.name) {
              functionName += delta.function_call.name;
            }

            if (delta?.function_call?.arguments) {
              functionArgs += delta.function_call.arguments;
            }

            if (parsed.choices?.[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason;
            }
          } catch {
            // 跳过无效 JSON
          }
        }
      }

      onChunk?.({ delta: '', done: true });
    } catch (error) {
      // 降级为非流式请求
      return this.think(messages, functions);
    }

    const result: LLMThinkResult = {
      content: fullContent,
      model: this.openaiConfig.model,
      finishReason,
    };

    if (functionName) {
      result.functionCall = {
        name: functionName,
        arguments: this.parseJson(functionArgs),
      };
    }

    return result;
  }

  async embed(text: string): Promise<LLMEmbedResult> {
    return this.withRetry(async () => {
      const model = 'text-embedding-3-small';
      const response = await this.request('POST', '/embeddings', {
        model,
        input: text,
      });

      return {
        embedding: response.data?.[0]?.embedding || [],
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };
    });
  }

  getModelInfo() {
    const modelInfo = OPENAI_MODELS[this.openaiConfig.model] || { maxTokens: 4096, contextWindow: 8192 };
    return {
      provider: 'openai',
      model: this.openaiConfig.model,
      maxTokens: modelInfo.maxTokens,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request('GET', '/models');
      return true;
    } catch {
      return false;
    }
  }

  // ============ 私有方法 ============

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    if (this.openaiConfig.organizationId) {
      headers['OpenAI-Organization'] = this.openaiConfig.organizationId;
    }

    return headers;
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout || 60000
    );

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const error: any = new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.body = errorBody;
        throw error;
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private formatMessages(messages: LLMMessage[]): any[] {
    return messages.map(msg => {
      const formatted: Record<string, any> = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.name) formatted.name = msg.name;
      if (msg.functionCall) {
        formatted.function_call = msg.functionCall;
      }
      return formatted;
    });
  }

  private formatFunctions(functions: LLMFunctionDef[]): any[] {
    return functions.map(fn => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    }));
  }

  private parseJson(str: string): Record<string, any> {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }
}
