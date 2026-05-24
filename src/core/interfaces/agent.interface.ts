import { TestCase } from '../types/test-case.type';
import { ExecutionContext, ExecutionReport, AgentConfig, AgentStatistics, StepHistory } from '../types/execution-context.type';

/**
 * 测试智能体接口
 * 定义 AI 测试 Agent 的核心行为
 */
export interface ITestAgent {
  /** 初始化 Agent */
  initialize(config: Partial<AgentConfig>): Promise<void>;

  /** 执行单个测试用例 */
  execute(testCase: TestCase): Promise<ExecutionContext>;

  /** 批量执行测试用例 */
  executeBatch(testCases: TestCase[]): Promise<ExecutionReport>;

  /** 暂停执行 */
  pause(): void;

  /** 恢复执行 */
  resume(): void;

  /** 停止执行 */
  stop(): void;

  /** 获取当前执行状态 */
  getStatus(): 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed';

  /** 获取当前执行上下文 */
  getCurrentContext(): ExecutionContext | null;

  /** 获取执行历史 */
  getExecutionHistory(): StepHistory[];

  /** 获取统计信息 */
  getStatistics(): AgentStatistics;

  /** 重置 Agent 状态 */
  reset(): void;
}

/**
 * ReAct 循环处理器接口
 */
export interface IReActProcessor {
  /** 思考步骤 */
  think(context: ExecutionContext): Promise<{
    thought: string;
    toolName: string;
    toolParams: Record<string, any>;
  }>;

  /** 执行步骤 */
  act(toolName: string, toolParams: Record<string, any>): Promise<any>;

  /** 观察步骤 */
  observe(result: any): Promise<{
    observation: string;
    passed: boolean;
    needsFix: boolean;
  }>;
}
