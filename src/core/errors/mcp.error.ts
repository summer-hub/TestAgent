import { BaseError } from './base.error';

/**
 * MCP 连接错误
 */
export class MCPConnectionError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'MCP_CONNECTION_ERROR', 503, details);
  }
}

/**
 * MCP 调用错误
 */
export class MCPCallError extends BaseError {
  constructor(toolName: string, message: string, details?: Record<string, any>) {
    super(
      `MCP tool call failed [${toolName}]: ${message}`,
      'MCP_CALL_ERROR',
      500,
      { toolName, ...details }
    );
  }
}

/**
 * 工具未找到错误
 */
export class ToolNotFoundError extends BaseError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND', 404, { toolName });
  }
}

/**
 * 工具参数错误
 */
export class ToolParameterError extends BaseError {
  constructor(toolName: string, paramName: string, expectedType: string) {
    super(
      `Invalid parameter for tool ${toolName}: ${paramName} should be ${expectedType}`,
      'TOOL_PARAMETER_ERROR',
      400,
      { toolName, paramName, expectedType }
    );
  }
}

/**
 * MCP 初始化错误
 */
export class MCPInitializationError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'MCP_INITIALIZATION_ERROR', 500, details);
  }
}
