/**
 * ConfigManager 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '@utils/config';

describe('ConfigManager', () => {
  let config: ConfigManager;

  beforeEach(() => {
    config = new ConfigManager();
  });

  describe('get/set', () => {
    it('should set and get flat value', () => {
      config.set('foo', 'bar');
      expect(config.get('foo')).toBe('bar');
    });

    it('should set and get nested value via dot path', () => {
      config.set('driver.connectionPool.max', 10);
      expect(config.get('driver.connectionPool.max')).toBe(10);
    });

    it('should return default if path missing', () => {
      expect(config.get('nonexistent', 42)).toBe(42);
    });

    it('should create intermediate objects', () => {
      config.set('a.b.c', 'value');
      expect(config.get('a.b')).toEqual({ c: 'value' });
    });
  });

  describe('has', () => {
    it('should return true for existing path', () => {
      config.set('x.y.z', 1);
      expect(config.has('x.y.z')).toBe(true);
    });

    it('should return false for missing path', () => {
      expect(config.has('no.such.key')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing key', () => {
      config.set('foo', 'bar');
      expect(config.delete('foo')).toBe(true);
      expect(config.has('foo')).toBe(false);
    });

    it('should return false for missing key', () => {
      expect(config.delete('nope')).toBe(false);
    });
  });

  describe('merge', () => {
    it('should deep merge configuration', () => {
      config.set('a', { b: 1, c: 2 });
      config.merge({ a: { c: 3, d: 4 } });
      expect(config.get('a')).toEqual({ b: 1, c: 3, d: 4 });
    });

    it('should add new keys', () => {
      config.merge({ newKey: 'newVal' });
      expect(config.get('newKey')).toBe('newVal');
    });
  });

  describe('watch', () => {
    it('should notify on value change', () => {
      let notified: any = undefined;
      const unsubscribe = config.watch('test.key', (val) => {
        notified = val;
      });
      config.set('test.key', 'notified');
      expect(notified).toBe('notified');
      unsubscribe();
    });

    it('should unsubscribe', () => {
      let count = 0;
      const un = config.watch('test.key', () => count++);
      config.set('test.key', 1);
      un();
      config.set('test.key', 2);
      expect(count).toBe(1);
    });
  });

  describe('toJson/toYaml', () => {
    it('should export as valid JSON', () => {
      config.set('a', { b: 1 });
      const json = config.toJson();
      expect(JSON.parse(json)).toEqual({ a: { b: 1 } });
    });

    it('should export as YAML', () => {
      config.set('name', 'test');
      const yaml = config.toYaml();
      expect(yaml).toContain('name: test');
    });
  });

  describe('env overrides', () => {
    it('should apply env prefix overrides', () => {
      process.env['TEST_DRIVER_MAX'] = '5';
      config.applyEnvOverrides('TEST');
      expect(config.get('driver.max')).toBe(5);
      delete process.env['TEST_DRIVER_MAX'];
    });

    it('should apply explicit env mapping', () => {
      process.env['MY_HOST'] = 'localhost:8080';
      config.applyEnvOverrides(undefined, { MY_HOST: 'server.host' });
      expect(config.get('server.host')).toBe('localhost:8080');
      delete process.env['MY_HOST'];
    });
  });
});
