import { ExecutionContext, StepHistory, StepStatus } from '@core/types/execution-context.type';
import { TestCase } from '@core/types/test-case.type';

/**
 * 执行上下文管理器
 * 管理测试执行过程中的状态、变量和快照
 */
export class ExecutionContextManager {
  private context: ExecutionContext;

  constructor(testCase: TestCase) {
    this.context = {
      testCase,
      steps: [],
      startTime: Date.now(),
      status: 'running',
      variables: {},
      metadata: {},
    };
  }

  /**
   * 获取当前执行上下文
   */
  get(): ExecutionContext {
    return this.context;
  }

  /**
   * 添加步骤历史
   */
  addStep(step: StepHistory): void {
    this.context.steps.push(step);
  }

  /**
   * 获取最后一步
   */
  getLastStep(): StepHistory | null {
    if (this.context.steps.length === 0) return null;
    return this.context.steps[this.context.steps.length - 1]!;
  }

  /**
   * 更新步骤状态
   */
  updateStepStatus(stepId: string, status: StepStatus, updates?: Partial<StepHistory>): void {
    const step = this.context.steps.find(s => s.stepId === stepId);
    if (step) {
      step.status = status;
      if (updates) {
        Object.assign(step, updates);
      }
    }
  }

  /**
   * 设置变量
   * 支持 ${variableName} 语法
   */
  setVariable(name: string, value: any): void {
    if (!this.context.variables) {
      this.context.variables = {};
    }
    this.context.variables[name] = value;
  }

  /**
   * 获取变量
   */
  getVariable(name: string): any {
    return this.context.variables?.[name];
  }

  /**
   * 解析变量引用
   * 将 ${variableName} 替换为变量值
   */
  resolveVariables(text: string): string {
    if (!this.context.variables) return text;

    return text.replace(/\$\{(\w+)\}/g, (match, varName) => {
      const value = this.context.variables![varName];
      if (value !== undefined) {
        return String(value);
      }
      return match; // 未找到变量则保留原始引用
    });
  }

  /**
   * 设置元数据
   */
  setMetadata(key: string, value: any): void {
    if (!this.context.metadata) {
      this.context.metadata = {};
    }
    this.context.metadata[key] = value;
  }

  /**
   * 更新执行状态
   */
  setStatus(status: ExecutionContext['status']): void {
    this.context.status = status;
  }

  /**
   * 设置错误
   */
  setError(error: string): void {
    this.context.error = error;
  }

  /**
   * 完成执行
   */
  complete(status: 'passed' | 'failed' | 'stopped'): void {
    this.context.status = status;
    this.context.endTime = Date.now();
  }

  /**
   * 创建快照（用于断点恢复）
   */
  createSnapshot(): ExecutionContextSnapshot {
    return {
      testCaseId: this.context.testCase.id,
      stepIndex: this.context.steps.length,
      variables: { ...this.context.variables },
      status: this.context.status,
      timestamp: Date.now(),
    };
  }

  /**
   * 从快照恢复
   */
  restoreFromSnapshot(snapshot: ExecutionContextSnapshot): void {
    this.context.variables = { ...snapshot.variables };
    this.context.status = snapshot.status;
    // 恢复到指定步骤
    this.context.steps = this.context.steps.slice(0, snapshot.stepIndex);
  }

  /**
   * 获取执行统计
   */
  getStats(): {
    totalSteps: number;
    successSteps: number;
    failedSteps: number;
    fixedSteps: number;
    duration: number;
  } {
    const steps = this.context.steps;
    const endTime = this.context.endTime || Date.now();
    return {
      totalSteps: steps.length,
      successSteps: steps.filter(s => s.status === StepStatus.SUCCESS).length,
      failedSteps: steps.filter(s => s.status === StepStatus.FAILED).length,
      fixedSteps: steps.filter(s => s.status === StepStatus.FIXED).length,
      duration: endTime - this.context.startTime,
    };
  }
}

/**
 * 执行上下文快照
 */
export interface ExecutionContextSnapshot {
  /** 测试用例 ID */
  testCaseId: string;
  /** 步骤索引 */
  stepIndex: number;
  /** 变量快照 */
  variables: Record<string, any>;
  /** 状态快照 */
  status: ExecutionContext['status'];
  /** 快照时间戳 */
  timestamp: number;
}
