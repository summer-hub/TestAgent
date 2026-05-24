/**
 * UnifiedSkillManager — 统一技能管理器
 * 整合解析、加载、注册、匹配、链式调用，提供一站式技能管理
 */

import { Skill, type SkillContext, type SkillResult, type SkillMetadata } from './skill-base';
import { SkillRegistry } from './skill-registry';
import { SkillFileLoader } from './skill-file-loader';
import { SkillMarkdownParser } from './skill-markdown-parser';
import { SkillMatcher, type MatchQuery, type MatchResult } from './skill-matcher';
import { SkillChainEngine, type ChainExecutor } from './skill-chain-engine';
import type { SkillDefinition, SkillSource } from './skill-definition';
import { toSkillMetadata } from './skill-definition';

/** 管理器配置 */
export interface SkillManagerConfig {
  /** 内置技能 */
  builtinSkills?: Skill[];
  /** 外部 SKILL.md 目录 */
  skillDirectories?: string[];
  /** 是否启动时自动加载 */
  autoLoad?: boolean;
  /** 是否允许同名覆盖 */
  allowOverride?: boolean;
  /** 最大技能数 */
  maxSkills?: number;
}

/** 管理器统计 */
export interface SkillManagerStats {
  total: number;
  builtin: number;
  file: number;
  external: number;
  enabled: number;
  disabled: number;
  categories: Record<string, number>;
}

/**
 * UnifiedSkillManager — 统一技能管理
 */
export class UnifiedSkillManager {
  private registry = new SkillRegistry();
  private loader = new SkillFileLoader();
  private matcher = new SkillMatcher();
  private chainEngine = new SkillChainEngine();

  /** 所有技能定义（含非可执行的外部定义） */
  private definitions = new Map<string, SkillDefinition>();
  private config: Required<SkillManagerConfig>;
  private initialized = false;

  constructor(config: SkillManagerConfig = {}) {
    this.config = {
      builtinSkills: config.builtinSkills ?? [],
      skillDirectories: config.skillDirectories ?? [],
      autoLoad: config.autoLoad ?? true,
      allowOverride: config.allowOverride ?? false,
      maxSkills: config.maxSkills ?? 10000,
    };
  }

  // ============================================================
  // 初始化
  // ============================================================
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 1. 注册内置技能
    for (const skill of this.config.builtinSkills) {
      this.registry.register(skill);
      const def: SkillDefinition = this.skillToDefinition(skill, 'builtin');
      this.definitions.set(def.name, def);
    }

    // 2. 从目录加载外部技能
    if (this.config.autoLoad && this.config.skillDirectories.length > 0) {
      await this.loadFromDirectories(this.config.skillDirectories);
    }

    // 3. 构建索引
    this.rebuildIndex();

    this.initialized = true;
  }

  // ============================================================
  // 技能发现与加载
  // ============================================================
  /**
   * 从目录扫描加载 SKILL.md 文件
   */
  async loadFromDirectories(dirs: string[]): Promise<SkillDefinition[]> {
    const result = await this.loader.loadDirectories(dirs, 'external');
    for (const def of result.definitions) {
      this.addDefinition(def);
    }
    this.rebuildIndex();
    return result.definitions;
  }

  /**
   * 从单个 SKILL.md 文件加载技能
   */
  async loadFromFile(filePath: string): Promise<SkillDefinition | null> {
    const result = await this.loader.loadFile(filePath, 'file');
    if (result.definitions.length > 0) {
      const def = result.definitions[0]!;
      this.addDefinition(def);
      this.rebuildIndex();
      return def;
    }
    return null;
  }

  /**
   * 从文本注册技能（编程方式注册 SKILL.md 内容）
   */
  registerFromMarkdown(markdown: string, filePath?: string): SkillDefinition | null {
    const result = SkillMarkdownParser.parse(markdown, 'file', filePath);
    if (result.success && result.definition) {
      this.addDefinition(result.definition);
      this.rebuildIndex();
      return result.definition;
    }
    return null;
  }

  /**
   * 注册程序化技能（原有 Skill 子类）
   */
  registerSkill(skill: Skill, options?: { namespace?: string; aliases?: string[] }): string {
    const name = this.registry.register(skill, options);
    const def = this.skillToDefinition(skill, 'builtin');
    this.definitions.set(def.name, def);
    this.rebuildIndex();
    return name;
  }

  // ============================================================
  // 技能移除
  // ============================================================
  /**
   * 移除技能（按名称）
   */
  remove(name: string): boolean {
    // 先从 registry 移除
    this.registry.unregister(name);
    // 从 definitions 移除
    const removed = this.definitions.delete(name);
    if (removed) {
      this.matcher.removeSkill(name);
      this.chainEngine = new SkillChainEngine();
      this.chainEngine.load(Array.from(this.definitions.values()));
    }
    return removed;
  }

  /**
   * 按类别批量移除
   */
  removeByCategory(category: string): number {
    let count = 0;
    for (const [name, def] of this.definitions) {
      if (def.category === category) {
        if (this.remove(name)) count++;
      }
    }
    return count;
  }

  /**
   * 按来源移除
   */
  removeBySource(source: SkillSource): number {
    let count = 0;
    for (const [name, def] of this.definitions) {
      if (def.source === source) {
        if (this.remove(name)) count++;
      }
    }
    return count;
  }

  // ============================================================
  // 技能查询
  // ============================================================
  /**
   * 智能匹配（自然语言 → 最佳技能）
   */
  match(query: string | MatchQuery): MatchResult[] {
    const q: MatchQuery = typeof query === 'string'
      ? { text: query }
      : query;
    return this.matcher.match(q);
  }

  /**
   * 查找单个技能
   */
  get(name: string): SkillDefinition | undefined {
    return this.definitions.get(name) || this.matcher.findByName(name);
  }

  /**
   * 列出所有技能
   */
  list(filter?: {
    category?: string;
    source?: SkillSource;
    enabled?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): SkillDefinition[] {
    let results = Array.from(this.definitions.values());

    if (filter?.category) {
      results = results.filter(d => d.category === filter.category);
    }
    if (filter?.source) {
      results = results.filter(d => d.source === filter.source);
    }
    if (filter?.enabled !== undefined) {
      results = results.filter(d => d.enabled === filter.enabled);
    }
    if (filter?.search) {
      const search = filter.search.toLowerCase();
      results = results.filter(d =>
        d.name.includes(search) ||
        d.description.toLowerCase().includes(search) ||
        d.tags.some(t => t.includes(search))
      );
    }

    results.sort((a, b) => b.registeredAt - a.registeredAt);

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  /**
   * 获取类别列表
   */
  getCategories(): Array<{ name: string; count: number }> {
    return this.matcher.getCategories();
  }

  /**
   * 获取依赖树
   */
  getDependencyTree(skillName: string): string {
    return this.chainEngine.getDependencyTree(skillName);
  }

  // ============================================================
  // 技能执行
  // ============================================================
  /**
   * 通过名称执行技能（兼容原有 SkillRegistry）
   */
  async executeByName(
    name: string,
    params: Record<string, any>,
    context: SkillContext
  ): Promise<SkillResult> {
    // 先从 registry 查找（兼容原有 Skill 子类）
    const regSkill = this.registry.get(name);
    if (regSkill) {
      return this.registry.execute(name, params, context);
    }

    // 从 definitions 查找外部技能
    const def = this.definitions.get(name);
    if (!def) {
      return { success: false, message: `Skill not found: ${name}`, error: 'SKILL_NOT_FOUND' };
    }

    // 外部技能：尝试执行（如果有绑定的 executor）
    // 这里外部技能需要通过 MCP 工具或 Agent 来实际执行
    return {
      success: false,
      message: `External skill "${name}" requires an executor. Use executeWith() to provide one.`,
      metadata: { definition: def },
    };
  }

  /**
   * 执行技能链
   */
  async executeChain(
    skillNames: string[],
    executor: ChainExecutor,
    context: SkillContext
  ) {
    return this.chainEngine.execute(skillNames, executor, context);
  }

  /**
   * 构建执行计划
   */
  buildPlan(skillNames: string[]) {
    return this.chainEngine.buildPlan(skillNames);
  }

  // ============================================================
  // 技能管理
  // ============================================================
  /** 启/禁用 */
  enable(name: string): boolean {
    const def = this.definitions.get(name);
    if (!def) return false;
    def.enabled = true;
    this.registry.enable(name);
    return true;
  }

  disable(name: string): boolean {
    const def = this.definitions.get(name);
    if (!def) return false;
    def.enabled = false;
    this.registry.disable(name);
    return true;
  }

  /** 记录使用 */
  recordUsage(name: string): void {
    const def = this.definitions.get(name);
    if (def) def.usageCount++;
  }

  /** 获取统计 */
  getStats(): SkillManagerStats {
    let builtin = 0, file = 0, external = 0, enabled = 0, disabled = 0;
    const categories: Record<string, number> = {};

    for (const def of this.definitions.values()) {
      switch (def.source) {
        case 'builtin': builtin++; break;
        case 'file': file++; break;
        case 'external': external++; break;
      }
      if (def.enabled) enabled++; else disabled++;
      const cat = def.category || 'uncategorized';
      categories[cat] = (categories[cat] || 0) + 1;
    }

    return {
      total: this.definitions.size,
      builtin, file, external, enabled, disabled, categories,
    };
  }

  /** 导出所有技能定义 */
  exportAll(): SkillDefinition[] {
    return Array.from(this.definitions.values());
  }

  // ============================================================
  // 私有方法
  // ============================================================
  private addDefinition(def: SkillDefinition): void {
    const existing = this.definitions.get(def.name);
    if (existing && !this.config.allowOverride) {
      // 跳过重复（不覆盖）
      return;
    }
    this.definitions.set(def.name, def);
    this.chainEngine.addSkill(def);
  }

  private rebuildIndex(): void {
    const defs = Array.from(this.definitions.values());
    this.matcher.index(defs);
    this.chainEngine = new SkillChainEngine();
    this.chainEngine.load(defs);
  }

  private skillToDefinition(skill: Skill, source: SkillSource): SkillDefinition {
    const meta = skill.metadata;
    return {
      name: meta.name,
      title: meta.description?.split(/[。.]/)[0] || meta.name,
      description: meta.description,
      summary: meta.description?.split(/[。.]/)[0],
      category: meta.tags?.[0] || 'general',
      tags: meta.tags || [],
      version: meta.version || '1.0.0',
      source,
      registeredAt: Date.now(),
      parameters: Object.entries(meta.parameters?.properties || {}).map(
        ([name, schema]: [string, any]) => ({
          name,
          required: meta.parameters?.required?.includes(name) || false,
          description: schema?.description || '',
          type: schema?.type || 'string',
        })
      ),
      parametersSchema: meta.parameters || {},
      phases: [],
      totalSteps: 0,
      dependencies: [],
      enabled: true,
      usageCount: 0,
      metadata: {},
    };
  }
}
