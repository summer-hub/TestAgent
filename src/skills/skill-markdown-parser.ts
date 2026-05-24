/**
 * SKILL.md 解析器
 * 解析 Agent Skills 规范的 SKILL.md 文件：
 *   1. YAML 前置信息 (frontmatter)
 *   2. Markdown 正文 (参数表、工作流、依赖)
 */

import * as YAML from 'yaml';
import { promises as fs } from 'fs';
import * as path from 'path';
import type {
  SkillDefinition,
  SkillParameterDef,
  WorkflowPhase,
  SkillDependency,
  SkillCategory,
  SkillSource,
} from './skill-definition';

// ============================================================
// 解析结果
// ============================================================

export interface ParseResult {
  /** 解析成功 */
  success: boolean;
  /** 解析出的技能定义 */
  definition?: SkillDefinition;
  /** 错误信息 */
  error?: string;
  /** 解析警告 */
  warnings: string[];
}

// ============================================================
// 解析器
// ============================================================

export class SkillMarkdownParser {
  /**
   * 解析单个 SKILL.md 文件
   */
  static async parseFile(
    filePath: string,
    source: SkillSource = 'file'
  ): Promise<ParseResult> {
    const warnings: string[] = [];
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = this.parse(raw, source, filePath);
      parsed.warnings.push(...warnings);
      return parsed;
    } catch (err) {
      return {
        success: false,
        error: `Failed to read ${filePath}: ${(err as Error).message}`,
        warnings,
      };
    }
  }

  /**
   * 解析 SKILL.md 文本内容
   */
  static parse(
    raw: string,
    source: SkillSource = 'file',
    filePath?: string
  ): ParseResult {
    const warnings: string[] = [];

    // 1. 提取 YAML frontmatter (支持 \r\n 和 \n)
    const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!frontmatterMatch) {
      return {
        success: false,
        error: 'No YAML frontmatter found. SKILL.md must start with ---',
        warnings,
      };
    }

    const yamlBlock = frontmatterMatch[1]!;
    const markdownBody = frontmatterMatch[2]!;

    // 2. 解析 YAML
    let frontmatter: Record<string, any>;
    try {
      frontmatter = YAML.parse(yamlBlock) || {};
    } catch (err) {
      return {
        success: false,
        error: `YAML parse error: ${(err as Error).message}`,
        warnings,
      };
    }

    // 3. 验证必需字段
    if (!frontmatter.name || typeof frontmatter.name !== 'string') {
      return { success: false, error: 'Missing required field: name', warnings };
    }
    if (!frontmatter.description || typeof frontmatter.description !== 'string') {
      return { success: false, error: 'Missing required field: description', warnings };
    }

    const name = frontmatter.name;
    const meta = frontmatter.metadata || {};

    // 4. 提取分类
    const category: SkillCategory = meta.category ||
      frontmatter.category ||
      this.inferCategory(filePath);

    // 5. 提取版本
    const version = meta.version || frontmatter.version || '1.0.0';

    // 6. 解析参数表
    const parameters = this.parseParameterTable(markdownBody);

    // 7. 解析工作流阶段
    const phases = this.parseWorkflowPhases(markdownBody);

    // 8. 解析依赖关系
    const dependencies = this.parseDependencies(markdownBody);

    // 9. 提取标签
    const tags = this.extractTags(frontmatter, markdownBody, category);

    // 10. 提取 summary（description 的第一句）
    const summary = frontmatter.description.split(/[。.]/)[0] || frontmatter.description;

    // 11. 从 markdown body 提取标题
    const titleMatch = markdownBody.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1] ?? undefined;

    const definition: SkillDefinition = {
      name,
      title,
      description: frontmatter.description,
      summary,
      category,
      tags,
      version: String(version),
      author: meta.author || frontmatter.author,
      license: frontmatter.license,
      source,
      filePath,
      registeredAt: Date.now(),
      compatibility: frontmatter.compatibility,
      parameters,
      parametersSchema: this.buildParametersSchema(parameters),
      phases,
      totalSteps: phases.reduce((sum, p) => sum + p.steps.length, 0),
      dependencies,
      enabled: true,
      usageCount: 0,
      rawBody: markdownBody,
      metadata: { ...meta, ...frontmatter },
    };

    return { success: true, definition, warnings };
  }

  // ============================================================
  // 参数表解析
  // ============================================================
  private static parseParameterTable(body: string): SkillParameterDef[] {
    const params: SkillParameterDef[] = [];

    // 匹配 markdown 表格: | 参数 | 必需 | 默认值 | 说明 |
    const tableRegex = /\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/g;
    let inParamSection = false;

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      // 查找参数表头
      if (/^\|.*参数.*\|.*(必需|必填).*\|/i.test(trimmed) ||
          /^\|.*parameter.*\|.*required.*\|/i.test(trimmed)) {
        inParamSection = true;
        continue;
      }
      // 分隔线跳过
      if (trimmed.startsWith('|---') || trimmed.startsWith('|--')) continue;
      // header 结束参数段
      if (inParamSection && (trimmed.startsWith('#') || trimmed.startsWith('---'))) {
        break;
      }

      if (inParamSection) {
        const cols = this.parseTableRow(trimmed);
        if (cols.length >= 4) {
          const name = cols[0]!.replace(/`/g, '').trim();
          const required = /✅|✔|✓|是|yes/i.test(cols[1]!);
          const defaultVal = cols[2]?.trim() || undefined;
          const desc = cols[3]?.trim() || '';
          if (name && name !== '参数' && name !== 'Parameter') {
            params.push({
              name,
              required,
              default: defaultVal && defaultVal !== '-' && defaultVal !== '—' ? defaultVal : undefined,
              description: desc,
              type: this.inferParamType(name, desc),
            });
          }
        }
      }
    }

    return params;
  }

  private static parseTableRow(line: string): string[] {
    // 去掉首尾 | ，按 | 分割
    let trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map(c => c.trim());
  }

  private static inferParamType(
    name: string,
    desc: string
  ): SkillParameterDef['type'] {
    const combined = `${name} ${desc}`.toLowerCase();
    if (/path|路径|目录|dir/i.test(combined)) return 'path';
    if (/url|链接|http/i.test(combined)) return 'url';
    if (/bool/i.test(combined)) return 'boolean';
    if (/number|num|数量|count|level/i.test(combined)) return 'number';
    if (/enum|枚举|mode|模式|format/i.test(combined)) return 'enum';
    return 'string';
  }

  // ============================================================
  // 工作流阶段解析
  // ============================================================
  private static parseWorkflowPhases(body: string): WorkflowPhase[] {
    const phases: WorkflowPhase[] = [];
    const lines = body.split('\n');
    let currentPhase: WorkflowPhase | null = null;

    const phaseHeaderRegex = /^#{2,4}\s*(?:阶段|Phase|步骤)\s*(\d+|[一二三四五六七八九十])[：:]*\s*(.+)/i;
    const stepRegex = /^\d+[.)]\s+(.+)/;

    for (const line of lines) {
      const phaseMatch = line.match(phaseHeaderRegex);
      if (phaseMatch) {
        if (currentPhase) phases.push(currentPhase);

        let phaseNum = 1;
        const numStr = phaseMatch[1]!;
        if (/^\d+$/.test(numStr)) {
          phaseNum = parseInt(numStr, 10);
        } else {
          const map: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8 };
          phaseNum = map[numStr] || phases.length + 1;
        }

        currentPhase = {
          phase: phaseNum,
          title: phaseMatch[2]?.trim() || `Phase ${phaseNum}`,
          description: '',
          steps: [],
        };
        continue;
      }

      if (currentPhase) {
        // 新的 phase 开始则结束当前
        if (/^#{1,3}\s/.test(line) && !phaseHeaderRegex.test(line)) {
          phases.push(currentPhase);
          currentPhase = null;
          continue;
        }

        const stepMatch = line.match(stepRegex);
        if (stepMatch) {
          currentPhase.steps.push(stepMatch[1]!.trim());
        }
      }
    }

    if (currentPhase) phases.push(currentPhase);
    return phases;
  }

  // ============================================================
  // 依赖解析
  // ============================================================
  private static parseDependencies(body: string): SkillDependency[] {
    const deps: SkillDependency[] = [];
    const genericWords = new Set(['skill', 'the', 'and', 'for', 'a', 'an', 'is', 'in', 'to', 'of']);

    // 匹配 "依赖 xxx"、"需要 xxx skill"、"depends on xxx"
    const depRegex = /(?:依赖|depends on|requires?|需要|需要用到)\s+(?:skill\s+)?[`"]?([a-z][a-z0-9-]{3,})[`"]?/gi;
    let match;
    while ((match = depRegex.exec(body)) !== null) {
      const name = match[1]!.toLowerCase();
      if (!genericWords.has(name) && !deps.find(d => d.skillName === name)) {
        deps.push({ skillName: name, type: 'required' });
      }
    }

    // 匹配 "消费 xxx"、"可消费 xxx"
    const consumeRegex = /(?:消费|consumes?|消费结果)\s+(?:skill\s+)?[`"]?([a-z][a-z0-9-]{3,})[`"]?/gi;
    while ((match = consumeRegex.exec(body)) !== null) {
      const name = match[1]!.toLowerCase();
      if (!genericWords.has(name) && !deps.find(d => d.skillName === name)) {
        deps.push({ skillName: name, type: 'consumes' });
      }
    }

    // 匹配 compatibility 中的依赖列表: "依赖 xxx、yyy"
    const compatMatch = body.match(/依赖\s+([\s\S]*?)(?:提供|支持|查询)/);
    if (compatMatch) {
      const skillNames = compatMatch[1]!.match(/[a-z][a-z0-9-]{3,}/gi) || [];
      for (const name of skillNames) {
        const lower = name.toLowerCase();
        if (!genericWords.has(lower) && !deps.find(d => d.skillName === lower)) {
          deps.push({ skillName: lower, type: 'required' });
        }
      }
    }

    return deps;
  }

  // ============================================================
  // 标签提取
  // ============================================================
  private static extractTags(
    fm: Record<string, any>,
    body: string,
    category: string
  ): string[] {
    const tags = new Set<string>();

    // category 作为标签
    if (category) tags.add(category);

    // metadata.tags
    const metaTags = fm.metadata?.tags;
    if (Array.isArray(metaTags)) {
      metaTags.forEach((t: string) => tags.add(t));
    }

    // 从 description 提取关键词
    const desc = fm.description || '';
    const keywordMatches = desc.match(/[\u4e00-\u9fa5]{2,4}|[a-zA-Z]{3,}/g) || [];
    const stopWords = new Set([
      'the', 'and', 'for', 'ing', 'ion', 'est', 'etc', '使用', '用于', '进行',
      '一个', '可以', '这个', '其中', '其他', '以及', '或者',
    ]);
    for (const kw of keywordMatches) {
      if (kw.length >= 3 && !stopWords.has(kw.toLowerCase())) {
        tags.add(kw.toLowerCase());
      }
    }

    return Array.from(tags).slice(0, 20);
  }

  // ============================================================
  // 工具函数
  // ============================================================
  private static buildParametersSchema(params: SkillParameterDef[]): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const p of params) {
      properties[p.name] = {
        type: p.type || 'string',
        description: p.description,
        ...(p.default !== undefined && { default: p.default }),
        ...(p.enumValues && { enum: p.enumValues }),
      };
      if (p.required) required.push(p.name);
    }

    return { type: 'object', properties, ...(required.length > 0 && { required }) };
  }

  private static inferCategory(filePath?: string): string {
    if (!filePath) return 'uncategorized';
    const full = filePath.toLowerCase();
    const known: Array<[string, string]> = [
      ['code-check', 'code-check'],
      ['code-generation', 'code-generation'],
      ['design-generation', 'design'],
      ['developer-test', 'test'],
      ['document-tools', 'document'],
      ['document-check', 'document'],
      ['publish', 'publish'],
      ['requirements-analysis', 'requirements'],
      ['test-verification', 'test'],
      ['clibrary-build', 'build'],
    ];
    // Split path and find category directory
    const segments = filePath.replace(/\\/g, '/').split('/');
    // Skip drive letter segments (e.g. "d:") and very short segments
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]!.toLowerCase();
      if (seg.length < 3 || seg === 'skills' || seg === 'skill.md' || /^[a-z]:$/i.test(seg)) continue;
      for (const [key, val] of known) {
        // Only match if segment contains the key (not vice versa)
        if (seg.includes(key)) return val;
      }
    }
    // Fallback: search the path (excluding drive letter prefix) for known categories
    const pathNoDrive = full.replace(/^[a-z]:/, '');
    for (const [key, val] of known) {
      if (pathNoDrive.includes(key)) return val;
    }
    return 'general';
  }
}
