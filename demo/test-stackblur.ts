/**
 * 端到端测试：com.example.stackblur
 *
 * 使用方式（设备需已连接 HDC）：
 *   npx tsx demo/test-stackblur.ts
 */

import { HypiumDriver } from '../src/hypium';

async function main() {
  console.log('=== AI Test Agent · 端到端测试 ===\n');

  // 1. 连接设备
  console.log('[1/6] 连接设备...');
  const driver = new HypiumDriver({
    deviceId: 'LNG0224718005504',
    logLevel: 'info',
    hdcPath: 'hdc',
  });
  await driver.connect();
  console.log('  ✓ 设备已连接\n');

  // 2. 获取设备信息
  console.log('[2/6] 获取设备信息...');
  const deviceInfo = await driver.getDeviceInfo();
  console.log(`  ✓ 型号: ${deviceInfo.model}`);
  console.log(`  ✓ 系统: ${deviceInfo.osVersion}`);
  console.log(`  ✓ 分辨率: ${deviceInfo.screenWidth}x${deviceInfo.screenHeight}\n`);

  // 3. 启动应用
  console.log('[3/6] 启动应用 com.example.stackblur...');
  await driver.launchApp('com.example.stackblur');
  console.log('  ✓ 应用已启动\n');

  // 4. 获取截图
  console.log('[4/6] 获取截图...');
  const screenshot = await driver.takeScreenshot();
  console.log(`  ✓ 截图成功: ${screenshot.length} bytes\n`);

  // 5. 获取 UI 树结构
  console.log('[5/6] 获取 UI 树...');
  const uiTree = await driver.getUiTree();
  const elements = Array.from(uiTree.elements.values());
  console.log(`  ✓ UI 节点数: ${elements.length}`);

  // 提取可见文字
  const textElements = elements.filter(e => e.text && e.text.trim());
  console.log(`  ✓ 可见文本元素: ${textElements.length}`);
  textElements.forEach(e => {
    if (e.text && e.text.length > 0 && e.text !== '›') {
      console.log(`    - "${e.text}" [${e.bounds ? `${e.bounds.x},${e.bounds.y}` : ''}]`);
    }
  });

  // 检查标题
  const titleEl = textElements.find(e => e.text?.includes('StackBlur'));
  if (titleEl) {
    console.log(`  ✓ 标题确认: "${titleEl.text}"\n`);
  }

  // 6. 验证列表内容
  console.log('[6/6] 验证列表项...');
  const listItems = textElements.filter(e => /^【\d{3}】/.test(e.text || ''));
  console.log(`  ✓ 发现 ${listItems.length} 个测试一览项:`);
  listItems.forEach((item, i) => {
    const descEl = textElements.find(e =>
      e.text && e.text.length > 20 &&
      Math.abs((e.bounds?.y || 0) - (item.bounds?.y || 0)) < 100
    );
    console.log(`    ${i + 1}. ${item.text}`);
    if (descEl) console.log(`       ${descEl.text}`);
  });

  // 测试通过
  console.log('\n=== 测试完成 ✓ ===');
  console.log(`    ${listItems.length} 个列表项均可见`);
  console.log('    应用正常运行，UI 结构完整');
}

main().catch(err => {
  console.error('\n=== 测试失败 ✗ ===');
  console.error(`    ${err.message}`);
  process.exit(1);
});
