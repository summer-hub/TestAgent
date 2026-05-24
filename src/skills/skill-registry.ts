import { Skill, SkillContext, SkillResult, SkillMetadata } from './skill-base';

/**
 * 技能注册项
 */
export interface SkillRegistration {
  /** 技能实例 */
  skill: Skill;
  /** 命名空间 */
  namespace?: string;
  /** 别名列表 */
  aliases?: string[];
  /** 注册时间 */
  registeredAt: number;
  /** 启用状态 */
  enabled: boolean;
}

/**
 * 技能组合定义
 */
export interface SkillComposition {
  /** 组合名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 子技能序列 */
  steps: Array<{
    skillName: string;
    params: Record<string, any> | ((context: any) => Record<string, any>);
    /** 是否允许失败 */
    allowFailure?: boolean;
    /** 失败后的回退技能 */
    fallback?: string;
  }>;
}

/**
 * SkillRegistry - 技能注册中心
 * 管理技能的注册、注销、查找、组合执行
 */
export class SkillRegistry {
  private skills: Map<string, SkillRegistration> = new Map();
  private aliases: Map<string, string> = new Map();
  private compositions: Map<string, SkillComposition> = new Map();

  /**
   * 注册技能
   */
  register(
    skill: Skill,
    options?: { namespace?: string; aliases?: string[]; enabled?: boolean }
  ): string {
    const baseName = skill.metadata.name;
    const fullName = options?.namespace ? `${options.namespace}.${baseName}` : baseName;

    if (this.skills.has(fullName)) {
      throw new Error(`Skill already registered: ${fullName}`);
    }

    const registration: SkillRegistration = {
      skill,
      namespace: options?.namespace,
      aliases: options?.aliases,
      registeredAt: Date.now(),
      enabled: options?.enabled ?? true,
    };

    this.skills.set(fullName, registration);

    // 注册别名
    if (options?.aliases) {
      for (const alias of options.aliases) {
        if (this.aliases.has(alias)) {
          throw new Error(`Alias already exists: ${alias}`);
        }
        this.aliases.set(alias, fullName);
      }
    }

    return fullName;
  }

  /**
   * 注销技能
   */
  unregister(name: string): boolean {
    const fullName = this.aliases.get(name) || name;
    const registration = this.skills.get(fullName);
    if (!registration) return false;

    // 清理别名
    if (registration.aliases) {
      for (const alias of registration.aliases) {
        this.aliases.delete(alias);
      }
    }

    return this.skills.delete(fullName);
  }

  /**
   * 获取技能
   */
  get(name: string): Skill | null {
    const fullName = this.aliases.get(name) || name;
    const registration = this.skills.get(fullName);
    if (!registration || !registration.enabled) return null;
    return registration.skill;
  }

  /**
   * 检查技能是否存在
   */
  has(name: string): boolean {
    const fullName = this.aliases.get(name) || name;
    return this.skills.has(fullName);
  }

  /**
   * 列出所有技能
   */
  list(filter?: { namespace?: string; tag?: string; enabled?: boolean }): SkillMetadata[] {
    const result: SkillMetadata[] = [];
    for (const [, registration] of this.skills) {
      if (filter?.namespace && registration.namespace !== filter.namespace) continue;
      if (filter?.enabled !== undefined && registration.enabled !== filter.enabled) continue;
      if (filter?.tag && !registration.skill.metadata.tags?.includes(filter.tag)) continue;
      result.push(registration.skill.metadata);
    }
    return result;
  }

  /**
   * 启用技能
   */
  enable(name: string): boolean {
    const fullName = this.aliases.get(name) || name;
    const registration = this.skills.get(fullName);
    if (!registration) return false;
    registration.enabled = true;
    return true;
  }

  /**
   * 禁用技能
   */
  disable(name: string): boolean {
    const fullName = this.aliases.get(name) || name;
    const registration = this.skills.get(fullName);
    if (!registration) return false;
    registration.enabled = false;
    return true;
  }

  /**
   * 执行技能
   */
  async execute(
    name: string,
    params: Record<string, any>,
    context: SkillContext
  ): Promise<SkillResult> {
    const skill = this.get(name);
    if (!skill) {
      return {
        success: false,
        message: `Skill not found: ${name}`,
        error: 'SKILL_NOT_FOUND',
      };
    }

    // 参数验证
    const validation = skill.validateParams(params);
    if (!validation.valid) {
      return {
        success: false,
        message: `Parameter validation failed`,
        error: validation.errors?.join('; ') || 'INVALID_PARAMS',
      };
    }

    const startTime = Date.now();
    try {
      const result = await skill.execute(params, context);
      result.duration = result.duration ?? Date.now() - startTime;
      return result;
    } catch (error) {
      return {
        success: false,
        message: `Skill execution failed`,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 注册技能组合
   */
  registerComposition(composition: SkillComposition): void {
    if (this.compositions.has(composition.name)) {
      throw new Error(`Composition already registered: ${composition.name}`);
    }
    this.compositions.set(composition.name, composition);
  }

  /**
   * 执行技能组合
   */
  async executeComposition(
    name: string,
    context: SkillContext,
    initialData?: Record<string, any>
  ): Promise<SkillResult> {
    const composition = this.compositions.get(name);
    if (!composition) {
      return {
        success: false,
        message: `Composition not found: ${name}`,
        error: 'COMPOSITION_NOT_FOUND',
      };
    }

    const startTime = Date.now();
    const stepResults: SkillResult[] = [];
    let accumulatedData = { ...(initialData || {}) };

    for (const [index, step] of composition.steps.entries()) {
      const params =
        typeof step.params === 'function' ? step.params(accumulatedData) : step.params;

      let result = await this.execute(step.skillName, params, context);

      // 失败处理
      if (!result.success) {
        if (step.fallback) {
          result = await this.execute(step.fallback, params, context);
        }
        if (!result.success && !step.allowFailure) {
          return {
            success: false,
            message: `Composition failed at step ${index}: ${step.skillName}`,
            error: result.error,
            duration: Date.now() - startTime,
            metadata: { stepResults: [...stepResults, result] },
          };
        }
      }

      stepResults.push(result);
      if (result.output && typeof result.output === 'object') {
        accumulatedData = { ...accumulatedData, ...result.output };
      }
    }

    return {
      success: true,
      message: `Composition executed: ${name}`,
      output: accumulatedData,
      duration: Date.now() - startTime,
      metadata: { stepResults },
    };
  }

  /**
   * 清空所有技能
   */
  clear(): void {
    this.skills.clear();
    this.aliases.clear();
    this.compositions.clear();
  }

  /**
   * 获取技能数量
   */
  get size(): number {
    return this.skills.size;
  }
}
