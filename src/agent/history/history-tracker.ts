import { ExecutionContext, StepHistory, AgentStatistics, StepStatus } from '@core/types/execution-context.type';
import { TestCase } from '@core/types/test-case.type';

/**
 * 历史记录条目
 */
interface HistoryEntry {
  /** 测试用例 ID */
  testCaseId: string;
  /** 测试用例标题 */
  testCaseTitle: string;
  /** 执行上下文 */
  context: ExecutionContext;
  /** 完成时间 */
  completedAt: number;
}

/**
 * HistoryTracker - 执行历史追踪器
 * 记录完整的执行历史，提供统计和导出功能
 */
export class HistoryTracker {
  private history: HistoryEntry[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * 记录一次执行
   */
  record(testCase: TestCase, context: ExecutionContext): void {
    const entry: HistoryEntry = {
      testCaseId: testCase.id,
      testCaseTitle: testCase.title,
      context,
      completedAt: Date.now(),
    };

    this.history.push(entry);

    // 限制历史大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * 获取所有历史
   */
  getAll(): HistoryEntry[] {
    return [...this.history];
  }

  /**
   * 获取指定测试用例的历史
   */
  getByTestCaseId(testCaseId: string): HistoryEntry[] {
    return this.history.filter(h => h.testCaseId === testCaseId);
  }

  /**
   * 获取最近 N 次执行
   */
  getRecent(count: number): HistoryEntry[] {
    return this.history.slice(-count);
  }

  /**
   * 获取统计信息
   */
  getStatistics(): AgentStatistics {
    let totalSteps = 0;
    let successSteps = 0;
    let failedSteps = 0;
    let fixedSteps = 0;
    let totalDuration = 0;
    let totalFixAttempts = 0;
    let successFixAttempts = 0;

    for (const entry of this.history) {
      for (const step of entry.context.steps) {
        totalSteps++;
        switch (step.status) {
          case StepStatus.SUCCESS:
            successSteps++;
            break;
          case StepStatus.FAILED:
            failedSteps++;
            break;
          case StepStatus.FIXED:
            fixedSteps++;
            successFixAttempts++;
            totalFixAttempts++;
            break;
          case StepStatus.FIXING:
            totalFixAttempts++;
            break;
        }
      }

      const duration = (entry.context.endTime || Date.now()) - entry.context.startTime;
      totalDuration += duration;
    }

    return {
      totalSteps,
      successSteps,
      failedSteps,
      fixedSteps,
      averageStepDuration: totalSteps > 0 ? totalDuration / totalSteps : 0,
      totalFixAttempts,
      successFixAttempts,
    };
  }

  /**
   * 获取平均步数
   */
  getAverageSteps(): number {
    if (this.history.length === 0) return 0;
    const totalSteps = this.history.reduce((sum, h) => sum + h.context.steps.length, 0);
    return totalSteps / this.history.length;
  }

  /**
   * 获取平均执行时间
   */
  getAverageDuration(): number {
    if (this.history.length === 0) return 0;
    const totalDuration = this.history.reduce((sum, h) => {
      const duration = (h.context.endTime || Date.now()) - h.context.startTime;
      return sum + duration;
    }, 0);
    return totalDuration / this.history.length;
  }

  /**
   * 获取成功率
   */
  getSuccessRate(): number {
    if (this.history.length === 0) return 0;
    const passed = this.history.filter(h => h.context.status === 'passed').length;
    return passed / this.history.length;
  }

  /**
   * 导出为 JSON
   */
  exportJson(): string {
    return JSON.stringify(this.history, null, 2);
  }

  /**
   * 导出为 CSV
   */
  exportCsv(): string {
    const headers = [
      'testCaseId',
      'testCaseTitle',
      'status',
      'totalSteps',
      'successSteps',
      'failedSteps',
      'fixedSteps',
      'duration',
      'completedAt',
    ];

    const rows = this.history.map(entry => {
      const steps = entry.context.steps;
      const duration = (entry.context.endTime || Date.now()) - entry.context.startTime;
      return [
        entry.testCaseId,
        `"${entry.testCaseTitle.replace(/"/g, '""')}"`,
        entry.context.status,
        steps.length,
        steps.filter(s => s.status === StepStatus.SUCCESS).length,
        steps.filter(s => s.status === StepStatus.FAILED).length,
        steps.filter(s => s.status === StepStatus.FIXED).length,
        duration,
        entry.completedAt,
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.history = [];
  }

  /**
   * 获取历史大小
   */
  get size(): number {
    return this.history.length;
  }
}
