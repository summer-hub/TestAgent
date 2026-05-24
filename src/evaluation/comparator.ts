/**
 * Comparator - 步骤对比器
 * 将 Agent 的实际输出与金标准进行逐步骤对比
 */

import type { StepHistory, ExecutionContext } from '@core/types/execution-context.type';
import type { EvalSample, StepComparison, ExpectedAction } from './types';
import { levenshteinDistance } from '@utils/helpers';

/**
 * Comparator - 单样本对比器
 */
export class Comparator {
  /**
   * 将一次执行的结果与金标准进行完整对比
   */
  compare(sample: EvalSample, context: ExecutionContext): {
    stepComparisons: StepComparison[];
    statusMatch: boolean;
  } {
    const expectedActions = sample.task.expectedActions;
    const actualSteps = context.steps;

    // 对每一步进行对比
    const stepComparisons: StepComparison[] = [];

    const maxLen = Math.max(expectedActions.length, actualSteps.length);
    for (let i = 0; i < maxLen; i++) {
      const expected = expectedActions[i];
      const actual = actualSteps[i];
      stepComparisons.push(this.compareStep(i + 1, expected, actual));
    }

    // 判断最终状态是否匹配
    const expectedStatus = sample.groundTruth.expectedStatus;
    const actualStatus = this.safeStatus(context.status);
    const statusMatch =
      (expectedStatus === 'passed' && actualStatus === 'passed') ||
      (expectedStatus === 'failed' && (actualStatus === 'failed' || actualStatus === 'stopped'));

    return { stepComparisons, statusMatch };
  }

  /**
   * 对比单步
   */
  private compareStep(
    stepNumber: number,
    expected: ExpectedAction | undefined,
    actual: StepHistory | undefined
  ): StepComparison {
    // Agent 少执行了步骤
    if (!actual) {
      return {
        stepNumber,
        actualTool: '(missing)',
        expectedTool: expected?.toolName ?? '(none)',
        toolMatch: false,
        locatorMatch: false,
        actualParams: {},
        expectedParams: expected?.params,
        paramDetails: [],
        status: 'skipped',
        fixTriggered: false,
        duration: 0,
        error: 'Agent did not execute this step',
      };
    }

    // Agent 多执行了步骤
    if (!expected) {
      return {
        stepNumber,
        actualTool: actual.chosenTool,
        expectedTool: '(none)',
        toolMatch: false,
        locatorMatch: false,
        actualParams: actual.toolParams,
        paramDetails: [],
        status: actual.passed ? 'success' : 'failed',
        fixTriggered: actual.fixAttempted,
        fixSuccess: actual.fixResult !== undefined && actual.status === 'fixed',
        duration: actual.duration ?? 0,
        error: actual.error,
      };
    }

    // 工具名匹配
    const toolMatch =
      actual.chosenTool.toLowerCase() === expected.toolName.toLowerCase();

    // 定位器匹配
    const { locatorMatch, actualLocator } = this.checkLocator(actual, expected);

    // 参数匹配
    const paramDetails = this.checkParams(actual.toolParams, expected.params || {});

    return {
      stepNumber,
      actualTool: actual.chosenTool,
      expectedTool: expected.toolName,
      toolMatch,
      locatorMatch,
      actualLocator,
      expectedLocator: expected.locator,
      actualParams: actual.toolParams,
      expectedParams: expected.params,
      paramDetails,
      status: this.mapStatus(actual.status),
      fixTriggered: actual.fixAttempted,
      fixSuccess: actual.fixResult !== undefined && actual.status === 'fixed',
      duration: actual.duration ?? 0,
      error: actual.error,
    };
  }

  /**
   * 检查定位器是否匹配
   */
  private checkLocator(
    actual: StepHistory,
    expected: ExpectedAction
  ): { locatorMatch: boolean; actualLocator?: import('@core/types/element.type').Locator } {
    // 从实际工具参数中提取定位器
    const actualLocator = actual.toolParams?.locator as
      | import('@core/types/element.type').Locator
      | undefined;

    if (!expected.locator && !actualLocator) {
      return { locatorMatch: true };
    }
    if (!expected.locator || !actualLocator) {
      return { locatorMatch: false, actualLocator };
    }

    // 类型匹配
    if (expected.locator.type !== actualLocator.type) {
      return { locatorMatch: false, actualLocator };
    }

    // 值匹配（支持模糊匹配，阈值 0.8）
    const similarity = 1 - levenshteinDistance(
      expected.locator.value,
      actualLocator.value
    ) / Math.max(expected.locator.value.length, actualLocator.value.length);

    return {
      locatorMatch: similarity >= 0.8,
      actualLocator,
    };
  }

  /**
   * 检查参数是否匹配
   */
  private checkParams(
    actual: Record<string, any>,
    expected: Record<string, any>
  ): StepComparison['paramDetails'] {
    const details: StepComparison['paramDetails'] = [];
    const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);

    for (const key of allKeys) {
      const actualVal = actual[key];
      const expectedVal = expected[key];

      // 跳过定位器（已在 checkLocator 中处理）
      if (key === 'locator') continue;

      let match: boolean;
      if (expectedVal === undefined) {
        match = true; // 额外参数不扣分
      } else if (actualVal === undefined) {
        match = false; // 缺少期望参数
      } else if (typeof expectedVal === 'string' && typeof actualVal === 'string') {
        const similarity = 1 - levenshteinDistance(expectedVal, actualVal) /
          Math.max(expectedVal.length, actualVal.length);
        match = similarity >= 0.8;
      } else if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
        match = Math.abs(expectedVal - actualVal) < 5; // 坐标允许 ±5px
      } else {
        match = JSON.stringify(actualVal) === JSON.stringify(expectedVal);
      }

      details.push({ key, actual: actualVal, expected: expectedVal, match });
    }

    return details;
  }

  /**
   * 安全地将状态字符串转换为 'passed' | 'failed' | 'stopped'
   */
  private safeStatus(status: string): 'passed' | 'failed' | 'stopped' {
    if (status === 'passed' || status === 'failed' || status === 'stopped') return status;
    return 'failed';
  }

  /**
   * 映射步骤状态
   */
  private mapStatus(status: string): StepComparison['status'] {
    switch (status) {
      case 'success': return 'success';
      case 'fixed': return 'fixed';
      case 'failed': return 'failed';
      default: return 'skipped';
    }
  }
}
