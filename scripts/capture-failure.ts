/**
 * capture-failure.ts — 失败时截图 + UI tree dump + 收集日志
 *
 * 在测试失败时自动调用，保存现场信息到 reports/failures/ 目录。
 *
 * 用法:
 *   npx tsx scripts/capture-failure.ts [--test-name "test_description"]
 */

import { HypiumDriver } from '../src/hypium/driver/hypium-driver';
import fs from 'fs';
import path from 'path';

const DEVICE_ID = process.env.DEVICE_ID || 'LNG0224718005504';
const FAILURE_DIR = path.resolve(__dirname, '..', 'reports', 'failures');

async function main() {
  const testName = process.argv.find(a => a.startsWith('--test-name='))?.split('=')[1]
    || `failure_${Date.now()}`;
  const safeName = testName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);

  console.log(`\n📸 Capturing failure: ${testName}`);

  // 确保输出目录
  fs.mkdirSync(FAILURE_DIR, { recursive: true });

  const driver = new HypiumDriver({ deviceId: DEVICE_ID });
  try {
    await driver.connect();

    // 1. 截图
    const ss = await driver.takeScreenshot();
    const ssPath = path.join(FAILURE_DIR, `${safeName}.jpeg`);
    fs.writeFileSync(ssPath, ss);
    console.log(`  ✅ Screenshot: ${ssPath}`);

    // 2. UI tree dump
    const source = await driver.getPageSource();
    const sourcePath = path.join(FAILURE_DIR, `${safeName}.uixml`);
    fs.writeFileSync(sourcePath, source, 'utf-8');
    console.log(`  ✅ UI Dump: ${sourcePath}`);

    // 3. 精简 UI 树 (前 100 个元素)
    const tree = await driver.getUiTree();
    const summaryPath = path.join(FAILURE_DIR, `${safeName}.summary.json`);
    const summary = {
      timestamp: new Date().toISOString(),
      testName,
      totalElements: tree.totalCount,
      visibleCount: tree.visibleCount,
      packageName: tree.packageName,
      screenSize: tree.screenSize,
      rootType: tree.root?.type,
      // 关键字段: bundleName + 主 text
      topElements: Array.from(tree.elements.values())
        .filter(e => (e.text || e.resourceId) && e.level < 3)
        .slice(0, 50)
        .map(e => ({
          id: e.id,
          type: e.type,
          text: e.text,
          bounds: e.bounds,
          clickable: e.clickable,
          level: e.level,
        })),
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`  ✅ Summary: ${summaryPath}`);

    // 4. 设备日志 (最后 50 行)
    try {
      const log = await driver.executeShell('log -d').catch(() => '');
      const logPath = path.join(FAILURE_DIR, `${safeName}.log`);
      const lines = log.split('\n').slice(-50);
      fs.writeFileSync(logPath, lines.join('\n'), 'utf-8');
      console.log(`  ✅ Device log: ${logPath}`);
    } catch {}

  } catch (err: any) {
    console.error(`  ❌ Capture failed: ${err.message}`);
  } finally {
    await driver.disconnect().catch(() => {});
  }

  // 输出 GitHub Actions 兼容的 step summary
  console.log(`\n::notice title=Failure-Capture::Saved to reports/failures/${safeName}.jpeg`);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
