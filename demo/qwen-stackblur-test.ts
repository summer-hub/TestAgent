/**
 * AI Test Agent · com.example.stackblur 智能 UI 测试
 *
 * 使用 Qwen3-VL-Flash 分析 stackblur 应用界面，
 * 自动识别 UI 元素并执行交互验证。
 *
 * 运行：
 *   npx tsx demo/qwen-stackblur-test.ts
 */

import { QwenProvider } from '../src/agent/llm/qwen-provider';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);
const DEVICE_ID = 'LNG0224718005504';
const API_KEY = process.env.QWEN_API_KEY || '';
const MODEL = 'qwen3-vl-flash';

/** 执行 HDC 命令 */
async function hdc(command: string, timeout = 20000) {
  const { stdout } = await execAsync(`hdc -t ${DEVICE_ID} ${command}`, { timeout });
  return stdout.trim();
}

/** 截屏并返回 Base64 */
async function screenshot(name: string): Promise<string> {
  await hdc(`shell snapshot_display -f /data/local/tmp/_${name}.jpeg`);
  await hdc(`file recv /data/local/tmp/_${name}.jpeg ${name}.jpeg`);
  return fs.readFileSync(`${name}.jpeg`).toString('base64');
}

/** 解析 UI 树中的文本 */
async function getUiTexts(): Promise<string[]> {
  await hdc('shell uitest dumpLayout -p /data/local/tmp/_q_ui.xml -b com.example.stackblur');
  await hdc('file recv /data/local/tmp/_q_ui.xml _q_ui.xml');
  const raw = fs.readFileSync('_q_ui.xml', 'utf-8');
  const tree = JSON.parse(raw);
  const texts: string[] = [];
  function walk(n: any) {
    if (n.attributes?.text?.trim()) texts.push(n.attributes.text.trim());
    if (n.children) n.children.forEach(walk);
  }
  walk(tree);
  return texts;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  StackBlur · Qwen3-VL-Flash 智能 UI 测试    ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  // 1. Qwen 初始化
  console.log('▶ [1/6] 连接 Qwen3-VL-Flash...');
  const qwen = new QwenProvider({
    apiKey: API_KEY,
    model: MODEL,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    temperature: 0.1,
    maxTokens: 4096,
  });
  const ok = await qwen.testConnection();
  console.log(`   ${ok ? '✓' : '✗'} AI 模型 ${ok ? '已连接' : '连接失败'}\n`);
  if (!ok) process.exit(1);

  // 2. 拉起应用
  console.log('▶ [2/6] 启动 com.example.stackblur...');
  await hdc('shell aa start -a EntryAbility -b com.example.stackblur');
  await new Promise(r => setTimeout(r, 2000));
  // 确认进程
  const pid = await hdc('shell pidof com.example.stackblur');
  console.log(`   ✓ PID: ${pid}\n`);

  // 3. 截屏 + UI 树
  console.log('▶ [3/6] 获取屏幕 & UI 结构...');
  const b64 = await screenshot('_stackblur_screen');
  const texts = await getUiTexts();
  console.log(`   ✓ 截图已获取 (${(b64.length * 0.75 / 1024).toFixed(0)} KB)`);
  console.log(`   ✓ UI 文本节点: ${texts.length}`);
  texts.forEach(t => console.log(`     - ${t}`));
  console.log('');

  // 4. Qwen 视觉分析
  console.log('▶ [4/6] Qwen 分析界面...');
  const analysis = await qwen.think([
    {
      role: 'system',
      content: '你是一个 HarmonyOS UI 测试专家。分析截图，用中文回答：当前页面名称、有哪些可点击的列表项、每个列表项的序号和标题。',
    },
    {
      role: 'user' as any,
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        { type: 'text', text: '分析这个 HarmonyOS 应用界面。' },
      ],
    },
  ]);
  console.log(`   📋 Qwen 分析:\n${analysis.content}\n`);

  // 5. 点击第一个列表项并验证导航
  console.log('▶ [5/6] 解析列表坐标并点击第一项...');
  const tree = JSON.parse(fs.readFileSync('_q_ui.xml', 'utf-8'));

  // 找到第一个 clickable 的 ListItem
  const clickables: { text: string; bounds: string }[] = [];
  function findClickable(node: any, parentText: string = '') {
    const t = node.attributes?.text?.trim() || parentText;
    if (node.attributes?.clickable === 'true' && node.attributes?.bounds && /【\d{3}】/.test(t)) {
      clickables.push({ text: t, bounds: node.attributes.bounds });
    } else {
      // 往上传递子文本
      let childText = t;
      if (node.children) {
        for (const c of node.children) {
          findClickable(c, childText);
        }
      }
    }
  }
  // 重新从树中查找
  function searchTree(node: any, inherited: string = '') {
    const t = node.attributes?.text?.trim() || inherited;
    if (node.attributes?.bounds && /【\d{3}】/.test(t)) {
      // 找这个节点的可点击父级
      clickables.push({ text: t, bounds: node.attributes.bounds });
    }
    if (node.children) {
      const hasChildText = node.children.some((c: any) => c.attributes?.text?.trim());
      for (const c of node.children) {
        searchTree(c, hasChildText ? inherited : t);
      }
    }
  }
  searchTree(tree);

  console.log(`   发现 ${clickables.length} 个列表项`);

  if (clickables.length >= 1) {
    const target = clickables[0];
    const match = target.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (match) {
      const [, x1, y1, x2, y2] = match.map(Number);
      const cx = Math.floor((x1 + x2) / 2);
      const cy = Math.floor((y1 + y2) / 2);
      console.log(`   → 点击 "${target.text}" 坐标 (${cx}, ${cy})`);
      await hdc(`shell uitest uiInput click ${cx} ${cy}`);
      await new Promise(r => setTimeout(r, 2500));

      // 导航后截图
      console.log('   → 导航后截屏...');
      const afterB64 = await screenshot('_stackblur_detail');
      console.log('');

      // 6. Qwen 分析导航后页面
      console.log('▶ [6/6] Qwen 分析导航后页面...');
      const detail = await qwen.think([
        {
          role: 'user' as any,
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${afterB64}` } },
            { type: 'text', text: '导航后的新页面是什么？有哪些功能按钮？用中文简要回答。' },
          ],
        },
      ]);
      console.log(`   📋 导航后分析:\n${detail.content}\n`);
    }
  } else {
    console.log('   ⚠ 未找到匹配的列表项，尝试点击第一个 ListItem 的 bounds...');

    // fallback: 找第一个 ListItem 的 bounds
    function findListItem(node: any): string | null {
      if (node.attributes?.type === 'ListItem' && node.attributes?.bounds) {
        return node.attributes.bounds;
      }
      if (node.children) {
        for (const c of node.children) {
          const r = findListItem(c);
          if (r) return r;
        }
      }
      return null;
    }
    const listBounds = findListItem(tree);
    if (listBounds) {
      const match = listBounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (match) {
        const [, x1, y1, x2, y2] = match.map(Number);
        const cx = Math.floor((x1 + x2) / 2);
        const cy = Math.floor((y1 + y2) / 2);
        console.log(`   → 点击 ListItem 坐标 (${cx}, ${cy})`);
        await hdc(`shell uitest uiInput click ${cx} ${cy}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  // 清理
  for (const f of ['_stackblur_screen.jpeg', '_stackblur_detail.jpeg', '_q_ui.xml', '_confirm.jpeg']) {
    try { fs.unlinkSync(f); } catch {}
  }
  await hdc('shell rm /data/local/tmp/_stackblur_screen.jpeg /data/local/tmp/_stackblur_detail.jpeg /data/local/tmp/_q_ui.xml /data/local/tmp/_confirm.jpeg').catch(() => {});

  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  测试完成 ✓                                  ║');
  console.log('╚═══════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error(`\n❌ 测试异常: ${err.message}`);
  process.exit(1);
});
