import { ITestAgent } from '@core/interfaces/agent.interface';
import { IFixExecutor } from '@core/interfaces/fixer.interface';
import { FixExecutor } from '@fixer/executor/fix-executor';
import { IMCPClient } from '@core/interfaces/mcp.interface';
import { IDriver } from '@core/interfaces/driver.interface';
import {
  TestCase,
  TestPriority,
} from '@core/types/test-case.type';
import {
  ExecutionContext,
  ExecutionReport,
  AgentConfig,
  AgentStatistics,
  StepHistory,
  AgentStatus,
  StepStatus,
} from '@core/types/execution-context.type';
import {
  AgentExecutionError,
  MaxRetriesExceededError,
  AgentNotInitializedError,
} from '@core/errors';
import { ReActProcessor } from './react-loop/react-processor';

/**
 * TestAgent - AI 测试智能体
 * 实现完整的测试执行流程
 */
export class TestAgent implements ITestAgent {
  private config!: AgentConfig;
  private status: AgentStatus = AgentStatus.IDLE;
  private currentContext: ExecutionContext | null = null;
  private executionHistory: StepHistory[] = [];
  private statistics!: AgentStatistics;
  private driver!: IDriver;
  private mcpClient!: IMCPClient;
  private fixExecutor!: IFixExecutor;
  private reactProcessor!: ReActProcessor;
  private paused: boolean = false;
  private stopped: boolean = false;

  constructor(driver: IDriver, mcpClient: IMCPClient, fixExecutor: IFixExecutor) {
    this.driver = driver;
    this.mcpClient = mcpClient;
    this.fixExecutor = fixExecutor;
    // 注入 driver 和 mcpClient 到修复执行器，使修复处理器能执行真实的设备操作和工具重试
    if (fixExecutor instanceof FixExecutor) {
      fixExecutor.setDriver(driver);
      fixExecutor.setMcpClient(mcpClient);
    }
    this.reactProcessor = new ReActProcessor(mcpClient);
    this.statistics = this.createEmptyStatistics();
  }

  /** 初始化 Agent */
  async initialize(config: Partial<AgentConfig>): Promise<void> {
    this.config = {
      maxRetriesPerStep: 3,
      maxTotalSteps: 50,
      thinkTimeout: 30000,
      actTimeout: 30000,
      observeTimeout: 30000,
      enableFixer: true,
      saveHistory: true,
      logLevel: 'info',
      // TODO: 以下配置项已存入 config，但尚未传递给 ReactProcessor / LLM Provider
      model: 'gpt-4',
      temperature: 0.7,
      ...config,
    };

    this.status = AgentStatus.IDLE;
    this.statistics = this.createEmptyStatistics();
  }

  /** 执行单个测试用例 */
  async execute(testCase: TestCase): Promise<ExecutionContext> {
    if (!this.config) {
      throw new AgentNotInitializedError();
    }

    this.status = AgentStatus.EXECUTING;
    this.stopped = false;
    this.paused = false;

    const context: ExecutionContext = {
      testCase,
      steps: [],
      startTime: Date.now(),
      status: 'running',
    };

    this.currentContext = context;

    try {
      // 执行测试用例的每一步
      for (let stepIndex = 0; stepIndex < testCase.steps.length; stepIndex++) {
        if (this.stopped) {
          context.status = 'stopped';
          break;
        }

        // 处理暂停
        while (this.paused) {
          this.status = AgentStatus.PAUSED;
          await this.delay(100);
        }

        if (this.stopped) {
          context.status = 'stopped';
          break;
        }

        this.status = AgentStatus.EXECUTING;

        // 执行 ReAct 循环
        const stepResult = await this.reactProcessor.executeStep(context);

        // 更新统计
        this.statistics.totalSteps++;
        if (stepResult.passed) {
          this.statistics.successSteps++;
        } else {
          this.statistics.failedSteps++;
        }

        // 如果步骤失败且启用了修复，尝试修复
        if (!stepResult.passed && this.config.enableFixer) {
          await this.attemptFix(context);
        }

        // 检查是否超过最大步数
        if (context.steps.length >= this.config.maxTotalSteps) {
          throw new AgentExecutionError(
            `Exceeded maximum total steps (${this.config.maxTotalSteps})`
          );
        }
      }

      // 确定最终状态
      if (context.status !== 'stopped') {
        const hasFailedSteps = context.steps.some((s) => s.status === StepStatus.FAILED);
        context.status = hasFailedSteps ? 'failed' : 'passed';
      }

      context.endTime = Date.now();

      // 保存历史
      if (this.config.saveHistory) {
        this.executionHistory.push(...context.steps);
      }

      return context;
    } catch (error) {
      context.status = 'failed';
      context.error = error instanceof Error ? error.message : String(error);
      context.endTime = Date.now();
      throw error;
    } finally {
      // 清理 fixAttempts 记录，防止内存泄漏
      if (context.testCase?.id) {
        this.fixExecutor.clearFixAttempts(context.testCase.id);
      }
      this.currentContext = null;
      if (context.status === 'failed') {
        this.status = AgentStatus.FAILED;
      } else {
        this.status = this.stopped ? AgentStatus.STOPPED : AgentStatus.COMPLETED;
      }
    }
  }

  /** 批量执行测试用例 */
  async executeBatch(testCases: TestCase[]): Promise<ExecutionReport> {
    const startTime = Date.now();
    const results: ExecutionContext[] = [];
    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
      try {
        const result = await this.execute(testCase);
        results.push(result);
        if (result.status === 'passed') {
          passed++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        results.push({
          testCase,
          steps: [],
          startTime: Date.now(),
          endTime: Date.now(),
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const endTime = Date.now();

    return {
      total: testCases.length,
      passed,
      failed,
      duration: endTime - startTime,
      results,
      summary: `Executed ${testCases.length} test cases: ${passed} passed, ${failed} failed`,
      startTime,
      endTime,
    };
  }

  /** 暂停执行 */
  pause(): void {
    this.paused = true;
    this.status = AgentStatus.PAUSED;
  }

  /** 恢复执行 */
  resume(): void {
    this.paused = false;
    this.status = AgentStatus.EXECUTING;
  }

  /** 停止执行 */
  stop(): void {
    this.stopped = true;
    this.status = AgentStatus.STOPPED;
  }

  /** 获取当前执行状态 */
  getStatus(): 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed' {
    switch (this.status) {
      case AgentStatus.IDLE:
        return 'idle';
      case AgentStatus.EXECUTING:
        return 'running';
      case AgentStatus.PAUSED:
        return 'paused';
      case AgentStatus.STOPPED:
        return 'stopped';
      case AgentStatus.COMPLETED:
        return 'completed';
      case AgentStatus.FAILED:
        return 'failed';
      default:
        return 'idle';
    }
  }

  /** 获取当前执行上下文 */
  getCurrentContext(): ExecutionContext | null {
    return this.currentContext;
  }

  /** 获取执行历史 */
  getExecutionHistory(): StepHistory[] {
    return [...this.executionHistory];
  }

  /** 获取统计信息 */
  getStatistics(): AgentStatistics {
    return { ...this.statistics };
  }

  /** 重置 Agent 状态 */
  reset(): void {
    this.status = AgentStatus.IDLE;
    this.currentContext = null;
    this.executionHistory = [];
    this.statistics = this.createEmptyStatistics();
    this.paused = false;
    this.stopped = false;
  }

  // ============ 私有方法 ============

  private async attemptFix(context: ExecutionContext): Promise<void> {
    try {
      const failureType = await this.fixExecutor.diagnose(context);
      const fixResult = await this.fixExecutor.fix(context, failureType);

      this.statistics.totalFixAttempts++;
      if (fixResult.success) {
        this.statistics.successFixAttempts++;
        this.statistics.fixedSteps++;
      }
    } catch (error) {
      // 修复失败，继续执行
    }
  }

  private createEmptyStatistics(): AgentStatistics {
    return {
      totalSteps: 0,
      successSteps: 0,
      failedSteps: 0,
      fixedSteps: 0,
      averageStepDuration: 0,
      totalFixAttempts: 0,
      successFixAttempts: 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
