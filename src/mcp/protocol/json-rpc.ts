import { z } from 'zod';

/**
 * JSON-RPC 2.0 标准错误码
 */
export const JSONRPC_ERROR_CODES = {
  /** 解析错误 */
  PARSE_ERROR: -32700,
  /** 无效请求 */
  INVALID_REQUEST: -32600,
  /** 方法未找到 */
  METHOD_NOT_FOUND: -32601,
  /** 无效参数 */
  INVALID_PARAMS: -32602,
  /** 内部错误 */
  INTERNAL_ERROR: -32603,
} as const;

/**
 * MCP 业务错误码范围: -32000 ~ -32099
 */
export const MCP_ERROR_CODES = {
  /** 工具未找到 */
  TOOL_NOT_FOUND: -32000,
  /** 工具参数错误 */
  TOOL_INVALID_PARAMS: -32001,
  /** 工具执行错误 */
  TOOL_EXECUTION_ERROR: -32002,
  /** 初始化失败 */
  INITIALIZATION_FAILED: -32003,
  /** 能力不支持 */
  CAPABILITY_NOT_SUPPORTED: -32004,
  /** 超时 */
  TIMEOUT: -32005,
  /** 连接错误 */
  CONNECTION_ERROR: -32006,
  /** 认证失败 */
  AUTH_FAILED: -32007,
} as const;

/**
 * JSON-RPC 请求 Schema
 */
export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.any()).optional(),
});

/**
 * JSON-RPC 响应 Schema
 */
export const JSONRPCResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.any().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.any().optional(),
  }).optional(),
}).refine(
  (data) => data.result !== undefined || data.error !== undefined,
  { message: 'Response must have either result or error' }
);

/**
 * JSON-RPC 通知 Schema
 */
export const JSONRPCNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1),
  params: z.record(z.any()).optional(),
});

/**
 * JSON-RPC 错误 Schema
 */
export const JSONRPCErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.any().optional(),
});

// 类型导出
export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;
export type JSONRPCResponse = z.infer<typeof JSONRPCResponseSchema>;
export type JSONRPCNotification = z.infer<typeof JSONRPCNotificationSchema>;
export type JSONRPCError = z.infer<typeof JSONRPCErrorSchema>;

/**
 * JSON-RPC 2.0 编解码器
 * 提供请求/响应/通知/错误的创建和验证
 */
export class JSONRPCCodec {
  private requestIdCounter = 0;

  /**
   * 创建 JSON-RPC 请求
   */
  createRequest(method: string, params?: Record<string, any>, id?: string | number): JSONRPCRequest {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: id ?? ++this.requestIdCounter,
      method,
      params,
    };
    return JSONRPCRequestSchema.parse(request);
  }

  /**
   * 创建 JSON-RPC 成功响应
   */
  createResponse(id: string | number, result: any): JSONRPCResponse {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    return JSONRPCResponseSchema.parse(response);
  }

  /**
   * 创建 JSON-RPC 错误响应
   */
  createErrorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: any
  ): JSONRPCResponse {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    return JSONRPCResponseSchema.parse(response);
  }

  /**
   * 创建 JSON-RPC 通知（无 id，不需要响应）
   */
  createNotification(method: string, params?: Record<string, any>): JSONRPCNotification {
    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    return JSONRPCNotificationSchema.parse(notification);
  }

  /**
   * 验证 JSON-RPC 消息
   * @returns 验证结果和解析后的消息
   */
  validate(message: unknown): { valid: boolean; type?: 'request' | 'response' | 'notification'; error?: string } {
    if (typeof message !== 'object' || message === null) {
      return { valid: false, error: 'Message must be an object' };
    }

    const msg = message as Record<string, any>;
    if (msg.jsonrpc !== '2.0') {
      return { valid: false, error: 'jsonrpc must be "2.0"' };
    }

    // 判断是请求、响应还是通知
    if ('id' in msg) {
      if ('method' in msg) {
        const result = JSONRPCRequestSchema.safeParse(message);
        if (result.success) return { valid: true, type: 'request' };
        return { valid: false, error: result.error.message };
      }
      const result = JSONRPCResponseSchema.safeParse(message);
      if (result.success) return { valid: true, type: 'response' };
      return { valid: false, error: result.error.message };
    }

    if ('method' in msg) {
      const result = JSONRPCNotificationSchema.safeParse(message);
      if (result.success) return { valid: true, type: 'notification' };
      return { valid: false, error: result.error.message };
    }

    return { valid: false, error: 'Unknown message type' };
  }

  /**
   * 解码 JSON 字符串为 JSON-RPC 消息
   */
  decode(json: string): { message?: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification; error?: string } {
    try {
      const parsed = JSON.parse(json);
      const validation = this.validate(parsed);
      if (!validation.valid) {
        return { error: validation.error };
      }
      return { message: parsed as JSONRPCRequest | JSONRPCResponse | JSONRPCNotification };
    } catch (e) {
      return { error: `JSON parse error: ${(e as Error).message}` };
    }
  }

  /**
   * 编码 JSON-RPC 消息为 JSON 字符串
   */
  encode(message: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification): string {
    return JSON.stringify(message);
  }

  /**
   * 创建批量请求
   */
  createBatchRequest(requests: Array<{ method: string; params?: Record<string, any> }>): JSONRPCRequest[] {
    return requests.map((req) => this.createRequest(req.method, req.params));
  }

  /**
   * 解码批量消息
   */
  decodeBatch(json: string): Array<{ message?: JSONRPCRequest | JSONRPCResponse | JSONRPCNotification; error?: string }> {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        return [this.decode(json)];
      }
      return parsed.map((item: unknown) => {
        const validation = this.validate(item);
        if (!validation.valid) {
          return { error: validation.error };
        }
        return { message: item as JSONRPCRequest | JSONRPCResponse | JSONRPCNotification };
      });
    } catch (e) {
      return [{ error: `JSON parse error: ${(e as Error).message}` }];
    }
  }

  /**
   * 判断是否为标准错误码
   */
  isStandardErrorCode(code: number): boolean {
    return code >= -32700 && code <= -32600;
  }

  /**
   * 判断是否为 MCP 业务错误码
   */
  isMCPErrorCode(code: number): boolean {
    return code >= -32099 && code <= -32000;
  }

  /**
   * 获取错误码描述
   */
  getErrorMessage(code: number): string {
    switch (code) {
      case JSONRPC_ERROR_CODES.PARSE_ERROR: return 'Parse error';
      case JSONRPC_ERROR_CODES.INVALID_REQUEST: return 'Invalid request';
      case JSONRPC_ERROR_CODES.METHOD_NOT_FOUND: return 'Method not found';
      case JSONRPC_ERROR_CODES.INVALID_PARAMS: return 'Invalid params';
      case JSONRPC_ERROR_CODES.INTERNAL_ERROR: return 'Internal error';
      case MCP_ERROR_CODES.TOOL_NOT_FOUND: return 'Tool not found';
      case MCP_ERROR_CODES.TOOL_INVALID_PARAMS: return 'Invalid tool parameters';
      case MCP_ERROR_CODES.TOOL_EXECUTION_ERROR: return 'Tool execution error';
      case MCP_ERROR_CODES.INITIALIZATION_FAILED: return 'Initialization failed';
      case MCP_ERROR_CODES.CAPABILITY_NOT_SUPPORTED: return 'Capability not supported';
      case MCP_ERROR_CODES.TIMEOUT: return 'Request timeout';
      case MCP_ERROR_CODES.CONNECTION_ERROR: return 'Connection error';
      case MCP_ERROR_CODES.AUTH_FAILED: return 'Authentication failed';
      default: return 'Unknown error';
    }
  }
}
