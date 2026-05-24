/**
 * Knowledge 模块类型定义
 */

/**
 * 知识条目
 */
export interface KnowledgeEntry {
  /** 唯一标识 */
  id: string;
  /** 标题 */
  title: string;
  /** 内容 */
  content: string;
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string[];
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 向量表示 */
  embedding?: number[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 使用次数 */
  usageCount?: number;
  /** 来源 */
  source?: string;
}

/**
 * 知识查询参数
 */
export interface KnowledgeQuery {
  /** 查询文本 */
  text: string;
  /** 限制返回数量 */
  limit?: number;
  /** 分类过滤 */
  category?: string;
  /** 标签过滤 */
  tags?: string[];
  /** 最小相关性分数 */
  minScore?: number;
  /** 是否包含 embedding */
  includeEmbedding?: boolean;
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  /** 知识条目 */
  entry: KnowledgeEntry;
  /** 相关性分数 (0-1) */
  score: number;
  /** 匹配类型 */
  matchType: 'semantic' | 'keyword' | 'hybrid' | 'exact';
  /** 匹配的字段 */
  matchedField?: string;
  /** 高亮片段 */
  highlights?: string[];
}

/**
 * 知识存储统计
 */
export interface KnowledgeStats {
  /** 总条目数 */
  totalEntries: number;
  /** 分类分布 */
  categoryCounts: Record<string, number>;
  /** 标签分布（前 N） */
  topTags: Array<{ tag: string; count: number }>;
  /** 已索引（含向量）条目数 */
  indexedCount: number;
  /** 存储大小（字节） */
  storageSize?: number;
}

/**
 * Embedding 生成器接口
 * Knowledge 模块依赖此接口生成向量，实际由 LLM Provider 提供
 */
export interface IEmbeddingProvider {
  /**
   * 生成单个文本的向量
   */
  embed(text: string): Promise<number[]>;

  /**
   * 批量生成向量
   */
  embedBatch?(texts: string[]): Promise<number[][]>;

  /**
   * 向量维度
   */
  readonly dimensions: number;
}

/**
 * 检索器接口
 */
export interface IRetriever {
  /**
   * 检索知识
   */
  retrieve(query: KnowledgeQuery): Promise<RetrievalResult[]>;
}

/**
 * 存储适配器接口
 */
export interface IStorageAdapter {
  load(): Promise<KnowledgeEntry[]>;
  save(entries: KnowledgeEntry[]): Promise<void>;
}
