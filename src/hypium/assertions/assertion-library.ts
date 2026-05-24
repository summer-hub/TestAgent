import { Element, Locator, LocatorType } from '@core/types/element.type';
import type { IDriver } from '@core/interfaces/driver.interface';

/**
 * 断言结果
 */
export interface AssertionResult {
  /** 是否通过 */
  passed: boolean;
  /** 断言描述 */
  message: string;
  /** 预期值 */
  expected?: any;
  /** 实际值 */
  actual?: any;
  /** 错误信息 */
  error?: string;
}

/**
 * 断言配置
 */
export interface AssertionConfig {
  /** 断言模式：soft(软断言-收集失败) / hard(硬断言-立即失败) */
  mode: 'soft' | 'hard';
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔（毫秒） */
  retryInterval: number;
}

/**
 * AssertionLibrary - 断言库
 * 提供软断言和硬断言两种模式
 *
 * 软断言：收集所有失败，最后统一报告
 * 硬断言：失败立即抛出异常
 *
 * 支持断言重试（默认 3 次，间隔 1 秒）
 */
export class AssertionLibrary {
  private driver: IDriver;
  private config: AssertionConfig;
  private failures: AssertionResult[] = [];

  constructor(driver: IDriver, config?: Partial<AssertionConfig>) {
    this.driver = driver;
    this.config = {
      mode: 'hard',
      maxRetries: 3,
      retryInterval: 1000,
      ...config,
    };
  }

  /**
   * 断言文本存在
   */
  async assertTextExists(locator: Locator, options?: { timeout?: number; exact?: boolean }): Promise<AssertionResult> {
    return this.executeWithRetry(async () => {
      const element = await this.driver.findElement(locator);
      if (!element) {
        return {
          passed: false,
          message: `Text element not found: ${locator.value}`,
          expected: 'element exists',
          actual: 'element not found',
        };
      }

      const text = element.text || '';
      if (options?.exact && text !== locator.value) {
        return {
          passed: false,
          message: `Text does not match exactly`,
          expected: locator.value,
          actual: text,
        };
      }

      return {
        passed: true,
        message: `Text exists: ${locator.value}`,
        expected: 'element exists',
        actual: 'element found',
      };
    });
  }

  /**
   * 断言组件可见
   */
  async assertComponentVisible(locator: Locator, options?: { timeout?: number }): Promise<AssertionResult> {
    return this.executeWithRetry(async () => {
      const element = await this.driver.findElement(locator);
      if (!element) {
        return {
          passed: false,
          message: `Component not found: ${locator.value}`,
          expected: 'component visible',
          actual: 'component not found',
        };
      }

      if (!element.visible) {
        return {
          passed: false,
          message: `Component exists but not visible: ${locator.value}`,
          expected: 'visible: true',
          actual: 'visible: false',
        };
      }

      return {
        passed: true,
        message: `Component is visible: ${locator.value}`,
        expected: 'component visible',
        actual: 'component visible',
      };
    });
  }

  /**
   * 断言组件可用（enabled）
   */
  async assertComponentEnabled(locator: Locator, options?: { timeout?: number }): Promise<AssertionResult> {
    return this.executeWithRetry(async () => {
      const element = await this.driver.findElement(locator);
      if (!element) {
        return {
          passed: false,
          message: `Component not found: ${locator.value}`,
          expected: 'component enabled',
          actual: 'component not found',
        };
      }

      if (!element.enabled) {
        return {
          passed: false,
          message: `Component exists but not enabled: ${locator.value}`,
          expected: 'enabled: true',
          actual: 'enabled: false',
        };
      }

      return {
        passed: true,
        message: `Component is enabled: ${locator.value}`,
        expected: 'component enabled',
        actual: 'component enabled',
      };
    });
  }

  /**
   * 断言文本相等
   */
  async assertTextEquals(locator: Locator, expectedText: string, options?: { caseSensitive?: boolean }): Promise<AssertionResult> {
    return this.executeWithRetry(async () => {
      const element = await this.driver.findElement(locator);
      if (!element) {
        return {
          passed: false,
          message: `Element not found: ${locator.value}`,
          expected: expectedText,
          actual: 'element not found',
        };
      }

      const actualText = element.text || '';
      const caseSensitive = options?.caseSensitive ?? true;

      const matches = caseSensitive
        ? actualText === expectedText
        : actualText.toLowerCase() === expectedText.toLowerCase();

      if (!matches) {
        return {
          passed: false,
          message: `Text does not match`,
          expected: expectedText,
          actual: actualText,
        };
      }

      return {
        passed: true,
        message: `Text matches: ${expectedText}`,
        expected: expectedText,
        actual: actualText,
      };
    });
  }

  /**
   * 断言元素包含文本
   */
  async assertTextContains(locator: Locator, expectedSubstring: string): Promise<AssertionResult> {
    return this.executeWithRetry(async () => {
      const element = await this.driver.findElement(locator);
      if (!element) {
        return {
          passed: false,
          message: `Element not found: ${locator.value}`,
          expected: `contains: ${expectedSubstring}`,
          actual: 'element not found',
        };
      }

      const actualText = element.text || '';
      if (!actualText.includes(expectedSubstring)) {
        return {
          passed: false,
          message: `Text does not contain expected substring`,
          expected: `contains: ${expectedSubstring}`,
          actual: actualText,
        };
      }

      return {
        passed: true,
        message: `Text contains: ${expectedSubstring}`,
        expected: `contains: ${expectedSubstring}`,
        actual: actualText,
      };
    });
  }

  /**
   * 断言元素不存在
   */
  async assertElementNotExists(locator: Locator, options?: { timeout?: number }): Promise<AssertionResult> {
    const timeout = options?.timeout || 3000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = await this.driver.findElement(locator);
      if (element) {
        return {
          passed: false,
          message: `Element should not exist but found: ${locator.value}`,
          expected: 'element not exists',
          actual: 'element exists',
        };
      }
      await this.driver.sleep(500);
    }

    return {
      passed: true,
      message: `Element does not exist as expected: ${locator.value}`,
      expected: 'element not exists',
      actual: 'element not exists',
    };
  }

  /**
   * 自定义断言
   */
  async assertCustom(
    description: string,
    condition: () => Promise<boolean>,
    expected?: any,
    actual?: any
  ): Promise<AssertionResult> {
    return this.executeWithRetry(async () => {
      const result = await condition();
      return {
        passed: result,
        message: description,
        expected: expected ?? 'condition true',
        actual: actual ?? (result ? 'true' : 'false'),
      };
    });
  }

  /**
   * 获取所有失败的断言
   */
  getFailures(): AssertionResult[] {
    return [...this.failures];
  }

  /**
   * 获取失败数量
   */
  get failureCount(): number {
    return this.failures.length;
  }

  /**
   * 是否有失败
   */
  get hasFailures(): boolean {
    return this.failures.length > 0;
  }

  /**
   * 报告所有失败的断言（软断言模式）
   * @throws 如果有失败则抛出包含所有失败信息的错误
   */
  report(): void {
    if (this.failures.length > 0) {
      const messages = this.failures
        .map((f, i) => `${i + 1}. ${f.message} (expected: ${f.expected}, actual: ${f.actual})`)
        .join('\n');
      throw new Error(`Assertion failures (${this.failures.length}):\n${messages}`);
    }
  }

  /**
   * 清空失败记录
   */
  reset(): void {
    this.failures = [];
  }

  /**
   * 设置断言模式
   */
  setMode(mode: 'soft' | 'hard'): void {
    this.config.mode = mode;
  }

  // ============ 私有方法 ============

  private async executeWithRetry(
    assertion: () => Promise<AssertionResult>
  ): Promise<AssertionResult> {
    let lastResult: AssertionResult | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      lastResult = await assertion();

      if (lastResult.passed) {
        return lastResult;
      }

      // 如果不是最后一次尝试，等待后重试
      if (attempt < this.config.maxRetries) {
        await this.driver.sleep(this.config.retryInterval);
      }
    }

    // 所有重试都失败
    const result = lastResult!;

    if (this.config.mode === 'soft') {
      this.failures.push(result);
      return result;
    }

    // 硬断言模式：立即抛出错误
    throw new Error(
      `Assertion failed: ${result.message} (expected: ${result.expected}, actual: ${result.actual})`
    );
  }
}
