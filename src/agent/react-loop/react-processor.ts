import { IReActProcessor } from '@core/interfaces/agent.interface';
import { IMCPClient } from '@core/interfaces/mcp.interface';
import { ExecutionContext, StepHistory, StepStatus } from '@core/types/execution-context.type';
import { ToolResult } from '@core/types/tool-result.type';

/**
 * ReAct 步骤结果
 */
export interface ReActStepResult {
  thought: string;
  toolName: string;
  toolParams: Record<string, any>;
  toolResult: any;
  observation: string;
  passed: boolean;
  needsFix: boolean;
}

/**
 * ReActProcessor - ReAct 循环处理器
 * 实现 Think -> Act -> Observe 循环
 */
export class ReActProcessor implements IReActProcessor {
  private mcpClient: IMCPClient;

  constructor(mcpClient: IMCPClient) {
    this.mcpClient = mcpClient;
  }

  /**
   * 思考步骤
   * 分析当前状态，决定下一步操作
   */
  async think(context: ExecutionContext): Promise<{
    thought: string;
    toolName: string;
    toolParams: Record<string, any>;
  }> {
    const testCase = context.testCase;
    const currentStep = context.steps.length;
    const totalSteps = testCase.steps.length;

    if (currentStep >= totalSteps) {
      return {
        thought: 'All steps completed. Test case finished.',
        toolName: 'finish',
        toolParams: { status: 'completed' },
      };
    }

    const stepDescription = testCase.steps[currentStep];

    // 构建思考提示
    const thought = this.buildThought(context, stepDescription);

    // 根据步骤描述选择合适的工具
    const { toolName, toolParams } = this.selectTool(stepDescription, context);

    return { thought, toolName, toolParams };
  }

  /**
   * 执行步骤
   * 调用工具执行操作
   */
  async act(toolName: string, toolParams: Record<string, any>): Promise<any> {
    if (toolName === 'finish') {
      return { status: 'completed' };
    }

    const result = await this.mcpClient.callTool(toolName, toolParams);
    return result;
  }

  /**
   * 观察步骤
   * 分析执行结果，判断是否需要修复
   */
  async observe(result: any): Promise<{
    observation: string;
    passed: boolean;
    needsFix: boolean;
  }> {
    if (result.success === false) {
      return {
        observation: `Execution failed: ${result.error || 'Unknown error'}`,
        passed: false,
        needsFix: true,
      };
    }

    const toolResult = result as ToolResult;

    return {
      observation: toolResult.content || 'Execution completed successfully',
      passed: true,
      needsFix: false,
    };
  }

  /**
   * 执行完整的 ReAct 循环
   */
  async executeStep(context: ExecutionContext): Promise<ReActStepResult> {
    const stepNumber = context.steps.length + 1;
    const stepId = `step-${stepNumber}-${Date.now()}`;

    // 1. Think
    const thinkResult = await this.think(context);

    const stepHistory: StepHistory = {
      stepId,
      stepNumber,
      status: StepStatus.THINKING,
      thought: thinkResult.thought,
      chosenTool: thinkResult.toolName,
      toolParams: thinkResult.toolParams,
      toolResult: null,
      observation: '',
      passed: false,
      fixAttempted: false,
      startTime: Date.now(),
    };

    context.steps.push(stepHistory);

    // 2. Act
    stepHistory.status = StepStatus.ACTING;
    const toolResult = await this.act(thinkResult.toolName, thinkResult.toolParams);
    stepHistory.toolResult = toolResult;

    // 3. Observe
    stepHistory.status = StepStatus.OBSERVING;
    const observeResult = await this.observe(toolResult);
    stepHistory.observation = observeResult.observation;
    stepHistory.passed = observeResult.passed;

    if (observeResult.passed) {
      stepHistory.status = StepStatus.SUCCESS;
    } else {
      stepHistory.status = StepStatus.FAILED;
    }

    stepHistory.endTime = Date.now();
    stepHistory.duration = stepHistory.endTime - stepHistory.startTime;

    return {
      thought: thinkResult.thought,
      toolName: thinkResult.toolName,
      toolParams: thinkResult.toolParams,
      toolResult,
      observation: observeResult.observation,
      passed: observeResult.passed,
      needsFix: observeResult.needsFix,
    };
  }

  // ============ 私有方法 ============

  private buildThought(context: ExecutionContext, stepDescription: string): string {
    const completedSteps = context.steps.filter((s) => s.status === StepStatus.SUCCESS).length;
    const failedSteps = context.steps.filter((s) => s.status === StepStatus.FAILED).length;

    return `Step ${completedSteps + 1}: ${stepDescription}. ` +
      `Completed: ${completedSteps}, Failed: ${failedSteps}. ` +
      `Analyzing current state to determine the best action.`;
  }

  private selectTool(
    stepDescription: string,
    context: ExecutionContext
  ): { toolName: string; toolParams: Record<string, any> } {
    // 简单的工具选择逻辑
    // 实际实现中会使用 LLM 来决定工具选择

    const lowerDesc = stepDescription.toLowerCase();

    if (lowerDesc.includes('click') || lowerDesc.includes('tap')) {
      return {
        toolName: 'click_element',
        toolParams: { description: stepDescription },
      };
    }

    if (lowerDesc.includes('input') || lowerDesc.includes('type') || lowerDesc.includes('enter')) {
      return {
        toolName: 'input_text',
        toolParams: { description: stepDescription },
      };
    }

    if (lowerDesc.includes('swipe') || lowerDesc.includes('scroll')) {
      return {
        toolName: 'swipe_screen',
        toolParams: { description: stepDescription },
      };
    }

    if (lowerDesc.includes('wait')) {
      return {
        toolName: 'wait',
        toolParams: { description: stepDescription },
      };
    }

    if (lowerDesc.includes('assert') || lowerDesc.includes('verify') || lowerDesc.includes('check')) {
      return {
        toolName: 'assert_element',
        toolParams: { description: stepDescription },
      };
    }

    if (lowerDesc.includes('screenshot')) {
      return {
        toolName: 'take_screenshot',
        toolParams: { description: stepDescription },
      };
    }

    // 默认工具
    return {
      toolName: 'execute_action',
      toolParams: { description: stepDescription },
    };
  }
}
