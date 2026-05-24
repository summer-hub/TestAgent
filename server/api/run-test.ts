/**
 * POST /api/run-test — 在真实设备上执行 E2E 测试
 *
 * 请求体: { bundleName?: string, deviceId?: string }
 * 响应:   { success: true, data: RunTestResult }
 *
 * 失败时自动截图 + 收集 UI 树，返回完整现场信息
 */

import { Router } from 'express';
import { HypiumDriver } from '../../src/hypium/driver/hypium-driver';
import { By } from '../../src/hypium/selectors/by';
import { AppProcessStatus } from '../../src/core/types/app-info.type';

const router = Router();

const DEFAULT_DEVICE_ID = process.env.DEVICE_ID || 'LNG0224718005504';
const DEFAULT_BUNDLE = 'com.example.stackblur';

/** 一步测试的结果 */
interface TestStepResult {
  name: string;                        // 步骤名称
  status: 'passed' | 'failed' | 'skipped';
  duration: number;                    // 耗时 ms
  error?: string;                      // 错误消息
  detail?: string;                     // UI 树 dump（失败时）
  screenshot?: string;                 // 截图 base64（失败时）
}

/** 完整运行结果 */
interface RunTestResult {
  total: number;
  passed: number;
  failed: number;
  duration: number;
  steps: TestStepResult[];
  deviceId: string;
  deviceName: string;
  bundleName: string;
  timestamp: string;
}

router.post('/', async (req, res) => {
  const { bundleName = DEFAULT_BUNDLE, deviceId = DEFAULT_DEVICE_ID } = req.body || {};
  const startTime = Date.now();
  const steps: TestStepResult[] = [];

  /** 执行一步，失败时自动截图 + 收集 UI 树 */
  async function step(name: string, fn: () => Promise<void>, driver?: HypiumDriver) {
    const t0 = Date.now();
    try {
      await fn();
      steps.push({ name, status: 'passed', duration: Date.now() - t0 });
    } catch (e: any) {
      const error = e.message || String(e);
      // 收集现场信息
      let detail: string | undefined;
      let screenshot: string | undefined;
      if (driver) {
        try {
          const tree = await driver.getUiTree();
          detail = JSON.stringify({
            totalCount: tree.totalCount,
            visibleCount: tree.visibleCount,
            packageName: tree.packageName,
            screenSize: tree.screenSize,
            elements: Array.from(tree.elements.entries()).slice(0, 30).map(([id, el]) => ({
              id, text: el.text, type: el.type,
              bounds: el.bounds, clickable: el.clickable,
              level: el.level,
            })),
          }, null, 2);
        } catch {
          detail = 'UI tree unavailable';
        }
        try {
          const buf = await driver.takeScreenshot();
          screenshot = buf.toString('base64');
        } catch {
          // 截图失败不阻断
        }
      }
      steps.push({ name, status: 'failed', duration: Date.now() - t0, error, detail, screenshot });
    }
  }

  let driver: HypiumDriver | null = null;

  try {
    driver = new HypiumDriver({ deviceId });
    await driver.connect();

    const appMan = driver.getAppManager();
    const info = await driver.getDeviceInfo();
    const deviceName = `${info.deviceName || 'HarmonyOS'} ${info.osVersion || ''}`;

    // === 1. 应用信息获取 ===
    await step('获取应用信息', async () => {
      const app = await appMan.getAppInfo(bundleName);
      if (!app.installed) throw new Error(`应用 ${bundleName} 未安装`);
    }, driver);

    // === 2. 启动应用 ===
    await step('启动应用', async () => {
      await appMan.start(bundleName);
      await driver!.sleep(2000);
      const status = await appMan.getAppStatus(bundleName);
      if (status === AppProcessStatus.NOT_RUNNING) {
        throw new Error('应用启动失败');
      }
    }, driver);

    // === 3. 获取 UI 树 ===
    await step('获取 UI 树', async () => {
      const tree = await driver!.getUiTree();
      if (tree.totalCount <= 1) throw new Error('UI 树为空或仅包含根节点');
    }, driver);

    // === 4. 查找文本元素 ===
    await step('查找文本元素', async () => {
      const el = await driver!.findComponent(By.text('StackBlur'));
      if (!el) throw new Error(`未找到文本为 "StackBlur" 的元素`);
    }, driver);

    // === 5. 点击操作 ===
    await step('点击操作', async () => {
      const el = await driver!.findComponent(By.text('001'));
      if (el) {
        await driver!.click(el);
        await driver!.sleep(1500);
        await driver!.pressBack();
        await driver!.sleep(500);
      }
    }, driver);

    // === 6. 滑动操作 ===
    await step('滑动操作', async () => {
      const screen = info.screenSize;
      // 上滑
      await driver!.swipe(
        { x: screen.width / 2, y: screen.height * 0.7 },
        { x: screen.width / 2, y: screen.height * 0.3 },
        300
      );
      await driver!.sleep(300);
      // 下滑
      await driver!.swipe(
        { x: screen.width / 2, y: screen.height * 0.3 },
        { x: screen.width / 2, y: screen.height * 0.7 },
        300
      );
      await driver!.sleep(300);
    }, driver);

    // === 7. 截图取证 ===
    await step('截图取证', async () => {
      const ss = await driver!.takeScreenshot();
      if (!ss || ss.length < 1000) throw new Error('截图无效（小于 1KB）');
    }, driver);

    // === 8. 停止应用 ===
    await step('停止应用', async () => {
      await appMan.stop(bundleName);
    }, driver);

  } catch (e: any) {
    // 设备连接级别的异常（非步骤内异常）
    if (steps.length === 0) {
      steps.push({
        name: '设备连接',
        status: 'failed',
        duration: 0,
        error: e.message || '未知连接错误',
        detail: '请检查 HDC 连接状态和 DEVICE_ID 配置',
      });
    }
  } finally {
    if (driver) {
      try { await driver.disconnect(); } catch { /* ignore */ }
    }
  }

  const passed = steps.filter(s => s.status === 'passed').length;
  const failed = steps.filter(s => s.status === 'failed').length;

  const result: RunTestResult = {
    total: steps.length,
    passed,
    failed,
    duration: Date.now() - startTime,
    steps,
    deviceId,
    deviceName: 'HarmonyOS Device',
    bundleName,
    timestamp: new Date().toISOString(),
  };

  res.json({ success: true, data: result });
});

export default router;
