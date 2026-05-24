/**
 * Knowledge 知识模块导出
 */

// 类型
export {
  type KnowledgeEntry,
  type KnowledgeQuery,
  type RetrievalResult,
  type KnowledgeStats,
  type IEmbeddingProvider,
  type IRetriever,
  type IStorageAdapter,
} from './types';

// Store
export { KnowledgeStore, type KnowledgeStoreOptions } from './knowledge-store';

// Storage 适配器
export {
  JsonStorageAdapter,
  MemoryStorageAdapter,
  type JsonStorageOptions,
} from './storage/json-storage';

// 检索器
export {
  SemanticRetriever,
  type SemanticRetrieverOptions,
} from './retrievers/semantic-retriever';
export {
  KeywordRetriever,
  type KeywordRetrieverOptions,
} from './retrievers/keyword-retriever';
export {
  HybridRetriever,
  type HybridRetrieverOptions,
  type FusionStrategy,
} from './retrievers/hybrid-retriever';

// 便捷工厂
import { KnowledgeStore } from './knowledge-store';
import { JsonStorageAdapter } from './storage/json-storage';
import { SemanticRetriever } from './retrievers/semantic-retriever';
import { KeywordRetriever } from './retrievers/keyword-retriever';
import { HybridRetriever } from './retrievers/hybrid-retriever';
import type { IEmbeddingProvider } from './types';

/**
 * 创建默认知识库（JSON 文件 + Hybrid 检索）
 */
export function createKnowledgeBase(options: {
  filePath: string;
  embeddingProvider?: IEmbeddingProvider;
}): {
  store: KnowledgeStore;
  retriever: HybridRetriever;
} {
  const storage = new JsonStorageAdapter({ filePath: options.filePath });
  const store = new KnowledgeStore({
    storage,
    ...(options.embeddingProvider !== undefined && { embedding: options.embeddingProvider }),
    autoLoad: true,
    autoSave: true,
  });

  const keywordRetriever = new KeywordRetriever({ store });
  const semanticRetriever = options.embeddingProvider
    ? new SemanticRetriever({ store, embeddingProvider: options.embeddingProvider })
    : undefined;

  const retriever = new HybridRetriever({
    keywordRetriever,
    ...(semanticRetriever !== undefined && { semanticRetriever }),
  });

  return { store, retriever };
}
