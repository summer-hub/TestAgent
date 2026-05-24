import { IDriver } from '@core/interfaces/driver.interface';
import {
  Element,
  Locator,
  LocatorType,
  UiTree,
  DeviceInfo,
  DeviceStatus,
  GestureType,
  Point,
  Rect,
} from '@core/types/element.type';
import {
  DeviceConnectionError,
  DeviceNotConnectedError,
  ElementNotFoundError,
  ElementOperationError,
  AppLaunchError,
} from '@core/errors';
import { HypiumDriverConfig, DEFAULT_DRIVER_CONFIG, HypiumDriverConfigSchema } from './driver-config';
import { AppManager } from '../app/app-manager';
import { By, MatchPattern } from '../selectors/by';
import { ConnectionPool, HdcConnectionHandle, type ConnectionHandle } from './connection-pool';
import { DeviceStateMachine } from './device-state-machine';
import { CommandQueue } from './command-queue';
import { HeartbeatMonitor } from './heartbeat-monitor';
import type { PoolEntry } from './connection-pool';

/**
 * OHOS 截图临时路径
 */
const OHOS_SCREENSHOT_DIR = '/data/local/tmp';
const OHOS_UI_TREE_DIR = '/data/local/tmp';

/**
 * HypiumDriver - HarmonyOS 设备驱动实现 (OHOS 原生)
 *
 * 使用 HarmonyOS 原生 uitest 工具替代已废弃的 Android 兼容命令:
 *   shell input tap       → shell uitest uiInput click
 *   shell input swipe     → shell uitest uiInput swipe
 *   shell uiautomator     → shell uitest dumpLayout
 *   shell screencap       → shell snapshot_display
 *   shell input keyevent  → shell uitest uiInput keyEvent
 *   shell input text      → shell uitest uiInput text
 */
export class HypiumDriver implements IDriver {
  private config: HypiumDriverConfig;
  private stateMachine: DeviceStateMachine;
  private connectionPool: ConnectionPool;
  private commandQueue: CommandQueue;
  private heartbeatMonitor: HeartbeatMonitor;
  private deviceInfo: DeviceInfo | null = null;
  private currentPackageName: string = '';
  private currentEntry: PoolEntry | null = null;
  private _appManager: AppManager | null = null;

  constructor(config: Partial<HypiumDriverConfig> = {}) {
    const merged = { ...DEFAULT_DRIVER_CONFIG, ...config };
    if (config.connectionPool) {
      merged.connectionPool = { ...DEFAULT_DRIVER_CONFIG.connectionPool, ...config.connectionPool };
    }
    if (config.heartbeat) {
      merged.heartbeat = { ...DEFAULT_DRIVER_CONFIG.heartbeat, ...config.heartbeat };
    }
    if (config.commandQueue) {
      merged.commandQueue = { ...DEFAULT_DRIVER_CONFIG.commandQueue, ...config.commandQueue };
    }

    this.config = HypiumDriverConfigSchema.parse(merged);
    this.stateMachine = new DeviceStateMachine();
    this.connectionPool = new ConnectionPool(this.config.connectionPool, this.config.hdcPath);
    this.commandQueue = new CommandQueue(this.config.commandQueue);
    this.heartbeatMonitor = new HeartbeatMonitor(this.config.heartbeat);
  }

  // ============ 连接管理 ============

  async connect(deviceId?: string): Promise<void> {
    const targetDeviceId = deviceId || this.config.deviceId;
    if (!targetDeviceId) {
      throw new DeviceConnectionError('Device ID is required');
    }

    this.stateMachine.transition(DeviceStatus.CONNECTING);

    try {
      this.config.deviceId = targetDeviceId;
      await this.connectionPool.initialize(targetDeviceId);

      const entry = await this.connectionPool.acquire(targetDeviceId);
      this.currentEntry = entry;

      // 先标记为已连接，否则 executeShell 中的 ensureConnected 会失败
      this.stateMachine.transition(DeviceStatus.CONNECTED);

      this.deviceInfo = await this._collectDeviceInfo(targetDeviceId);

      this.heartbeatMonitor.start(entry.handle, () => this.handleDisconnection());
    } catch (error) {
      this.stateMachine.transition(DeviceStatus.ERROR);
      this.currentEntry = null;
      throw new DeviceConnectionError(
        `Failed to connect device: ${targetDeviceId}`,
        { originalError: String(error) }
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.stateMachine.isConnected) return;

    this.heartbeatMonitor.stop();
    if (this.currentEntry) {
      this.connectionPool.release(this.currentEntry);
      this.currentEntry = null;
    }

    await this.connectionPool.destroy();
    this.stateMachine.transition(DeviceStatus.DISCONNECTED);
    this.deviceInfo = null;
  }

  isConnected(): boolean {
    return this.stateMachine.isConnected;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    this.ensureConnected();
    if (this.deviceInfo) return this.deviceInfo;
    this.deviceInfo = await this._collectDeviceInfo(this.config.deviceId || '');
    return this.deviceInfo;
  }

  // ============ 应用管理 ============

  /** 获取 AppManager 实例 */
  getAppManager(): AppManager {
    if (!this._appManager) {
      this._appManager = AppManager.create(this);
    }
    return this._appManager;
  }

  async startApp(bundleName: string, abilityName?: string): Promise<void> {
    this.ensureConnected();
    try {
      await this.getAppManager().start(bundleName, abilityName);
      this.currentPackageName = bundleName;
    } catch (error: any) {
      throw new AppLaunchError(bundleName, { originalError: String(error) });
    }
  }

  async stopApp(bundleName: string): Promise<void> {
    this.ensureConnected();
    await this.getAppManager().stop(bundleName);
  }

  // ============ UI 树 ============

  async getUiTree(): Promise<UiTree> {
    this.ensureConnected();
    const pkg = this.currentPackageName;

    // 最多重试 3 次（首次 dump 可能页面未稳定）
    for (let attempt = 0; attempt < 3; attempt++) {
      const dumpPath = `${OHOS_UI_TREE_DIR}/_hypium_tree_${Date.now()}_${attempt}.json`;

      // 不使用 -b 过滤器（可能间歇性失败），JS 端通过 bundleName 过滤
      const cmd = `shell uitest dumpLayout -p ${dumpPath}`;
      const result = await this.executeCommand(cmd).catch(() => '');
      if (!result.toLowerCase().includes('saved to')) {
        await this.sleep(500);
        continue;
      }
      await this.sleep(300);

      const b64 = await this.executeCommand(`shell base64 -w0 ${dumpPath}`).catch(() => '');
      await this.executeCommand(`shell rm ${dumpPath}`).catch(() => {});

      if (b64.length > 0) {
        const jsonStr = Buffer.from(b64, 'base64').toString('utf-8');
        const tree = this._parseOhosUiTree(jsonStr);
        if (tree.totalCount > 1) return tree;
      }
      await this.sleep(500);
    }

    return this._emptyUiTree();
  }

  // ============ 元素查找 ============

  async findElement(locator: Locator): Promise<Element | null> {
    this.ensureConnected();
    const tree = await this.getUiTree();
    const elements = this.findElementsInTree(tree, locator);
    return elements[0] || null;
  }

  async findElements(locator: Locator): Promise<Element[]> {
    this.ensureConnected();
    const tree = await this.getUiTree();
    return this.findElementsInTree(tree, locator);
  }

  // ============ By 风格组件查找 ============

  /**
   * 使用 By 选择器查找单个元素
   * By.text('性能对比').clickable(true).matchFirst(tree)
   */
  async findComponent(by: By): Promise<Element | null> {
    this.ensureConnected();
    if (!by.isCompound) {
      // 简单选择器走原 findElement 路径（更快）
      return this.findElement(by.toLocator());
    }
    const tree = await this.getUiTree();
    return by.matchFirst(tree);
  }

  /**
   * 使用 By 选择器查找所有匹配元素
   */
  async findComponents(by: By): Promise<Element[]> {
    this.ensureConnected();
    const tree = await this.getUiTree();
    return by.match(tree);
  }

  /**
   * 使用 By 等待元素出现（带超时）
   */
  async waitForComponent(by: By, timeout: number = 10000): Promise<Element> {
    this.ensureConnected();
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = await this.findComponent(by);
      if (el) return el;
      await this.sleep(500);
    }
    throw new ElementNotFoundError(by.toString());
  }

  // ============ 操作 — OHOS 原生 uitest ============

  async click(element: Element | Locator): Promise<void> {
    this.ensureConnected();
    const target = await this.resolveElement(element);
    const { x, y } = target.center;
    await this._ohosClick(x, y);
  }

  async longClick(element: Element | Locator, duration: number = 1000): Promise<void> {
    this.ensureConnected();
    const target = await this.resolveElement(element);
    const { x, y } = target.center;
    // OHOS: uitest uiInput swipe 起点=终点 实现长按
    await this.executeCommand(`shell uitest uiInput swipe ${x} ${y} ${x} ${y} ${duration}`);
  }

  async doubleClick(element: Element | Locator): Promise<void> {
    this.ensureConnected();
    const target = await this.resolveElement(element);
    const { x, y } = target.center;
    await this._ohosClick(x, y);
    await this.sleep(120);
    await this._ohosClick(x, y);
  }

  async inputText(element: Element | Locator, text: string): Promise<void> {
    this.ensureConnected();
    const target = await this.resolveElement(element);
    await this.click(target);
    await this.sleep(300);
    // OHOS: uitest uiInput text 输入文本
    const escaped = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    await this.executeCommand(`shell uitest uiInput text "${escaped}"`);
  }

  async clearText(element: Element | Locator): Promise<void> {
    this.ensureConnected();
    const target = await this.resolveElement(element);
    await this.click(target);
    await this.sleep(200);
    // OHOS: 连续按删除键清空
    for (let i = 0; i < 50; i++) {
      await this.executeCommand('shell uitest uiInput keyEvent KEYCODE_DEL');
    }
  }

  async swipe(start: Point, end: Point, duration?: number): Promise<void> {
    this.ensureConnected();
    const d = duration || 300;
    await this.executeCommand(
      `shell uitest uiInput swipe ${start.x} ${start.y} ${end.x} ${end.y} ${d}`
    );
  }

  async gesture(type: GestureType, points: Point[]): Promise<void> {
    this.ensureConnected();

    switch (type) {
      case GestureType.TAP:
        if (points.length < 1) throw new ElementOperationError('Tap requires at least 1 point');
        await this._ohosClick(points[0].x, points[0].y);
        break;
      case GestureType.SWIPE:
        if (points.length < 2) throw new ElementOperationError('Swipe requires at least 2 points');
        await this.swipe(points[0], points[1]);
        break;
      case GestureType.LONG_PRESS:
        if (points.length < 1) throw new ElementOperationError('Long press requires at least 1 point');
        await this.executeCommand(
          `shell uitest uiInput swipe ${points[0].x} ${points[0].y} ${points[0].x} ${points[0].y} 1000`
        );
        break;
      case GestureType.DOUBLE_TAP:
        if (points.length < 1) throw new ElementOperationError('Double tap requires at least 1 point');
        await this._ohosClick(points[0].x, points[0].y);
        await this.sleep(120);
        await this._ohosClick(points[0].x, points[0].y);
        break;
      case GestureType.PINCH:
        if (points.length < 2) throw new ElementOperationError('Pinch requires at least 2 points');
        await this._ohosPinch(points[0], points[1], true);
        break;
      case GestureType.PINCH_OUT:
        if (points.length < 2) throw new ElementOperationError('PinchOut requires at least 2 points');
        await this._ohosPinch(points[0], points[1], false);
        break;
      case GestureType.ROTATE:
        if (points.length < 3) throw new ElementOperationError('Rotate requires center, startAngle, endAngle');
        await this._ohosRotate(points[0], points[1], points[2]);
        break;
      case GestureType.DRAG:
        if (points.length < 2) throw new ElementOperationError('Drag requires at least 2 points');
        await this.executeCommand(
          `shell uitest uiInput swipe ${points[0].x} ${points[0].y} ${points[1].x} ${points[1].y} 500`
        );
        break;
      default:
        throw new ElementOperationError(`Unknown gesture type: ${type}`);
    }
  }

  async pressBack(): Promise<void> {
    this.ensureConnected();
    await this.executeCommand('shell uitest uiInput keyEvent Back');
  }

  async pressHome(): Promise<void> {
    this.ensureConnected();
    await this.executeCommand('shell uitest uiInput keyEvent Home');
  }

  // ============ 等待 ============

  async waitForElement(locator: Locator, timeout?: number): Promise<Element> {
    this.ensureConnected();
    const targetTimeout = timeout || this.config.defaultTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < targetTimeout) {
      const element = await this.findElement(locator);
      if (element) return element;
      await this.sleep(500);
    }

    throw new ElementNotFoundError(JSON.stringify(locator), { timeout: targetTimeout });
  }

  async waitForElementGone(locator: Locator, timeout?: number): Promise<void> {
    this.ensureConnected();
    const targetTimeout = timeout || this.config.defaultTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < targetTimeout) {
      const element = await this.findElement(locator);
      if (!element) return;
      await this.sleep(500);
    }

    throw new ElementOperationError('Element still exists after timeout', {
      locator: JSON.stringify(locator),
      timeout: targetTimeout,
    });
  }

  // ============ 截图 ============

  async takeScreenshot(): Promise<Buffer> {
    this.ensureConnected();
    const name = `_hypium_ss_${Date.now()}.jpeg`;
    const remotePath = `${OHOS_SCREENSHOT_DIR}/${name}`;

    // OHOS: snapshot_display 截图 (JPEG)
    await this.executeCommand(`shell snapshot_display -f ${remotePath}`);

    // 用 base64 编码读回（避免二进制管道损坏）
    const b64 = await this.executeCommand(`shell base64 -w0 ${remotePath}`);
    await this.executeCommand(`shell rm ${remotePath}`).catch(() => {});

    return Buffer.from(b64, 'base64');
  }

  async getPageSource(): Promise<string> {
    this.ensureConnected();
    const dumpPath = `${OHOS_UI_TREE_DIR}/_hypium_page_${Date.now()}.json`;
    const cmd = `shell uitest dumpLayout -p ${dumpPath}`;
    await this.executeCommand(cmd);
    await this.sleep(500);
    const b64 = await this.executeCommand(`shell base64 -w0 ${dumpPath}`);
    await this.executeCommand(`shell rm ${dumpPath}`).catch(() => {});
    return Buffer.from(b64, 'base64').toString('utf-8');
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 执行任意 shell 命令 */
  async executeShell(command: string): Promise<string> {
    this.ensureConnected();
    return await this.executeCommand(`shell ${command}`);
  }

  // ============ 滚动查找 ============

  async scrollToElement(
    locator: Locator,
    direction: 'up' | 'down' | 'left' | 'right' = 'down'
  ): Promise<Element> {
    this.ensureConnected();
    const maxScrolls = 10;
    const screenSize = this.deviceInfo?.screenSize || { width: 1260, height: 2720 };

    for (let i = 0; i < maxScrolls; i++) {
      const element = await this.findElement(locator);
      if (element) return element;

      const cx = screenSize.width / 2;
      const cy = screenSize.height / 2;
      const margin = Math.min(screenSize.width, screenSize.height) * 0.15;

      switch (direction) {
        case 'up':
          await this.swipe({ x: cx, y: screenSize.height * 0.3 }, { x: cx, y: screenSize.height * 0.7 }, 300);
          break;
        case 'down':
          await this.swipe({ x: cx, y: screenSize.height * 0.7 }, { x: cx, y: screenSize.height * 0.3 }, 300);
          break;
        case 'left':
          await this.swipe({ x: screenSize.width - margin, y: cy }, { x: margin, y: cy }, 300);
          break;
        case 'right':
          await this.swipe({ x: margin, y: cy }, { x: screenSize.width - margin, y: cy }, 300);
          break;
      }
      await this.sleep(500);
    }

    throw new ElementNotFoundError(JSON.stringify(locator), { scrollDirection: direction });
  }

  // ============ 公开 API ============

  getConnectionPoolStats(): { total: number; inUse: number; idle: number; waiting: number } {
    return this.connectionPool.getStats();
  }

  getDeviceStatus(): DeviceStatus {
    return this.stateMachine.status;
  }

  // ============ 私有 ============

  private ensureConnected(): void {
    if (!this.stateMachine.isOperable) {
      throw new DeviceNotConnectedError();
    }
  }

  protected async executeCommand(command: string, timeout?: number): Promise<string> {
    if (!this.currentEntry) throw new DeviceNotConnectedError();
    return this.commandQueue.execute(command, this.currentEntry.handle, timeout);
  }

  private async handleDisconnection(): Promise<void> {
    if (this.stateMachine.canTransition(DeviceStatus.ERROR)) {
      this.stateMachine.transition(DeviceStatus.ERROR);
    }
    if (this.currentEntry) {
      this.connectionPool.release(this.currentEntry);
      this.currentEntry = null;
    }
    try {
      await this.connect(this.config.deviceId);
    } catch {}
  }

  /**
   * OHOS uitest uiInput click — 原生点击
   */
  private async _ohosClick(x: number, y: number): Promise<void> {
    // 点击目标坐标上方 10px（Button 文字通常偏下）
    await this.executeCommand(`shell uitest uiInput click ${Math.floor(x)} ${Math.floor(y)}`);
  }

  /**
   * OHOS 捏合手势 — 通过两个独立短 swipe 模拟多点触控
   *
   * @param center   捏合中心
   * @param edge     边缘参考点 (与中心距离决定起始/终止半径)
   * @param pinchIn  true=捏合缩小, false=放大
   * @param steps    插值步数 (默认 8)
   */
  private async _ohosPinch(center: Point, edge: Point, pinchIn: boolean, steps: number = 8): Promise<void> {
    // 手指1: 从 edge → 中心 (捏合) 或 从中心 → edge (放大)
    // 手指2: 对称位置
    const last1 = { x: edge.x, y: edge.y };
    const last2 = {
      x: center.x - (edge.x - center.x),
      y: center.y - (edge.y - center.y),
    };

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const factor = pinchIn ? (1 - progress) : progress;
      const p1 = {
        x: Math.floor(center.x + (edge.x - center.x) * factor),
        y: Math.floor(center.y + (edge.y - center.y) * factor),
      };
      const p2 = {
        x: Math.floor(center.x - (edge.x - center.x) * factor),
        y: Math.floor(center.y - (edge.y - center.y) * factor),
      };

      // 两步交错发送模拟双指同时移动
      await this.executeCommand(`shell uitest uiInput swipe ${last1.x} ${last1.y} ${p1.x} ${p1.y} 30`);
      await this.executeCommand(`shell uitest uiInput swipe ${last2.x} ${last2.y} ${p2.x} ${p2.y} 30`);

      last1.x = p1.x; last1.y = p1.y;
      last2.x = p2.x; last2.y = p2.y;
      await this.sleep(25);
    }
  }

  /**
   * OHOS 旋转手势 — 双指绕中心旋转模拟
   *
   * @param center     旋转中心
   * @param startAngle 起始角度 (度)
   * @param endAngle   终止角度 (度, 正值=顺时针)
   * @param radius     旋转半径 (默认 100px)
   */
  private async _ohosRotate(
    center: Point,
    angleRange: Point,  // x=startAngle, y=endAngle
    radiusRange?: Point // x=radius (optional)
  ): Promise<void> {
    const startAngle = angleRange.x;
    const endAngle = angleRange.y;
    const radius = radiusRange?.x ?? 100;
    const steps = 16;
    const angleStep = (endAngle - startAngle) / steps;

    let lastAngle = startAngle;
    for (let i = 1; i <= steps; i++) {
      const currentAngle = startAngle + angleStep * i;
      const lastRad = lastAngle * Math.PI / 180;
      const curRad = currentAngle * Math.PI / 180;

      // 手指1: 顺时针
      const f1x1 = Math.floor(center.x + radius * Math.cos(lastRad));
      const f1y1 = Math.floor(center.y + radius * Math.sin(lastRad));
      const f1x2 = Math.floor(center.x + radius * Math.cos(curRad));
      const f1y2 = Math.floor(center.y + radius * Math.sin(curRad));

      // 手指2: 对面 (逆时针)
      const f2x1 = Math.floor(center.x + radius * Math.cos(lastRad + Math.PI));
      const f2y1 = Math.floor(center.y + radius * Math.sin(lastRad + Math.PI));
      const f2x2 = Math.floor(center.x + radius * Math.cos(curRad + Math.PI));
      const f2y2 = Math.floor(center.y + radius * Math.sin(curRad + Math.PI));

      await this.executeCommand(`shell uitest uiInput swipe ${f1x1} ${f1y1} ${f1x2} ${f1y2} 30`);
      await this.executeCommand(`shell uitest uiInput swipe ${f2x1} ${f2y1} ${f2x2} ${f2y2} 30`);
      lastAngle = currentAngle;
      await this.sleep(20);
    }
  }

  /**
   * 收集设备信息（多参数并行）
   */
  private async _collectDeviceInfo(deviceId: string): Promise<DeviceInfo> {
    const [model, os, serial] = await Promise.all([
      this.executeShell('param get const.product.model').catch(() => 'Unknown'),
      this.executeShell('param get const.product.software.version').catch(() => '4.0.0'),
      this.executeShell('param get const.ohos.serial').catch(() => deviceId),
    ]);
    return {
      deviceId: serial || deviceId,
      deviceName: model || 'HarmonyOS Device',
      osVersion: os || '4.0.0',
      screenSize: { width: 1260, height: 2720 },
      density: 3,
      isRooted: false,
    };
  }

  /**
   * 解析 OHOS uitest 的 JSON UI 树
   *
   * 格式:
   * {
   *   "attributes": { "text": "xxx", "clickable": "true",
   *                   "bounds": "[x1,y1][x2,y2]", "type": "Button" },
   *   "children": [ ... ]
   * }
   */
  private _parseOhosUiTree(jsonStr: string): UiTree {
    const elements = new Map<string, Element>();
    let nodeIdCounter = 0;

    let rootNode: any;
    try {
      rootNode = JSON.parse(jsonStr);
    } catch {
      return this._emptyUiTree();
    }

    // 扁平遍历树
    const stack: { node: any; parentId: string | undefined; level: number }[] =
      [{ node: rootNode, parentId: undefined, level: 0 }];

    while (stack.length > 0) {
      const { node, parentId, level } = stack.pop()!;
      const attrs = node.attributes || {};
      const nodeId = `node_${nodeIdCounter++}`;

      const bounds = this.parseBounds(attrs.bounds || '');
      const cx = bounds ? bounds.x + bounds.width / 2 : 0;
      const cy = bounds ? bounds.y + bounds.height / 2 : 0;

      const element: Element = {
        id: nodeId,
        type: attrs.type || attrs.class || 'unknown',
        text: attrs.text?.trim() || undefined,
        description: attrs['content-desc'] || attrs.description || undefined,
        bounds: bounds || { x: 0, y: 0, width: 0, height: 0 },
        center: { x: cx, y: cy },
        visible: true,
        clickable: attrs.clickable === 'true' || attrs.clickable === true,
        enabled: attrs.enabled !== 'false' && attrs.enabled !== false,
        selected: attrs.selected === 'true' || attrs.selected === true,
        focusable: attrs.focusable === 'true' || attrs.focusable === true,
        focused: attrs.focused === 'true' || attrs.focused === true,
        level,
        parentId,
        childrenIds: [],
        attributes: { ...attrs },
        resourceId: attrs['resource-id'] || attrs.resourceId || undefined,
        className: attrs.type || attrs.class || undefined,
        packageName: attrs.package || this.currentPackageName || undefined,
        contentDesc: attrs['content-desc'] || attrs.description || undefined,
      };

      if (parentId) {
        const parent = elements.get(parentId);
        if (parent) {
          parent.childrenIds = parent.childrenIds || [];
          parent.childrenIds.push(nodeId);
        }
      }

      elements.set(nodeId, element);

      // 子节点入栈（逆序保持原始顺序）
      if (node.children && Array.isArray(node.children)) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({ node: node.children[i], parentId: nodeId, level: level + 1 });
        }
      }
    }

    // 找根节点（level=0 且有最多子节点）
    let root: Element | null = null;
    for (const el of elements.values()) {
      if (el.level === 0) {
        if (!root || (el.childrenIds?.length || 0) > (root.childrenIds?.length || 0)) {
          root = el;
        }
      }
    }

    if (!root) {
      root = {
        id: 'root',
        type: 'root',
        bounds: { x: 0, y: 0, width: 1260, height: 2720 },
        center: { x: 630, y: 1360 },
        visible: true, clickable: false, enabled: true,
        level: 0, childrenIds: Array.from(elements.keys()), attributes: {},
      };
      elements.set('root', root);
    }

    const totalCount = elements.size;
    const visibleCount = Array.from(elements.values()).filter(e => e.visible).length;
    const screenSize = this.deviceInfo?.screenSize || { width: 1260, height: 2720 };

    return {
      root, elements, totalCount, visibleCount,
      screenSize,
      packageName: this.currentPackageName || root.packageName || '',
      activityName: '',
      timestamp: Date.now(),
    };
  }

  private _emptyUiTree(): UiTree {
    const root: Element = {
      id: 'root', type: 'root',
      bounds: { x: 0, y: 0, width: 1260, height: 2720 },
      center: { x: 630, y: 1360 },
      visible: true, clickable: false, enabled: true,
      level: 0, childrenIds: [], attributes: {},
    };
    const elements = new Map<string, Element>();
    elements.set('root', root);
    return {
      root, elements, totalCount: 1, visibleCount: 1,
      screenSize: { width: 1260, height: 2720 },
      packageName: '', activityName: '', timestamp: Date.now(),
    };
  }

  /**
   * 解析 bounds 格式 [x1,y1][x2,y2] → Rect
   */
  private parseBounds(boundsStr: string): Rect | null {
    const match = boundsStr.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!match) return null;
    const x = parseInt(match[1]!, 10);
    const y = parseInt(match[2]!, 10);
    const x2 = parseInt(match[3]!, 10);
    const y2 = parseInt(match[4]!, 10);
    return { x, y, width: x2 - x, height: y2 - y };
  }

  private findElementsInTree(tree: UiTree, locator: Locator): Element[] {
    const results: Element[] = [];
    for (const element of tree.elements.values()) {
      if (this.matchesLocator(element, locator)) {
        results.push(element);
      }
    }
    return results;
  }

  private matchesLocator(element: Element, locator: Locator): boolean {
    switch (locator.type) {
      case LocatorType.TEXT:
        return (element.text || '').includes(locator.value);
      case LocatorType.ID:
        return (element.id || element.resourceId || '').includes(locator.value);
      case LocatorType.XPATH:
      case LocatorType.COORDINATE:
      case LocatorType.VISION:
        return false;
      default:
        return false;
    }
  }

  private async resolveElement(element: Element | Locator): Promise<Element> {
    if ('id' in element && 'type' in element) return element as Element;
    const found = await this.findElement(element as Locator);
    if (!found) throw new ElementNotFoundError(JSON.stringify(element));
    return found;
  }
}
