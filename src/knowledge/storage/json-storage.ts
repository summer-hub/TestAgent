/**
 * JSON 文件存储适配器
 * 将知识库持久化到 JSON 文件
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { IStorageAdapter, KnowledgeEntry } from '../types';

/**
 * JSON 存储配置
 */
export interface JsonStorageOptions {
  /** 存储文件路径 */
  filePath: string;
  /** 是否美化输出 */
  pretty?: boolean;
  /** 是否使用原子写入 */
  atomic?: boolean;
}

/**
 * JsonStorageAdapter - JSON 文件存储适配器
 */
export class JsonStorageAdapter implements IStorageAdapter {
  private filePath: string;
  private pretty: boolean;
  private atomic: boolean;

  constructor(options: JsonStorageOptions) {
    this.filePath = options.filePath;
    this.pretty = options.pretty !== false;
    this.atomic = options.atomic !== false;
  }

  /**
   * 加载知识条目
   */
  async load(): Promise<KnowledgeEntry[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
      return [];
    } catch (err: any) {
      if (err?.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * 保存知识条目
   */
  async save(entries: KnowledgeEntry[]): Promise<void> {
    await this.ensureDir();
    const content = this.pretty
      ? JSON.stringify({ entries, version: 1, updatedAt: Date.now() }, null, 2)
      : JSON.stringify({ entries, version: 1, updatedAt: Date.now() });

    if (this.atomic) {
      const tmpPath = `${this.filePath}.${Date.now()}.tmp`;
      try {
        await fs.writeFile(tmpPath, content, 'utf-8');
        await fs.rename(tmpPath, this.filePath);
      } catch (err) {
        try {
          await fs.unlink(tmpPath);
        } catch {
          // 忽略
        }
        throw err;
      }
    } else {
      await fs.writeFile(this.filePath, content, 'utf-8');
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * 获取文件大小
   */
  async getSize(): Promise<number> {
    try {
      const stat = await fs.stat(this.filePath);
      return stat.size;
    } catch {
      return 0;
    }
  }
}

/**
 * MemoryStorageAdapter - 内存存储适配器（用于测试）
 */
export class MemoryStorageAdapter implements IStorageAdapter {
  private data: KnowledgeEntry[] = [];

  async load(): Promise<KnowledgeEntry[]> {
    return [...this.data];
  }

  async save(entries: KnowledgeEntry[]): Promise<void> {
    this.data = [...entries];
  }
}
