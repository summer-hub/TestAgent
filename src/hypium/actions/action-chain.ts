import { Element, Locator, Point } from '@core/types/element.type';
import { ElementOperationError } from '@core/errors';
import type { IDriver } from '@core/interfaces/driver.interface';

/**
 * 动作类型枚举
 */
export enum ActionType {
  CLICK = 'click',
  LONG_CLICK = 'long_click',
  DOUBLE_CLICK = 'double_click',
  INPUT_TEXT = 'input_text',
  CLEAR_TEXT = 'clear_text',
  SWIPE = 'swipe',
  PRESS_BACK = 'press_back',
  PRESS_HOME = 'press_home',
  WAIT = 'wait',
  SCREENSHOT = 'screenshot',
  SHELL = 'shell',
  CUSTOM = 'custom',
}

/**
 * 动作定义
 */
export interface ActionDefinition {
  /** 动作类型 */
  type: ActionType;
  /** 目标元素 */
  target?: Element | Locator;
  /** 动作参数 */
  params?: Record<string, any>;
  /** 前置延迟（毫秒） */
  preDelay?: number;
  /** 后置延迟（毫秒） */
  postDelay?: number;
  /** 超时时间 */
  timeout?: number;
  /** 描述 */
  description?: string;
}

/**
 * 动作执行结果
 */
export interface ActionResult {
  /** 动作类型 */
  type: ActionType;
  /** 是否成功 */
  success: boolean;
  /** 执行耗时 */
  duration: number;
  /** 错误信息 */
  error?: string;
  /** 结果数据 */
  data?: any;
}

/**
 * 动作链配置
 */
export interface ActionChainConfig {
  /** 默认前置延迟（毫秒） */
  defaultPreDelay: number;
  /** 默认后置延迟（毫秒） */
  defaultPostDelay: number;
  /** 执行失败是否继续 */
  continueOnError: boolean;
}

/**
 * ActionChain - 动作链
 * 支持链式调用、嵌套、前后延迟
 *
 * @example
 * ```ts
 * const chain = new ActionChain(driver);
 * const results = await chain
 *   .click(loginButton)
 *   .wait(500)
 *   .inputText(usernameField, 'admin')
 *   .inputText(passwordField, '123456')
 *   .click(submitButton)
 *   .execute();
 * ```
 */
export class ActionChain {
  private driver: IDriver;
  private actions: ActionDefinition[] = [];
  private config: ActionChainConfig;
  private nestedChains: ActionChain[] = [];

  constructor(driver: IDriver, config?: Partial<ActionChainConfig>) {
    this.driver = driver;
    this.config = {
      defaultPreDelay: 500,
      defaultPostDelay: 500,
      continueOnError: false,
      ...config,
    };
  }

  /**
   * 点击
   */
  click(element: Element | Locator, options?: { preDelay?: number; postDelay?: number }): this {
    this.actions.push({
      type: ActionType.CLICK,
      target: element,
      preDelay: options?.preDelay,
      postDelay: options?.postDelay,
    });
    return this;
  }

  /**
   * 长按
   */
  longClick(element: Element | Locator, duration?: number): this {
    this.actions.push({
      type: ActionType.LONG_CLICK,
      target: element,
      params: { duration: duration || 1000 },
    });
    return this;
  }

  /**
   * 双击
   */
  doubleClick(element: Element | Locator): this {
    this.actions.push({
      type: ActionType.DOUBLE_CLICK,
      target: element,
    });
    return this;
  }

  /**
   * 输入文本
   */
  inputText(element: Element | Locator, text: string): this {
    this.actions.push({
      type: ActionType.INPUT_TEXT,
      target: element,
      params: { text },
    });
    return this;
  }

  /**
   * 清空文本
   */
  clearText(element: Element | Locator): this {
    this.actions.push({
      type: ActionType.CLEAR_TEXT,
      target: element,
    });
    return this;
  }

  /**
   * 滑动
   */
  swipe(start: Point, end: Point, duration?: number): this {
    this.actions.push({
      type: ActionType.SWIPE,
      params: { start, end, duration },
    });
    return this;
  }

  /**
   * 按返回键
   */
  pressBack(): this {
    this.actions.push({ type: ActionType.PRESS_BACK });
    return this;
  }

  /**
   * 按 Home 键
   */
  pressHome(): this {
    this.actions.push({ type: ActionType.PRESS_HOME });
    return this;
  }

  /**
   * 等待
   */
  wait(ms: number): this {
    this.actions.push({
      type: ActionType.WAIT,
      params: { duration: ms },
    });
    return this;
  }

  /**
   * 截图
   */
  screenshot(): this {
    this.actions.push({ type: ActionType.SCREENSHOT });
    return this;
  }

  /**
   * 执行 Shell 命令
   */
  shell(command: string): this {
    this.actions.push({
      type: ActionType.SHELL,
      params: { command },
    });
    return this;
  }

  /**
   * 自定义动作
   */
  custom(action: (driver: IDriver) => Promise<any>, description?: string): this {
    this.actions.push({
      type: ActionType.CUSTOM,
      params: { handler: action },
      description,
    });
    return this;
  }

  /**
   * 嵌套动作链
   */
  nest(chain: ActionChain): this {
    this.nestedChains.push(chain);
    return this;
  }

  /**
   * 执行所有动作
   */
  async execute(): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    // 执行当前链的动作
    for (const action of this.actions) {
      const preDelay = action.preDelay ?? this.config.defaultPreDelay;
      const postDelay = action.postDelay ?? this.config.defaultPostDelay;

      // 前置延迟
      if (preDelay > 0) {
        await this.driver.sleep(preDelay);
      }

      // 执行动作
      const result = await this.executeAction(action);
      results.push(result);

      // 执行失败处理
      if (!result.success && !this.config.continueOnError) {
        break;
      }

      // 后置延迟
      if (postDelay > 0) {
        await this.driver.sleep(postDelay);
      }
    }

    // 执行嵌套链
    for (const nestedChain of this.nestedChains) {
      const nestedResults = await nestedChain.execute();
      results.push(...nestedResults);
    }

    return results;
  }

  /**
   * 获取动作列表
   */
  getActions(): ActionDefinition[] {
    return [...this.actions];
  }

  /**
   * 清空动作链
   */
  clear(): this {
    this.actions = [];
    this.nestedChains = [];
    return this;
  }

  /**
   * 获取动作数量
   */
  get length(): number {
    return this.actions.length;
  }

  // ============ 私有方法 ============

  private async executeAction(action: ActionDefinition): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      let data: any;

      switch (action.type) {
        case ActionType.CLICK:
          await this.driver.click(action.target as Element | Locator);
          break;
        case ActionType.LONG_CLICK:
          await this.driver.longClick(
            action.target as Element | Locator,
            action.params?.duration
          );
          break;
        case ActionType.DOUBLE_CLICK:
          await this.driver.doubleClick(action.target as Element | Locator);
          break;
        case ActionType.INPUT_TEXT:
          await this.driver.inputText(
            action.target as Element | Locator,
            action.params?.text
          );
          break;
        case ActionType.CLEAR_TEXT:
          await this.driver.clearText(action.target as Element | Locator);
          break;
        case ActionType.SWIPE:
          await this.driver.swipe(
            action.params?.start,
            action.params?.end,
            action.params?.duration
          );
          break;
        case ActionType.PRESS_BACK:
          await this.driver.pressBack();
          break;
        case ActionType.PRESS_HOME:
          await this.driver.pressHome();
          break;
        case ActionType.WAIT:
          await this.driver.sleep(action.params?.duration || 1000);
          break;
        case ActionType.SCREENSHOT:
          data = await this.driver.takeScreenshot();
          break;
        case ActionType.SHELL:
          data = await this.driver.executeShell(action.params?.command);
          break;
        case ActionType.CUSTOM:
          data = await action.params?.handler(this.driver);
          break;
        default:
          throw new ElementOperationError(`Unknown action type: ${action.type}`);
      }

      return {
        type: action.type,
        success: true,
        duration: Date.now() - startTime,
        data,
      };
    } catch (error) {
      return {
        type: action.type,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * HypiumActions - 高级动作封装
 * 提供更高级的动作组合
 */
export class HypiumActions {
  private driver: IDriver;

  constructor(driver: IDriver) {
    this.driver = driver;
  }

  /**
   * 导航到指定页面
   */
  navigateTo(bundleName: string, abilityName: string): ActionChain {
    return new ActionChain(this.driver)
      .custom(async (driver) => {
        await driver.startApp(bundleName, abilityName);
      }, `Navigate to ${bundleName}/${abilityName}`);
  }

  /**
   * 填写表单
   */
  fillForm(fields: Array<{ element: Element | Locator; value: string }>): ActionChain {
    const chain = new ActionChain(this.driver);
    for (const field of fields) {
      chain.clearText(field.element).inputText(field.element, field.value);
    }
    return chain;
  }

  /**
   * 执行动作链
   */
  executeChain(chain: ActionChain): Promise<ActionResult[]> {
    return chain.execute();
  }

  /**
   * 创建新的动作链
   */
  createChain(config?: Partial<ActionChainConfig>): ActionChain {
    return new ActionChain(this.driver, config);
  }
}
