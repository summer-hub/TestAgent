import type { IDriver } from '@core/interfaces/driver.interface';
import type { IMCPClient } from '@core/interfaces/mcp.interface';

/**
 * 技能元数据
 */
export interface SkillMetadata {
  /** 技能名称 */
  name: string;
  /** 技能描述 */
  description: string;
  /** 参数 JSON Schema */
  parameters: Record<string, any>;
  /** 使用示例 */
  examples?: Array<{
    description: string;
    params: Record<string, any>;
    expectedResult?: any;
  }>;
  /** 标签 */
  tags?: string[];
  /** 版本 */
  version?: string;
}

/**
 * 技能执行上下文
 */
export interface SkillContext {
  /** 设备驱动 */
  driver: IDriver;
  /** MCP 客户端 */
  mcpClient?: IMCPClient;
  /** 共享变量 */
  variables?: Record<string, any>;
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 进度回调 */
  onProgress?: (progress: { current: number; total: number; message: string }) => void;
}

/**
 * 技能执行结果
 */
export interface SkillResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  output?: any;
  /** 消息 */
  message: string;
  /** 错误信息 */
  error?: string;
  /** 执行耗时（毫秒） */
  duration?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * Skill - 技能基类
 * 所有技能必须继承此类
 */
export abstract class Skill {
  /** 技能元数据 */
  abstract readonly metadata: SkillMetadata;

  /**
   * 执行技能
   * @param params 技能参数
   * @param context 执行上下文
   */
  abstract execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult>;

  /**
   * 验证参数
   */
  validateParams(params: Record<string, any>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const schema = this.metadata.parameters;

    if (!schema || !schema.properties) {
      return { valid: true };
    }

    // 检查必需参数
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in params)) {
          errors.push(`Missing required parameter: ${required}`);
        }
      }
    }

    // 检查类型
    for (const [key, value] of Object.entries(params)) {
      const propDef = schema.properties[key];
      if (!propDef) continue;

      if (propDef.type === 'string' && typeof value !== 'string') {
        errors.push(`Parameter ${key} must be a string`);
      }
      if (propDef.type === 'number' && typeof value !== 'number') {
        errors.push(`Parameter ${key} must be a number`);
      }
      if (propDef.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Parameter ${key} must be a boolean`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 报告进度
   */
  protected reportProgress(
    context: SkillContext,
    current: number,
    total: number,
    message: string
  ): void {
    context.onProgress?.({ current, total, message });
  }

  /**
   * 延迟
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
