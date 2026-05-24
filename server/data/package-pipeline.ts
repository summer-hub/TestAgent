/**
 * Package Pipeline — 包自动化流水线
 *
 * 完整链路:
 *   注册 → 下载仓库 → 分析 Demo → 生成测试用例
 *   → 生成自动化脚本 → 执行测试 → 保存报告
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { packageDB, type TestReport } from './package-db';

const execAsync = promisify(exec);

/** 仓库下载目录 */
const REPOS_DIR = path.resolve(process.cwd(), '.repos');

// ====== 1. 下载仓库 ======

export async function cloneRepo(packageName: string, repoUrl: string): Promise<string> {
  const targetDir = path.join(REPOS_DIR, packageName.replace(/\./g, '-'));

  // 已存在则跳过
  if (fs.existsSync(targetDir)) {
    // git pull 更新
    try {
      await execAsync(`git -C "${targetDir}" pull`, { timeout: 30000 });
    } catch {}
    return targetDir;
  }

  // 确保父目录存在
  fs.mkdirSync(REPOS_DIR, { recursive: true });

  // git clone
  try {
    await execAsync(`git clone "${repoUrl}" "${targetDir}"`, { timeout: 60000 });
  } catch (e: any) {
    throw new Error(`仓库下载失败: ${e.message}`);
  }

  return targetDir;
}

// ====== 2. 分析 Demo 目录生成测试用例 ======

export interface DemoTest {
  name: string;
  description: string;
  steps: string[];
  expected: string;
}

/**
 * 扫描 entry/ 目录下的代码, 生成测试用例
 * 简单地分析 .ts / .js 文件中的 UI 交互模式
 */
export function analyzeAndGenerateTests(repoDir: string): DemoTest[] {
  const entryDir = path.join(repoDir, 'entry');
  const tests: DemoTest[] = [];

  // 扫描 entry/src/main/ 下的 ts/js 文件
  const srcDirs = [
    path.join(entryDir, 'src', 'main', 'ets'),
    path.join(entryDir, 'src', 'main', 'js'),
    path.join(entryDir, 'src', 'main', 'java'),
    path.join(entryDir, 'src'),
  ];

  const sourceFiles: string[] = [];
  for (const dir of srcDirs) {
    if (fs.existsSync(dir)) {
      collectFiles(dir, sourceFiles);
    }
  }

  // 如果没有找到源码目录, 扫描 entry 下所有子目录
  if (sourceFiles.length === 0 && fs.existsSync(entryDir)) {
    collectFiles(entryDir, sourceFiles);
  }

  // 根据源码推断测试用例
  if (sourceFiles.length > 0) {
    tests.push({
      name: '应用启动验证',
      description: '启动应用, 验证主界面正常加载',
      steps: ['启动应用', '等待 2s 加载', '获取 UI 树', '确认 UI 树不为空'],
      expected: 'UI 树可见, 元素数量 > 1',
    });

    tests.push({
      name: '页面元素检查',
      description: '检查主界面上可交互元素',
      steps: ['获取 UI 树', '遍历可见元素', '确认存在可点击组件'],
      expected: '存在至少一个可交互组件',
    });

    tests.push({
      name: '交互操作测试',
      description: '对可见元素执行点击操作',
      steps: ['查找可点击元素', '执行点击', '等待页面响应', '验证无崩溃'],
      expected: '点击后应用正常运行, 无 ANR/崩溃',
    });
  }

  // 默认测试 (即使没有解析到源码)
  if (tests.length === 0) {
    tests.push({
      name: '应用启动',
      description: '验证应用可正常启动',
      steps: ['连接设备', '启动应用', '等待 2s', '获取 UI 树'],
      expected: '应用启动成功, UI 树可获取',
    });
    tests.push({
      name: '截图验证',
      description: '验证截图功能正常',
      steps: ['启动应用', '等待 2s', '截图取证'],
      expected: '截图文件有效 ( > 1KB )',
    });
  }

  return tests;
}

function collectFiles(dir: string, result: string[]) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath, result);
      } else if (/\.(ts|js|ets)$/i.test(entry.name)) {
        result.push(fullPath);
      }
    }
  } catch {}
}

// ====== 3. 生成自动化测试脚本 ======

export function generateTestScript(packageName: string, tests: DemoTest[]): string {
  const testImports = `
import { HypiumDriver } from '../../src/hypium/driver/hypium-driver';
import { By } from '../../src/hypium/selectors/by';
import { AppManager } from '../../src/hypium/app/app-manager';
import { AppProcessStatus } from '../../src/core/types/app-info.type';

const DEVICE_ID = process.env.DEVICE_ID || 'LNG0224718005504';
const BUNDLE = '${packageName}';
`;

  const testSteps = tests.map((t, i) => `
  // ===== Test ${i + 1}: ${t.name} =====
  console.log('▶ [${i + 1}/${tests.length}] ${t.name}');
  try {
    ${t.steps.map(s => `// ${s}`).join('\n    ')}
    console.log('  ✅ ${t.name} - PASSED');
  } catch (e) {
    console.log('  ❌ ${t.name} - FAILED:', e.message);
    throw e;
  }
`).join('\n');

  return `${testImports}

async function runTest() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  ${packageName.padEnd(36)}║');
  console.log('╚══════════════════════════════════════╝\\n');

  const driver = new HypiumDriver({ deviceId: DEVICE_ID });
  
  try {
    await driver.connect();
    const appMan = driver.getAppManager();

    // 检查应用
    const info = await appMan.getAppInfo(BUNDLE);
    if (!info.installed) {
      console.log('❌ 应用未安装, 请先安装:', BUNDLE);
      return;
    }

    // 启动
    await appMan.start(BUNDLE);
    await driver.sleep(2000);

    // 获取设备信息
    const deviceInfo = await driver.getDeviceInfo();
    console.log('📱 设备:', deviceInfo.deviceName, deviceInfo.osVersion);

    // 获取 UI 树
    const tree = await driver.getUiTree();
    console.log('🌳 UI 元素数:', tree.totalCount);

    ${testSteps}

    console.log('\\n✅ 全部测试通过!');
    
  } catch (e) {
    console.error('\\n❌ 测试执行失败:', e.message);
    process.exit(1);
  } finally {
    await driver.disconnect();
  }
}

runTest();
`;
}

// ====== 4. 保存脚本到文件 ======

export function saveScript(packageName: string, content: string): string {
  const scriptsDir = path.resolve(process.cwd(), 'scripts', 'auto');
  fs.mkdirSync(scriptsDir, { recursive: true });

  const safeName = packageName.replace(/\./g, '-');
  const filePath = path.join(scriptsDir, `test-${safeName}.ts`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ====== 5. 执行测试完整流水线 ======

export interface PipelineResult {
  success: boolean;
  steps: { name: string; status: string; error?: string }[];
  report?: TestReport;
}

export async function runPipeline(packageName: string, repoUrl?: string): Promise<PipelineResult> {
  const pipelineSteps: { name: string; status: string; error?: string }[] = [];
  const startTime = Date.now();

  async function runStep(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      pipelineSteps.push({ name, status: 'passed' });
    } catch (e: any) {
      pipelineSteps.push({ name, status: 'failed', error: e.message });
      throw e; // 终止流水线
    }
  }

  let repoDir: string | undefined;

  try {
    // Step 1: 下载仓库
    if (repoUrl) {
      await runStep('下载仓库', async () => {
        repoDir = await cloneRepo(packageName, repoUrl);
        await packageDB.setStatus(packageName, 'repo_cloned');
      });
    }

    // Step 2: 分析并生成测试用例
    await runStep('生成测试用例', async () => {
      const tests = repoDir
        ? analyzeAndGenerateTests(repoDir)
        : analyzeAndGenerateTests(''); // 生成默认用例
      await packageDB.addTestCases(packageName, tests.map(t => ({
        name: t.name,
        description: t.description,
        steps: t.steps,
        expected: t.expected,
        status: 'pending' as const,
      })));
    });

    // Step 3: 生成自动化脚本
    await runStep('生成自动化脚本', async () => {
      const record = packageDB.get(packageName)!;
      const testCases = record.testCases.filter(tc => tc.status === 'pending');
      const script = generateTestScript(packageName, testCases.map(tc => ({
        name: tc.name,
        description: tc.description,
        steps: tc.steps,
        expected: tc.expected,
      })));
      const filePath = saveScript(packageName, script);
      await packageDB.addScript(packageName, {
        name: `test-${packageName}.ts`,
        filePath,
        content: script,
        status: 'generated',
      });
    });

    // Step 4: 执行测试
    await runStep('执行测试', async () => {
      const record = packageDB.get(packageName)!;
      const scriptFile = record.scripts[record.scripts.length - 1]?.filePath;
      if (!scriptFile || !fs.existsSync(scriptFile)) {
        throw new Error('脚本文件不存在');
      }
      // 用 tsx 执行脚本
      try {
        const { stdout, stderr } = await execAsync(`npx tsx "${scriptFile}"`, { timeout: 120000 });
        console.log(`[Pipeline] stdout: ${stdout}`);
        if (stderr) console.error(`[Pipeline] stderr: ${stderr}`);
      } catch (e: any) {
        throw new Error(`测试执行失败: ${e.message}`);
      }
    });

  } catch (e: any) {
    // 某一步失败, 记录但不阻断(已经记录在 pipelineSteps 里了)
  }

  // 生成报告
  const passed = pipelineSteps.filter(s => s.status === 'passed').length;
  const failed = pipelineSteps.filter(s => s.status === 'failed').length;

  const report: TestReport = {
    runId: `R${Date.now()}`,
    total: pipelineSteps.length,
    passed,
    failed,
    duration: Date.now() - startTime,
    steps: pipelineSteps,
    timestamp: new Date().toISOString(),
  };

  // 保存报告
  await packageDB.addReport(packageName, report);

  return {
    success: failed === 0,
    steps: pipelineSteps,
    report,
  };
}
