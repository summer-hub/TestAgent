/**
 * KeywordRetriever - 关键词检索
 * 基于 BM25 算法的全文检索
 */

import { KnowledgeStore } from '../knowledge-store';
import {
  IRetriever,
  KnowledgeQuery,
  RetrievalResult,
  KnowledgeEntry,
} from '../types';

/**
 * KeywordRetriever 配置
 */
export interface KeywordRetrieverOptions {
  /** 知识库 */
  store: KnowledgeStore;
  /** 默认返回数量 */
  defaultLimit?: number;
  /** BM25 参数 k1 */
  k1?: number;
  /** BM25 参数 b */
  b?: number;
  /** 自定义分词器 */
  tokenizer?: (text: string) => string[];
  /** 停用词 */
  stopWords?: Set<string>;
}

/**
 * 默认中英文停用词
 */
const DEFAULT_STOP_WORDS = new Set([
  // 英文
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'this', 'these', 'those',
  // 中文
  '的', '了', '和', '是', '在', '我', '有', '不', '人', '都', '一', '上',
  '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '就', '与', '及', '或',
]);

/**
 * KeywordRetriever - BM25 关键词检索
 */
export class KeywordRetriever implements IRetriever {
  private store: KnowledgeStore;
  private defaultLimit: number;
  private k1: number;
  private b: number;
  private tokenizer: (text: string) => string[];
  private stopWords: Set<string>;

  // 倒排索引
  private invertedIndex: Map<string, Map<string, number>> = new Map();
  // 文档长度
  private docLengths: Map<string, number> = new Map();
  // 平均文档长度
  private avgDocLength = 0;
  // 索引是否已构建
  private indexBuilt = false;
  // 上次构建索引时的知识库条目数（用于检测变更）
  private storeSizeAtLastBuild = 0;

  constructor(options: KeywordRetrieverOptions) {
    this.store = options.store;
    this.defaultLimit = options.defaultLimit ?? 5;
    this.k1 = options.k1 ?? 1.5;
    this.b = options.b ?? 0.75;
    this.tokenizer = options.tokenizer ?? KeywordRetriever.defaultTokenizer;
    this.stopWords = options.stopWords ?? DEFAULT_STOP_WORDS;
  }

  /**
   * 默认分词器（支持中英文）
   */
  static defaultTokenizer(text: string): string[] {
    const tokens: string[] = [];
    // 英文按空白和标点分割
    const englishParts = text.toLowerCase().split(/[\s\p{P}]+/u).filter(t => t.length > 0);
    for (const part of englishParts) {
      if (/^[a-z0-9]+$/.test(part)) {
        tokens.push(part);
      } else {
        // 中文按字符切分（简化处理）
        for (const ch of part) {
          if (/[\u4e00-\u9fa5]/.test(ch)) {
            tokens.push(ch);
          }
        }
        // 双字 n-gram 提升中文检索效果
        for (let i = 0; i < part.length - 1; i++) {
          const bigram = part.substring(i, i + 2);
          if (/^[\u4e00-\u9fa5]{2}$/.test(bigram)) {
            tokens.push(bigram);
          }
        }
      }
    }
    return tokens;
  }

  /**
   * 构建索引
   */
  async buildIndex(): Promise<void> {
    this.invertedIndex.clear();
    this.docLengths.clear();

    const entries = await this.store.list();
    let totalLength = 0;

    for (const entry of entries) {
      const text = `${entry.title} ${entry.content}`;
      const tokens = this.tokenize(text);
      this.docLengths.set(entry.id, tokens.length);
      totalLength += tokens.length;

      // 统计词频
      const termFreq: Map<string, number> = new Map();
      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      }

      // 写入倒排索引
      for (const [term, freq] of termFreq) {
        let docMap = this.invertedIndex.get(term);
        if (!docMap) {
          docMap = new Map();
          this.invertedIndex.set(term, docMap);
        }
        docMap.set(entry.id, freq);
      }
    }

    this.avgDocLength = entries.length > 0 ? totalLength / entries.length : 0;
    this.storeSizeAtLastBuild = this.store.size;
    this.indexBuilt = true;
  }

  /**
   * 检索
   */
  async retrieve(query: KnowledgeQuery): Promise<RetrievalResult[]> {
    // 如果知识库已变更，自动重建索引
    if (!this.indexBuilt || this.store.size !== this.storeSizeAtLastBuild) {
      await this.buildIndex();
    }

    const limit = query.limit ?? this.defaultLimit;
    const queryTokens = this.tokenize(query.text);
    if (queryTokens.length === 0) return [];

    const totalDocs = this.docLengths.size;
    const scores: Map<string, number> = new Map();
    const matchedTerms: Map<string, Set<string>> = new Map();

    for (const term of queryTokens) {
      const docMap = this.invertedIndex.get(term);
      if (!docMap) continue;

      const idf = Math.log(1 + (totalDocs - docMap.size + 0.5) / (docMap.size + 0.5));

      for (const [docId, tf] of docMap) {
        const docLength = this.docLengths.get(docId) ?? 0;
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (docLength / (this.avgDocLength || 1))));
        const score = idf * tfNorm;
        scores.set(docId, (scores.get(docId) ?? 0) + score);

        let terms = matchedTerms.get(docId);
        if (!terms) {
          terms = new Set();
          matchedTerms.set(docId, terms);
        }
        terms.add(term);
      }
    }

    // 归一化分数到 [0, 1]
    const maxScore = Math.max(...scores.values(), 1);

    // 转化为结果并应用过滤
    const results: RetrievalResult[] = [];
    for (const [docId, rawScore] of scores) {
      const entry = await this.store.get(docId);
      if (!entry) continue;

      // 过滤
      if (query.category && entry.category !== query.category) continue;
      if (query.tags && query.tags.length > 0) {
        const hasAllTags = query.tags.every(t => entry.tags?.includes(t));
        if (!hasAllTags) continue;
      }

      const normalized = rawScore / maxScore;
      if (query.minScore !== undefined && normalized < query.minScore) continue;

      const matched = Array.from(matchedTerms.get(docId) ?? []);
      results.push({
        entry: query.includeEmbedding ? entry : { ...entry, embedding: undefined as any },
        score: normalized,
        matchType: 'keyword',
        highlights: this.buildHighlights(entry, matched),
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * 重建索引（添加/更新条目后）
   */
  async rebuild(): Promise<void> {
    await this.buildIndex();
  }

  /**
   * 分词 + 去停用词
   */
  private tokenize(text: string): string[] {
    return this.tokenizer(text).filter(t => t.length > 0 && !this.stopWords.has(t));
  }

  /**
   * 构建高亮片段
   */
  private buildHighlights(entry: KnowledgeEntry, terms: string[]): string[] {
    const text = `${entry.title}\n${entry.content}`;
    const highlights: string[] = [];
    const seen = new Set<string>();

    for (const term of terms) {
      const idx = text.toLowerCase().indexOf(term.toLowerCase());
      if (idx === -1) continue;
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + term.length + 30);
      const snippet = text.substring(start, end).replace(/\s+/g, ' ').trim();
      if (!seen.has(snippet)) {
        seen.add(snippet);
        highlights.push(snippet);
      }
      if (highlights.length >= 3) break;
    }

    return highlights;
  }
}
