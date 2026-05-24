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
 * 通义千问 Provider 配置
 */
export interface QwenProviderConfig extends LLMProviderConfig {
  /** 模型: qwen-turbo, qwen-plus, qwen-max */
  model: string;
}

/**
 * 通义千问模型信息
 */
const QWEN_MODELS: Record<string, { maxTokens: number; contextWindow: number }> = {
  'qwen-turbo': { maxTokens: 8192, contextWindow: 8192 },
  'qwen-plus': { maxTokens: 32768, contextWindow: 131072 },
  'qwen-max': { maxTokens: 8192, contextWindow: 32768 },
  'qwen-long': { maxTokens: 6000, contextWindow: 10000000 },
  'qwen-vl-max': { maxTokens: 8192, contextWindow: 9600 },
  'qwen-vl-plus': { maxTokens: 8192, contextWindow: 8000 },
  'qwen3-vl-flash': { maxTokens: 8192, contextWindow: 131072 },
  'text-embedding-v2': { maxTokens: 2048, contextWindow: 2048 },
  'text-embedding-v3': { maxTokens: 8192, contextWindow: 8192 },
};

/**
 * QwenProvider - 通义千问 API 适配器
 * 支持 qwen-turbo, qwen-plus, qwen-max, qwen3-vl-flash 等模型
 */
export class QwenProvider extends LLMProvider {
  private qwenConfig: QwenProviderConfig;

  constructor(config: QwenProviderConfig) {
    super(config);
    this.qwenConfig = config;
    this.config.baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }

  async think(messages: LLMMessage[], functions?: LLMFunctionDef[]): Promise<LLMThinkResult> {
    return this.withRetry(async () => {
      const body: Record<string, any> = {
        model: this.qwenConfig.model,
        messages: this.formatMessages(messages),
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 2048,
      };

      if (functions && functions.length > 0) {
        body.tools = functions.map(fn => ({
          type: 'function',
          function: {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters,
          },
        }));
        body.tool_choice = 'auto';
      }

      const response = await this.request('POST', '/chat/completions', body);
      const choice = response.choices?.[0];

      if (!choice) {
        throw new Error('No response from Qwen');
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

      // 处理 tool_calls
      if (choice.message?.tool_calls?.[0]) {
        const toolCall = choice.message.tool_calls[0];
        result.functionCall = {
          name: toolCall.function.name,
          arguments: this.parseJson(toolCall.function.arguments),
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
    // 通义千问兼容 OpenAI 流式格式
    const body: Record<string, any> = {
      model: this.qwenConfig.model,
      messages: this.formatMessages(messages),
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 2048,
      stream: true,
    };

    if (functions && functions.length > 0) {
      body.tools = functions.map(fn => ({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      }));
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
        throw new Error(`Qwen API error: ${response.status}`);
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

            if (delta?.tool_calls?.[0]?.function?.name) {
              functionName += delta.tool_calls[0].function.name;
            }

            if (delta?.tool_calls?.[0]?.function?.arguments) {
              functionArgs += delta.tool_calls[0].function.arguments;
            }

            if (parsed.choices?.[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason;
            }
          } catch {
            // skip
          }
        }
      }

      onChunk?.({ delta: '', done: true });
    } catch {
      return this.think(messages, functions);
    }

    const result: LLMThinkResult = {
      content: fullContent,
      model: this.qwenConfig.model,
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
      const response = await this.request('POST', '/embeddings', {
        model: 'text-embedding-v3',
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
    const modelInfo = QWEN_MODELS[this.qwenConfig.model] || { maxTokens: 8192, contextWindow: 32768 };
    return {
      provider: 'qwen',
      model: this.qwenConfig.model,
      maxTokens: modelInfo.maxTokens,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.think([
        { role: 'user', content: 'ping' },
      ]);
      return response.content.length > 0;
    } catch {
      return false;
    }
  }

  // ============ 私有方法 ============

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
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
        const error: any = new Error(`Qwen API error: ${response.status} ${response.statusText}`);
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
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.name ? { name: msg.name } : {}),
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
