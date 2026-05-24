/**
 * Skill 文件加载器
 * 扫描目录，递归发现并解析所有 SKILL.md 文件
 */

import { promises as fs } from 'fs';
import { type Dirent } from 'fs';
import * as path from 'path';
import { SkillMarkdownParser } from './skill-markdown-parser';
import type { SkillDefinition, SkillSource } from './skill-definition';

/** 加载配置 */
export interface LoaderConfig {
  /** 扫描深度 (-1 = 无限) */
  maxDepth?: number;
  /** 排除的目录名 */
  excludeDirs?: string[];
  /** 排除的模式 */
  excludePatterns?: RegExp[];
  /** 是否加载子目录 skill */
  includeNested?: boolean;
  /** 文件发现回调 */
  onFileFound?: (filePath: string) => void;
  /** 解析完成回调 */
  onParsed?: (def: SkillDefinition) => void;
  /** 错误回调 */
  onError?: (filePath: string, error: string) => void;
}

/** 加载结果 */
export interface LoadResult {
  /** 成功加载的技能定义 */
  definitions: SkillDefinition[];
  /** 跳过的文件 */
  skipped: string[];
  /** 失败的文件 */
  failed: Array<{ filePath: string; error: string }>;
  /** 统计信息 */
  stats: {
    totalFiles: number;
    loaded: number;
    skipped: number;
    failed: number;
    durationMs: number;
  };
}

/**
 * SkillFileLoader — 递归目录扫描器
 */
export class SkillFileLoader {
  private config: Required<LoaderConfig>;

  constructor(config: LoaderConfig = {}) {
    this.config = {
      maxDepth: config.maxDepth ?? -1,
      excludeDirs: config.excludeDirs ?? ['node_modules', '.git', 'dist', 'assets', 'scripts', 'references'],
      excludePatterns: config.excludePatterns ?? [],
      includeNested: config.includeNested ?? true,
      onFileFound: config.onFileFound ?? (() => {}),
      onParsed: config.onParsed ?? (() => {}),
      onError: config.onError ?? (() => {}),
    };
  }

  /**
   * 从目录加载所有 SKILL.md
   */
  async loadDirectory(dirPath: string, source: SkillSource = 'external'): Promise<LoadResult> {
    const startTime = Date.now();
    const definitions: SkillDefinition[] = [];
    const skipped: string[] = [];
    const failed: Array<{ filePath: string; error: string }> = [];

    const skillFiles: string[] = [];
    await this.scanDirectory(dirPath, skillFiles, 0);

    for (const filePath of skillFiles) {
      this.config.onFileFound(filePath);

      const result = await SkillMarkdownParser.parseFile(filePath, source);
      if (result.success && result.definition) {
        // 如果 definition 没有设置 source，补充
        if (!result.definition.source) {
          (result.definition as any).source = source;
        }
        definitions.push(result.definition);
        this.config.onParsed(result.definition);
      } else if (result.error) {
        if (result.error.includes('No YAML frontmatter')) {
          skipped.push(filePath);
        } else {
          failed.push({ filePath, error: result.error! });
          this.config.onError(filePath, result.error!);
        }
      }
    }

    return {
      definitions,
      skipped,
      failed,
      stats: {
        totalFiles: skillFiles.length,
        loaded: definitions.length,
        skipped: skipped.length,
        failed: failed.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * 从多个目录加载
   */
  async loadDirectories(dirPaths: string[], source?: SkillSource): Promise<LoadResult> {
    const merged: LoadResult = {
      definitions: [],
      skipped: [],
      failed: [],
      stats: { totalFiles: 0, loaded: 0, skipped: 0, failed: 0, durationMs: 0 },
    };

    for (const dir of dirPaths) {
      const r = await this.loadDirectory(dir, source);
      merged.definitions.push(...r.definitions);
      merged.skipped.push(...r.skipped);
      merged.failed.push(...r.failed);
      merged.stats.totalFiles += r.stats.totalFiles;
      merged.stats.loaded += r.stats.loaded;
      merged.stats.skipped += r.stats.skipped;
      merged.stats.failed += r.stats.failed;
      merged.stats.durationMs += r.stats.durationMs;
    }
    return merged;
  }

  /**
   * 从单个文件加载
   */
  async loadFile(filePath: string, source: SkillSource = 'file'): Promise<LoadResult> {
    const start = Date.now();
    const result = await SkillMarkdownParser.parseFile(filePath, source);
    if (result.success && result.definition) {
      return {
        definitions: [result.definition],
        skipped: [],
        failed: [],
        stats: { totalFiles: 1, loaded: 1, skipped: 0, failed: 0, durationMs: Date.now() - start },
      };
    }
    return {
      definitions: [],
      skipped: [],
      failed: [{ filePath, error: result.error || 'Unknown error' }],
      stats: { totalFiles: 1, loaded: 0, skipped: 0, failed: 1, durationMs: Date.now() - start },
    };
  }

  // ============================================================
  // 目录扫描
  // ============================================================
  private async scanDirectory(
    dirPath: string,
    results: string[],
    depth: number
  ): Promise<void> {
    if (this.config.maxDepth >= 0 && depth > this.config.maxDepth) return;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return; // skip inaccessible dirs
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (this.config.excludeDirs.includes(entry.name)) continue;
        if (this.config.excludePatterns.some(p => p.test(fullPath))) continue;
        await this.scanDirectory(fullPath, results, depth + 1);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(fullPath);
      }
    }
  }
}
