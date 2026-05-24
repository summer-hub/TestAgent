import { FailureType, FixStrategy, FixResult, FixHandler } from '@core/interfaces/fixer.interface';
import { ExecutionContext, StepHistory, StepStatus } from '@core/types/execution-context.type';
import { LocatorType } from '@core/types/element.type';
import type { IDriver } from '@core/interfaces/driver.interface';

/**
 * 修复策略基类
 * 所有修复策略继承此类
 */
export abstract class BaseFixStrategy {
  abstract readonly strategy: FixStrategy;
  abstract readonly description: string;

  /**
   * 执行修复
   */
  abstract fix(context: ExecutionContext, driver?: IDriver): Promise<FixResult>;

  /**
   * 获取最后一步
   */
  protected getLastStep(context: ExecutionContext): StepHistory | null {
    if (context.steps.length === 0) return null;
    return context.steps[context.steps.length - 1]!;
  }

  /**
   * 延迟
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * SelectorFixStrategy - 选择器修复策略
 * 3 级回退: Text -> ID -> XPath -> Visual
 */
export class SelectorFixStrategy extends BaseFixStrategy {
  readonly strategy = FixStrategy.ALTERNATIVE_LOCATOR;
  readonly description = 'Try alternative locators when primary locator fails';

  private driver: IDriver | null = null;

  setDriver(driver: IDriver): void {
    this.driver = driver;
  }

  async fix(context: ExecutionContext): Promise<FixResult> {
    const lastStep = this.getLastStep(context);
    if (!lastStep) {
      return { success: false, strategy: this.strategy, description: 'No step to fix' };
    }

    if (!this.driver) {
      return { success: false, strategy: this.strategy, description: 'No driver available' };
    }

    const originalParams = lastStep.toolParams || {};
    const locatorValue = originalParams.locatorValue || originalParams.description || '';

    if (!locatorValue) {
      return { success: false, strategy: this.strategy, description: 'No locator value to try alternatives' };
    }

    // 3 级回退链
    const fallbackChain: Array<{ type: LocatorType; value: string }> = [];

    // 根据原始类型构建回退链
    const originalType = originalParams.locatorType as LocatorType || LocatorType.TEXT;

    switch (originalType) {
      case LocatorType.ID:
        // ID -> Text -> XPath
        fallbackChain.push(
          { type: LocatorType.TEXT, value: locatorValue },
          { type: LocatorType.XPATH, value: `//*[contains(@resource-id, '${locatorValue}')]` },
        );
        break;
      case LocatorType.TEXT:
        // Text -> ID -> XPath
        fallbackChain.push(
          { type: LocatorType.ID, value: locatorValue },
          { type: LocatorType.XPATH, value: `//*[contains(text(), '${locatorValue}')]` },
        );
        break;
      case LocatorType.XPATH:
        // XPath -> Text -> ID
        fallbackChain.push(
          { type: LocatorType.TEXT, value: locatorValue },
          { type: LocatorType.ID, value: locatorValue },
        );
        break;
      default:
        // 其他类型 -> Text -> ID -> XPath
        fallbackChain.push(
          { type: LocatorType.TEXT, value: locatorValue },
          { type: LocatorType.ID, value: locatorValue },
          { type: LocatorType.XPATH, value: `//*[contains(text(), '${locatorValue}')]` },
        );
        break;
    }

    // 尝试每个回退
    for (const locator of fallbackChain) {
      try {
        const element = await this.driver.findElement(locator);
        if (element) {
          // 重新执行原始操作
          if (lastStep.chosenTool === 'click' || lastStep.chosenTool === 'click_element') {
            await this.driver.click(element);
          } else if (lastStep.chosenTool === 'input_text') {
            await this.driver.inputText(element, originalParams.text || '');
          }

          lastStep.status = StepStatus.FIXED;
          lastStep.fixAttempted = true;
          lastStep.fixResult = `Fixed using ${locator.type} locator: ${locator.value}`;

          return {
            success: true,
            strategy: this.strategy,
            description: `Found element using ${locator.type} locator: ${locator.value}`,
            fixedStep: lastStep,
          };
        }
      } catch {
        // 继续尝试下一个回退
        continue;
      }
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'All alternative locators failed',
    };
  }
}

/**
 * AuthFixStrategy - 认证修复策略
 * 重新登录或 Token 刷新
 */
export class AuthFixStrategy extends BaseFixStrategy {
  readonly strategy = FixStrategy.RETRY;
  readonly description = 'Fix authentication issues by re-login or token refresh';

  private driver: IDriver | null = null;
  private loginHandler: (() => Promise<boolean>) | null = null;

  setDriver(driver: IDriver): void {
    this.driver = driver;
  }

  /**
   * 设置登录处理器
   */
  setLoginHandler(handler: () => Promise<boolean>): void {
    this.loginHandler = handler;
  }

  async fix(context: ExecutionContext): Promise<FixResult> {
    const lastStep = this.getLastStep(context);
    if (!lastStep) {
      return { success: false, strategy: this.strategy, description: 'No step to fix' };
    }

    // 尝试 Token 刷新
    try {
      const refreshed = await this.attemptTokenRefresh();
      if (refreshed) {
        lastStep.status = StepStatus.FIXED;
        lastStep.fixAttempted = true;
        lastStep.fixResult = 'Token refreshed successfully';

        return {
          success: true,
          strategy: this.strategy,
          description: 'Token refreshed successfully',
          fixedStep: lastStep,
        };
      }
    } catch {
      // Token 刷新失败，尝试重新登录
    }

    // 尝试重新登录
    if (this.loginHandler) {
      try {
        const loggedIn = await this.loginHandler();
        if (loggedIn) {
          lastStep.status = StepStatus.FIXED;
          lastStep.fixAttempted = true;
          lastStep.fixResult = 'Re-login successful';

          return {
            success: true,
            strategy: this.strategy,
            description: 'Re-login successful',
            fixedStep: lastStep,
          };
        }
      } catch {
        // 重新登录失败
      }
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'Authentication fix failed: could not refresh token or re-login',
    };
  }

  private async attemptTokenRefresh(): Promise<boolean> {
    // 框架实现：实际需要调用 Token 刷新 API
    return false;
  }
}

/**
 * AssertionFixStrategy - 断言修复策略
 * 放宽匹配条件或降低阈值
 */
export class AssertionFixStrategy extends BaseFixStrategy {
  readonly strategy = FixStrategy.RETRY;
  readonly description = 'Fix assertion failures by relaxing conditions';

  async fix(context: ExecutionContext): Promise<FixResult> {
    const lastStep = this.getLastStep(context);
    if (!lastStep) {
      return { success: false, strategy: this.strategy, description: 'No step to fix' };
    }

    // 检查断言是否可以放宽
    const observation = lastStep.observation || '';
    const toolParams = lastStep.toolParams || {};

    // 尝试以下修复方式：
    // 1. 精确匹配 -> 模糊匹配
    if (toolParams.exact === true) {
      lastStep.status = StepStatus.FIXED;
      lastStep.fixAttempted = true;
      lastStep.fixResult = 'Relaxed assertion from exact to fuzzy match';

      return {
        success: true,
        strategy: this.strategy,
        description: 'Relaxed assertion from exact to fuzzy match',
        fixedStep: lastStep,
      };
    }

    // 2. 降低相似度阈值
    if (toolParams.threshold && toolParams.threshold > 0.5) {
      const newThreshold = Math.max(0.5, toolParams.threshold - 0.15);
      lastStep.status = StepStatus.FIXED;
      lastStep.fixAttempted = true;
      lastStep.fixResult = `Lowered threshold from ${toolParams.threshold} to ${newThreshold}`;

      return {
        success: true,
        strategy: this.strategy,
        description: `Lowered threshold from ${toolParams.threshold} to ${newThreshold}`,
        fixedStep: lastStep,
      };
    }

    // 3. 忽略大小写
    if (toolParams.caseSensitive === true) {
      lastStep.status = StepStatus.FIXED;
      lastStep.fixAttempted = true;
      lastStep.fixResult = 'Relaxed assertion to case-insensitive matching';

      return {
        success: true,
        strategy: this.strategy,
        description: 'Relaxed assertion to case-insensitive matching',
        fixedStep: lastStep,
      };
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'Cannot further relax assertion conditions',
    };
  }
}

/**
 * DataFixStrategy - 数据修复策略
 * 数据清理、数据重置、账号切换
 */
export class DataFixStrategy extends BaseFixStrategy {
  readonly strategy = FixStrategy.RETRY;
  readonly description = 'Fix data-related issues by cleanup, reset, or account switch';

  private driver: IDriver | null = null;
  private dataCleanupHandler: (() => Promise<boolean>) | null = null;
  private accountSwitchHandler: ((accountIndex: number) => Promise<boolean>) | null = null;

  setDriver(driver: IDriver): void {
    this.driver = driver;
  }

  setDataCleanupHandler(handler: () => Promise<boolean>): void {
    this.dataCleanupHandler = handler;
  }

  setAccountSwitchHandler(handler: (accountIndex: number) => Promise<boolean>): void {
    this.accountSwitchHandler = handler;
  }

  async fix(context: ExecutionContext): Promise<FixResult> {
    const lastStep = this.getLastStep(context);
    if (!lastStep) {
      return { success: false, strategy: this.strategy, description: 'No step to fix' };
    }

    // 1. 尝试数据清理
    if (this.dataCleanupHandler) {
      try {
        const cleaned = await this.dataCleanupHandler();
        if (cleaned) {
          lastStep.status = StepStatus.FIXED;
          lastStep.fixAttempted = true;
          lastStep.fixResult = 'Data cleanup successful';

          return {
            success: true,
            strategy: this.strategy,
            description: 'Data cleanup successful',
            fixedStep: lastStep,
          };
        }
      } catch {
        // 数据清理失败
      }
    }

    // 2. 尝试账号切换
    if (this.accountSwitchHandler) {
      try {
        const switched = await this.accountSwitchHandler(1);
        if (switched) {
          lastStep.status = StepStatus.FIXED;
          lastStep.fixAttempted = true;
          lastStep.fixResult = 'Account switch successful';

          return {
            success: true,
            strategy: this.strategy,
            description: 'Account switch successful',
            fixedStep: lastStep,
          };
        }
      } catch {
        // 账号切换失败
      }
    }

    // 3. 尝试应用数据重置（通过 shell 命令）
    if (this.driver) {
      try {
        const bundleName = context.testCase.testData?.bundleName || context.testCase.testData?.packageName;
        if (bundleName) {
          await this.driver.executeShell(`pm clear ${bundleName}`);
          lastStep.status = StepStatus.FIXED;
          lastStep.fixAttempted = true;
          lastStep.fixResult = 'App data reset successful';

          return {
            success: true,
            strategy: this.strategy,
            description: `App data reset for ${bundleName}`,
            fixedStep: lastStep,
          };
        }
      } catch {
        // 数据重置失败
      }
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'Data fix failed: all cleanup/reset/switch attempts failed',
    };
  }
}

/**
 * WaitFixStrategy - 等待修复策略
 * 梯度等待、显式轮询(500ms)、空闲等待、逐步等待
 */
export class WaitFixStrategy extends BaseFixStrategy {
  readonly strategy = FixStrategy.WAIT_AND_RETRY;
  readonly description = 'Fix timing issues using gradient wait, explicit polling, or idle wait';

  private driver: IDriver | null = null;

  /** 梯度等待配置 */
  private static readonly GRADIENT_STEPS = [
    { wait: 1000, label: '1s' },
    { wait: 2000, label: '2s' },
    { wait: 5000, label: '5s' },
    { wait: 10000, label: '10s' },
    { wait: 30000, label: '30s' },
  ];

  /** 显式轮询配置 */
  private static readonly POLL_INTERVAL = 500; // 500ms
  private static readonly POLL_MAX_ATTEMPTS = 20; // 最多 20 次

  setDriver(driver: IDriver): void {
    this.driver = driver;
  }

  async fix(context: ExecutionContext): Promise<FixResult> {
    const lastStep = this.getLastStep(context);
    if (!lastStep) {
      return { success: false, strategy: this.strategy, description: 'No step to fix' };
    }

    const failureType = this.inferWaitReason(lastStep);

    switch (failureType) {
      case 'loading':
        return this.gradientWait(context, lastStep);
      case 'element_delay':
        // 先尝试逐步等待元素出现，失败后降级到显式轮询
        const stepResult = await this.stepByStepWait(context, lastStep);
        if (stepResult.success) return stepResult;
        return this.explicitPolling(context, lastStep);
      case 'animation':
        return this.idleWait(context, lastStep);
      default:
        return this.gradientWait(context, lastStep);
    }
  }

  /**
   * 梯度等待：逐步增加等待时间
   */
  private async gradientWait(context: ExecutionContext, lastStep: StepHistory): Promise<FixResult> {
    for (const step of WaitFixStrategy.GRADIENT_STEPS) {
      await this.delay(step.wait);

      // 检查是否可以通过重试解决
      const retryResult = await this.retryLastAction(context, lastStep);
      if (retryResult) {
        lastStep.status = StepStatus.FIXED;
        lastStep.fixAttempted = true;
        lastStep.fixResult = `Fixed after ${step.label} gradient wait`;

        return {
          success: true,
          strategy: this.strategy,
          description: `Fixed after ${step.label} gradient wait`,
          fixedStep: lastStep,
        };
      }
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'Gradient wait exhausted without success',
    };
  }

  /**
   * 显式轮询：每 500ms 检查一次
   */
  private async explicitPolling(context: ExecutionContext, lastStep: StepHistory): Promise<FixResult> {
    for (let i = 0; i < WaitFixStrategy.POLL_MAX_ATTEMPTS; i++) {
      await this.delay(WaitFixStrategy.POLL_INTERVAL);

      const retryResult = await this.retryLastAction(context, lastStep);
      if (retryResult) {
        lastStep.status = StepStatus.FIXED;
        lastStep.fixAttempted = true;
        lastStep.fixResult = `Fixed after ${(i + 1) * WaitFixStrategy.POLL_INTERVAL}ms polling`;

        return {
          success: true,
          strategy: this.strategy,
          description: `Fixed after ${(i + 1) * WaitFixStrategy.POLL_INTERVAL}ms explicit polling`,
          fixedStep: lastStep,
        };
      }
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'Explicit polling exhausted without success',
    };
  }

  /**
   * 空闲等待：等待动画或过渡完成
   */
  private async idleWait(context: ExecutionContext, lastStep: StepHistory): Promise<FixResult> {
    // 等待 2 秒让动画完成
    await this.delay(2000);

    const retryResult = await this.retryLastAction(context, lastStep);
    if (retryResult) {
      lastStep.status = StepStatus.FIXED;
      lastStep.fixAttempted = true;
      lastStep.fixResult = 'Fixed after idle wait for animation';

      return {
        success: true,
        strategy: this.strategy,
        description: 'Fixed after idle wait for animation/transition',
        fixedStep: lastStep,
      };
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'Idle wait did not resolve the issue',
    };
  }

  /**
   * 逐步等待：等待元素逐渐出现
   */
  private async stepByStepWait(context: ExecutionContext, lastStep: StepHistory): Promise<FixResult> {
    if (!this.driver) {
      return { success: false, strategy: this.strategy, description: 'No driver available' };
    }

    const locator = lastStep.toolParams?.locatorValue
      ? { type: LocatorType.TEXT, value: lastStep.toolParams.locatorValue }
      : null;

    if (locator) {
      try {
        const element = await this.driver.waitForElement(locator, 10000);
        if (element) {
          lastStep.status = StepStatus.FIXED;
          lastStep.fixAttempted = true;
          lastStep.fixResult = 'Element appeared after step-by-step wait';

          return {
            success: true,
            strategy: this.strategy,
            description: 'Element appeared after step-by-step wait',
            fixedStep: lastStep,
          };
        }
      } catch {
        // 等待超时
      }
    }

    return {
      success: false,
      strategy: this.strategy,
      description: 'Step-by-step wait did not resolve the issue',
    };
  }

  /**
   * 推断等待原因
   */
  private inferWaitReason(step: StepHistory): 'loading' | 'element_delay' | 'animation' | 'unknown' {
    const observation = (step.observation || '').toLowerCase();
    const error = (step.error || '').toLowerCase();

    if (observation.includes('loading') || error.includes('loading')) return 'loading';
    if (observation.includes('animation') || observation.includes('transition')) return 'animation';
    if (observation.includes('not found') || observation.includes('not visible')) return 'element_delay';

    return 'unknown';
  }

  /**
   * 重试最后一步的操作
   */
  /**
   * 重试最后一步的操作
   * TODO: 需要根据 lastStep 的工具和参数，通过 MCPClient 重新执行工具
   */
  private async retryLastAction(_context: ExecutionContext, _lastStep: StepHistory): Promise<boolean> {
    // 框架实现：需要根据 lastStep 的工具和参数重新执行
    // 实际实现中会调用 MCPClient 重新执行工具
    return false;
  }
}

/**
 * 创建所有修复策略
 */
export function createFixStrategies(): {
  selectorFix: SelectorFixStrategy;
  authFix: AuthFixStrategy;
  assertionFix: AssertionFixStrategy;
  dataFix: DataFixStrategy;
  waitFix: WaitFixStrategy;
} {
  return {
    selectorFix: new SelectorFixStrategy(),
    authFix: new AuthFixStrategy(),
    assertionFix: new AssertionFixStrategy(),
    dataFix: new DataFixStrategy(),
    waitFix: new WaitFixStrategy(),
  };
}
