import { Skill, SkillContext, SkillResult, SkillMetadata } from '../skill-base';
import { LocatorType, Element } from '@core/types/element.type';

/**
 * 滚动方向
 */
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/**
 * 滚动参数
 */
export interface ScrollParams {
  /** 滚动方向 */
  direction: ScrollDirection;
  /** 滚动到目标文本 */
  toText?: string;
  /** 滚动到目标元素的定位器 */
  toLocator?: { type: string; value: string };
  /** 最大滚动次数 */
  maxScrolls?: number;
  /** 每次滚动距离比例（0-1，相对屏幕） */
  distance?: number;
  /** 滚动持续时间（毫秒） */
  duration?: number;
  /** 滚动间隔（毫秒） */
  interval?: number;
  /** 边界检测：连续 N 次未变化则停止 */
  boundaryThreshold?: number;
}

/**
 * ScrollSkill - 滚动技能
 * 智能滚动查找、边界检测、可配置距离与速度
 */
export class ScrollSkill extends Skill {
  readonly metadata: SkillMetadata = {
    name: 'scroll',
    description: '智能滚动技能，支持滚动到指定元素、边界检测、自定义滚动参数',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        toText: { type: 'string' },
        toLocator: { type: 'object' },
        maxScrolls: { type: 'number', default: 10 },
        distance: { type: 'number', minimum: 0, maximum: 1, default: 0.6 },
        duration: { type: 'number', default: 500 },
        interval: { type: 'number', default: 300 },
        boundaryThreshold: { type: 'number', default: 2 },
      },
      required: ['direction'],
    },
    examples: [
      { description: '向下滚动查找文本', params: { direction: 'down', toText: '隐私政策', maxScrolls: 15 } },
      { description: '简单向上滚动 3 次', params: { direction: 'up', maxScrolls: 3 } },
    ],
    tags: ['scroll', 'gesture', 'harmonyos'],
    version: '1.0.0',
  };

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    const scrollParams = params as ScrollParams;
    const startTime = Date.now();
    const { driver } = context;

    const maxScrolls = scrollParams.maxScrolls ?? 10;
    const distance = scrollParams.distance ?? 0.6;
    const duration = scrollParams.duration ?? 500;
    const interval = scrollParams.interval ?? 300;
    const boundaryThreshold = scrollParams.boundaryThreshold ?? 2;

    try {
      const device = await driver.getDeviceInfo();
      const { width, height } = device.screenSize;

      // 计算滚动起止点
      const center = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
      const dx = Math.floor(width * distance);
      const dy = Math.floor(height * distance);

      const scrollVectors: Record<ScrollDirection, { start: { x: number; y: number }; end: { x: number; y: number } }> = {
        // 向下滚动：手指从下往上滑
        down: { start: { x: center.x, y: center.y + dy / 2 }, end: { x: center.x, y: center.y - dy / 2 } },
        up: { start: { x: center.x, y: center.y - dy / 2 }, end: { x: center.x, y: center.y + dy / 2 } },
        left: { start: { x: center.x + dx / 2, y: center.y }, end: { x: center.x - dx / 2, y: center.y } },
        right: { start: { x: center.x - dx / 2, y: center.y }, end: { x: center.x + dx / 2, y: center.y } },
      };

      const vec = scrollVectors[scrollParams.direction];
      let boundaryCount = 0;
      let lastPageHash = await this.getPageHash(context);
      let foundElement: Element | null = null;

      for (let i = 0; i < maxScrolls; i++) {
        this.reportProgress(context, i + 1, maxScrolls, `滚动第 ${i + 1} 次`);

        // 检查目标是否已经在视图中
        if (scrollParams.toText) {
          foundElement = await driver.findElement({
            type: LocatorType.TEXT,
            value: scrollParams.toText,
          });
          if (foundElement && foundElement.visible) {
            return {
              success: true,
              message: `滚动到目标：${scrollParams.toText}`,
              output: { element: foundElement, scrollCount: i },
              duration: Date.now() - startTime,
            };
          }
        }

        if (scrollParams.toLocator) {
          foundElement = await driver.findElement({
            type: scrollParams.toLocator.type as LocatorType,
            value: scrollParams.toLocator.value,
          });
          if (foundElement && foundElement.visible) {
            return {
              success: true,
              message: '滚动到目标元素',
              output: { element: foundElement, scrollCount: i },
              duration: Date.now() - startTime,
            };
          }
        }

        // 执行滚动
        await driver.swipe(vec.start, vec.end, duration);
        await this.delay(interval);

        // 边界检测
        const newPageHash = await this.getPageHash(context);
        if (newPageHash === lastPageHash) {
          boundaryCount++;
          if (boundaryCount >= boundaryThreshold) {
            // 到达边界
            if (scrollParams.toText || scrollParams.toLocator) {
              return {
                success: false,
                message: '已到达边界但未找到目标',
                error: 'TARGET_NOT_FOUND',
                output: { scrollCount: i + 1, boundaryReached: true },
                duration: Date.now() - startTime,
              };
            }
            return {
              success: true,
              message: '已到达边界',
              output: { scrollCount: i + 1, boundaryReached: true },
              duration: Date.now() - startTime,
            };
          }
        } else {
          boundaryCount = 0;
          lastPageHash = newPageHash;
        }
      }

      // 无目标：滚动指定次数完成
      if (!scrollParams.toText && !scrollParams.toLocator) {
        return {
          success: true,
          message: `已完成 ${maxScrolls} 次滚动`,
          output: { scrollCount: maxScrolls },
          duration: Date.now() - startTime,
        };
      }

      return {
        success: false,
        message: `滚动 ${maxScrolls} 次后未找到目标`,
        error: 'TARGET_NOT_FOUND',
        output: { scrollCount: maxScrolls },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: '滚动失败',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 计算页面哈希用于边界检测
   */
  private async getPageHash(context: SkillContext): Promise<string> {
    try {
      const source = await context.driver.getPageSource();
      // 简单哈希：取前 500 字符
      return source.substring(0, 500);
    } catch {
      return Math.random().toString();
    }
  }
}
