/**
 * Package Database — 包管理持久化层
 *
 * 表结构 (JSON 文件存储, 可迁移至 SQLite/PostgreSQL):
 *
 * packages:
 *   package_name  →  仓库地址 / 状态 / 测试用例 / 脚本 / 报告
 *
 * 状态流转:
 *   registered → repo_cloned → test_cases_generated → scripts_generated → tested
 */

import path from 'path';
import fs from 'fs';

// ====== 类型定义 ======

export interface TestCase {
  id: string;
  name: string;
  description: string;
  steps: string[];
  expected: string;
  status: 'pending' | 'passed' | 'failed';
  created_at: string;
}

export interface TestScript {
  id: string;
  name: string;
  filePath: string;
  content: string;
  status: 'generated' | 'executed' | 'passed' | 'failed';
  created_at: string;
}

export interface TestReport {
  runId: string;
  total: number;
  passed: number;
  failed: number;
  duration: number;
  steps: { name: string; status: string; error?: string }[];
  timestamp: string;
}

export type PackageStatus =
  | 'registered'          // 已注册，有包名
  | 'awaiting_repo'       // 等待用户提供仓库地址
  | 'repo_cloned'         // 仓库已下载
  | 'test_cases_generated'// 测试用例已生成
  | 'scripts_generated'   // 自动化脚本已生成
  | 'tested';             // 测试已完成

export interface PackageRecord {
  packageName: string;
  repoUrl: string | null;
  status: PackageStatus;
  testCases: TestCase[];
  scripts: TestScript[];
  reports: TestReport[];
  createdAt: string;
  updatedAt: string;
}

// ====== 存储 ======

const DB_PATH = path.resolve(process.cwd(), 'server/data/package-db.json');

export class PackageDB {
  private records: Map<string, PackageRecord> = new Map();

  constructor() {
    this.load();
  }

  /** 从磁盘加载 */
  private load() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        if (Array.isArray(raw)) {
          for (const r of raw) {
            this.records.set(r.packageName, r);
          }
        }
      }
    } catch {}
  }

  /** 持久化到磁盘 */
  private save() {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(Array.from(this.records.values()), null, 2), 'utf-8');
    } catch {}
  }

  // ====== 查询 ======

  /** 获取所有包 */
  getAll(): PackageRecord[] {
    return Array.from(this.records.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 按包名查找 */
  get(packageName: string): PackageRecord | undefined {
    return this.records.get(packageName);
  }

  /** 是否存在 */
  has(packageName: string): boolean {
    return this.records.has(packageName);
  }

  // ====== 写入 ======

  /** 注册新包 */
  register(packageName: string, repoUrl?: string): PackageRecord {
    const now = new Date().toISOString();
    const record: PackageRecord = {
      packageName,
      repoUrl: repoUrl || null,
      status: repoUrl ? 'registered' : 'awaiting_repo',
      testCases: [],
      scripts: [],
      reports: [],
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(packageName, record);
    this.save();
    return record;
  }

  /** 更新仓库地址 */
  setRepoUrl(packageName: string, repoUrl: string): PackageRecord | null {
    const record = this.records.get(packageName);
    if (!record) return null;
    record.repoUrl = repoUrl;
    record.status = 'registered';
    record.updatedAt = new Date().toISOString();
    this.save();
    return record;
  }

  /** 更新状态 */
  setStatus(packageName: string, status: PackageStatus): PackageRecord | null {
    const record = this.records.get(packageName);
    if (!record) return null;
    record.status = status;
    record.updatedAt = new Date().toISOString();
    this.save();
    return record;
  }

  /** 添加测试用例 */
  addTestCases(packageName: string, cases: Omit<TestCase, 'id' | 'created_at'>[]): PackageRecord | null {
    const record = this.records.get(packageName);
    if (!record) return null;
    const now = new Date().toISOString();
    for (const tc of cases) {
      record.testCases.push({
        ...tc,
        id: `TC-${String(record.testCases.length + 1).padStart(3, '0')}`,
        created_at: now,
      });
    }
    record.status = 'test_cases_generated';
    record.updatedAt = now;
    this.save();
    return record;
  }

  /** 添加自动化脚本 */
  addScript(packageName: string, script: Omit<TestScript, 'id' | 'created_at'>): PackageRecord | null {
    const record = this.records.get(packageName);
    if (!record) return null;
    const now = new Date().toISOString();
    record.scripts.push({
      ...script,
      id: `SC-${String(record.scripts.length + 1).padStart(3, '0')}`,
      created_at: now,
    });
    record.status = 'scripts_generated';
    record.updatedAt = now;
    this.save();
    return record;
  }

  /** 添加测试报告 */
  addReport(packageName: string, report: TestReport): PackageRecord | null {
    const record = this.records.get(packageName);
    if (!record) return null;
    record.reports.push(report);
    record.status = 'tested';
    record.updatedAt = report.timestamp;
    this.save();
    return record;
  }

  /** 获取最新报告摘要 */
  getLastReportSummary(packageName: string): string | null {
    const record = this.records.get(packageName);
    if (!record || record.reports.length === 0) return null;
    const r = record.reports[record.reports.length - 1];
    return `${r.passed}/${r.total} 通过, 耗时 ${(r.duration / 1000).toFixed(1)}s`;
  }
}

/** 全局单例 */
export const packageDB = new PackageDB();
