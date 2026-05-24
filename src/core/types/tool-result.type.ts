/**
 * 工具调用结果接口
 * 定义工具执行后的返回结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 结果内容（文本形式） */
  content?: string;
  /** 结构化数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 错误码 */
  errorCode?: string;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 工具定义接口
 * 描述工具的名称、描述和参数模式
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入参数模式 */
  inputSchema: ToolInputSchema;
  /** 输出参数模式 */
  outputSchema?: ToolOutputSchema;
}

/**
 * 工具输入模式
 */
export interface ToolInputSchema {
  /** 类型 */
  type: 'object';
  /** 属性定义 */
  properties: Record<string, ToolSchemaProperty>;
  /** 必需参数列表 */
  required?: string[];
}

/**
 * 工具输出模式
 */
export interface ToolOutputSchema {
  /** 类型 */
  type: 'object';
  /** 属性定义 */
  properties: Record<string, ToolSchemaProperty>;
}

/**
 * 工具模式属性
 */
export interface ToolSchemaProperty {
  /** 属性类型 */
  type: string;
  /** 属性描述 */
  description?: string;
  /** 枚举值 */
  enum?: string[];
  /** 默认值 */
  default?: any;
  /** 最小值 */
  minimum?: number;
  /** 最大值 */
  maximum?: number;
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 模式（正则表达式） */
  pattern?: string;
  /** 格式 */
  format?: string;
  /** 是否可为空 */
  nullable?: boolean;
}

/**
 * 工具处理器类型
 */
export type ToolHandler = (params: Record<string, any>) => Promise<ToolResult>;

/**
 * LLM 函数调用格式
 */
export interface LLMFunction {
  /** 函数名称 */
  name: string;
  /** 函数描述 */
  description: string;
  /** 参数定义 */
  parameters: {
    /** 类型 */
    type: 'object';
    /** 属性定义 */
    properties: Record<string, ToolSchemaProperty>;
    /** 必需参数列表 */
    required?: string[];
  };
}

/**
 * MCP 能力声明
 */
export interface MCPCapabilities {
  /** 是否支持工具 */
  tools?: boolean;
  /** 是否支持资源 */
  resources?: boolean;
  /** 是否支持提示 */
  prompts?: boolean;
}

/**
 * MCP 服务端配置
 */
export interface MCPServerConfig {
  /** 服务名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 能力声明 */
  capabilities: MCPCapabilities;
}

/**
 * MCP 客户端配置
 */
export interface MCPClientConfig {
  /** 服务名称 */
  serverName: string;
  /** 版本号 */
  serverVersion?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}
