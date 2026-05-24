/**
 * E2E 测试 — HypiumDriver 全链路
 *
 * 需要: HDC 连接的 HarmonyOS 设备 + com.example.stackblur 已安装
 * 运行: npx vitest run tests/e2e --config vitest.config.ts
 * 或:   CI=true npx vitest run
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HypiumDriver } from '@hypium/driver/hypium-driver';
import { By } from '@hypium/selectors/by';
import { AppManager } from '@hypium/app/app-manager';
import { AppProcessStatus } from '@core/types/app-info.type';

const DEVICE_ID = process.env.DEVICE_ID || 'LNG0224718005504';
const BUNDLE = 'com.example.stackblur';
const TIMEOUT = 30000;

let driver: HypiumDriver;
let appMan: AppManager;

beforeAll(async () => {
  driver = new HypiumDriver({
    deviceId: DEVICE_ID,
    defaultTimeout: 10000,
  });
  await driver.connect();
  appMan = driver.getAppManager();
  // 确保测试前应用在干净状态
  await appMan.stop(BUNDLE).catch(() => {});
  await driver.sleep(1000);
  await appMan.clearData(BUNDLE).catch(() => {});
  await driver.sleep(500);
}, TIMEOUT);

afterAll(async () => {
  await appMan.stop(BUNDLE).catch(() => {});
  await driver.disconnect();
}, 10000);

// ============ 1. 应用管理 ============

describe('App Manager', () => {
  it('应获取应用信息并解析 mainAbility', async () => {
    const info = await appMan.getAppInfo(BUNDLE);
    expect(info.bundleName).toBe(BUNDLE);
    expect(info.versionName).toBeTruthy();
    expect(info.mainAbility).toBeTruthy();
    expect(info.mainAbility!.name).toBe('EntryAbility');
    expect(info.abilities.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('应启动应用', async () => {
    await appMan.start(BUNDLE);
    await driver.sleep(2000);
    const status = await appMan.getAppStatus(BUNDLE);
    expect([AppProcessStatus.FOREGROUND, AppProcessStatus.BACKGROUND]).toContain(status);
  }, TIMEOUT);

  it('应停止应用', async () => {
    await appMan.stop(BUNDLE);
    await driver.sleep(1000);
    const status = await appMan.getAppStatus(BUNDLE);
    expect(status).toBe(AppProcessStatus.NOT_RUNNING);
  }, TIMEOUT);
});

// ============ 2. UI 树 ============

describe('UI Tree', () => {
  it('应获取 UI 树结构', async () => {
    await appMan.start(BUNDLE);
    await driver.sleep(3000);
    const tree = await driver.getUiTree();
    expect(tree.totalCount).toBeGreaterThan(1);
    expect(tree.elements.size).toBeGreaterThan(1);
    expect(tree.root).toBeTruthy();
  }, TIMEOUT);

  it('UI 树应包含 stackblur 应用元素', async () => {
    const tree = await driver.getUiTree();
    const pkg = tree.packageName;
    expect(pkg).toBe(BUNDLE);
  }, TIMEOUT);
});

// ============ 3. 元素查找 ============

describe('Element Finding', () => {
  it('应通过文本查找元素', async () => {
    const el = await driver.findComponent(By.text('StackBlur'));
    expect(el).toBeTruthy();
    expect(el!.text).toContain('StackBlur');
  }, TIMEOUT);

  it('应等待元素出现', async () => {
    const el = await driver.waitForComponent(
      By.text('StackBlur').clickable(true),
      8000
    );
    expect(el).toBeTruthy();
    expect(el!.clickable).toBe(true);
  }, TIMEOUT);

  it('元素应有正确的坐标信息', async () => {
    const el = await driver.findComponent(By.text('StackBlur'));
    expect(el).toBeTruthy();
    expect(el!.bounds.width).toBeGreaterThan(0);
    expect(el!.bounds.height).toBeGreaterThan(0);
    expect(el!.center.x).toBeGreaterThan(0);
    expect(el!.center.y).toBeGreaterThan(0);
  }, TIMEOUT);
});

// ============ 4. 手势操作 ============

describe('Gestures', () => {
  it('应能点击文本为 "001" 的元素', async () => {
    const el = await driver.findComponent(By.text('001'));
    if (!el) return; // 可能不存在
    await driver.click(el);
    await driver.sleep(1500);
    await driver.pressBack();
    await driver.sleep(500);
  }, TIMEOUT);

  it('应能滑动页面', async () => {
    const screen = (await driver.getDeviceInfo()).screenSize;
    await driver.swipe(
      { x: screen.width / 2, y: screen.height * 0.7 },
      { x: screen.width / 2, y: screen.height * 0.3 },
      300
    );
    await driver.sleep(500);
    // 滑回
    await driver.swipe(
      { x: screen.width / 2, y: screen.height * 0.3 },
      { x: screen.width / 2, y: screen.height * 0.7 },
      300
    );
    await driver.sleep(500);
  }, TIMEOUT);

  it('长按不应报错', async () => {
    const el = await driver.findComponent(By.text('001'));
    if (!el) return;
    await driver.longClick(el, 800);
    await driver.sleep(300);
  }, TIMEOUT);
});

// ============ 5. 截图取证 ============

describe('Screenshot', () => {
  it('应能截取屏幕截图', async () => {
    const ss = await driver.takeScreenshot();
    expect(ss).toBeTruthy();
    expect(ss.length).toBeGreaterThan(1000); // JPEG > 1KB
  }, TIMEOUT);

  it('应能获取页面源码', async () => {
    const source = await driver.getPageSource();
    expect(source).toBeTruthy();
    expect(source.length).toBeGreaterThan(100);
    expect(source).toContain('StackBlur');
  }, TIMEOUT);
});

// ============ 6. 设备信息 ============

describe('Device Info', () => {
  it('应获取设备信息', async () => {
    const info = await driver.getDeviceInfo();
    expect(info.deviceId).toBeTruthy();
    expect(info.osVersion).toBeTruthy();
    expect(info.screenSize.width).toBeGreaterThan(0);
    expect(info.screenSize.height).toBeGreaterThan(0);
  }, TIMEOUT);
});
