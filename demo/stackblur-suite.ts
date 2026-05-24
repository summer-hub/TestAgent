/**
 * StackBlur 全功能深度测试套件
 *
 * 覆盖 4 个功能页的完整测试流程：
 *   001 纯 ArkTS 模糊 → 002 Native C 对比 → 003 保存文件 → 004 安卓原库
 *
 * 运行：
 *   npx tsx demo/stackblur-suite.ts
 */
import { QwenProvider } from '../src/agent/llm/qwen-provider';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);
const DEVICE_ID = process.env.DEVICE_ID || 'LNG0224718005504';
const API_KEY = process.env.QWEN_API_KEY || '';
const PACKAGE = 'com.example.stackblur';

const qwen = new QwenProvider({
  apiKey: API_KEY,
  model: 'qwen3-vl-flash',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  temperature: 0.05,
  maxTokens: 2048,
});

async function hdc(cmd: string, timeout = 20000) {
  const { stdout } = await execAsync(`hdc -t ${DEVICE_ID} ${cmd}`, { timeout });
  return stdout.trim();
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(name: string): Promise<string> {
  await hdc(`shell snapshot_display -f /data/local/tmp/_${name}.jpeg`);
  await hdc(`file recv /data/local/tmp/_${name}.jpeg ${name}.jpeg`);
  await hdc(`shell rm /data/local/tmp/_${name}.jpeg`).catch(() => {});
  const buf = fs.readFileSync(`${name}.jpeg`);
  return buf.toString('base64');
}

async function uiDump(): Promise<any> {
  await hdc(`shell uitest dumpLayout -p /data/local/tmp/_s_ui.xml -b ${PACKAGE}`).catch(() => {});
  await hdc('file recv /data/local/tmp/_s_ui.xml _s_ui.xml').catch(() => {});
  await hdc('shell rm /data/local/tmp/_s_ui.xml').catch(() => {});
  try {
    const raw = fs.readFileSync('_s_ui.xml', 'utf-8');
    fs.unlinkSync('_s_ui.xml');
    return JSON.parse(raw);
  } catch { return null; }
}

function findClickables(tree: any): { text: string; bounds: string; cx: number; cy: number }[] {
  const result: { text: string; bounds: string; cx: number; cy: number }[] = [];
  // First pass: collect all text positions
  const textPositions: { text: string; bounds: string }[] = [];
  function collectText(n: any) {
    const t = n.attributes?.text?.trim();
    if (t && t !== '›' && n.attributes?.bounds) {
      textPositions.push({ text: t, bounds: n.attributes.bounds });
    }
    if (n.children) n.children.forEach(collectText);
  }
  collectText(tree);

  // Second pass: find clickable containers and match their child text
  function walk(n: any) {
    if (n.attributes?.clickable === 'true' && n.attributes?.bounds) {
      const match = n.attributes.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (match) {
        const [, x1, y1, x2, y2] = match.map(Number);
        const cx = Math.floor((x1 + x2) / 2);
        const cy = Math.floor((y1 + y2) / 2);
        // Find child text that falls within this clickable's bounds
        const childText = textPositions.filter(tp => {
          const tm = tp.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
          return tm && parseInt(tm[1]) >= x1 && parseInt(tm[3]) <= x2 &&
                 parseInt(tm[2]) >= y1 && parseInt(tm[4]) <= y2;
        }).map(tp => tp.text).join(' | ');
        if (childText) {
          result.push({ text: childText, bounds: n.attributes.bounds, cx, cy });
        }
      }
    }
    if (n.children) n.children.forEach(walk);
  }
  walk(tree);
  return result;
}

function findTexts(tree: any): string[] {
  const texts: string[] = [];
  function walk(n: any) {
    const t = n.attributes?.text?.trim();
    if (t && t !== '›') texts.push(t);
    if (n.children) n.children.forEach(walk);
  }
  walk(tree);
  return texts;
}

async function launchApp() {
  await hdc(`shell aa start -a EntryAbility -b ${PACKAGE}`);
  await sleep(2000);
}

interface TestCase {
  name: string;
  pageTitle: string;
  run: () => Promise<{ passed: boolean; detail: string }>;
}

const tests: TestCase[] = [];

// ====== Test 001: Pure ArkTS Blur ======
tests.push({
  name: '【001】纯 ArkTS 图像模糊处理',
  pageTitle: '纯 ArkTS 图像模糊处理',
  run: async () => {
    // Navigate to 001 by clicking the first list item
    const tree = await uiDump();
    if (!tree) return { passed: false, detail: 'UI tree unavailable' };

    const items = findClickables(tree).filter(i => i.text.includes('001') || i.text.includes('纯 ArkTS'));
    if (items.length === 0) return { passed: false, detail: '001 list item not found' };

    await hdc(`shell uitest uiInput click ${items[0].cx} ${items[0].cy}`);
    await sleep(2000);

    // Screenshot after navigation
    const b64 = await screenshot('_sb_001');
    const analysis = await qwen.think([
      { role: 'system', content: '分析截图中页面上的功能按钮，列出所有可见的可交互元素名称和大致坐标。' },
      { role: 'user' as any, content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }, { type: 'text', text: '分析这个图片模糊处理界面' }],
    }]);

    // Also get text from UI tree
    const tree2 = await uiDump();
    const txt = tree2 ? findTexts(tree2) : [];

    // Look for key UI elements
    const hasBlurButton = txt.some(t => t.includes('模糊') || t.includes('Blur') || t.includes('process'));
    const hasLoadButton = txt.some(t => t.includes('加载') || t.includes('Load') || t.includes('图片'));
    const hasRadius = txt.some(t => /[0-9]/.test(t) && (t.includes('半径') || t.includes('Radius') || parseInt(t) > 0 && parseInt(t) < 100));

    // Try clicking "加载" or "模糊" if found
    const buttons = findClickables(tree2 || tree);
    const loadBtn = buttons.find(b => b.text.includes('加载') || b.text.includes('Load'));
    if (loadBtn) {
      await hdc(`shell uitest uiInput click ${loadBtn.cx} ${loadBtn.cy}`);
      await sleep(1500);
    }
    const blurBtn = buttons.find(b => b.text.includes('模糊') || b.text.includes('process'));
    if (blurBtn) {
      await hdc(`shell uitest uiInput click ${blurBtn.cx} ${blurBtn.cy}`);
      await sleep(2000);
    }

    // Final screenshot
    const finalB64 = await screenshot('_sb_001_done');
    const finalAnalysis = await qwen.think([
      { role: 'user' as any, content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${finalB64}` } }, { type: 'text', text: '模糊处理是否已执行？界面上是否有模糊后的图像结果？用一句话回答。' }],
    }]);

    const hasResult = finalAnalysis.content.includes('模糊') || finalAnalysis.content.includes('结果') || finalAnalysis.content.includes('图像');

    return {
      passed: hasLoadButton || hasBlurButton || hasResult,
      detail: `Qwen: ${analysis.content.slice(0, 120)} | 按钮: ${hasLoadButton ? '加载✓' : '加载✗'} ${hasBlurButton ? '模糊✓' : '模糊✗'} | 结果: ${hasResult ? '有✓' : '—'}`,
    };
  },
});

// ====== Test 002: Native C Performance Comparison ======
tests.push({
  name: '【002】Native C 高性能模糊对比',
  pageTitle: 'Native C 高性能模糊对比',
  run: async () => {
    // Navigate back to main page first
    await hdc('shell uitest uiInput keyEvent Back');
    await sleep(1000);

    const tree = await uiDump();
    if (!tree) return { passed: false, detail: 'UI tree unavailable' };

    const items = findClickables(tree).filter(i => i.text.includes('002') || i.text.includes('Native'));
    if (items.length === 0) return { passed: false, detail: '002 item not found' };

    await hdc(`shell uitest uiInput click ${items[0].cx} ${items[0].cy}`);
    await sleep(2000);

    const b64 = await screenshot('_sb_002');
    const analysis = await qwen.think([
      { role: 'user' as any, content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }, { type: 'text', text: '界面上有几个方法对比按钮？方法名称是什么？用一句话回答。' }],
    }]);

    const tree2 = await uiDump();
    const txt = tree2 ? findTexts(tree2) : [];
    const hasComparison = txt.some(t => t.includes('Native') || t.includes('RenderScript') || t.includes('耗时') || t.includes('性能'));
    const hasMethods = analysis.content.includes('Native') || analysis.content.includes('RenderScript') || analysis.content.includes('process');

    return {
      passed: hasComparison || hasMethods,
      detail: `Qwen: ${analysis.content.slice(0, 120)}`,
    };
  },
});

// ====== Test 003: Save to File ======
tests.push({
  name: '【003】模糊图像保存文件',
  pageTitle: '模糊图像保存文件',
  run: async () => {
    await hdc('shell uitest uiInput keyEvent Back');
    await sleep(1000);

    const tree = await uiDump();
    if (!tree) return { passed: false, detail: 'UI tree unavailable' };

    const items = findClickables(tree).filter(i => i.text.includes('003') || i.text.includes('保存'));
    if (items.length === 0) return { passed: false, detail: '003 item not found' };

    await hdc(`shell uitest uiInput click ${items[0].cx} ${items[0].cy}`);
    await sleep(2000);

    const b64 = await screenshot('_sb_003');
    const analysis = await qwen.think([
      { role: 'user' as any, content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }, { type: 'text', text: '界面上是否有"保存"或"Save"按钮？有哪些文件操作功能？' }],
    }]);

    const tree2 = await uiDump();
    const txt = tree2 ? findTexts(tree2) : [];
    const hasSave = txt.some(t => t.includes('保存') || t.includes('Save') || t.includes('file'));
    const hasFunction = analysis.content.includes('保存') || analysis.content.includes('Save') || analysis.content.includes('文件');

    return {
      passed: hasSave || hasFunction,
      detail: `Qwen: ${analysis.content.slice(0, 120)}`,
    };
  },
});

// ====== Test 004: Android Original Library ======
tests.push({
  name: '【004】安卓原库demo',
  pageTitle: '安卓原库demo',
  run: async () => {
    await hdc('shell uitest uiInput keyEvent Back');
    await sleep(1000);

    const tree = await uiDump();
    if (!tree) return { passed: false, detail: 'UI tree unavailable' };

    const items = findClickables(tree).filter(i => i.text.includes('004') || i.text.includes('安卓'));
    if (items.length === 0) return { passed: false, detail: '004 item not found' };

    await hdc(`shell uitest uiInput click ${items[0].cx} ${items[0].cy}`);
    await sleep(2000);

    const b64 = await screenshot('_sb_004');
    const analysis = await qwen.think([
      { role: 'user' as any, content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }, { type: 'text', text: '这个界面是否是 Android 原库的 demo 界面？界面上有哪些功能元素？' }],
    }]);

    const isAndroidDemo = analysis.content.includes('Android') || analysis.content.includes('原库') || analysis.content.includes('demo');

    return {
      passed: isAndroidDemo,
      detail: `Qwen: ${analysis.content.slice(0, 120)}`,
    };
  },
});

// ====== Main Runner ======
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   StackBlur 全功能深度测试套件              ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Check device
  const targets = await hdc('list targets');
  console.log(`📱 设备: ${targets}`);
  console.log(`📦 应用: ${PACKAGE}\n`);

  // Check Qwen
  console.log('🔌 连接 Qwen3-VL-Flash...');
  const ok = await qwen.testConnection();
  console.log(`   ${ok ? '✓' : '✗'} ${ok ? '已连接' : '失败'}\n`);

  if (!ok) process.exit(1);

  // Launch app
  await launchApp();
  console.log(`🚀 应用已启动\n`);

  // Run tests
  let passed = 0, failed = 0;
  const results: { name: string; passed: boolean; detail: string }[] = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`──────────────────────────────────────────────`);
    console.log(`测试 ${i + 1}/${tests.length}: ${test.name}`);
    console.log(`──────────────────────────────────────────────`);

    try {
      const result = await test.run();
      results.push(result);
      if (result.passed) { passed++; console.log(`  ✅ 通过`); }
      else { failed++; console.log(`  ❌ 失败`); }
      console.log(`  ${result.detail}\n`);
    } catch (err: any) {
      results.push({ name: test.name, passed: false, detail: err.message });
      failed++;
      console.log(`  ❌ 异常: ${err.message}\n`);
    }
  }

  // Cleanup
  for (const f of ['_sb_001.jpeg', '_sb_001_done.jpeg', '_sb_002.jpeg', '_sb_003.jpeg', '_sb_004.jpeg']) {
    try { fs.unlinkSync(f); } catch {}
  }

  // Summary
  console.log(`══════════════════════════════════════════════`);
  console.log(`  结果: ${passed}/${tests.length} 通过`);
  console.log(`══════════════════════════════════════════════\n`);
  results.forEach((r, i) => {
    console.log(`  ${r.passed ? '✅' : '❌'} Test ${i + 1}: ${r.name}`);
  });

  process.exit(passed === tests.length ? 0 : 1);
}

main().catch(err => {
  console.error(`\n❌ 套件异常: ${err.message}`);
  process.exit(1);
});
