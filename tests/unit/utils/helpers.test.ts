/**
 * Utils Helpers 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sleep,
  retry,
  withTimeout,
  debounce,
  throttle,
  deepClone,
  deepEqual,
  levenshteinDistance,
  stringSimilarity,
  uuid,
  shortId,
  formatBytes,
  formatDuration,
  chunk,
  unique,
  groupBy,
  pick,
  omit,
  safeJsonParse,
  safeJsonStringify,
  interpolate,
  isPromise,
  isNotNull,
  isNonEmptyString,
  asyncMap,
} from '@utils/helpers';

describe('sleep', () => {
  it('should resolve after specified ms', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});

describe('retry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn, { maxAttempts: 3, delay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    const result = await retry(fn, { maxAttempts: 3, delay: 10, backoff: 'linear' });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(
      retry(fn, { maxAttempts: 3, delay: 10, backoff: 'linear' })
    ).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect shouldRetry', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('retryable'))
      .mockRejectedValueOnce(new Error('fatal'));
    await expect(
      retry(fn, {
        maxAttempts: 5,
        delay: 10,
        backoff: 'linear',
        shouldRetry: (err) => err.message !== 'fatal',
      })
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withTimeout', () => {
  it('should resolve if promise finishes in time', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('should reject on timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(slow, 10, 'too slow')).rejects.toThrow('too slow');
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should call function after wait', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should only call once for rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should call immediately then throttle', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('deepClone', () => {
  it('should clone primitive values', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBe(null);
    expect(deepClone(true)).toBe(true);
  });

  it('should deep clone arrays', () => {
    const arr = [1, [2, 3], { a: 4 }];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
    (cloned as any)[1].push(4);
    expect(arr[1]).toEqual([2, 3]);
  });

  it('should deep clone objects', () => {
    const obj = { a: 1, b: { c: 2, d: [3, 4] } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    cloned.b.c = 99;
    expect(obj.b.c).toBe(2);
  });

  it('should clone Date', () => {
    const d = new Date('2024-01-01');
    const cloned = deepClone(d);
    expect(cloned instanceof Date).toBe(true);
    expect(cloned.getTime()).toBe(d.getTime());
  });

  it('should clone RegExp', () => {
    const r = /hello/gi;
    const cloned = deepClone(r);
    expect(cloned instanceof RegExp).toBe(true);
    expect(cloned.source).toBe('hello');
    expect(cloned.flags).toBe('gi');
  });
});

describe('deepEqual', () => {
  it('should return true for equal primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
  });

  it('should return false for different values', () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('should handle nested objects', () => {
    expect(deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toBe(true);
    expect(deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 3] } })).toBe(false);
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  it('should compute correct distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('should handle Chinese characters', () => {
    expect(levenshteinDistance('你好世界', '你好')).toBe(2);
  });
});

describe('stringSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1);
  });

  it('should return value between 0 and 1', () => {
    const sim = stringSimilarity('hello', 'hallo');
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1);
  });

  it('should return 0 for completely different strings', () => {
    expect(stringSimilarity('', 'abc')).toBe(0);
  });
});

describe('uuid', () => {
  it('should generate valid UUID v4 format', () => {
    const id = uuid();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('should generate unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuid()));
    expect(ids.size).toBe(100);
  });
});

describe('shortId', () => {
  it('should generate 8 character id', () => {
    const id = shortId();
    expect(id.length).toBe(8);
  });
});

describe('formatBytes', () => {
  it('should format B', () => expect(formatBytes(500)).toBe('500 B'));
  it('should format KB', () => expect(formatBytes(2048)).toBe('2.00 KB'));
  it('should format MB', () => expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB'));
  it('should format GB', () => expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB'));
});

describe('formatDuration', () => {
  it('should format ms', () => expect(formatDuration(500)).toBe('500ms'));
  it('should format seconds', () => expect(formatDuration(2500)).toBe('2.50s'));
  it('should format minutes', () => expect(formatDuration(125000)).toContain('m'));
});

describe('chunk', () => {
  it('should split array into chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('should return whole array if size > length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe('unique', () => {
  it('should deduplicate array', () => {
    expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
  });

  it('should deduplicate by key', () => {
    const arr = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'c' }];
    expect(unique(arr, (item) => item.id)).toEqual([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
  });
});

describe('groupBy', () => {
  it('should group by key', () => {
    const arr = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ];
    const result = groupBy(arr, (item) => item.type);
    expect(result['a']).toHaveLength(2);
    expect(result['b']).toHaveLength(1);
  });
});

describe('pick', () => {
  it('should pick specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });
});

describe('omit', () => {
  it('should omit specified keys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('should return fallback on error', () => {
    expect(safeJsonParse('invalid', 'fallback')).toBe('fallback');
  });

  it('should return undefined on error without fallback', () => {
    expect(safeJsonParse('invalid')).toBeUndefined();
  });
});

describe('safeJsonStringify', () => {
  it('should handle circular references', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const result = safeJsonStringify(obj);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(result).toContain('[Circular]');
  });

  it('should handle BigInt', () => {
    const result = safeJsonStringify({ val: BigInt(123) });
    expect(result).toContain('123');
  });
});

describe('interpolate', () => {
  it('should replace variables', () => {
    expect(interpolate('hello ${name}', { name: 'world' })).toBe('hello world');
  });

  it('should keep unmatched variables', () => {
    expect(interpolate('hello ${name}', {})).toBe('hello ${name}');
  });
});

describe('isPromise', () => {
  it('should return true for Promise', () => {
    expect(isPromise(Promise.resolve())).toBe(true);
  });

  it('should return false for non-Promise', () => {
    expect(isPromise({})).toBe(false);
    expect(isPromise(42)).toBe(false);
    expect(isPromise(null)).toBe(false);
  });
});

describe('isNotNull', () => {
  it('should type guard', () => {
    expect(isNotNull('hello')).toBe(true);
    expect(isNotNull(0)).toBe(true);
    expect(isNotNull(null)).toBe(false);
    expect(isNotNull(undefined)).toBe(false);
  });
});

describe('isNonEmptyString', () => {
  it('should check non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });
});

describe('asyncMap', () => {
  it('should map with default concurrency', async () => {
    const fn = vi.fn().mockImplementation((x: number) => Promise.resolve(x * 2));
    const results = await asyncMap([1, 2, 3], fn);
    expect(results).toEqual([2, 4, 6]);
  });

  it('should map with limited concurrency', async () => {
    let running = 0;
    let maxRunning = 0;
    const fn = async (x: number) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await sleep(10);
      running--;
      return x;
    };
    await asyncMap([1, 2, 3, 4, 5], fn, 2);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});
