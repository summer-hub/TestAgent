/**
 * SkillChainEngine — 技能链引擎
 * 解析技能间依赖关系，构建执行 DAG，按拓扑顺序链式调用
 */

import type { SkillDefinition, SkillDependency } from './skill-definition';
import type { SkillContext, SkillResult } from './skill-base';

/** 链中的单个节点 */
export interface ChainNode {
  skill: SkillDefinition;
  level: number;
  dependsOn: string[];
  requiredBy: string[];
}

/** 执行计划 */
export interface ExecutionPlan {
  /** 拓扑排序后的执行序列（按层级） */
  levels: ChainNode[][];
  /** 总步骤数 */
  totalNodes: number;
  /** 是否存在循环依赖 */
  hasCycles: boolean;
  /** 循环依赖描述 */
  cycles?: string[];
  /** 缺失的依赖 */
  missingDependencies: string[];
}

/** 链执行回调 */
export type ChainExecutor = (
  skill: SkillDefinition,
  previousOutputs: Map<string, SkillResult>,
  context: SkillContext
) => Promise<SkillResult>;

/**
 * SkillChainEngine — 技能链编排
 */
export class SkillChainEngine {
  private skillMap = new Map<string, SkillDefinition>();

  /**
   * 加载技能定义
   */
  load(skills: SkillDefinition[]): void {
    for (const s of skills) {
      this.skillMap.set(s.name, s);
    }
  }

  /**
   * 添加单个技能
   */
  addSkill(skill: SkillDefinition): void {
    this.skillMap.set(skill.name, skill);
  }

  /**
   * 构建执行计划（拓扑排序）
   */
  buildPlan(skillNames: string[]): ExecutionPlan {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const nodes = new Map<string, ChainNode>();
    const cycles: string[] = [];
    const missing: string[] = [];

    // DFS 构建 DAG
    const dfs = (name: string, level: number): boolean => {
      if (inStack.has(name)) {
        cycles.push(`Cycle detected at: ${name}`);
        return false;
      }
      if (visited.has(name)) return true;

      const skill = this.skillMap.get(name);
      if (!skill) {
        missing.push(name);
        return false;
      }

      inStack.add(name);
      visited.add(name);

      let maxDepLevel = level;
      for (const dep of skill.dependencies) {
        if (dep.type === 'required') {
          if (dfs(dep.skillName, level + 1)) {
            maxDepLevel = Math.max(maxDepLevel, level + 1);
          }
        }
      }
      inStack.delete(name);

      const node: ChainNode = {
        skill,
        level: maxDepLevel,
        dependsOn: skill.dependencies
          .filter(d => d.type === 'required')
          .map(d => d.skillName)
          .filter(n => this.skillMap.has(n)),
        requiredBy: [],
      };
      nodes.set(name, node);
      return true;
    };

    for (const name of skillNames) {
      dfs(name, 0);
    }

    // 补充反向引用
    for (const [, node] of nodes) {
      for (const depName of node.dependsOn) {
        const depNode = nodes.get(depName);
        if (depNode) {
          depNode.requiredBy.push(node.skill.name);
        }
      }
    }

    // 按层级分组
    const levelMap = new Map<number, ChainNode[]>();
    for (const node of nodes.values()) {
      const list = levelMap.get(node.level) || [];
      list.push(node);
      levelMap.set(node.level, list);
    }

    const levels: ChainNode[][] = [];
    for (let i = 0; ; i++) {
      const list = levelMap.get(i);
      if (!list || list.length === 0) break;
      levels.push(list);
    }

    return {
      levels,
      totalNodes: nodes.size,
      hasCycles: cycles.length > 0,
      cycles: cycles.length > 0 ? cycles : undefined,
      missingDependencies: missing,
    };
  }

  /**
   * 执行技能链
   * @param skillNames 入口技能名列表
   * @param executor 单个技能执行器
   * @param context 共享上下文
   */
  async execute(
    skillNames: string[],
    executor: ChainExecutor,
    context: SkillContext
  ): Promise<{
    results: Map<string, SkillResult>;
    plan: ExecutionPlan;
    success: boolean;
    error?: string;
  }> {
    const plan = this.buildPlan(skillNames);

    if (plan.hasCycles) {
      return {
        results: new Map(),
        plan,
        success: false,
        error: `Circular dependency detected: ${plan.cycles?.join('; ')}`,
      };
    }

    const results = new Map<string, SkillResult>();
    const allOutputs = new Map<string, SkillResult>();

    // 按层级顺序执行（level 越大越深层 → 从深到浅执行）
    for (let levelIdx = plan.levels.length - 1; levelIdx >= 0; levelIdx--) {
      const level = plan.levels[levelIdx]!;
      for (const node of level) {
        try {
          const result = await executor(node.skill, allOutputs, context);
          results.set(node.skill.name, result);
          allOutputs.set(node.skill.name, result);

          if (!result.success) {
            // 检查依赖此技能的后续节点
            const dependents = node.requiredBy;
            if (dependents.length > 0) {
              return {
                results,
                plan,
                success: false,
                error: `Skill "${node.skill.name}" failed, blocking: ${dependents.join(', ')}`,
              };
            }
          }
        } catch (err) {
          results.set(node.skill.name, {
            success: false,
            message: `Execution error: ${(err as Error).message}`,
            error: (err as Error).message,
          });
        }
      }
    }

    return { results, plan, success: true };
  }

  /**
   * 获取技能的完整依赖树
   */
  getDependencyTree(skillName: string, depth = 0, visited = new Set<string>()): string {
    if (visited.has(skillName)) return `${'  '.repeat(depth)}${skillName} (CYCLE)`;
    visited.add(skillName);

    const skill = this.skillMap.get(skillName);
    if (!skill) return `${'  '.repeat(depth)}${skillName} (NOT FOUND)`;

    const prefix = '  '.repeat(depth);
    let tree = `${prefix}${skill.name} [${skill.category || '?'}]`;
    if (skill.dependencies.length > 0) {
      for (const dep of skill.dependencies) {
        tree += '\n' + this.getDependencyTree(dep.skillName, depth + 1, visited);
      }
    }
    return tree;
  }
}
