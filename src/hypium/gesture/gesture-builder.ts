/**
 * GestureBuilder — 手势动作链流式构建器
 *
 * 支持顺序链接多个手势动作，适用于复杂自动化场景:
 *   1. 滑动 → 等待 → 点击 → 输入 → 返回
 *   2. 缩放 → 旋转 → 拖拽
 *
 * 用法:
 * ```typescript
 * await GestureBuilder.create(driver)
 *   .swipe({ x: 100, y: 500 }, { x: 100, y: 200 })
 *   .wait(500)
 *   .tap({ x: 300, y: 400 })
 *   .wait(1000)
 *   .longPress({ x: 300, y: 400 }, 2000)
 *   .execute();
 * ```
 */

import type { HypiumDriver } from '../driver/hypium-driver';
import { Point } from '@core/types/element.type';

/** 手势动作类型 */
type GestureAction =
  | { type: 'tap'; point: Point }
  | { type: 'doubleTap'; point: Point }
  | { type: 'longPress'; point: Point; duration: number }
  | { type: 'swipe'; from: Point; to: Point; duration?: number }
  | { type: 'drag'; from: Point; to: Point }
  | { type: 'pinchIn'; center: Point; edge: Point; steps?: number }
  | { type: 'pinchOut'; center: Point; edge: Point; steps?: number }
  | { type: 'rotate'; center: Point; startAngle: number; endAngle: number; radius: number }
  | { type: 'wait'; ms: number }
  | { type: 'scrollTo'; locator: any; direction?: 'up' | 'down' | 'left' | 'right' }
  | { type: 'pressBack' }
  | { type: 'pressHome' };

export class GestureBuilder {
  private actions: GestureAction[] = [];
  private driver: HypiumDriver;

  private constructor(driver: HypiumDriver) {
    this.driver = driver;
  }

  /** 创建手势构建器 */
  static create(driver: HypiumDriver): GestureBuilder {
    return new GestureBuilder(driver);
  }

  // ============ 动作方法 ============

  /** 点击指定坐标 */
  tap(point: Point): this {
    this.actions.push({ type: 'tap', point });
    return this;
  }

  /** 双击 */
  doubleTap(point: Point): this {
    this.actions.push({ type: 'doubleTap', point });
    return this;
  }

  /** 长按 */
  longPress(point: Point, duration: number = 1000): this {
    this.actions.push({ type: 'longPress', point, duration });
    return this;
  }

  /** 滑动 */
  swipe(from: Point, to: Point, duration?: number): this {
    this.actions.push({ type: 'swipe', from, to, duration });
    return this;
  }

  /** 拖拽 */
  drag(from: Point, to: Point): this {
    this.actions.push({ type: 'drag', from, to });
    return this;
  }

  /** 双指捏合 (缩小) */
  pinchIn(center: Point, edge: Point, steps?: number): this {
    this.actions.push({ type: 'pinchIn', center, edge, steps });
    return this;
  }

  /** 双指放大 */
  pinchOut(center: Point, edge: Point, steps?: number): this {
    this.actions.push({ type: 'pinchOut', center, edge, steps });
    return this;
  }

  /**
   * 旋转手势
   * @param center 旋转中心
   * @param startAngle 起始角度 (度)
   * @param endAngle 终止角度 (度, 正=顺时针)
   * @param radius 旋转半径
   */
  rotate(center: Point, startAngle: number, endAngle: number, radius: number): this {
    this.actions.push({ type: 'rotate', center, startAngle, endAngle, radius });
    return this;
  }

  /** 等待 */
  wait(ms: number): this {
    this.actions.push({ type: 'wait', ms });
    return this;
  }

  /** 滚动到元素 (shell 层) */
  scrollToElement(locator: any, direction?: 'up' | 'down' | 'left' | 'right'): this {
    this.actions.push({ type: 'scrollTo', locator, direction });
    return this;
  }

  /** 按返回键 */
  pressBack(): this {
    this.actions.push({ type: 'pressBack' });
    return this;
  }

  /** 按主页键 */
  pressHome(): this {
    this.actions.push({ type: 'pressHome' });
    return this;
  }

  // ============ 执行 ============

  /** 清空动作链 */
  clear(): this {
    this.actions = [];
    return this;
  }

  /** 获取动作数 */
  get length(): number {
    return this.actions.length;
  }

  /** 依次执行所有动作 */
  async execute(): Promise<void> {
    for (const action of this.actions) {
      await this._runAction(action);
    }
  }

  private async _runAction(action: GestureAction): Promise<void> {
    const d = this.driver as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    switch (action.type) {
      case 'tap':
        await d._ohosClick(action.point.x, action.point.y);
        break;
      case 'doubleTap':
        await d._ohosClick(action.point.x, action.point.y);
        await this.driver.sleep(120);
        await d._ohosClick(action.point.x, action.point.y);
        break;
      case 'longPress':
        await this.driver.executeShell(
          `uitest uiInput swipe ${action.point.x} ${action.point.y} ${action.point.x} ${action.point.y} ${action.duration}`
        );
        break;
      case 'swipe':
        await this.driver.executeShell(
          `uitest uiInput swipe ${action.from.x} ${action.from.y} ${action.to.x} ${action.to.y} ${action.duration || 300}`
        );
        break;
      case 'drag':
        await this.driver.executeShell(
          `uitest uiInput swipe ${action.from.x} ${action.from.y} ${action.to.x} ${action.to.y} 500`
        );
        break;
      case 'pinchIn':
        await d._ohosPinch(action.center, action.edge, true, action.steps);
        break;
      case 'pinchOut':
        await d._ohosPinch(action.center, action.edge, false, action.steps);
        break;
      case 'rotate':
        await d._ohosRotate(action.center, { x: action.startAngle, y: action.endAngle }, { x: action.radius });
        break;
      case 'wait':
        await this.driver.sleep(action.ms);
        break;
      case 'scrollTo':
        await this.driver.scrollToElement(action.locator, action.direction);
        break;
      case 'pressBack':
        await this.driver.pressBack();
        break;
      case 'pressHome':
        await this.driver.pressHome();
        break;
    }
  }

  /** 生成人类可读的动作链描述 */
  describe(): string {
    const desc = this.actions.map(a => {
      switch (a.type) {
        case 'tap': return `tap(${a.point.x},${a.point.y})`;
        case 'doubleTap': return `doubleTap(${a.point.x},${a.point.y})`;
        case 'longPress': return `longPress(${a.point.x},${a.point.y},${a.duration}ms)`;
        case 'swipe': return `swipe(${a.from.x},${a.from.y}→${a.to.x},${a.to.y})`;
        case 'drag': return `drag(${a.from.x},${a.from.y}→${a.to.x},${a.to.y})`;
        case 'pinchIn': return `pinchIn(center=${a.center.x},${a.center.y})`;
        case 'pinchOut': return `pinchOut(center=${a.center.x},${a.center.y})`;
        case 'rotate': return `rotate(${a.startAngle}°→${a.endAngle}°)`;
        case 'wait': return `wait(${a.ms}ms)`;
        case 'scrollTo': return `scrollTo(direction=${a.direction || 'down'})`;
        case 'pressBack': return 'pressBack';
        case 'pressHome': return 'pressHome';
      }
    });
    return `GestureChain[${desc.join(' → ')}]`;
  }
}
