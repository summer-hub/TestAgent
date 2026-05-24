/**
 * HybridRetriever - 混合检索
 * 结合语义和关键词检索，使用加权融合或 RRF
 */

import { SemanticRetriever } from './semantic-retriever';
import { KeywordRetriever } from './keyword-retriever';
import { IRetriever, KnowledgeQuery, RetrievalResult, KnowledgeEntry } from '../types';

/**
 * 融合策略
 */
export type FusionStrategy = 'weighted' | 'rrf';

/**
 * HybridRetriever 配置
 */
export interface HybridRetrieverOptions {
  /** 语义检索器 */
  semanticRetriever?: SemanticRetriever;
  /** 关键词检索器 */
  keywordRetriever: KeywordRetriever;
  /** 融合策略 */
  strategy?: FusionStrategy;
  /** 语义检索权重（仅 weighted） */
  semanticWeight?: number;
  /** 关键词检索权重（仅 weighted） */
  keywordWeight?: number;
  /** RRF 参数 k */
  rrfK?: number;
  /** 默认返回数量 */
  defaultLimit?: number;
  /** 单路召回数量（候选池大小） */
  recallLimit?: number;
}

/**
 * HybridRetriever - 混合检索器
 */
export class HybridRetriever implements IRetriever {
  private semanticRetriever?: SemanticRetriever;
  private keywordRetriever: KeywordRetriever;
  private strategy: FusionStrategy;
  private semanticWeight: number;
  private keywordWeight: number;
  private rrfK: number;
  private defaultLimit: number;
  private recallLimit: number;

  constructor(options: HybridRetrieverOptions) {
    if (options.semanticRetriever) {
      this.semanticRetriever = options.semanticRetriever;
    }
    this.keywordRetriever = options.keywordRetriever;
    this.strategy = options.strategy ?? 'weighted';
    this.semanticWeight = options.semanticWeight ?? 0.6;
    this.keywordWeight = options.keywordWeight ?? 0.4;
    this.rrfK = options.rrfK ?? 60;
    this.defaultLimit = options.defaultLimit ?? 5;
    this.recallLimit = options.recallLimit ?? 20;
  }

  /**
   * 检索
   */
  async retrieve(query: KnowledgeQuery): Promise<RetrievalResult[]> {
    const limit = query.limit ?? this.defaultLimit;
    const recallQuery: KnowledgeQuery = { ...query, limit: this.recallLimit };

    // 并行执行两路召回
    const promises: Array<Promise<RetrievalResult[]>> = [];
    promises.push(this.keywordRetriever.retrieve(recallQuery));
    if (this.semanticRetriever) {
      promises.push(
        this.semanticRetriever.retrieve(recallQuery).catch(() => [] as RetrievalResult[])
      );
    }

    const allResults = await Promise.all(promises);
    const keywordResults = allResults[0] ?? [];
    const semanticResults = allResults[1] ?? [];

    // 融合
    let merged: RetrievalResult[];
    if (this.strategy === 'rrf') {
      merged = this.rrfFusion(semanticResults, keywordResults);
    } else {
      merged = this.weightedFusion(semanticResults, keywordResults);
    }

    // 应用 minScore 过滤
    if (query.minScore !== undefined) {
      merged = merged.filter(r => r.score >= query.minScore!);
    }

    return merged.slice(0, limit);
  }

  /**
   * 加权融合
   */
  private weightedFusion(
    semantic: RetrievalResult[],
    keyword: RetrievalResult[]
  ): RetrievalResult[] {
    const scoreMap: Map<string, { entry: KnowledgeEntry; score: number; highlights?: string[] }> = new Map();

    for (const result of semantic) {
      scoreMap.set(result.entry.id, {
        entry: result.entry,
        score: result.score * this.semanticWeight,
      });
    }

    for (const result of keyword) {
      const existing = scoreMap.get(result.entry.id);
      if (existing) {
        existing.score += result.score * this.keywordWeight;
        existing.highlights = result.highlights;
      } else {
        scoreMap.set(result.entry.id, {
          entry: result.entry,
          score: result.score * this.keywordWeight,
          ...(result.highlights !== undefined && { highlights: result.highlights }),
        });
      }
    }

    return Array.from(scoreMap.values())
      .map(({ entry, score, highlights }) => ({
        entry,
        score: Math.min(1, score),
        matchType: 'hybrid' as const,
        ...(highlights !== undefined && { highlights }),
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Reciprocal Rank Fusion
   * RRF score = sum( 1 / (k + rank) ) for each retriever
   */
  private rrfFusion(
    semantic: RetrievalResult[],
    keyword: RetrievalResult[]
  ): RetrievalResult[] {
    const scoreMap: Map<string, { entry: KnowledgeEntry; score: number; highlights?: string[] }> = new Map();

    semantic.forEach((result, rank) => {
      const rrfScore = 1 / (this.rrfK + rank + 1);
      scoreMap.set(result.entry.id, { entry: result.entry, score: rrfScore });
    });

    keyword.forEach((result, rank) => {
      const rrfScore = 1 / (this.rrfK + rank + 1);
      const existing = scoreMap.get(result.entry.id);
      if (existing) {
        existing.score += rrfScore;
        existing.highlights = result.highlights;
      } else {
        scoreMap.set(result.entry.id, {
          entry: result.entry,
          score: rrfScore,
          ...(result.highlights !== undefined && { highlights: result.highlights }),
        });
      }
    });

    // 归一化
    const maxScore = Math.max(...Array.from(scoreMap.values()).map(v => v.score), 1);

    return Array.from(scoreMap.values())
      .map(({ entry, score, highlights }) => ({
        entry,
        score: score / maxScore,
        matchType: 'hybrid' as const,
        ...(highlights !== undefined && { highlights }),
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * 重建关键词索引
   */
  async rebuildIndex(): Promise<void> {
    await this.keywordRetriever.rebuild();
  }
}
