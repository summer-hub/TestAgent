/**
 * 文件系统工具
 */

import { promises as fs, constants } from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 确保目录存在
 */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * 路径是否存在
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取 JSON 文件
 */
export async function readJson<T = any>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * 写入 JSON 文件
 */
export async function writeJson(filePath: string, data: any, pretty: boolean = true): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const content = JSON.stringify(data, null, pretty ? 2 : 0);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * 安全写入文件（先写临时文件再 rename）
 */
export async function safeWriteFile(
  filePath: string,
  content: string | Buffer
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmpPath, content);
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // 忽略清理失败
    }
    throw err;
  }
}

/**
 * 列出目录下的文件（可递归）
 */
export async function listFiles(
  dir: string,
  options: { recursive?: boolean; extensions?: string[]; relative?: boolean } = {}
): Promise<string[]> {
  const results: string[] = [];
  const baseDir = dir;

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (options.recursive) await walk(fullPath);
      } else if (entry.isFile()) {
        if (options.extensions && options.extensions.length > 0) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!options.extensions.includes(ext)) continue;
        }
        results.push(options.relative ? path.relative(baseDir, fullPath) : fullPath);
      }
    }
  }

  await walk(baseDir);
  return results;
}

/**
 * 删除文件（不存在也不报错）
 */
export async function removeFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * 删除目录（递归）
 */
export async function removeDir(dirPath: string): Promise<boolean> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 复制文件
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

/**
 * 获取文件大小
 */
export async function fileSize(filePath: string): Promise<number> {
  const stat = await fs.stat(filePath);
  return stat.size;
}

/**
 * 获取项目根目录
 * 通过查找最近的 package.json
 */
export async function findProjectRoot(startDir: string = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    if (await pathExists(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * 解析家目录路径（~ 展开）
 */
export function expandHome(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * 生成临时文件路径
 */
export function getTempPath(prefix: string = 'ai-test-agent', ext: string = ''): string {
  const random = Math.random().toString(36).substring(2, 10);
  const name = `${prefix}-${Date.now()}-${random}${ext}`;
  return path.join(os.tmpdir(), name);
}
