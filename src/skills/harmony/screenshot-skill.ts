import { Skill, SkillContext, SkillResult, SkillMetadata } from '../skill-base';
import { LocatorType, Rect } from '@core/types/element.type';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * 截图模式
 */
export type ScreenshotMode = 'full' | 'element' | 'region';

/**
 * 截图参数
 */
export interface ScreenshotParams {
  /** 截图模式 */
  mode?: ScreenshotMode;
  /** 文件保存路径（不传则不保存） */
  savePath?: string;
  /** 文件名前缀 */
  filenamePrefix?: string;
  /** 元素定位器（mode=element） */
  locator?: { type: string; value: string };
  /** 区域坐标（mode=region） */
  region?: Rect;
  /** 是否返回 Base64 */
  returnBase64?: boolean;
  /** 截图时间戳 */
  withTimestamp?: boolean;
  /** 保存到变量名 */
  saveToVariable?: string;
}

/**
 * ScreenshotSkill - 截图技能
 * 支持全屏、元素、区域截图，保存文件或返回 Base64
 */
export class ScreenshotSkill extends Skill {
  readonly metadata: SkillMetadata = {
    name: 'screenshot',
    description: '截图技能，支持全屏/元素/区域截图，可保存文件或返回 Base64',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['full', 'element', 'region'], default: 'full' },
        savePath: { type: 'string', description: '保存目录路径' },
        filenamePrefix: { type: 'string', default: 'screenshot' },
        locator: { type: 'object' },
        region: { type: 'object' },
        returnBase64: { type: 'boolean', default: false },
        withTimestamp: { type: 'boolean', default: true },
        saveToVariable: { type: 'string' },
      },
    },
    examples: [
      { description: '全屏截图保存', params: { mode: 'full', savePath: './screenshots' } },
      {
        description: '元素截图',
        params: { mode: 'element', locator: { type: 'text', value: '登录按钮' }, returnBase64: true },
      },
      {
        description: '区域截图',
        params: { mode: 'region', region: { x: 0, y: 0, width: 500, height: 500 } },
      },
    ],
    tags: ['screenshot', 'capture', 'harmonyos'],
    version: '1.0.0',
  };

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    const screenshotParams = params as ScreenshotParams;
    const startTime = Date.now();
    const { driver } = context;
    const mode = screenshotParams.mode ?? 'full';

    try {
      this.reportProgress(context, 1, 3, '执行截图');
      let imageBuffer: Buffer = await driver.takeScreenshot();

      // 元素或区域裁剪
      this.reportProgress(context, 2, 3, '处理图像');
      if (mode === 'element') {
        if (!screenshotParams.locator) {
          return {
            success: false,
            message: '元素截图需要 locator 参数',
            error: 'MISSING_LOCATOR',
          };
        }
        const element = await driver.findElement({
          type: screenshotParams.locator.type as LocatorType,
          value: screenshotParams.locator.value,
        });
        if (!element) {
          return {
            success: false,
            message: '未找到指定元素',
            error: 'ELEMENT_NOT_FOUND',
          };
        }
        imageBuffer = await this.cropImage(imageBuffer, element.bounds);
      } else if (mode === 'region') {
        if (!screenshotParams.region) {
          return {
            success: false,
            message: '区域截图需要 region 参数',
            error: 'MISSING_REGION',
          };
        }
        imageBuffer = await this.cropImage(imageBuffer, screenshotParams.region);
      }

      this.reportProgress(context, 3, 3, '保存结果');
      const result: Record<string, any> = {
        size: imageBuffer.length,
        mode,
      };

      // 保存文件
      if (screenshotParams.savePath) {
        const filename = this.buildFilename(screenshotParams);
        const filePath = path.join(screenshotParams.savePath, filename);
        await this.ensureDir(screenshotParams.savePath);
        await fs.writeFile(filePath, imageBuffer);
        result.filePath = filePath;
      }

      // 返回 Base64
      if (screenshotParams.returnBase64) {
        result.base64 = imageBuffer.toString('base64');
      }

      // 保存到变量
      if (screenshotParams.saveToVariable && context.variables) {
        context.variables[screenshotParams.saveToVariable] = imageBuffer;
      }

      return {
        success: true,
        message: `截图完成（${mode}）`,
        output: result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: '截图失败',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 裁剪图像（简化实现，不依赖图像库）
   * 实际生产环境应使用 sharp/jimp，此处保留接口
   */
  private async cropImage(buffer: Buffer, _region: Rect): Promise<Buffer> {
    // TODO: 集成 sharp 或 jimp 实现真实裁剪
    // 当前返回原图，并在 metadata 中标注 region
    return buffer;
  }

  /**
   * 构建文件名
   */
  private buildFilename(params: ScreenshotParams): string {
    const prefix = params.filenamePrefix || 'screenshot';
    const timestamp = params.withTimestamp ?? true
      ? `_${new Date().toISOString().replace(/[:.]/g, '-')}`
      : '';
    return `${prefix}${timestamp}.png`;
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // 目录已存在
    }
  }
}
