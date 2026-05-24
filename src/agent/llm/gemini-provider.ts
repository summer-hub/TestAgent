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
 * Gemini Provider 配置
 */
export interface GeminiProviderConfig extends LLMProviderConfig {
  /** 模型: gemini-pro, gemini-1.5-pro, gemini-1.5-flash */
  model: string;
  /** 项目 ID */
  projectId?: string;
}

/**
 * Gemini 模型信息
 */
const GEMINI_MODELS: Record<string, { maxTokens: number; contextWindow: number }> = {
  'gemini-pro': { maxTokens: 2048, contextWindow: 32768 },
  'gemini-1.5-pro': { maxTokens: 8192, contextWindow: 2097152 },
  'gemini-1.5-flash': { maxTokens: 8192, contextWindow: 1048576 },
  'gemini-2.0-flash': { maxTokens: 8192, contextWindow: 1048576 },
  'text-embedding-004': { maxTokens: 2048, contextWindow: 2048 },
};

/**
 * GeminiProvider - Google Gemini API 适配器
 * 支持 Gemini Pro 等模型
 */
export class GeminiProvider extends LLMProvider {
  private geminiConfig: GeminiProviderConfig;

  constructor(config: GeminiProviderConfig) {
    super(config);
    this.geminiConfig = config;
    this.config.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  async think(messages: LLMMessage[], functions?: LLMFunctionDef[]): Promise<LLMThinkResult> {
    return this.withRetry(async () => {
      const body = this.buildRequestBody(messages, functions);

      const url = `${this.config.baseUrl}/models/${this.geminiConfig.model}:generateContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error: any = new Error(`Gemini API error: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json() as Record<string, any>;
      const candidate = data.candidates?.[0];

      if (!candidate) {
        throw new Error('No response from Gemini');
      }

      const result: LLMThinkResult = {
        content: candidate.content?.parts?.[0]?.text || '',
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount || 0,
          completionTokens: data.usageMetadata.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata.totalTokenCount || 0,
        } : undefined,
        model: this.geminiConfig.model,
        finishReason: candidate.finishReason,
      };

      // 处理函数调用
      const functionCall = candidate.content?.parts?.find((p: any) => p.functionCall);
      if (functionCall?.functionCall) {
        result.functionCall = {
          name: functionCall.functionCall.name,
          arguments: functionCall.functionCall.args || {},
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
    const body = this.buildRequestBody(messages, functions);
    body.generationConfig = body.generationConfig || {};

    const url = `${this.config.baseUrl}/models/${this.geminiConfig.model}:streamGenerateContent?alt=sse`;

    let fullContent = '';
    let functionName = '';
    let functionArgs: Record<string, any> = {};
    let finishReason = '';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
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
          try {
            const parsed = JSON.parse(data);
            const parts = parsed.candidates?.[0]?.content?.parts || [];

            for (const part of parts) {
              if (part.text) {
                fullContent += part.text;
                onChunk?.({ delta: part.text, done: false });
              }
              if (part.functionCall) {
                functionName = part.functionCall.name;
                functionArgs = part.functionCall.args || {};
              }
            }

            if (parsed.candidates?.[0]?.finishReason) {
              finishReason = parsed.candidates[0].finishReason;
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
      model: this.geminiConfig.model,
      finishReason,
    };

    if (functionName) {
      result.functionCall = { name: functionName, arguments: functionArgs };
    }

    return result;
  }

  async embed(text: string): Promise<LLMEmbedResult> {
    return this.withRetry(async () => {
      const url = `${this.config.baseUrl}/models/text-embedding-004:embedContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini embedding error: ${response.status}`);
      }

      const data = await response.json() as Record<string, any>;

      return {
        embedding: data.embedding?.values || [],
      };
    });
  }

  getModelInfo() {
    const modelInfo = GEMINI_MODELS[this.geminiConfig.model] || { maxTokens: 2048, contextWindow: 32768 };
    return {
      provider: 'gemini',
      model: this.geminiConfig.model,
      maxTokens: modelInfo.maxTokens,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.think([
        { role: 'user', content: 'ping' },
      ]);
      return result.content.length > 0;
    } catch {
      return false;
    }
  }

  // ============ 私有方法 ============

  private buildRequestBody(messages: LLMMessage[], functions?: LLMFunctionDef[]): any {
    // 从消息中提取 system 消息到 Gemini 的 system_instruction 顶层字段
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const contents = this.formatMessages(nonSystemMessages);
    const body: any = {
      contents,
      generationConfig: {
        temperature: this.config.temperature ?? 0.7,
        maxOutputTokens: this.config.maxTokens ?? 2048,
      },
    };

    if (functions && functions.length > 0) {
      body.tools = [{
        functionDeclarations: functions.map(fn => ({
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        })),
      }];
    }

    // Gemini 使用 system_instruction 顶层字段传递系统指令，而非混入 contents
    if (systemMessages.length > 0) {
      const systemText = systemMessages.map(m => m.content).join('\n');
      body.system_instruction = { parts: [{ text: systemText }] };
    }

    return body;
  }

  private formatMessages(messages: LLMMessage[]): any[] {
    const contents: any[] = [];
    let currentRole = '';
    let currentParts: any[] = [];

    // Gemini 使用 role: "user" | "model"，需要合并连续同角色消息
    for (const msg of messages) {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

      if (geminiRole !== currentRole && currentParts.length > 0) {
        contents.push({ role: currentRole, parts: currentParts });
        currentParts = [];
      }

      currentRole = geminiRole;

      if (msg.functionCall) {
        currentParts.push({
          functionCall: {
            name: msg.functionCall.name,
            args: this.parseJson(msg.functionCall.arguments),
          },
        });
      } else {
        currentParts.push({ text: msg.content });
      }
    }

    if (currentParts.length > 0) {
      contents.push({ role: currentRole, parts: currentParts });
    }

    return contents;
  }

  private parseJson(str: string | Record<string, any>): Record<string, any> {
    if (typeof str === 'object') return str;
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }
}
