/**
 * Config - 配置管理
 * 支持 YAML / JSON 加载、环境变量覆盖、点路径访问
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * 配置加载选项
 */
export interface ConfigLoadOptions {
  /** 配置文件路径 */
  filePath?: string;
  /** 多个配置源（合并） */
  filePaths?: string[];
  /** 启用环境变量覆盖 */
  envOverride?: boolean;
  /** 环境变量前缀 */
  envPrefix?: string;
  /** 环境变量到配置路径的映射 */
  envMapping?: Record<string, string>;
  /** 默认配置 */
  defaults?: Record<string, any>;
}

/**
 * ConfigManager - 配置管理器
 */
export class ConfigManager {
  private data: Record<string, any> = {};
  private listeners: Map<string, Set<(value: any) => void>> = new Map();

  constructor(initial?: Record<string, any>) {
    if (initial) this.data = this.deepClone(initial);
  }

  /**
   * 从文件加载配置（支持 .yaml/.yml/.json）
   */
  static async load(options: ConfigLoadOptions): Promise<ConfigManager> {
    const manager = new ConfigManager(options.defaults);

    const files = options.filePaths || (options.filePath ? [options.filePath] : []);
    for (const file of files) {
      await manager.loadFile(file);
    }

    if (options.envOverride !== false) {
      manager.applyEnvOverrides(options.envPrefix, options.envMapping);
    }

    return manager;
  }

  /**
   * 加载单个配置文件
   */
  async loadFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    let parsed: any;

    if (ext === '.yaml' || ext === '.yml') {
      parsed = YAML.parse(content);
    } else if (ext === '.json') {
      parsed = JSON.parse(content);
    } else {
      throw new Error(`Unsupported config file format: ${ext}`);
    }

    this.merge(parsed);
  }

  /**
   * 合并配置（深度合并）
   */
  merge(source: Record<string, any>): void {
    this.data = this.deepMerge(this.data, source);
  }

  /**
   * 获取配置（支持点路径，如 'driver.connectionPool.max'）
   */
  get<T = any>(keyPath: string, defaultValue?: T): T {
    const parts = keyPath.split('.');
    let current: any = this.data;
    for (const part of parts) {
      if (current === null || current === undefined) return defaultValue as T;
      current = current[part];
    }
    return (current === undefined ? defaultValue : current) as T;
  }

  /**
   * 设置配置（支持点路径）
   */
  set(keyPath: string, value: any): void {
    const parts = keyPath.split('.');
    let current: any = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (current[part] === undefined || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    const oldValue = current[parts[parts.length - 1]!];
    current[parts[parts.length - 1]!] = value;
    if (oldValue !== value) this.notifyListeners(keyPath, value);
  }

  /**
   * 检查配置是否存在
   */
  has(keyPath: string): boolean {
    const parts = keyPath.split('.');
    let current: any = this.data;
    for (const part of parts) {
      if (current === null || current === undefined) return false;
      if (!(part in current)) return false;
      current = current[part];
    }
    return true;
  }

  /**
   * 删除配置
   */
  delete(keyPath: string): boolean {
    const parts = keyPath.split('.');
    let current: any = this.data;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (current === null || current === undefined || !(part in current)) {
        return false;
      }
      current = current[part];
    }
    const lastKey = parts[parts.length - 1]!;
    if (lastKey in current) {
      delete current[lastKey];
      return true;
    }
    return false;
  }

  /**
   * 获取全部配置（副本）
   */
  getAll(): Record<string, any> {
    return this.deepClone(this.data);
  }

  /**
   * 监听配置变化
   */
  watch(keyPath: string, callback: (value: any) => void): () => void {
    let set = this.listeners.get(keyPath);
    if (!set) {
      set = new Set();
      this.listeners.set(keyPath, set);
    }
    set.add(callback);
    return () => {
      set!.delete(callback);
    };
  }

  /**
   * 应用环境变量覆盖
   */
  applyEnvOverrides(prefix?: string, mapping?: Record<string, string>): void {
    // 显式映射优先
    if (mapping) {
      for (const [envKey, configPath] of Object.entries(mapping)) {
        const value = process.env[envKey];
        if (value !== undefined) this.set(configPath, this.parseEnvValue(value));
      }
    }

    // 前缀模式（PREFIX_FOO_BAR -> foo.bar）
    if (prefix) {
      const prefixUpper = prefix.toUpperCase() + '_';
      for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(prefixUpper) && value !== undefined) {
          const path = key
            .substring(prefixUpper.length)
            .toLowerCase()
            .replace(/_/g, '.');
          this.set(path, this.parseEnvValue(value));
        }
      }
    }
  }

  /**
   * 解析环境变量值（自动类型转换）
   */
  private parseEnvValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
    if ((value.startsWith('{') && value.endsWith('}')) ||
        (value.startsWith('[') && value.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  /**
   * 通知监听器
   */
  private notifyListeners(keyPath: string, value: any): void {
    const exact = this.listeners.get(keyPath);
    if (exact) {
      for (const cb of exact) {
        try {
          cb(value);
        } catch {
          // 忽略监听器错误
        }
      }
    }
  }

  /**
   * 深度合并
   */
  private deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) return target;
    if (typeof source !== 'object' || Array.isArray(source)) return source;

    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /**
   * 深度克隆
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.deepClone(item)) as any;
    const result: any = {};
    for (const key of Object.keys(obj as any)) {
      result[key] = this.deepClone((obj as any)[key]);
    }
    return result;
  }

  /**
   * 导出为 YAML
   */
  toYaml(): string {
    return YAML.stringify(this.data);
  }

  /**
   * 导出为 JSON
   */
  toJson(pretty: boolean = true): string {
    return JSON.stringify(this.data, null, pretty ? 2 : 0);
  }

  /**
   * 保存到文件
   */
  async save(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    let content: string;
    if (ext === '.yaml' || ext === '.yml') {
      content = this.toYaml();
    } else if (ext === '.json') {
      content = this.toJson();
    } else {
      throw new Error(`Unsupported config file format: ${ext}`);
    }
    await fs.writeFile(filePath, content, 'utf-8');
  }
}

// 全局默认配置管理器
let defaultConfig: ConfigManager | null = null;

/**
 * 获取默认配置管理器
 */
export function getConfig(): ConfigManager {
  if (!defaultConfig) {
    defaultConfig = new ConfigManager();
  }
  return defaultConfig;
}

/**
 * 设置默认配置管理器
 */
export function setDefaultConfig(config: ConfigManager): void {
  defaultConfig = config;
}
