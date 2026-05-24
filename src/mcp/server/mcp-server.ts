import { IMCPService } from '@core/interfaces/mcp.interface';
import {
  ToolDefinition,
  ToolHandler,
  ToolResult,
  MCPServerConfig,
} from '@core/types/tool-result.type';
import {
  JSONRPCCodec,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPC_ERROR_CODES,
  MCP_ERROR_CODES,
} from '../protocol/json-rpc';

/**
 * MCP 服务端配置
 */
export interface MCPServerOptions {
  /** 服务名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 能力声明 */
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
  /** 命名空间前缀 */
  namespace?: string;
}

/**
 * 注册的工具条目
 */
interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  /** 带命名空间的完整名称 */
  fullName: string;
  /** 方法别名列表 */
  aliases: string[];
}

/**
 * MCPServer - MCP 服务端实现
 * 提供工具注册、请求路由、参数验证
 */
export class MCPServer implements IMCPService {
  private config: MCPServerOptions;
  private tools: Map<string, RegisteredTool> = new Map();
  private aliasMap: Map<string, string> = new Map(); // alias -> toolName
  private codec: JSONRPCCodec;
  private running = false;

  constructor(options: MCPServerOptions) {
    this.config = options;
    this.codec = new JSONRPCCodec();
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    this.running = true;
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    this.running = false;
  }

  /**
   * 注册工具
   * @param definition 工具定义
   * @param handler 工具处理器
   * @param options 注册选项
   */
  registerTool(
    definition: ToolDefinition,
    handler: ToolHandler,
    options?: { aliases?: string[] }
  ): void {
    const fullName = this.config.namespace
      ? `${this.config.namespace}:${definition.name}`
      : definition.name;

    const aliases = options?.aliases || [];

    const entry: RegisteredTool = {
      definition,
      handler,
      fullName,
      aliases,
    };

    this.tools.set(fullName, entry);

    // 注册别名
    for (const alias of aliases) {
      const fullAlias = this.config.namespace
        ? `${this.config.namespace}:${alias}`
        : alias;
      this.aliasMap.set(fullAlias, fullName);
    }
  }

  /**
   * 注销工具
   */
  unregisterTool(name: string): void {
    const fullName = this.config.namespace
      ? `${this.config.namespace}:${name}`
      : name;

    const entry = this.tools.get(fullName);
    if (entry) {
      // 清理别名：使用和注册时一致的完整命名空间 key
      for (const alias of entry.aliases) {
        const fullAlias = this.config.namespace
          ? `${this.config.namespace}:${alias}`
          : alias;
        this.aliasMap.delete(fullAlias);
      }
      this.tools.delete(fullName);
    }
  }

  /**
   * 处理 JSON-RPC 请求
   */
  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (!this.running) {
      return this.codec.createErrorResponse(
        request.id,
        MCP_ERROR_CODES.CONNECTION_ERROR,
        'Server is not running'
      );
    }

    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request);
      case 'tools/list':
        return this.handleToolsList(request);
      case 'tools/call':
        return this.handleToolsCall(request);
      default:
        // 检查是否是注册的工具方法名
        const toolEntry = this.resolveTool(request.method);
        if (toolEntry) {
          return this.handleDirectToolCall(request, toolEntry);
        }
        return this.codec.createErrorResponse(
          request.id,
          JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${request.method}`
        );
    }
  }

  /**
   * 处理原始 JSON 消息
   */
  async handleMessage(json: string): Promise<string> {
    const decoded = this.codec.decode(json);
    if (decoded.error) {
      return JSON.stringify(this.codec.createErrorResponse(
        0,
        JSONRPC_ERROR_CODES.PARSE_ERROR,
        decoded.error
      ));
    }

    const message = decoded.message!;

    // 通知消息不需要响应
    if ('method' in message && !('id' in message)) {
      return ''; // 通知无响应
    }

    // 请求消息
    if ('method' in message && 'id' in message) {
      const response = await this.handleRequest(message as JSONRPCRequest);
      return this.codec.encode(response);
    }

    return JSON.stringify(this.codec.createErrorResponse(
      0,
      JSONRPC_ERROR_CODES.INVALID_REQUEST,
      'Invalid message type'
    ));
  }

  /**
   * 获取服务配置
   */
  getConfig(): MCPServerConfig {
    return {
      name: this.config.name,
      version: this.config.version,
      capabilities: {
        tools: this.config.capabilities.tools ?? (this.tools.size > 0),
        resources: this.config.capabilities.resources ?? false,
        prompts: this.config.capabilities.prompts ?? false,
      },
    };
  }

  /**
   * 获取已注册工具数量
   */
  get toolCount(): number {
    return this.tools.size;
  }

  /**
   * 检查是否运行中
   */
  get isRunning(): boolean {
    return this.running;
  }

  // ============ 私有方法 ============

  private resolveTool(name: string): RegisteredTool | undefined {
    // 直接查找
    const direct = this.tools.get(name);
    if (direct) return direct;

    // 通过别名查找
    const aliasedName = this.aliasMap.get(name);
    if (aliasedName) return this.tools.get(aliasedName);

    // 无命名空间查找
    for (const [key, entry] of this.tools.entries()) {
      if (key.endsWith(`:${name}`) || entry.definition.name === name) {
        return entry;
      }
    }

    return undefined;
  }

  private handleInitialize(request: JSONRPCRequest): JSONRPCResponse {
    const config = this.getConfig();
    return this.codec.createResponse(request.id, {
      protocolVersion: '2024-11-05',
      capabilities: config.capabilities,
      serverInfo: {
        name: config.name,
        version: config.version,
      },
    });
  }

  private handleToolsList(request: JSONRPCRequest): JSONRPCResponse {
    const tools = Array.from(this.tools.values()).map(t => ({
      name: t.fullName,
      description: t.definition.description,
      inputSchema: t.definition.inputSchema,
    }));

    return this.codec.createResponse(request.id, { tools });
  }

  private async handleToolsCall(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const params = request.params || {};
    const toolName = params.name as string;
    const arguments_ = (params.arguments || {}) as Record<string, any>;

    if (!toolName) {
      return this.codec.createErrorResponse(
        request.id,
        MCP_ERROR_CODES.TOOL_INVALID_PARAMS,
        'Missing tool name'
      );
    }

    const entry = this.resolveTool(toolName);
    if (!entry) {
      return this.codec.createErrorResponse(
        request.id,
        MCP_ERROR_CODES.TOOL_NOT_FOUND,
        `Tool not found: ${toolName}`
      );
    }

    // 参数验证
    const validation = this.validateToolParams(entry.definition, arguments_);
    if (!validation.valid) {
      return this.codec.createErrorResponse(
        request.id,
        MCP_ERROR_CODES.TOOL_INVALID_PARAMS,
        validation.error!,
        validation.errors
      );
    }

    try {
      const result = await entry.handler(arguments_);
      return this.codec.createResponse(request.id, {
        content: [
          {
            type: 'text',
            text: result.content || JSON.stringify(result.data),
          },
        ],
        ...result,
      });
    } catch (error) {
      return this.codec.createResponse(request.id, {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      });
    }
  }

  private async handleDirectToolCall(
    request: JSONRPCRequest,
    entry: RegisteredTool
  ): Promise<JSONRPCResponse> {
    const params = request.params || {};

    // 参数验证
    const validation = this.validateToolParams(entry.definition, params);
    if (!validation.valid) {
      return this.codec.createErrorResponse(
        request.id,
        MCP_ERROR_CODES.TOOL_INVALID_PARAMS,
        validation.error!,
        validation.errors
      );
    }

    try {
      const result = await entry.handler(params);
      return this.codec.createResponse(request.id, result);
    } catch (error) {
      return this.codec.createErrorResponse(
        request.id,
        MCP_ERROR_CODES.TOOL_EXECUTION_ERROR,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private validateToolParams(
    definition: ToolDefinition,
    params: Record<string, any>
  ): { valid: boolean; error?: string; errors?: string[] } {
    const schema = definition.inputSchema;
    if (!schema || !schema.properties) {
      return { valid: true };
    }

    // 检查必需参数
    const errors: string[] = [];
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in params)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    // 使用 Zod 验证参数类型
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (key in params) {
        const value = params[key];
        const propDef = prop as any;

        switch (propDef.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Parameter ${key} must be a string`);
            }
            break;
          case 'number':
          case 'integer':
            if (typeof value !== 'number') {
              errors.push(`Parameter ${key} must be a number`);
            }
            if (propDef.type === 'integer' && !Number.isInteger(value)) {
              errors.push(`Parameter ${key} must be an integer`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Parameter ${key} must be a boolean`);
            }
            break;
          case 'array':
            if (!Array.isArray(value)) {
              errors.push(`Parameter ${key} must be an array`);
            }
            break;
          case 'object':
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
              errors.push(`Parameter ${key} must be an object`);
            }
            break;
        }

        // 枚举值验证
        if (propDef.enum && !propDef.enum.includes(value)) {
          errors.push(`Parameter ${key} must be one of: ${propDef.enum.join(', ')}`);
        }

        // 范围验证
        if (typeof value === 'number') {
          if (propDef.minimum !== undefined && value < propDef.minimum) {
            errors.push(`Parameter ${key} must be >= ${propDef.minimum}`);
          }
          if (propDef.maximum !== undefined && value > propDef.maximum) {
            errors.push(`Parameter ${key} must be <= ${propDef.maximum}`);
          }
        }

        // 字符串长度验证
        if (typeof value === 'string') {
          if (propDef.minLength !== undefined && value.length < propDef.minLength) {
            errors.push(`Parameter ${key} must have length >= ${propDef.minLength}`);
          }
          if (propDef.maxLength !== undefined && value.length > propDef.maxLength) {
            errors.push(`Parameter ${key} must have length <= ${propDef.maxLength}`);
          }
          if (propDef.pattern) {
            try {
              if (!new RegExp(propDef.pattern).test(value)) {
                errors.push(`Parameter ${key} must match pattern: ${propDef.pattern}`);
              }
            } catch {
              // 无效正则，跳过
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, error: errors[0], errors };
    }

    return { valid: true };
  }
}
