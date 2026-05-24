/**
 * KnowledgeStore - 知识存储管理
 * 提供 CRUD、向量索引、查询接口
 */

import {
  IStorageAdapter,
  KnowledgeEntry,
  KnowledgeQuery,
  KnowledgeStats,
  IEmbeddingProvider,
  RetrievalResult,
} from './types';

/**
 * KnowledgeStore 配置
 */
export interface KnowledgeStoreOptions {
  /** 存储适配器 */
  storage: IStorageAdapter;
  /** Embedding 提供者（用于语义索引） */
  embedding?: IEmbeddingProvider;
  /** 是否自动加载 */
  autoLoad?: boolean;
  /** 自动保存（每次变更后） */
  autoSave?: boolean;
  /** 自动保存防抖（毫秒） */
  autoSaveDebounce?: number;
}

/**
 * KnowledgeStore - 知识存储核心
 */
export class KnowledgeStore {
  private entries: Map<string, KnowledgeEntry> = new Map();
  private storage: IStorageAdapter;
  private embedding?: IEmbeddingProvider;
  private autoSave: boolean;
  private autoSaveDebounce: number;
  private saveTimer: NodeJS.Timeout | null = null;
  private loaded = false;
  private idCounter = 0;

  constructor(options: KnowledgeStoreOptions) {
    this.storage = options.storage;
    if (options.embedding) {
      this.embedding = options.embedding;
    }
    this.autoSave = options.autoSave ?? true;
    this.autoSaveDebounce = options.autoSaveDebounce ?? 500;
    if (options.autoLoad !== false) {
      this.load().catch(() => {
        // 错误延后到首次 query 时暴露
      });
    }
  }

  /**
   * 加载存储
   */
  async load(): Promise<void> {
    const entries = await this.storage.load();
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
    this.loaded = true;
  }

  /**
   * 持久化（立即）
   */
  async save(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.storage.save(Array.from(this.entries.values()));
  }

  /**
   * 触发自动保存
   */
  private scheduleSave(): void {
    if (!this.autoSave) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.storage.save(Array.from(this.entries.values())).catch(() => {
        // 忽略保存错误（应通过 logger 上报）
      });
    }, this.autoSaveDebounce);
  }

  /**
   * 添加知识条目
   */
  async add(
    entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<KnowledgeEntry> {
    await this.ensureLoaded();
    const id = entry.id ?? this.generateId();
    const now = Date.now();

    const newEntry: KnowledgeEntry = {
      id,
      title: entry.title,
      content: entry.content,
      ...(entry.category !== undefined && { category: entry.category }),
      ...(entry.tags !== undefined && { tags: entry.tags }),
      ...(entry.metadata !== undefined && { metadata: entry.metadata }),
      ...(entry.source !== undefined && { source: entry.source }),
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    };

    // 生成 embedding
    if (this.embedding && !entry.embedding) {
      try {
        newEntry.embedding = await this.embedding.embed(`${entry.title}\n${entry.content}`);
      } catch (err) {
        console.warn(`[KnowledgeStore] Embedding generation failed for "${entry.title}":`, err);
      }
    } else if (entry.embedding) {
      newEntry.embedding = entry.embedding;
    }

    this.entries.set(id, newEntry);
    this.scheduleSave();
    return newEntry;
  }

  /**
   * 批量添加
   */
  async addBatch(
    entries: Array<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>
  ): Promise<KnowledgeEntry[]> {
    const results: KnowledgeEntry[] = [];
    for (const entry of entries) {
      results.push(await this.add(entry));
    }
    return results;
  }

  /**
   * 更新条目
   */
  async update(
    id: string,
    updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt'>>
  ): Promise<KnowledgeEntry | null> {
    await this.ensureLoaded();
    const existing = this.entries.get(id);
    if (!existing) return null;

    const updated: KnowledgeEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    // 内容变化时重新生成 embedding
    const contentChanged = updates.title !== undefined || updates.content !== undefined;
    if (this.embedding && contentChanged && !updates.embedding) {
      try {
        updated.embedding = await this.embedding.embed(`${updated.title}\n${updated.content}`);
      } catch (err) {
        console.warn(`[KnowledgeStore] Embedding regeneration failed for "${updated.title}":`, err);
      }
    }

    this.entries.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  /**
   * 删除条目
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const result = this.entries.delete(id);
    if (result) this.scheduleSave();
    return result;
  }

  /**
   * 获取条目
   */
  async get(id: string): Promise<KnowledgeEntry | null> {
    await this.ensureLoaded();
    const entry = this.entries.get(id);
    return entry || null;
  }

  /**
   * 列出全部
   */
  async list(filter?: { category?: string; tag?: string }): Promise<KnowledgeEntry[]> {
    await this.ensureLoaded();
    let results = Array.from(this.entries.values());
    if (filter?.category) {
      results = results.filter(e => e.category === filter.category);
    }
    if (filter?.tag !== undefined && filter?.tag !== null) {
      const searchTag = filter.tag;
      results = results.filter(e => e.tags?.includes(searchTag));
    }
    return results;
  }

  /**
   * 记录使用次数（每次检索成功调用）
   */
  async recordUsage(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.usageCount = (entry.usageCount ?? 0) + 1;
      this.scheduleSave();
    }
  }

  /**
   * 重建所有向量索引
   */
  async rebuildIndex(progress?: (current: number, total: number) => void): Promise<number> {
    await this.ensureLoaded();
    if (!this.embedding) return 0;

    const entries = Array.from(this.entries.values());
    let count = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      try {
        entry.embedding = await this.embedding.embed(`${entry.title}\n${entry.content}`);
        count++;
      } catch (err) {
        console.warn(`[KnowledgeStore] RebuildIndex embedding failed for "${entry.title}":`, err);
      }
      progress?.(i + 1, entries.length);
    }

    this.scheduleSave();
    return count;
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<KnowledgeStats> {
    await this.ensureLoaded();
    const categoryCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let indexedCount = 0;

    for (const entry of this.entries.values()) {
      if (entry.category) {
        categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
      }
      if (entry.tags) {
        for (const tag of entry.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      if (entry.embedding && entry.embedding.length > 0) {
        indexedCount++;
      }
    }

    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEntries: this.entries.size,
      categoryCounts,
      topTags,
      indexedCount,
    };
  }

  /**
   * 清空知识库
   */
  async clear(): Promise<void> {
    this.entries.clear();
    await this.save();
  }

  /**
   * 获取所有条目（内部用）
   */
  getEntries(): IterableIterator<KnowledgeEntry> {
    return this.entries.values();
  }

  /**
   * 条目数
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * 获取 embedding 提供者
   */
  getEmbeddingProvider(): IEmbeddingProvider | undefined {
    return this.embedding;
  }

  // ============ 私有方法 ============

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  private generateId(): string {
    return `know_${Date.now()}_${++this.idCounter}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
