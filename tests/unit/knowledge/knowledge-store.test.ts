/**
 * KnowledgeStore 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeStore } from '@knowledge/knowledge-store';
import { MemoryStorageAdapter } from '@knowledge/storage/json-storage';
import type { KnowledgeEntry, IEmbeddingProvider } from '@knowledge/types';

// Mock embedding provider
const mockEmbedding: IEmbeddingProvider = {
  dimensions: 128,
  async embed(text: string): Promise<number[]> {
    // Simple hash-based embedding for testing
    const vec = new Array(128).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % 128]! += text.charCodeAt(i) / 255;
    }
    return vec;
  },
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  },
};

function createEntry(overrides?: Partial<KnowledgeEntry>): Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: 'Test Title',
    content: 'Test content for testing.',
    category: 'test',
    tags: ['unit-test'],
    ...overrides,
  };
}

describe('KnowledgeStore', () => {
  let store: KnowledgeStore;
  let storage: MemoryStorageAdapter;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();
    store = new KnowledgeStore({
      storage,
      embedding: mockEmbedding,
      autoLoad: true,
      autoSave: false,
    });
  });

  describe('add', () => {
    it('should add entry with id', async () => {
      const entry = await store.add(createEntry());
      expect(entry.id).toBeDefined();
      expect(entry.title).toBe('Test Title');
      expect(entry.createdAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
    });

    it('should generate embedding', async () => {
      const entry = await store.add(createEntry());
      expect(entry.embedding).toBeDefined();
      expect(entry.embedding).toHaveLength(128);
    });

    it('should increment size', async () => {
      expect(store.size).toBe(0);
      await store.add(createEntry());
      expect(store.size).toBe(1);
    });
  });

  describe('get', () => {
    it('should return entry by id', async () => {
      const added = await store.add(createEntry());
      const retrieved = await store.get(added.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe('Test Title');
    });

    it('should return null for unknown id', async () => {
      const retrieved = await store.get('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('update', () => {
    it('should update entry', async () => {
      const added = await store.add(createEntry());
      const updated = await store.update(added.id, { title: 'Updated Title' });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('Updated Title');
    });

    it('should regenerate embedding on content change', async () => {
      const added = await store.add(createEntry());
      const oldEmbedding = [...added.embedding!];
      const updated = await store.update(added.id, { content: 'Completely different content' });
      expect(updated!.embedding).not.toEqual(oldEmbedding);
    });

    it('should return null for unknown id', async () => {
      const result = await store.update('nonexistent', { title: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete entry', async () => {
      const added = await store.add(createEntry());
      expect(store.size).toBe(1);
      const deleted = await store.delete(added.id);
      expect(deleted).toBe(true);
      expect(store.size).toBe(0);
    });

    it('should return false for unknown id', async () => {
      const deleted = await store.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all entries', async () => {
      await store.add(createEntry({ title: 'A' }));
      await store.add(createEntry({ title: 'B' }));
      const entries = await store.list();
      expect(entries).toHaveLength(2);
    });

    it('should filter by category', async () => {
      await store.add(createEntry({ title: 'A', category: 'cat-a' }));
      await store.add(createEntry({ title: 'B', category: 'cat-b' }));
      const results = await store.list({ category: 'cat-a' });
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('A');
    });

    it('should filter by tag', async () => {
      await store.add(createEntry({ title: 'A', tags: ['important'] }));
      await store.add(createEntry({ title: 'B', tags: ['draft'] }));
      const results = await store.list({ tag: 'important' });
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe('A');
    });
  });

  describe('recordUsage', () => {
    it('should increment usage count', async () => {
      const added = await store.add(createEntry());
      await store.recordUsage(added.id);
      await store.recordUsage(added.id);
      const entry = await store.get(added.id);
      expect(entry!.usageCount).toBe(2);
    });
  });

  describe('addBatch', () => {
    it('should add multiple entries', async () => {
      const entries = await store.addBatch([
        createEntry({ title: 'A' }),
        createEntry({ title: 'B' }),
        createEntry({ title: 'C' }),
      ]);
      expect(entries).toHaveLength(3);
      expect(store.size).toBe(3);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      await store.add(createEntry({ category: 'cat-a', tags: ['t1', 't2'] }));
      await store.add(createEntry({ category: 'cat-a', tags: ['t1'] }));
      await store.add(createEntry({ category: 'cat-b', tags: ['t2'] }));

      const stats = await store.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.categoryCounts['cat-a']).toBe(2);
      expect(stats.categoryCounts['cat-b']).toBe(1);
      expect(stats.indexedCount).toBe(3);
      expect(stats.topTags).toHaveLength(2); // t1, t2
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await store.add(createEntry());
      await store.add(createEntry());
      await store.clear();
      expect(store.size).toBe(0);
    });
  });

  describe('persistence', () => {
    it('should persist and reload entries', async () => {
      store = new KnowledgeStore({
        storage,
        embedding: mockEmbedding,
        autoSave: true,
      });
      await store.add(createEntry({ title: 'Persisted' }));
      await store.save(); // force immediate persistence

      // Re-create store with same storage adapter
      const newStore = new KnowledgeStore({
        storage,
        embedding: mockEmbedding,
        autoLoad: true,
        autoSave: false,
      });
      await newStore.load();
      const entries = await newStore.list();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.title).toBe('Persisted');
    });
  });
});
