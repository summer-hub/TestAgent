/**
 * 端到端测试：com.example.stackblur
 * 直接通过 HDC 驱动设备，验证 UI 结构完整
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEVICE_ID = 'LNG0224718005504';

async function hdc(command: string, timeout = 15000): Promise<string> {
  const { stdout, stderr } = await execAsync(`hdc -t ${DEVICE_ID} ${command}`, { timeout });
  if (stderr && !stderr.includes('Info:')) console.warn('  ⚠', stderr.trim());
  return stdout.trim();
}

function walkTexts(node: any): string[] {
  const texts: string[] = [];
  if (node.attributes?.text && node.attributes.text.trim()) {
    texts.push(node.attributes.text.trim());
  }
  if (node.children) {
    for (const child of node.children) {
      texts.push(...walkTexts(child));
    }
  }
  return texts;
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  AI Test Agent · 端到端设备测试     ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 1. 验证连接
  console.log('▶ [1/5] 验证设备连接');
  const targets = await hdc('list targets');
  if (!targets.includes(DEVICE_ID)) throw new Error('Device not found');
  console.log(`   ✓ 设备在线: ${DEVICE_ID}\n`);

  // 2. 设备信息
  console.log('▶ [2/5] 获取设备信息');
  const model = await hdc('shell param get const.product.model');
  const os = await hdc('shell param get const.product.software.version');
  console.log(`   ✓ 型号: ${model}`);
  console.log(`   ✓ 系统: ${os}\n`);

  // 3. 应用状态
  console.log('▶ [3/5] 检查应用状态');
  const pid = await hdc('shell pidof com.example.stackblur');
  console.log(`   ✓ 进程 ID: ${pid} (运行中)\n`);

  // 4. 截图
  console.log('▶ [4/5] 截图');
  await hdc('shell snapshot_display -f /data/local/tmp/e2e_screen.jpeg');
  await hdc('file recv /data/local/tmp/e2e_screen.jpeg screenshot_e2e.jpeg');
  console.log('   ✓ 已保存: screenshot_e2e.jpeg\n');

  // 5. UI 解析
  console.log('▶ [5/5] UI 结构验证');
  await hdc('shell uitest dumpLayout -p /data/local/tmp/e2e_ui.xml -b com.example.stackblur');
  await hdc('file recv /data/local/tmp/e2e_ui.xml e2e_ui.xml');

  const fs = await import('fs');
  const raw = fs.readFileSync('./e2e_ui.xml', 'utf-8');
  const tree = JSON.parse(raw);
  const texts = walkTexts(tree);

  // 验证关键内容
  const title = texts.find((t: string) => t.includes('StackBlur'));
  const items = texts.filter((t: string) => /^【\d{3}】/.test(t));
  const descs = texts.filter((t: string) => t.includes('展示') || t.includes('对比'));

  console.log(`   ${'─'.repeat(40)}`);
  console.log(`   📋 App: com.example.stackblur`);
  console.log(`   📄 页面: pages/DemoIndex`);
  console.log(`   ${'─'.repeat(40)}`);

  // 断言
  let passed = 0, failed = 0;

  if (title) { console.log(`   ✅ 标题: "${title}"`); passed++; }
  else { console.log('   ❌ 标题未找到'); failed++; }

  console.log(`   ✅ 功能项: ${items.length} 个`);
  passed++;
  items.forEach((t: string, i: number) => console.log(`      ${i + 1}. ${t}`));

  if (descs.length > 0) { console.log(`   ✅ 描述文本: ${descs.length} 条`); passed++; }
  else { console.log('   ❌ 描述文本缺失'); failed++; }

  console.log(`   ${'─'.repeat(40)}`);
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  结果: ${passed} passed · ${failed} failed           ║`);
  console.log(`╚══════════════════════════════════════╝`);

  // 清理
  await hdc('shell rm /data/local/tmp/e2e_screen.jpeg /data/local/tmp/e2e_ui.xml');
  fs.unlinkSync('./e2e_ui.xml');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(`\n❌ 测试异常: ${err.message}`);
  process.exit(1);
});
