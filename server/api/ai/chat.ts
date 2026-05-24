/**
 * POST /api/ai/chat — 智能对话接口
 *
 * 双引擎 + 包管理流水线:
 *   规则引擎 - 配置/包管理/执行 即时响应
 *   Qwen3-VL-Flash - 分析/问答
 *
 * 包管理流程:
 *   注册包名(无仓库) → 询问仓库地址 → 下载 → 生成用例
 *   → 生成脚本 → 执行 → 报告
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { packageDB } from '../../data/package-db';
import { runPipeline } from '../../data/package-pipeline';

const router = Router();

// ====== 通用配置 ======
const CONFIG_PATH = path.resolve(process.cwd(), 'server/data/ai-config.json');
const API_KEY = process.env.QWEN_API_KEY || '';

interface AiConfig {
  bundleName: string;
  deviceId: string;
  webhookUrl: string;
  lastRunResult?: any;
}

function loadConfig(): AiConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {}
  return { bundleName: process.env.BUNDLE || 'com.example.stackblur', deviceId: process.env.DEVICE_ID || 'LNG0224718005504', webhookUrl: '' };
}
function persistConfig(c: AiConfig) {
  try { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)); } catch {}
}

// ====== 工具函数 ======

function extractPackageName(text: string): string | null {
  const m = text.match(/([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*)/);
  return m ? m[1] : null;
}

function extractDeviceId(text: string): string | null {
  const m = text.match(/([A-Z0-9_]{10,})/);
  return m ? m[1] : null;
}

function extractRepoUrl(text: string): string | null {
  const m = text.match(/(https?:\/\/[^\s]+(?:gitcode|github|gitee)[^\s]*)/i);
  return m ? m[1].replace(/[>）\)\]]$/, '') : null;
}

/** 获取等待仓库地址的包名 */
function getAwaitingPackage(): string | null {
  for (const pkg of packageDB.getAll()) {
    if (pkg.status === 'awaiting_repo') return pkg.packageName;
  }
  return null;
}

async function checkDevice(deviceId: string): Promise<string> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(`hdc -t ${deviceId} shell "echo connected"`, { timeout: 5000 });
    return stdout.trim() === 'connected'
      ? `✅ 设备 \`${deviceId}\` 在线`
      : `❌ 设备 \`${deviceId}\` 无响应`;
  } catch (e: any) {
    return `❌ 设备连接失败: ${e.message || 'timeout'}`;
  }
}

// ====== Qwen 引擎 ======
let qwen: any = null;
async function getQwen() {
  if (!qwen) {
    const { QwenProvider } = await import('../../../src/agent/llm/qwen-provider');
    qwen = new QwenProvider({ apiKey: API_KEY, model: 'qwen3-vl-flash', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', temperature: 0.3, maxTokens: 2048 });
  }
  return qwen;
}
async function askQwen(msg: string, config: AiConfig): Promise<string | null> {
  try {
    const q = await getQwen();
    const result = await Promise.race([
      q.think([{ role: 'system', content: `你是 AI Test Assistant。环境: 包名=${config.bundleName}, 设备=${config.deviceId}。请用中文简洁回答。` }, { role: 'user', content: msg }]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    return (result as any).content || null;
  } catch { return null; }
}

// ====== POST /api/ai/chat ======
router.post('/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.json({ reply: '请说点什么吧！😊' });

  const trimmed = message.trim();
  const config = loadConfig();

  // 1. 帮助
  if (/^(帮助|help|\/help|hi|你好|能力|你会什么)$/i.test(trimmed)) {
    return res.json({ reply: `🤖 **AI Test Assistant**

**📝 包管理（全自动流水线）**
• \`添加包名 com.xxx.yyy\`
  → 注册新包, 自动询问仓库地址
• \`仓库地址为 https://gitcode.com/...\`
  → 提供仓库, 启动全自动流水线
• \`查看所有包\` / \`包列表\`
  → 显示所有已注册的包及状态

**▶️ 测试执行**
• \`运行测试\` — 执行当前配置的测试
• \`检查设备\` — 检测 HDC
• \`查看配置\` — 当前环境信息

**📊 结果**
• \`上次结果\` — 最近测试报告
• \`为什么失败\` — 分析失败原因

流水线: 注册 → 下载仓库 → 分析 Demo → 生成用例 → 生成脚本 → 执行 → 报告` });
  }

  // 2. 查看包列表
  if (/^(查看所有包|包列表|packages|所有包|包管理)$/i.test(trimmed)) {
    const all = packageDB.getAll();
    if (all.length === 0) return res.json({ reply: '📭 还没有注册过任何包。说 **"添加包名 com.xxx.yyy"** 开始。' });
    const lines = all.map(p => {
      const statusIcon: Record<string, string> = { awaiting_repo: '⏳', registered: '📦', repo_cloned: '📥', test_cases_generated: '📝', scripts_generated: '📄', tested: '✅' };
      const lastReport = p.reports.length > 0 ? ` (最近: ${p.reports[p.reports.length-1].passed}/${p.reports[p.reports.length-1].total})` : '';
      return `${statusIcon[p.status] || '📦'} \`${p.packageName}\` — ${p.status}${lastReport}`;
    });
    return res.json({ reply: `📋 **已注册的包**\n\n${lines.join('\n')}\n\n${all.some(p => p.status === 'awaiting_repo') ? '\n💡 有包等待仓库地址, 请提供: **"仓库地址为 https://..."**' : ''}` });
  }

  // 3. 提取仓库地址（可能独立提供, 也可能和包名一起）
  const repoUrl = extractRepoUrl(trimmed);

  // 4. 提取包名
  const pkg = extractPackageName(trimmed);

  // 5. 包名 + 仓库地址 → 注册 + 启动流水线
  if (pkg && repoUrl) {
    config.bundleName = pkg;
    persistConfig(config);

    // 注册或更新
    if (!packageDB.has(pkg)) {
      packageDB.register(pkg, repoUrl);
    } else {
      packageDB.setRepoUrl(pkg, repoUrl);
    }

    // 回复 + 触发流水线
    return res.json({
      reply: `✅ **包注册成功, 启动全自动流水线**\n\n\`\`\`\n包名: ${pkg}\n仓库: ${repoUrl}\n\`\`\`\n\n📥 Step 1/4: 下载仓库...\n📝 Step 2/4: 分析 Demo → 生成测试用例...\n📄 Step 3/4: 生成自动化脚本...\n▶️  Step 4/4: 执行测试...`,
      action: 'run_pipeline',
      data: { packageName: pkg, repoUrl },
    });
  }

  // 6. 只有仓库地址 → 找等待中的包
  if (repoUrl) {
    const awaiting = getAwaitingPackage();
    if (awaiting) {
      packageDB.setRepoUrl(awaiting, repoUrl);
      config.bundleName = awaiting;
      persistConfig(config);

      return res.json({
        reply: `✅ **已收到仓库地址, 启动流水线**\n\n包名: \`${awaiting}\`\n仓库: ${repoUrl}\n\n📥 下载仓库...\n📝 生成测试用例...\n📄 生成脚本...\n▶️ 执行测试...`,
        action: 'run_pipeline',
        data: { packageName: awaiting, repoUrl },
      });
    }
    // 没有等待的包 → 提醒先配置包名
    return res.json({ reply: `⚠️ 检测到仓库地址, 但没有找到等待配置的包。请先提供包名, 例如:\n\n**"添加包名 com.openharmony.xxx, 仓库地址为 ${repoUrl}"**` });
  }

  // 7. 只有包名（无仓库）
  if (pkg) {
    const exists = packageDB.get(pkg);

    // 已有完整信息 → 直接更新配置
    if (exists && exists.repoUrl) {
      config.bundleName = pkg;
      persistConfig(config);
      return res.json({
        reply: `✅ **切换到包 \`${pkg}\`**\n  仓库: ${exists.repoUrl}\n  状态: ${exists.status}\n  最近: ${packageDB.getLastReportSummary(pkg) || '无'}\n\n说 **"运行测试"** 执行, 或 **"查看包列表"** 看所有包。`,
        action: 'config_update',
        data: { bundleName: pkg },
      });
    }

    // 新包 → 注册, 询问仓库地址
    if (!exists) {
      packageDB.register(pkg);
    }

    config.bundleName = pkg;
    persistConfig(config);

    return res.json({
      reply: `📦 **包已注册: \`${pkg}\`**\n\n请提供该应用的**仓库地址**, 这样我就能自动:\n\n1. 📥 下载源码\n2. 📝 分析 Demo → 生成测试用例\n3. 📄 生成自动化测试脚本\n4. ▶️ 执行测试\n5. 📊 生成报告\n\n请说: **"仓库地址为 https://gitcode.com/xxx/xxx"**`,
      action: 'awaiting_repo',
      data: { packageName: pkg },
    });
  }

  // 8. 设备 ID
  const deviceId = extractDeviceId(trimmed);
  if (deviceId && /(设备|device|HDC|ID)/i.test(trimmed)) {
    config.deviceId = deviceId;
    persistConfig(config);
    return res.json({ reply: `✅ 已配置设备 \`${deviceId}\``, action: 'config_update', data: { deviceId } });
  }

  // 9. 运行测试
  if (/^(运行测试|执行测试|跑一下|开始测试|执行)$/i.test(trimmed)) {
    return res.json({ reply: `🔌 开始测试: \`${config.bundleName}\``, action: 'run_test', data: { bundleName: config.bundleName, deviceId: config.deviceId } });
  }

  // 10. 检查设备
  if (/^(检查设备|设备状态|设备连接|hdc|连接测试)$/i.test(trimmed)) {
    return res.json({ reply: await checkDevice(config.deviceId) });
  }

  // 11. 查看配置
  if (/^(查看配置|当前配置|配置信息)$/i.test(trimmed)) {
    const pkgRecord = packageDB.get(config.bundleName);
    return res.json({
      reply: `📋 **当前配置**

| 项 | 值 |
|---|---|
| 包名 | \`${config.bundleName}\` |
| 设备 | \`${config.deviceId}\` |
| 仓库 | ${pkgRecord?.repoUrl || '未配置'} |
| 包状态 | ${pkgRecord?.status || '未注册'} |
| 测试用例 | ${pkgRecord?.testCases.length || 0} 个 |
| 上次测试 | ${pkgRecord ? (packageDB.getLastReportSummary(config.bundleName) || '无') : '无'} |
| Webhook | ${config.webhookUrl || '未配置'} |`,
    });
  }

  // 12. 上次结果
  if (/^(上次结果|查看结果|测试结果|结果)$/i.test(trimmed)) {
    const r = config.lastRunResult;
    if (!r) return res.json({ reply: '📭 还没有运行过测试。' });
    const failedSteps = r.steps.filter((s: any) => s.status === 'failed');
    let detail = '';
    if (failedSteps.length > 0) detail = `\n\n❌ **失败步骤**\n${failedSteps.map((s: any) => `  • ${s.name}: ${s.error}`).join('\n')}`;
    return res.json({ reply: `📊 **测试结果**\n\n总数: ${r.total} | ✅ ${r.passed} | ❌ ${r.failed} | ${r.total > 0 ? Math.round(r.passed/r.total*100) : 0}%\n应用: \`${r.bundleName}\` | 耗时: ${(r.duration/1000).toFixed(1)}s${detail}` });
  }

  // 13. Qwen 分析
  const qwenReply = await askQwen(trimmed, config);
  if (qwenReply) return res.json({ reply: qwenReply });

  // 14. 兜底
  return res.json({ reply: `🤔 没理解。试试:\n• **"添加包名 com.openharmony.xxx"**\n• **"仓库地址为 https://..."**\n• **"运行测试"**\n• **"帮助"**` });
});

// ====== POST /api/ai/pipeline ======
router.post('/pipeline', async (req, res) => {
  const { packageName, repoUrl } = req.body || {};
  if (!packageName) return res.json({ success: false, error: '缺少包名' });

  try {
    const result = await runPipeline(packageName, repoUrl || undefined);
    return res.json({ success: true, data: result });
  } catch (e: any) {
    return res.json({ success: false, error: e.message });
  }
});

// ====== GET /api/ai/config ======
router.get('/config', (_req, res) => {
  const config = loadConfig();
  const pkgRecord = packageDB.get(config.bundleName);
  res.json({ success: true, data: { ...config, packageRecord: pkgRecord || null } });
});

export default router;
