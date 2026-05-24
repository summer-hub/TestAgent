import { IFixExecutor, FailureType, FixStrategy, FixResult, FixHandler } from '@core/interfaces/fixer.interface';
import { ExecutionContext, StepHistory, StepStatus } from '@core/types/execution-context.type';
import { IDriver } from '@core/interfaces/driver.interface';
import { IMCPClient } from '@core/interfaces/mcp.interface';
import { LocatorType } from '@core/types/element.type';
import { FailureDiagnoser } from '../diagnoser/failure-diagnoser';
import { FixFailedError, StrategyNotSupportedError, FixTimeoutError } from '@core/errors';

/**
 * 修复执行器配置
 */
export interface FixExecutorConfig {
  /** 最大修复尝试次数 */
  maxFixAttempts: number;
  /** 修复超时时间（毫秒） */
  fixTimeout: number;
  /** 是否启用修复 */
  enabled: boolean;
  /** 默认重试次数 */
  defaultRetryCount: number;
  /** 默认等待时间（毫秒） */
  defaultWaitTime: number;
}

/**
 * FixExecutor - 自愈修复执行器
 * 实现自动诊断和修复测试失败
 */
export class FixExecutor implements IFixExecutor {
  private config: FixExecutorConfig;
  private diagnoser: FailureDiagnoser;
  private strategies: Map<FixStrategy, FixHandler> = new Map();
  private fixAttempts: Map<string, number> = new Map();
  private driver: IDriver | null = null;
  private mcpClient: IMCPClient | null = null;

  constructor(config: Partial<FixExecutorConfig> = {}) {
    this.config = {
      maxFixAttempts: 3,
      fixTimeout: 30000,
      enabled: true,
      defaultRetryCount: 3,
      defaultWaitTime: 2000,
      ...config,
    };
    this.diagnoser = new FailureDiagnoser();
    this.registerDefaultStrategies();
  }

  /** 诊断失败类型 */
  async diagnose(context: ExecutionContext): Promise<FailureType> {
    return this.diagnoser.diagnose(context);
  }

  /** 尝试修复 */
  async fix(context: ExecutionContext, failureType: FailureType): Promise<FixResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        strategy: FixStrategy.RETRY,
        description: 'Fixer is disabled',
      };
    }

    const contextId = context.testCase.id;
    const attempts = this.fixAttempts.get(contextId) || 0;

    if (attempts >= this.config.maxFixAttempts) {
      return {
        success: false,
        strategy: FixStrategy.RETRY,
        description: `Max fix attempts (${this.config.maxFixAttempts}) exceeded`,
      };
    }

    this.fixAttempts.set(contextId, attempts + 1);

    // 根据失败类型选择修复策略
    const strategy = this.selectStrategy(failureType);
    const handler = this.strategies.get(strategy);

    if (!handler) {
      throw new StrategyNotSupportedError(strategy);
    }

    const startTime = Date.now();
    try {
      const result = await this.executeWithTimeout(handler, context);
      return {
        ...result,
        strategy,
        description: `Fixed ${failureType} using ${strategy} (attempt ${attempts + 1})`,
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.config.fixTimeout) {
        throw new FixTimeoutError(strategy, this.config.fixTimeout);
      }

      throw new FixFailedError(failureType, strategy, {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** 获取支持的修复策略 */
  getSupportedStrategies(): FixStrategy[] {
    return Array.from(this.strategies.keys());
  }

  /** 注册自定义修复策略 */
  registerStrategy(strategy: FixStrategy, handler: FixHandler): void {
    this.strategies.set(strategy, handler);
  }

  /** 清理指定上下文的修复记录，防止 fixAttempts 无限增长 */
  clearFixAttempts(contextId: string): void {
    this.fixAttempts.delete(contextId);
  }

  /** 设置设备驱动，供修复处理器使用 */
  setDriver(driver: IDriver): void {
    this.driver = driver;
  }

  /** 设置 MCP 客户端，供修复处理器重新执行工具调用 */
  setMcpClient(client: IMCPClient): void {
    this.mcpClient = client;
  }

  // ============ 私有方法 ============

  private registerDefaultStrategies(): void {
    // 重试策略
    this.strategies.set(FixStrategy.RETRY, this.retryHandler.bind(this));

    // 滚动并重试策略
    this.strategies.set(FixStrategy.SCROLL_AND_RETRY, this.scrollAndRetryHandler.bind(this));

    // 替代定位策略
    this.strategies.set(FixStrategy.ALTERNATIVE_LOCATOR, this.alternativeLocatorHandler.bind(this));

    // 等待并重试策略
    this.strategies.set(FixStrategy.WAIT_AND_RETRY, this.waitAndRetryHandler.bind(this));

    // 重启应用策略
    this.strategies.set(FixStrategy.RESTART_APP, this.restartAppHandler.bind(this));
  }

  private selectStrategy(failureType: FailureType): FixStrategy {
    switch (failureType) {
      case FailureType.ELEMENT_NOT_FOUND:
        return FixStrategy.SCROLL_AND_RETRY;
      case FailureType.ELEMENT_NOT_CLICKABLE:
        return FixStrategy.WAIT_AND_RETRY;
      case FailureType.ASSERTION_FAILED:
        return FixStrategy.RETRY;
      case FailureType.TIMEOUT:
        return FixStrategy.WAIT_AND_RETRY;
      case FailureType.CRASH:
      case FailureType.ANR:
        return FixStrategy.RESTART_APP;
      case FailureType.NETWORK_ERROR:
        return FixStrategy.WAIT_AND_RETRY;
      case FailureType.PERMISSION_DENIED:
        return FixStrategy.RETRY;
      case FailureType.STATE_MISMATCH:
        return FixStrategy.RETRY;
      default:
        return FixStrategy.RETRY;
    }
  }

  private async executeWithTimeout(handler: FixHandler, context: ExecutionContext): Promise<FixResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Fix execution timeout'));
      }, this.config.fixTimeout);

      handler(context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  // ============ 默认修复策略处理器 ============

  /**
   * 重试最后一步的工具调用
   */
  private async retryHandler(context: ExecutionContext): Promise<FixResult> {
    const lastStep = context.steps[context.steps.length - 1];
    if (!lastStep) {
      return { success: false, strategy: FixStrategy.RETRY, description: 'No step to retry' };
    }

    lastStep.status = StepStatus.FIXING;

    // 调用 MCP 重新执行最后一步的工具
    const result = await this.retryToolCall(lastStep);
    if (result.success) {
      lastStep.status = StepStatus.FIXED;
      lastStep.fixAttempted = true;
      lastStep.fixResult = 'Retry succeeded';
      return {
        success: true,
        strategy: FixStrategy.RETRY,
        description: `Retried tool "${lastStep.chosenTool}" successfully`,
        fixedStep: lastStep,
      };
    }

    lastStep.status = StepStatus.FAILED;
    return {
      success: false,
      strategy: FixStrategy.RETRY,
      description: result.error || 'Retry failed',
      error: result.error,
    };
  }

  /**
   * 滚动页面后重试
   */
  private async scrollAndRetryHandler(context: ExecutionContext): Promise<FixResult> {
    const lastStep = context.steps[context.steps.length - 1];
    if (!lastStep) {
      return {
        success: false,
        strategy: FixStrategy.SCROLL_AND_RETRY,
        description: 'No step to scroll and retry',
      };
    }

    lastStep.status = StepStatus.FIXING;

    // 尝试用 driver 滚动查找元素
    if (this.driver && lastStep.toolParams?.locatorValue) {
      try {
        const locator: import('@core/types/element.type').Locator = {
          type: LocatorType.TEXT,
          value: lastStep.toolParams.locatorValue,
        };
        const element = await this.driver.scrollToElement(locator, 'down');
        if (element) {
          // 滚动找到元素后重试工具调用
          const result = await this.retryToolCall(lastStep);
          if (result.success) {
            lastStep.status = StepStatus.FIXED;
            lastStep.fixAttempted = true;
            lastStep.fixResult = 'Found element after scrolling and retry succeeded';
            return {
              success: true,
              strategy: FixStrategy.SCROLL_AND_RETRY,
              description: `Scrolled and found element for "${lastStep.chosenTool}"`,
              fixedStep: lastStep,
            };
          }
        }
      } catch {
        // 滚动失败，继续尝试
      }
    }

    // 降级：直接重试
    const result = await this.retryToolCall(lastStep);
    if (result.success) {
      lastStep.status = StepStatus.FIXED;
      lastStep.fixAttempted = true;
      return { success: true, strategy: FixStrategy.SCROLL_AND_RETRY, description: 'Retry succeeded after scroll attempt', fixedStep: lastStep };
    }

    lastStep.status = StepStatus.FAILED;
    return { success: false, strategy: FixStrategy.SCROLL_AND_RETRY, description: result.error || 'Scroll and retry failed', error: result.error };
  }

  /**
   * 使用替代定位器重试
   */
  private async alternativeLocatorHandler(context: ExecutionContext): Promise<FixResult> {
    const lastStep = context.steps[context.steps.length - 1];
    if (!lastStep) {
      return { success: false, strategy: FixStrategy.ALTERNATIVE_LOCATOR, description: 'No step' };
    }

    lastStep.status = StepStatus.FIXING;

    // 从最后一步提取原始定位器值和类型
    const locatorValue = lastStep.toolParams?.locatorValue as string;
    const locatorType = lastStep.toolParams?.locatorType as string;

    if (this.driver && locatorValue) {
      // 根据原始定位器类型构建备用定位器链
      const fallbackLocators: Array<{ type: LocatorType; value: string }> = [];

      if (locatorType === 'text' || !locatorType) {
        fallbackLocators.push(
          { type: LocatorType.ID, value: locatorValue },
          { type: LocatorType.XPATH, value: `//*[contains(text(), '${locatorValue.replace(/'/g, "&apos;")}')]` },
        );
      } else if (locatorType === 'id') {
        fallbackLocators.push(
          { type: LocatorType.TEXT, value: locatorValue },
          { type: LocatorType.XPATH, value: `//*[contains(@resource-id, '${locatorValue}')]` },
        );
      }

      // 依次尝试备用定位器
      for (const altLocator of fallbackLocators) {
        try {
          const element = await this.driver.findElement(altLocator);
          if (element) {
            // 找到元素后重试工具调用
            lastStep.toolParams = { ...lastStep.toolParams, locatorValue: altLocator.value, locatorType: altLocator.type };
            const result = await this.retryToolCall(lastStep);
            if (result.success) {
              lastStep.status = StepStatus.FIXED;
              lastStep.fixAttempted = true;
              lastStep.fixResult = `Found via alternative locator ${altLocator.type}:${altLocator.value}`;
              return { success: true, strategy: FixStrategy.ALTERNATIVE_LOCATOR, description: `Used alternative ${altLocator.type} locator`, fixedStep: lastStep };
            }
          }
        } catch {
          continue;
        }
      }
    }

    lastStep.status = StepStatus.FAILED;
    return { success: false, strategy: FixStrategy.ALTERNATIVE_LOCATOR, description: 'All alternative locators failed' };
  }

  /**
   * 等待后重试
   */
  private async waitAndRetryHandler(context: ExecutionContext): Promise<FixResult> {
    const lastStep = context.steps[context.steps.length - 1];
    if (!lastStep) {
      return { success: false, strategy: FixStrategy.WAIT_AND_RETRY, description: 'No step' };
    }

    lastStep.status = StepStatus.FIXING;

    // 梯度等待：逐步增加等待时间
    const waitSteps = [1000, 2000, 5000];
    for (const waitMs of waitSteps) {
      await this.delay(waitMs);

      const result = await this.retryToolCall(lastStep);
      if (result.success) {
        lastStep.status = StepStatus.FIXED;
        lastStep.fixAttempted = true;
        lastStep.fixResult = `Succeeded after ${waitMs}ms wait`;
        return { success: true, strategy: FixStrategy.WAIT_AND_RETRY, description: `Waited ${waitMs}ms and retry succeeded`, fixedStep: lastStep };
      }
    }

    lastStep.status = StepStatus.FAILED;
    return { success: false, strategy: FixStrategy.WAIT_AND_RETRY, description: 'Wait and retry exhausted', error: 'Element did not appear within wait time' };
  }

  /**
   * 重启应用后重试
   */
  private async restartAppHandler(context: ExecutionContext): Promise<FixResult> {
    const lastStep = context.steps[context.steps.length - 1];

    lastStep!.status = StepStatus.FIXING;

    // 获取包名
    const bundleName = context.testCase?.testData?.bundleName ||
                       context.testCase?.testData?.packageName ||
                       (lastStep?.toolParams?.bundleName as string);

    if (this.driver && bundleName) {
      try {
        // 停止应用
        await this.driver.stopApp(bundleName);
        await this.delay(1000);
        // 启动应用
        await this.driver.startApp(bundleName);
        // 等待应用启动
        await this.delay(3000);
      } catch (err) {
        return { success: false, strategy: FixStrategy.RESTART_APP, description: 'App restart failed', error: String(err) };
      }
    } else {
      // 没有包名或 driver 时退化为等待
      await this.delay(3000);
    }

    // 重启后重试工具调用
    if (lastStep) {
      const result = await this.retryToolCall(lastStep);
      if (result.success) {
        lastStep.status = StepStatus.FIXED;
        lastStep.fixAttempted = true;
        return { success: true, strategy: FixStrategy.RESTART_APP, description: 'App restarted and retry succeeded', fixedStep: lastStep };
      }
      lastStep.status = StepStatus.FAILED;
      return { success: false, strategy: FixStrategy.RESTART_APP, description: 'App restarted but retry failed', error: result.error };
    }

    return { success: false, strategy: FixStrategy.RESTART_APP, description: 'No step to retry after restart' };
  }

  /**
   * 通过 MCP 客户端重新执行工具调用
   */
  private async retryToolCall(lastStep: StepHistory): Promise<{ success: boolean; error?: string }> {
    if (!this.mcpClient || !lastStep.chosenTool) {
      return { success: false, error: 'MCP client not available or no tool to retry' };
    }

    try {
      const result = await this.mcpClient.callTool(lastStep.chosenTool, lastStep.toolParams || {});
      if (result.success) {
        return { success: true };
      }
      return { success: false, error: result.error || 'Tool call returned failure' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
