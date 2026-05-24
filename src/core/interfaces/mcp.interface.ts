import { ToolDefinition, ToolResult, ToolHandler, MCPServerConfig, MCPClientConfig } from '../types/tool-result.type';

/**
 * MCP 客户端接口
 * 定义与 Model Context Protocol 服务交互的能力
 */
export interface IMCPClient {
  /** 连接到 MCP 服务 */
  connect(config: MCPClientConfig): Promise<void>;

  /** 断开连接 */
  disconnect(): Promise<void>;

  /** 检查连接状态 */
  isConnected(): boolean;

  /** 初始化会话 */
  initialize(): Promise<MCPServerConfig>;

  /** 获取可用工具列表 */
  listTools(): Promise<ToolDefinition[]>;

  /** 调用工具 */
  callTool(name: string, params: Record<string, any>): Promise<ToolResult>;

  /** 注册本地工具 */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void;

  /** 注销本地工具 */
  unregisterTool(name: string): void;

  /** 获取已注册工具 */
  getRegisteredTools(): ToolDefinition[];
}

/**
 * MCP 服务端接口
 * 定义提供 MCP 服务的能力
 */
export interface IMCPService {
  /** 启动服务 */
  start(): Promise<void>;

  /** 停止服务 */
  stop(): Promise<void>;

  /** 注册工具 */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void;

  /** 获取服务配置 */
  getConfig(): MCPServerConfig;
}
