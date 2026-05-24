/**
 * Knowledge Retrievers 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeStore } from '@knowledge/knowledge-store';
import { MemoryStorageAdapter } from '@knowledge/storage/json-storage';
import { SemanticRetriever } from '@knowledge/retrievers/semantic-retriever';
import { KeywordRetriever } from '@knowledge/retrievers/keyword-retriever';
import { HybridRetriever } from '@knowledge/retrievers/hybrid-retriever';
import type { IEmbeddingProvider } from '@knowledge/types';

const mockEmbedding: IEmbeddingProvider = {
  dimensions: 16,
  async embed(text: string): Promise<number[]> {
    // Simple vector encoding for testing
    const vec = new Array(16).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      let hash = 0;
      for (let j = 0; j < w.length; j++) {
        hash = ((hash << 5) - hash + w.charCodeAt(j)) | 0;
      }
      vec[i % 16]! += hash / 1e9;
    }
    return vec;
  },
};

describe('SemanticRetriever', () => {
  let store: KnowledgeStore;
  let retriever: SemanticRetriever;

  beforeEach(async () => {
    store = new KnowledgeStore({
      storage: new MemoryStorageAdapter(),
      embedding: mockEmbedding,
      autoLoad: false,
      autoSave: false,
    });
    await store.load();
    retriever = new SemanticRetriever({ store, defaultMinScore: -1 });

    await store.add({
      title: 'Login Button',
      content: 'The login button is at the top right corner of the screen.',
      tags: ['ui'],
    });
    await store.add({
      title: 'User Registration',
      content: 'Registration requires email and password validation.',
      category: 'process',
    });
    await store.add({
      title: 'Performance Settings',
      content: 'Configuring frame rate and graphics quality in settings.',
      tags: ['performance'],
    });
  });

  it('should retrieve semantically similar entries', async () => {
    const results = await retriever.retrieve({ text: 'how to log in' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.matchType).toBe('semantic');
    expect(results[0]!.score).toBeGreaterThanOrEqual(0);
  });

  it('should respect limit', async () => {
    const results = await retriever.retrieve({ text: 'settings', limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should filter by category', async () => {
    const results = await retriever.retrieve({
      text: 'register user',
      category: 'process',
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.entry.category).toBe('process');
  });

  it('should filter by tags', async () => {
    const results = await retriever.retrieve({
      text: 'button',
      tags: ['ui'],
    });
    expect(results).toHaveLength(1);
  });
});

describe('KeywordRetriever', () => {
  let store: KnowledgeStore;
  let retriever: KeywordRetriever;

  beforeEach(async () => {
    store = new KnowledgeStore({
      storage: new MemoryStorageAdapter(),
      autoLoad: false,
      autoSave: false,
    });
    await store.load();
    retriever = new KeywordRetriever({ store });

    await store.add({
      title: 'Login Button',
      content: 'The login button is at the top right corner of the screen.',
    });
    await store.add({
      title: 'Button Styles',
      content: 'All buttons have rounded corners and blue color.',
    });
    await store.add({
      title: 'Grid Layout',
      content: 'The grid uses a 12-column responsive layout.',
    });
  });

  it('should retrieve by keyword match', async () => {
    const results = await retriever.retrieve({ text: 'button' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.matchType).toBe('keyword');
  });

  it('should provide highlights', async () => {
    const results = await retriever.retrieve({ text: 'button login' });
    expect(results[0]!.highlights).toBeDefined();
    expect(results[0]!.highlights!.length).toBeGreaterThan(0);
  });

  it('should handle rebuild', async () => {
    await store.add({
      title: 'New Feature',
      content: 'This feature was just added with a special button.',
    });
    await retriever.rebuild();
    const results = await retriever.retrieve({ text: 'special button' });
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('HybridRetriever', () => {
  let store: KnowledgeStore;
  let keywordRetriever: KeywordRetriever;
  let semanticRetriever: SemanticRetriever;
  let hybrid: HybridRetriever;

  beforeEach(async () => {
    store = new KnowledgeStore({
      storage: new MemoryStorageAdapter(),
      embedding: mockEmbedding,
      autoLoad: false,
      autoSave: false,
    });
    await store.load();
    keywordRetriever = new KeywordRetriever({ store });
    semanticRetriever = new SemanticRetriever({ store, defaultMinScore: -1 });
    hybrid = new HybridRetriever({
      keywordRetriever,
      semanticRetriever,
      strategy: 'weighted',
      semanticWeight: 0.6,
      keywordWeight: 0.4,
    });

    await store.add({ title: 'Login', content: 'Login screen with username and password.' });
    await store.add({ title: 'Register', content: 'Registration form for new users.' });
    await store.add({ title: 'Dashboard', content: 'Main dashboard with widgets.' });
  });

  it('should return hybrid results', async () => {
    const results = await hybrid.retrieve({ text: 'user access' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.matchType).toBe('hybrid');
  });

  it('should work with RRF strategy', async () => {
    const rrfHybrid = new HybridRetriever({
      keywordRetriever,
      semanticRetriever,
      strategy: 'rrf',
    });
    const results = await rrfHybrid.retrieve({ text: 'dashboard' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle missing semantic retriever gracefully', async () => {
    const keywordOnly = new HybridRetriever({
      keywordRetriever,
      // no semanticRetriever
      strategy: 'weighted',
      keywordWeight: 1.0,
      semanticWeight: 0,
    });
    const results = await keywordOnly.retrieve({ text: 'login' });
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(SemanticRetriever.cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(SemanticRetriever.cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('should return 0 for different length vectors', () => {
    expect(SemanticRetriever.cosineSimilarity([1, 2], [1])).toBe(0);
  });
});
