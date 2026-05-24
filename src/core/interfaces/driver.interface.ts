import { Element, Locator, UiTree, DeviceInfo, GestureType, Point } from '../types/element.type';

/**
 * Hypium 驱动接口
 * 定义与 HarmonyOS 设备交互的所有操作
 */
export interface IDriver {
  /** 设备连接 */
  connect(deviceId?: string): Promise<void>;

  /** 断开设备连接 */
  disconnect(): Promise<void>;

  /** 检查设备是否已连接 */
  isConnected(): boolean;

  /** 获取设备信息 */
  getDeviceInfo(): Promise<DeviceInfo>;

  /** 启动应用 */
  startApp(bundleName: string, abilityName?: string): Promise<void>;

  /** 停止应用 */
  stopApp(bundleName: string): Promise<void>;

  /** 获取当前页面 UI 树 */
  getUiTree(): Promise<UiTree>;

  /** 查找单个元素 */
  findElement(locator: Locator): Promise<Element | null>;

  /** 查找多个元素 */
  findElements(locator: Locator): Promise<Element[]>;

  /** 点击元素 */
  click(element: Element | Locator): Promise<void>;

  /** 长按元素 */
  longClick(element: Element | Locator, duration?: number): Promise<void>;

  /** 双击元素 */
  doubleClick(element: Element | Locator): Promise<void>;

  /** 输入文本 */
  inputText(element: Element | Locator, text: string): Promise<void>;

  /** 清空输入 */
  clearText(element: Element | Locator): Promise<void>;

  /** 滑动屏幕 */
  swipe(start: Point, end: Point, duration?: number): Promise<void>;

  /** 执行手势 */
  gesture(type: GestureType, points: Point[]): Promise<void>;

  /** 按返回键 */
  pressBack(): Promise<void>;

  /** 按 Home 键 */
  pressHome(): Promise<void>;

  /** 等待元素出现 */
  waitForElement(locator: Locator, timeout?: number): Promise<Element>;

  /** 等待元素消失 */
  waitForElementGone(locator: Locator, timeout?: number): Promise<void>;

  /** 截图 */
  takeScreenshot(): Promise<Buffer>;

  /** 获取页面源码 */
  getPageSource(): Promise<string>;

  /** 等待指定时间 */
  sleep(ms: number): Promise<void>;

  /** 执行 shell 命令 */
  executeShell(command: string): Promise<string>;

  /** 滚动查找元素 */
  scrollToElement(locator: Locator, direction?: 'up' | 'down' | 'left' | 'right'): Promise<Element>;
}
