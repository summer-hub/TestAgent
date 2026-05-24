import { ToolDefinition, ToolHandler, ToolResult } from '@core/types/tool-result.type';

/**
 * 工具注册表
 * 管理所有可用工具的注册和发现
 */
export class ToolRegistry {
  private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();

  /**
   * 注册工具
   */
  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * 注销工具
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * 获取工具定义
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * 获取工具处理器
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  /**
   * 获取所有工具定义
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 执行工具
   */
  async execute(name: string, params: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    const startTime = Date.now();
    try {
      const result = await tool.handler(params);
      return {
        ...result,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'TOOL_EXECUTION_ERROR',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size;
  }
}
