/**
 * SkillMatcher — 智能技能匹配器
 * 支持关键词匹配、类别过滤、参数推断，从用户自然语言请求中找到最佳技能
 */

import type { SkillDefinition } from './skill-definition';
import { levenshteinDistance } from '@utils/helpers';

/** 匹配查询 */
export interface MatchQuery {
  /** 用户自然语言请求 */
  text: string;
  /** 期望的分类过滤 */
  category?: string;
  /** 期望的标签 */
  tags?: string[];
  /** 最大返回数量 */
  limit?: number;
  /** 最小匹配分数 */
  minScore?: number;
  /** 是否包含禁用的技能 */
  includeDisabled?: boolean;
}

/** 匹配结果 */
export interface MatchResult {
  /** 技能定义 */
  skill: SkillDefinition;
  /** 匹配分数 (0-1) */
  score: number;
  /** 匹配的类别 */
  matchReasons: string[];
  /** 推断的参数 */
  inferredParams: Record<string, any>;
}

/**
 * SkillMatcher — 技能匹配器
 */
export class SkillMatcher {
  private skills: SkillDefinition[] = [];
  /** 倒排索引：关键词 → 技能名列表 */
  private keywordIndex = new Map<string, Set<string>>();
  /** 类别索引 */
  private categoryIndex = new Map<string, Set<string>>();

  /**
   * 批量索引技能
   */
  index(skills: SkillDefinition[]): void {
    this.skills = skills;
    this.keywordIndex.clear();
    this.categoryIndex.clear();

    for (const skill of skills) {
      // 分类索引
      if (skill.category) {
        const set = this.categoryIndex.get(skill.category) || new Set();
        set.add(skill.name);
        this.categoryIndex.set(skill.category, set);
      }

      // 关键词索引
      const keywords = new Set<string>();
      // 从 name
      for (const part of skill.name.split(/[-_]/)) {
        if (part.length >= 2) keywords.add(part.toLowerCase());
      }
      // 从 tags
      for (const tag of skill.tags) {
        keywords.add(tag.toLowerCase());
      }
      // 从 description 提取
      const descWords = (skill.description || '').toLowerCase().split(/[\s,，。、；;]+/);
      for (const w of descWords) {
        if (w.length >= 3) keywords.add(w);
      }

      for (const kw of keywords) {
        const s = this.keywordIndex.get(kw) || new Set();
        s.add(skill.name);
        this.keywordIndex.set(kw, s);
      }
    }
  }

  /**
   * 添加单个技能到索引
   */
  addSkill(skill: SkillDefinition): void {
    this.skills.push(skill);
    this.index(this.skills); // 重建索引（简单但可靠）
  }

  /**
   * 从索引移除技能
   */
  removeSkill(name: string): boolean {
    const idx = this.skills.findIndex(s => s.name === name);
    if (idx === -1) return false;
    this.skills.splice(idx, 1);
    this.index(this.skills);
    return true;
  }

  /**
   * 匹配最佳技能
   */
  match(query: MatchQuery): MatchResult[] {
    const limit = query.limit ?? 10;
    const minScore = query.minScore ?? 0.1;
    const candidates: Array<{ skill: SkillDefinition; score: number; reasons: string[] }> = [];

    // Tokenize 查询
    const queryTokens = this.tokenize(query.text);

    for (const skill of this.skills) {
      if (!query.includeDisabled && !skill.enabled) continue;
      if (query.category && skill.category !== query.category) continue;
      if (query.tags && query.tags.length > 0) {
        const hasTag = query.tags.some(t => skill.tags.includes(t));
        if (!hasTag) continue;
      }

      let score = 0;
      const reasons: string[] = [];

      // 1. 名称完全匹配 (0.95)
      if (skill.name === query.text.toLowerCase()) {
        score = 0.95;
        reasons.push('exact name match');
      }
      // 2. 名称部分匹配 (0.7)
      else if (skill.name.includes(query.text.toLowerCase()) ||
               query.text.toLowerCase().includes(skill.name)) {
        score = Math.max(score, 0.7);
        reasons.push('partial name match');
      }

      // 3. 描述关键词匹配 (0.1-0.5)
      const descLower = skill.description.toLowerCase();
      let keywordHits = 0;
      let keywordScore = 0;
      for (const token of queryTokens) {
        if (descLower.includes(token)) {
          keywordHits++;
          keywordScore += 0.08;
        }
        // 模糊匹配
        for (const tag of skill.tags) {
          const dist = levenshteinDistance(token, tag.toLowerCase());
          const sim = 1 - dist / Math.max(token.length, tag.length);
          if (sim >= 0.8) {
            keywordScore += 0.05;
          }
        }
      }
      if (keywordHits > 0) {
        reasons.push(`${keywordHits} keyword matches`);
      }
      score = Math.max(score, Math.min(0.5, keywordScore));

      // 4. Category 匹配加成 (0.1)
      if (query.category && skill.category === query.category) {
        score += 0.1;
        reasons.push('category match');
      }

      // 5. 使用频率加成 (0-0.05)
      const usageBonus = Math.min(0.05, skill.usageCount * 0.01);
      score += usageBonus;

      // 6. 版本新鲜度加成
      try {
        const major = parseInt(skill.version.split('.')[0] || '1', 10);
        score += Math.min(0.05, major * 0.01);
      } catch { /* ignore */ }

      score = Math.min(1, score);

      if (score >= minScore) {
        candidates.push({ skill, score, reasons });
      }
    }

    // 排序、去重、截断
    candidates.sort((a, b) => b.score - a.score);
    const unique = new Map<string, MatchResult>();
    for (const c of candidates) {
      if (!unique.has(c.skill.name)) {
        unique.set(c.skill.name, {
          skill: c.skill,
          score: c.score,
          matchReasons: c.reasons,
          inferredParams: this.inferParams(c.skill, query.text),
        });
      }
    }

    return Array.from(unique.values()).slice(0, limit);
  }

  /**
   * 根据技能名精确查找
   */
  findByName(name: string): SkillDefinition | undefined {
    return this.skills.find(
      s => s.name === name || s.name.toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * 按类别列出
   */
  listByCategory(category?: string): Map<string, SkillDefinition[]> {
    const map = new Map<string, SkillDefinition[]>();
    for (const skill of this.skills) {
      const cat = skill.category || 'uncategorized';
      if (!category || cat === category) {
        const list = map.get(cat) || [];
        list.push(skill);
        map.set(cat, list);
      }
    }
    return map;
  }

  /**
   * 获取类别列表
   */
  getCategories(): Array<{ name: string; count: number }> {
    const cats = new Map<string, number>();
    for (const skill of this.skills) {
      const c = skill.category || 'uncategorized';
      cats.set(c, (cats.get(c) || 0) + 1);
    }
    return Array.from(cats.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; enabled: number; byCategory: Record<string, number> } {
    const byCategory: Record<string, number> = {};
    let enabled = 0;
    for (const s of this.skills) {
      if (s.enabled) enabled++;
      const c = s.category || 'uncategorized';
      byCategory[c] = (byCategory[c] || 0) + 1;
    }
    return { total: this.skills.length, enabled, byCategory };
  }

  // ============================================================
  // 私有方法
  // ============================================================
  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    const lower = text.toLowerCase();

    // Chinese bigrams (2-char sliding window)
    const cjkChars = lower.match(/[\u4e00-\u9fa5]+/g);
    if (cjkChars) {
      for (const seg of cjkChars) {
        // Bigrams
        for (let i = 0; i < seg.length - 1; i++) {
          tokens.push(seg.substring(i, i + 2));
        }
        // Also keep trigrams for better precision
        for (let i = 0; i < seg.length - 2; i++) {
          tokens.push(seg.substring(i, i + 3));
        }
        // Keep the whole segment if short
        if (seg.length >= 2 && seg.length <= 5) {
          tokens.push(seg);
        }
      }
    }

    // English/ASCII words
    const asciiWords = lower.split(/[\s,，。、；;：:！!？?()（）\[\]【】"'\d]+/);
    for (const w of asciiWords) {
      if (w.length >= 2) tokens.push(w);
    }

    return tokens;
  }

  private inferParams(skill: SkillDefinition, query: string): Record<string, any> {
    const params: Record<string, any> = {};
    const queryLower = query.toLowerCase();

    for (const pdef of skill.parameters) {
      // 尝试从查询文本推断参数值
      const patterns = [
        // `--param value` or `-p value`
        new RegExp(`--${pdef.name}\\s+(\\S+)`, 'i'),
        new RegExp(`-${pdef.name[0]}\\s+(\\S+)`, 'i'),
        // `${param}: value`
        new RegExp(`${pdef.name}[：:]\\s*(.+?)(?:\\s|$)`, 'i'),
      ];

      for (const pat of patterns) {
        const m = query.match(pat);
        if (m?.[1]) {
          params[pdef.name] = m[1];
          break;
        }
      }

      // 路径模式
      if (!params[pdef.name] && pdef.type === 'path') {
        const pathMatch = queryLower.match(/([a-z]:[/\\][\w./\\-]+|\/[\w./-]+|[\w./-]+\/[\w./-]+)/);
        if (pathMatch) {
          params[pdef.name] = pathMatch[1];
        }
      }

      // URL 模式
      if (!params[pdef.name] && pdef.type === 'url') {
        const urlMatch = queryLower.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          params[pdef.name] = urlMatch[1];
        }
      }

      // 使用默认值
      if (!params[pdef.name] && pdef.default) {
        params[pdef.name] = pdef.default;
      }
    }

    return params;
  }
}
