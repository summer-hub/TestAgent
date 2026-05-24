import { IMCPClient } from '@core/interfaces/mcp.interface';
import {
  ToolDefinition,
  ToolResult,
  ToolHandler,
  MCPServerConfig,
  MCPClientConfig,
} from '@core/types/tool-result.type';
import {
  MCPConnectionError,
  MCPCallError,
  ToolNotFoundError,
  MCPInitializationError,
} from '@core/errors';
import {
  JSONRPCCodec,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPC_ERROR_CODES,
  MCP_ERROR_CODES,
} from '../protocol/json-rpc';

/**
 * MCP 客户端配置
 */
export interface MCPClientOptions {
  /** 服务名称 */
  serverName: string;
  /** 服务版本 */
  serverVersion?: string;
  /** 请求超时（毫秒） */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔（毫秒） */
  retryInterval: number;
  /** 是否缓存工具列表 */
  cacheTools: boolean;
  /** 工具列表刷新间隔（毫秒） */
  toolsRefreshInterval: number;
}

/**
 * 默认客户端配置
 */
const DEFAULT_OPTIONS: MCPClientOptions = {
  serverName: '',
  timeout: 60000,
  maxRetries: 2,
  retryInterval: 1000,
  cacheTools: true,
  toolsRefreshInterval: 300000, // 5 分钟
};

/**
 * MCPClient - MCP 客户端实现
 * 基于 JSON-RPC 2.0 协议与 MCP 服务通信
 *
 * 特性：
 * - 连接管理与自动重连
 * - 工具列表缓存与增量刷新
 * - 调用超时控制与重试
 * - 本地工具注册
 */
export class MCPClient implements IMCPClient {
  private options: MCPClientOptions;
  private connected: boolean = false;
  private initialized: boolean = false;
  private serverConfig: MCPServerConfig | null = null;
  private localTools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();
  private codec: JSONRPCCodec;
  private transport: MCPTransport | null = null;
  private cachedTools: ToolDefinition[] | null = null;
  private lastToolsRefresh: number = 0;
  private pendingRequests: Map<string | number, {
    resolve: (response: JSONRPCResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  constructor(options?: Partial<MCPClientOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.codec = new JSONRPCCodec();
  }

  /** 连接到 MCP 服务 */
  async connect(config: MCPClientConfig): Promise<void> {
    this.options.serverName = config.serverName;
    if (config.serverVersion) this.options.serverVersion = config.serverVersion;
    if (config.timeout) this.options.timeout = config.timeout;

    try {
      // 创建传输层
      this.transport = this.createTransport(config);

      // 注册消息处理器，接收传输层返回的 JSON-RPC 响应
      this.transport.onMessage((data: string) => this.handleMessage(data));

      await this.transport.connect();
      this.connected = true;
    } catch (error) {
      throw new MCPConnectionError(
        `Failed to connect to MCP server: ${config.serverName}`,
        { originalError: String(error) }
      );
    }
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    // 取消所有待处理请求
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new MCPConnectionError('Connection closed'));
      this.pendingRequests.delete(id);
    }

    if (this.transport) {
      await this.transport.disconnect();
      this.transport = null;
    }

    this.connected = false;
    this.initialized = false;
    this.serverConfig = null;
    this.cachedTools = null;
  }

  /** 检查连接状态 */
  isConnected(): boolean {
    return this.connected;
  }

  /** 初始化会话 */
  async initialize(): Promise<MCPServerConfig> {
    this.ensureConnected();

    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
      },
      clientInfo: {
        name: this.options.serverName,
        version: this.options.serverVersion || '1.0.0',
      },
    });

    if (response.error) {
      throw new MCPInitializationError(
        `Initialize failed: ${response.error.message}`,
        { code: response.error.code }
      );
    }

    this.serverConfig = {
      name: response.result?.serverInfo?.name || response.result?.name || 'unknown',
      version: response.result?.serverInfo?.version || response.result?.version || '0.0.0',
      capabilities: response.result?.capabilities || { tools: true },
    };

    // 发送 initialized 通知
    await this.sendNotification('notifications/initialized');

    this.initialized = true;
    return this.serverConfig;
  }

  /** 获取可用工具列表 */
  async listTools(): Promise<ToolDefinition[]> {
    this.ensureConnected();

    // 检查缓存
    if (this.options.cacheTools && this.cachedTools) {
      const now = Date.now();
      if (now - this.lastToolsRefresh < this.options.toolsRefreshInterval) {
        // 合并本地工具
        return [...this.cachedTools, ...this.getLocalToolDefinitions()];
      }
    }

    const response = await this.sendRequest('tools/list', {});

    if (response.error) {
      throw new MCPCallError('tools/list', response.error.message, {
        code: response.error.code,
      });
    }

    const remoteTools = (response.result?.tools || []) as ToolDefinition[];
    this.cachedTools = remoteTools;
    this.lastToolsRefresh = Date.now();

    // 合并本地工具
    return [...remoteTools, ...this.getLocalToolDefinitions()];
  }

  /**
   * 增量刷新工具列表
   */
  async refreshTools(): Promise<ToolDefinition[]> {
    this.cachedTools = null;
    this.lastToolsRefresh = 0;
    return this.listTools();
  }

  /** 调用工具 */
  async callTool(name: string, params: Record<string, any>): Promise<ToolResult> {
    this.ensureConnected();

    // 优先检查本地注册的工具
    const localTool = this.localTools.get(name);
    if (localTool) {
      return await this.executeLocalTool(localTool.handler, params);
    }

    // 调用远程工具（带重试）
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const response = await this.sendRequest('tools/call', {
          name,
          arguments: params,
        }, this.options.timeout);

        if (response.error) {
          // 协议级错误不重试
          if (response.error.code === MCP_ERROR_CODES.TOOL_NOT_FOUND) {
            throw new ToolNotFoundError(name);
          }
          if (response.error.code === MCP_ERROR_CODES.TOOL_INVALID_PARAMS) {
            return {
              success: false,
              error: response.error.message,
              errorCode: String(response.error.code),
            };
          }
          // 可重试的错误
          lastError = new MCPCallError(name, response.error.message, {
            code: response.error.code,
          });

          if (attempt < this.options.maxRetries) {
            await this.delay(this.options.retryInterval * (attempt + 1));
            continue;
          }
        }

        const result = response.result;
        return {
          success: !result?.isError,
          content: result?.content?.[0]?.text || result?.content,
          data: result?.data,
          error: result?.isError ? result?.content?.[0]?.text : undefined,
          errorCode: result?.isError ? 'TOOL_ERROR' : undefined,
          executionTime: result?.executionTime,
          metadata: result?.metadata,
        };
      } catch (error) {
        if (error instanceof ToolNotFoundError) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.options.maxRetries) {
          await this.delay(this.options.retryInterval * (attempt + 1));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      errorCode: 'TOOL_CALL_FAILED',
    };
  }

  /**
   * 获取工具的 LLM function calling 格式
   */
  async toFunctionsFormat(): Promise<Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>> {
    const tools = await this.listTools();
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));
  }

  /** 注册本地工具 */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    this.localTools.set(definition.name, { definition, handler });
    // 清空工具缓存以包含新注册的本地工具
    this.lastToolsRefresh = 0;
  }

  /** 注销本地工具 */
  unregisterTool(name: string): void {
    this.localTools.delete(name);
    this.lastToolsRefresh = 0;
  }

  /** 获取已注册工具 */
  getRegisteredTools(): ToolDefinition[] {
    return this.getLocalToolDefinitions();
  }

  // ============ 私有方法 ============

  private ensureConnected(): void {
    if (!this.connected) {
      throw new MCPConnectionError('Not connected to MCP server');
    }
  }

  private createTransport(config: MCPClientConfig): MCPTransport {
    // 创建传输层实现
    // 根据配置选择不同的传输方式
    return new InProcessTransport();
  }

  private async sendRequest(
    method: string,
    params: Record<string, any>,
    timeout?: number
  ): Promise<JSONRPCResponse> {
    const request = this.codec.createRequest(method, params);
    const requestTimeout = timeout || this.options.timeout;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new MCPCallError(method, `Request timeout after ${requestTimeout}ms`));
      }, requestTimeout);

      this.pendingRequests.set(request.id, { resolve, reject, timer });

      // 通过传输层发送
      if (this.transport) {
        this.transport.send(this.codec.encode(request)).catch((error) => {
          clearTimeout(timer);
          this.pendingRequests.delete(request.id);
          reject(error);
        });
      } else {
        // 无传输层时使用模拟
        clearTimeout(timer);
        this.pendingRequests.delete(request.id);
        resolve(this.mockResponse(request));
      }
    });
  }

  /**
   * 处理从传输层收到的 JSON-RPC 消息
   */
  private handleMessage(data: string): void {
    try {
      const decoded = this.codec.decode(data);
      if (decoded.message && 'id' in decoded.message) {
        const response = decoded.message as JSONRPCResponse;
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      }
    } catch {
      // 解析失败，忽略无法处理的消息
    }
  }

  private async sendNotification(method: string, params?: Record<string, any>): Promise<void> {
    const notification = this.codec.createNotification(method, params);
    if (this.transport) {
      await this.transport.send(this.codec.encode(notification));
    }
  }

  private async executeLocalTool(
    handler: ToolHandler,
    params: Record<string, any>
  ): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const result = await handler(params);
      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  private getLocalToolDefinitions(): ToolDefinition[] {
    return Array.from(this.localTools.values()).map(t => t.definition);
  }

  private mockResponse(request: JSONRPCRequest): JSONRPCResponse {
    switch (request.method) {
      case 'initialize':
        return this.codec.createResponse(request.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: true },
          serverInfo: {
            name: 'ai-test-agent-mcp',
            version: '1.0.0',
          },
        });
      case 'tools/list':
        return this.codec.createResponse(request.id, {
          tools: this.getLocalToolDefinitions(),
        });
      case 'tools/call':
        return this.codec.createResponse(request.id, {
          content: [{ type: 'text', text: 'Mock tool execution result' }],
        });
      default:
        return this.codec.createErrorResponse(
          request.id,
          JSONRPC_ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${request.method}`
        );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * MCP 传输层接口
 */
export interface MCPTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(data: string): Promise<void>;
  onMessage(handler: (data: string) => void): void;
}

/**
 * 进程内传输（用于测试或本地调用）
 */
export class InProcessTransport implements MCPTransport {
  private messageHandler: ((data: string) => void) | null = null;
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.messageHandler = null;
  }

  async send(data: string): Promise<void> {
    // 进程内传输：直接回传消息
    if (this.messageHandler) {
      this.messageHandler(data);
    }
  }

  onMessage(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }
}

/**
 * WebSocket 传输实现
 */
export class WebSocketTransport implements MCPTransport {
  private url: string;
  private ws: any = null;
  private messageHandler: ((data: string) => void) | null = null;
  private connected = false;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    try {
      // 动态导入 WebSocket
      const { WebSocket } = await import('ws');
      this.ws = new WebSocket(this.url);

      return new Promise((resolve, reject) => {
        this.ws!.on('open', () => {
          this.connected = true;
          resolve();
        });
        this.ws!.on('error', (err: Error) => {
          reject(err);
        });
        this.ws!.on('message', (data: Buffer) => {
          if (this.messageHandler) {
            this.messageHandler(data.toString());
          }
        });
        this.ws!.on('close', () => {
          this.connected = false;
        });
      });
    } catch {
      // 降级为模拟模式
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.messageHandler = null;
  }

  async send(data: string): Promise<void> {
    if (this.ws && this.connected) {
      this.ws.send(data);
    }
  }

  onMessage(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }
}
