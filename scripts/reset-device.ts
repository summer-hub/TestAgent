/**
 * reset-device.ts — 测试前设备/应用重置
 *
 * 在 CI/CD 流水线中，每次测试前执行以确保干净状态。
 *
 * 用法:
 *   npx tsx scripts/reset-device.ts [--device LNG0224718005504] [--bundle com.example.stackblur]
 */

import { HypiumDriver } from '../src/hypium/driver/hypium-driver';
import { AppManager } from '../src/hypium/app/app-manager';

const DEVICE_ID = process.env.DEVICE_ID || 'LNG0224718005504';
const BUNDLE = process.env.BUNDLE || 'com.example.stackblur';

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Device Reset — 测试前设备/应用重置        ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const driver = new HypiumDriver({ deviceId: DEVICE_ID });
  await driver.connect();
  const appMan = driver.getAppManager();

  // 1. 停止目标应用
  console.log('  1. 停止应用...');
  await appMan.stop(BUNDLE).catch(() => {});
  await driver.sleep(500);

  // 2. 清除应用数据
  console.log('  2. 清除应用数据...');
  await appMan.clearData(BUNDLE).catch(() => {});
  await driver.sleep(500);

  // 3. 停止所有可能冲突的进程
  console.log('  3. 检查运行进程...');
  const running = await appMan.getRunningApps();
  const conflictApps = running.filter(r =>
    r.bundleName.includes('stackblur') ||
    r.bundleName.includes('test')
  );
  for (const app of conflictApps) {
    await appMan.stop(app.bundleName).catch(() => {});
  }
  await driver.sleep(500);

  // 4. 验证设备连接
  console.log('  4. 验证设备连接...');
  const info = await driver.getDeviceInfo();
  console.log(`     设备: ${info.deviceName} (${info.deviceId})`);
  console.log(`     OS: ${info.osVersion}`);
  console.log(`     屏幕: ${info.screenSize.width}x${info.screenSize.height}`);

  // 5. 确认应用已安装
  console.log('  5. 确认应用已安装...');
  try {
    const appInfo = await appMan.getAppInfo(BUNDLE);
    console.log(`     应用: ${appInfo.bundleName} v${appInfo.versionName}`);
    console.log(`     Ability: ${appInfo.mainAbility?.name || '(未检测)'}`);
  } catch {
    console.error(`     ⚠ 应用 ${BUNDLE} 未安装，请先安装`);
    process.exitCode = 1;
  }

  await driver.disconnect();

  if (process.exitCode) {
    console.log('\n❌ 重置失败');
    process.exit(process.exitCode);
  }
  console.log('\n✅ 设备已就绪\n');
}

main().catch(err => {
  console.error(`\n❌ 重置失败: ${err.message}`);
  process.exit(1);
});
