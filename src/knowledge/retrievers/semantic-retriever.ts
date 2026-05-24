/**
 * SemanticRetriever - 语义检索
 * 基于 embedding 向量的余弦相似度检索
 */

import { KnowledgeStore } from '../knowledge-store';
import { IRetriever, KnowledgeQuery, RetrievalResult, IEmbeddingProvider } from '../types';

/**
 * SemanticRetriever 配置
 */
export interface SemanticRetrieverOptions {
  /** 知识库 */
  store: KnowledgeStore;
  /** Embedding 提供者（如果与 store 不同） */
  embeddingProvider?: IEmbeddingProvider;
  /** 默认返回数量 */
  defaultLimit?: number;
  /** 默认最小相似度阈值 */
  defaultMinScore?: number;
}

/**
 * SemanticRetriever - 基于向量的语义检索
 */
export class SemanticRetriever implements IRetriever {
  private store: KnowledgeStore;
  private embeddingProvider?: IEmbeddingProvider;
  private defaultLimit: number;
  private defaultMinScore: number;

  constructor(options: SemanticRetrieverOptions) {
    this.store = options.store;
    this.embeddingProvider = options.embeddingProvider ?? options.store.getEmbeddingProvider();
    this.defaultLimit = options.defaultLimit ?? 5;
    this.defaultMinScore = options.defaultMinScore ?? 0.3;
  }

  /**
   * 检索
   */
  async retrieve(query: KnowledgeQuery): Promise<RetrievalResult[]> {
    if (!this.embeddingProvider) {
      throw new Error('SemanticRetriever requires an embedding provider');
    }

    const limit = query.limit ?? this.defaultLimit;
    const minScore = query.minScore ?? this.defaultMinScore;

    // 生成查询向量
    const queryVector = await this.embeddingProvider.embed(query.text);

    // 收集候选条目（应用过滤）
    // TODO: 当 query.tags.length > 1 时，store.list 未传 tag 过滤器，导致全表扫描
    //   后续可优化为：store.list 支持多 tag 过滤，或使用倒排索引预筛选
    const entries = await this.store.list({
      ...(query.category !== undefined && { category: query.category }),
      ...(query.tags && query.tags.length === 1 && { tag: query.tags[0]! }),
    });

    // 计算相似度
    const results: RetrievalResult[] = [];
    for (const entry of entries) {
      if (!entry.embedding || entry.embedding.length === 0) continue;

      // 多标签过滤
      if (query.tags && query.tags.length > 1) {
        const hasAllTags = query.tags.every(t => entry.tags?.includes(t));
        if (!hasAllTags) continue;
      }

      const score = SemanticRetriever.cosineSimilarity(queryVector, entry.embedding);
      if (score < minScore) continue;

      results.push({
        entry: query.includeEmbedding ? entry : { ...entry, embedding: undefined as any },
        score,
        matchType: 'semantic',
      });
    }

    // 按分数排序并限制数量
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 余弦相似度
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]!;
      const bi = b[i]!;
      dot += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 欧氏距离
   */
  static euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i]! - b[i]!;
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}
