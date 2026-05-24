import { Skill, SkillContext, SkillResult, SkillMetadata } from '../skill-base';
import { LocatorType } from '@core/types/element.type';

/**
 * 导航方式
 */
export type NavigationMode = 'menu' | 'tab' | 'back' | 'home' | 'breadcrumb' | 'deep_link';

/**
 * 导航参数
 */
export interface NavigationParams {
  /** 导航方式 */
  mode: NavigationMode;
  /** 目标页面或菜单项 */
  target?: string;
  /** 导航路径（多级菜单/面包屑） */
  path?: string[];
  /** Deep link URL */
  deepLink?: string;
  /** 启动应用包名（与 deep_link 配合） */
  bundleName?: string;
  /** 等待页面加载的时间 */
  waitAfterNav?: number;
  /** 页面加载完成的标识 */
  completionIndicator?: string;
}

/**
 * NavigationSkill - 导航技能
 * 支持菜单/Tab/返回/Home/面包屑/Deep Link 多种导航方式
 */
export class NavigationSkill extends Skill {
  readonly metadata: SkillMetadata = {
    name: 'navigation',
    description: '应用内导航技能，支持菜单点击、Tab 切换、返回、Home、面包屑导航、Deep Link',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['menu', 'tab', 'back', 'home', 'breadcrumb', 'deep_link'],
        },
        target: { type: 'string' },
        path: { type: 'array', items: { type: 'string' } },
        deepLink: { type: 'string' },
        bundleName: { type: 'string' },
        waitAfterNav: { type: 'number', default: 1000 },
        completionIndicator: { type: 'string' },
      },
      required: ['mode'],
    },
    examples: [
      { description: '点击菜单项', params: { mode: 'menu', target: '设置' } },
      { description: '多级菜单导航', params: { mode: 'menu', path: ['我的', '设置', '通用'] } },
      { description: '切换 Tab', params: { mode: 'tab', target: '消息' } },
      { description: '返回上一级', params: { mode: 'back' } },
      { description: 'Deep Link', params: { mode: 'deep_link', deepLink: 'app://settings' } },
    ],
    tags: ['navigation', 'routing', 'harmonyos'],
    version: '1.0.0',
  };

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    const navParams = params as NavigationParams;
    const startTime = Date.now();
    const { driver } = context;
    const waitAfter = navParams.waitAfterNav ?? 1000;

    try {
      switch (navParams.mode) {
        case 'back':
          await driver.pressBack();
          break;

        case 'home':
          await driver.pressHome();
          break;

        case 'menu':
        case 'tab':
        case 'breadcrumb': {
          const items = navParams.path || (navParams.target ? [navParams.target] : []);
          if (items.length === 0) {
            return {
              success: false,
              message: '导航需要 target 或 path',
              error: 'MISSING_NAVIGATION_TARGET',
            };
          }

          for (const [index, item] of items.entries()) {
            this.reportProgress(context, index + 1, items.length, `导航到：${item}`);
            const element = await driver.findElement({
              type: LocatorType.TEXT,
              value: item,
            });
            if (!element) {
              return {
                success: false,
                message: `未找到导航项：${item}`,
                error: 'NAV_ITEM_NOT_FOUND',
                metadata: { reachedSteps: items.slice(0, index) },
              };
            }
            await driver.click(element);
            await this.delay(500);
          }
          break;
        }

        case 'deep_link': {
          if (!navParams.deepLink) {
            return {
              success: false,
              message: 'Deep Link 模式需要 deepLink 参数',
              error: 'MISSING_DEEP_LINK',
            };
          }

          // 通过 shell 命令唤起 Deep Link
          const cmd = navParams.bundleName
            ? `aa start -W -a ${navParams.deepLink} -b ${navParams.bundleName}`
            : `aa start -U ${navParams.deepLink}`;
          await driver.executeShell(cmd);
          break;
        }

        default:
          return {
            success: false,
            message: `不支持的导航模式：${navParams.mode}`,
            error: 'UNSUPPORTED_NAVIGATION_MODE',
          };
      }

      // 等待导航完成
      await this.delay(waitAfter);

      // 验证完成
      if (navParams.completionIndicator) {
        const indicator = await driver.findElement({
          type: LocatorType.TEXT,
          value: navParams.completionIndicator,
        });
        if (!indicator) {
          return {
            success: false,
            message: `未检测到完成标识：${navParams.completionIndicator}`,
            error: 'NAVIGATION_NOT_COMPLETED',
            duration: Date.now() - startTime,
          };
        }
      }

      return {
        success: true,
        message: `导航完成：${navParams.mode}`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: '导航失败',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }
}
