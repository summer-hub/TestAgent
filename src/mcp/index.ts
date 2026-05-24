/**
 * MCP 模块导出
 */

// 协议
export * from './protocol';

// 客户端
export { MCPClient, InProcessTransport, WebSocketTransport, type MCPClientOptions, type MCPTransport } from './client/mcp-client';

// 服务端
export { MCPServer, type MCPServerOptions } from './server/mcp-server';

// 工具注册表
export { ToolRegistry } from './tools/tool-registry';
