/**
 * Skill 定义 — 扩展的 Skill 元数据
 * 对应 Agent Skills 规范 (agentskills.io) 的 SKILL.md 格式
 */

import type { SkillMetadata } from './skill-base';

// ============================================================
// Agent Skills 规范对应的扩展类型
// ============================================================

/** 技能类别 */
export type SkillCategory = string;

/** 技能来源 */
export type SkillSource = 'builtin' | 'file' | 'external';

/** 输入参数定义（对应 SKILL.md 的参数表） */
export interface SkillParameterDef {
  /** 参数名 */
  name: string;
  /** 是否必需 */
  required: boolean;
  /** 默认值 */
  default?: string;
  /** 参数说明 */
  description: string;
  /** 参数类型 */
  type?: 'string' | 'number' | 'boolean' | 'path' | 'url' | 'enum';
  /** 枚举值 */
  enumValues?: string[];
}

/** 工作流阶段 */
export interface WorkflowPhase {
  /** 阶段编号 */
  phase: number;
  /** 阶段名称 */
  title: string;
  /** 阶段描述 */
  description: string;
  /** 阶段步骤 */
  steps: string[];
  /** 输入 */
  inputs?: string[];
  /** 输出 */
  outputs?: string[];
}

/** 技能依赖关系 */
export interface SkillDependency {
  /** 依赖的技能名 */
  skillName: string;
  /** 传递的参数映射 */
  passParams?: Record<string, string>;
  /** 依赖类型 */
  type: 'required' | 'optional' | 'consumes';
}

/** 完整的技能定义（对应 SKILL.md 解析结果） */
export interface SkillDefinition {
  // --- 基础标识 ---
  /** 技能名称（唯一标识） */
  name: string;
  /** 技能标题（显示名） */
  title?: string;
  /** 详细描述（含触发关键词） */
  description: string;
  /** 简短摘要 */
  summary?: string;

  // --- 分类 ---
  /** 分类 */
  category: SkillCategory;
  /** 标签 */
  tags: string[];

  // --- 版本与来源 ---
  /** 版本 */
  version: string;
  /** 作者 */
  author?: string;
  /** 许可证 */
  license?: string;
  /** 来源类型 */
  source: SkillSource;
  /** SKILL.md 文件路径 */
  filePath?: string;
  /** 注册时间 */
  registeredAt: number;

  // --- 环境要求 ---
  /** 兼容性说明 */
  compatibility?: string;

  // --- 参数定义 ---
  /** 输入参数列表 */
  parameters: SkillParameterDef[];
  /** JSON Schema 格式的参数（兼容原有 SkillMetadata） */
  parametersSchema: Record<string, any>;

  // --- 工作流 ---
  /** 工作流阶段 */
  phases: WorkflowPhase[];
  /** 工作流步骤总数 */
  totalSteps: number;

  // --- 依赖 ---
  /** 技能间依赖 */
  dependencies: SkillDependency[];

  // --- 执行配置 ---
  /** 预估执行时间 (ms) */
  estimatedDuration?: number;
  /** 是否启用 */
  enabled: boolean;
  /** 使用次数 */
  usageCount: number;

  // --- 扩展 ---
  /** 原始 Markdown 正文 */
  rawBody?: string;
  /** 自定义元数据 */
  metadata: Record<string, any>;
}

/**
 * 从 SkillDefinition 转换为 SkillMetadata（原有格式）
 */
export function toSkillMetadata(def: SkillDefinition): SkillMetadata {
  return {
    name: def.name,
    description: def.description,
    parameters: def.parametersSchema,
    tags: def.tags,
    version: def.version,
  };
}
