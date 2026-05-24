/**
 * AI Test Agent · Qwen3-VL-Flash 智能测试
 *
 * 使用 Qwen3-VL-Flash 视觉语言模型分析设备截图，
 * 自动理解 UI 结构并驱动测试执行。
 *
 * 运行：
 *   npx tsx demo/qwen-vl-test.ts
 */

import { HypiumDriver } from '../src/hypium';
import { QwenProvider } from '../src/agent/llm/qwen-provider';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
const DEVICE_ID = 'LNG0224718005504';
const API_KEY = process.env.QWEN_API_KEY || '';
const MODEL = 'qwen3-vl-flash';

/** 执行 HDC 命令 */
async function hdc(command: string, timeout = 15000): Promise<string> {
  const { stdout } = await execAsync(`hdc -t ${DEVICE_ID} ${command}`, { timeout });
  return stdout.trim();
}

/** 截屏并返回 Base64 */
async function captureScreenBase64(): Promise<string> {
  await hdc('shell snapshot_display -f /data/local/tmp/_qwen_test.jpeg');
  await hdc('file recv /data/local/tmp/_qwen_test.jpeg _current_screen.jpeg');
  const buffer = fs.readFileSync('_current_screen.jpeg');
  return buffer.toString('base64');
}

/** 获取 UI 树文本摘要 */
async function getUiSummary(): Promise<string> {
  await hdc('shell uitest dumpLayout -p /data/local/tmp/_qwen_ui.xml -b com.example.stackblur');
  await hdc('file recv /data/local/tmp/_qwen_ui.xml _current_ui.xml');
  const raw = fs.readFileSync('_current_ui.xml', 'utf-8');
  const tree = JSON.parse(raw);

  const texts: string[] = [];
  function walk(node: any) {
    if (node.attributes?.text?.trim()) texts.push(node.attributes.text.trim());
    if (node.children) node.children.forEach(walk);
  }
  walk(tree);
  return texts.join('\n');
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   AI Test Agent · Qwen3-VL-Flash 测试   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. 初始化 Qwen Provider
  console.log('▶ [1/5] 初始化 Qwen3-VL-Flash...');
  const qwen = new QwenProvider({
    apiKey: API_KEY,
    model: MODEL,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    temperature: 0.3,
    maxTokens: 4096,
  });
  const connOk = await qwen.testConnection();
  if (!connOk) {
    throw new Error('Qwen API connection failed — 检查 API Key 和网络');
  }
  console.log('   ✓ AI 模型已连接\n');

  // 2. 连接设备
  console.log('▶ [2/5] 连接设备...');
  const driver = new HypiumDriver({ deviceId: DEVICE_ID, hdcPath: 'hdc' });
  try {
    await driver.connect();
    console.log('   ✓ 设备已连接\n');
  } catch (e: any) {
    console.log('   ⚠ HypiumDriver 直连异常，切换为 HDC 直连模式');
    console.log(`   ${e.message}\n`);
  }

  // 3. 截取当前屏幕
  console.log('▶ [3/5] 获取当前屏幕...');
  await hdc('shell snapshot_display -f /data/local/tmp/_qwen_test.jpeg');
  await hdc('file recv /data/local/tmp/_qwen_test.jpeg _current_screen.jpeg');
  const screenBase64 = fs.readFileSync('_current_screen.jpeg').toString('base64');
  console.log(`   ✓ 截图已获取 (${(screenBase64.length * 0.75 / 1024).toFixed(0)} KB)\n`);

  // 4. Qwen 分析屏幕
  console.log('▶ [4/5] Qwen 分析 UI 界面...');
  const response = await qwen.think([
    {
      role: 'system',
      content: `你是一个 HarmonyOS UI 测试专家。分析设备截图，回答：
1. 当前是什么页面？
2. 页面上有哪些可交互的元素（按钮、输入框、列表项）？
3. 请给出 3 个推荐的测试操作及其预期结果。

用中文回答，简洁准确。`,
    },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenBase64}` } },
        { type: 'text', text: '请分析当前屏幕内容。' },
      ] as any,
    },
  ]);

  console.log(`   📋 Qwen 分析结果:\n`);
  console.log(response.content);
  console.log('');

  // 5. 导航到第一个功能页并测试
  console.log('▶ [5/5] 执行 UI 导航测试...');

  // 获取 UI 树确认列表位置
  await hdc('shell uitest dumpLayout -p /data/local/tmp/_qwen_ui.xml -b com.example.stackblur');
  await hdc('file recv /data/local/tmp/_qwen_ui.xml _nav_ui.xml');
  const raw = fs.readFileSync('_nav_ui.xml', 'utf-8');
  const tree = JSON.parse(raw);

  // 提取前两个列表项的位置
  const items: { text: string; bounds: string }[] = [];
  function walkItems(node: any) {
    if (node.attributes?.clickable === 'true' && node.attributes?.bounds) {
      const text = node.attributes.text || '';
      const parentText = findChildText(node);
      if (parentText && /【\d{3}】/.test(parentText)) {
        items.push({ text: parentText, bounds: node.attributes.bounds });
      }
    }
    if (node.children) node.children.forEach(walkItems);
  }
  function findChildText(node: any): string {
    if (node.attributes?.text?.trim()) return node.attributes.text.trim();
    for (const c of node.children || []) {
      const t = findChildText(c);
      if (t) return t;
    }
    return '';
  }
  walkItems(tree);

  console.log(`   发现 ${items.length} 个可交互列表项:`);
  items.forEach((item, i) => {
    // 解析 bounds 格式 "[x,y][w,h]"
    const match = item.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (match) {
      const [, x, y, w, h] = match.map(Number);
      const cx = Math.floor((x + w) / 2);
      const cy = Math.floor((y + h) / 2);
      console.log(`   ${i + 1}. "${item.text}" → 点击坐标 (${cx}, ${cy})`);

      // 模拟点击第一个
      if (i === 0) {
        console.log(`\n   → 点击 "${item.text}"...`);
        hdc(`shell uitest uiInput click ${cx} ${cy}`);
      }
    }
  });

  // 点击后等待并再次截图
  await new Promise(r => setTimeout(r, 1500));

  // 截取导航后的屏幕
  await hdc('shell snapshot_display -f /data/local/tmp/_qwen_after.jpeg');
  await hdc('file recv /data/local/tmp/_qwen_after.jpeg _after_nav.jpeg');
  const afterBase64 = fs.readFileSync('_after_nav.jpeg').toString('base64');

  console.log('\n▶ Qwen 分析导航后页面...');
  const response2 = await qwen.think([
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${afterBase64}` } },
        { type: 'text', text: '导航后的页面是什么内容？有哪些可操作元素？' },
      ] as any,
    },
  ]);
  console.log(`\n   📋 导航后分析:\n`);
  console.log(response2.content);

  // 清理临时文件
  for (const f of ['_current_screen.jpeg', '_current_ui.xml', '_nav_ui.xml', '_after_nav.jpeg']) {
    try { fs.unlinkSync(f); } catch {}
  }
  await hdc('shell rm /data/local/tmp/_qwen_test.jpeg /data/local/tmp/_qwen_ui.xml /data/local/tmp/_qwen_after.jpeg').catch(() => {});

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   测试完成 ✓                             ║');
  console.log('╚══════════════════════════════════════════╝');
}

main().catch(err => {
  console.error(`\n❌ 测试失败: ${err.message}`);
  for (const f of ['_current_screen.jpeg', '_current_ui.xml', '_nav_ui.xml', '_after_nav.jpeg']) {
    try { fs.unlinkSync(f); } catch {}
  }
  process.exit(1);
});
