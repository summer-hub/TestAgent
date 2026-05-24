import { ExecutionContext, StepHistory } from '@core/types/execution-context.type';
import { FailureType } from '@core/interfaces/fixer.interface';

/**
 * 失败诊断器
 * 分析执行上下文，诊断失败类型
 */
export class FailureDiagnoser {
  /**
   * 诊断失败类型
   */
  diagnose(context: ExecutionContext): FailureType {
    const lastStep = this.getLastStep(context);
    if (!lastStep) {
      return FailureType.UNKNOWN;
    }

    const error = lastStep.error || '';
    const observation = lastStep.observation || '';
    const toolResult = lastStep.toolResult;

    // 元素未找到
    if (this.isElementNotFound(error, observation, toolResult)) {
      return FailureType.ELEMENT_NOT_FOUND;
    }

    // 元素不可点击
    if (this.isElementNotClickable(error, observation)) {
      return FailureType.ELEMENT_NOT_CLICKABLE;
    }

    // 断言失败
    if (this.isAssertionFailed(error, observation)) {
      return FailureType.ASSERTION_FAILED;
    }

    // 超时
    if (this.isTimeout(error, observation)) {
      return FailureType.TIMEOUT;
    }

    // 应用崩溃
    if (this.isCrash(error, observation)) {
      return FailureType.CRASH;
    }

    // ANR (Application Not Responding)
    if (this.isANR(error, observation)) {
      return FailureType.ANR;
    }

    // 网络错误
    if (this.isNetworkError(error, observation)) {
      return FailureType.NETWORK_ERROR;
    }

    // 权限拒绝
    if (this.isPermissionDenied(error, observation)) {
      return FailureType.PERMISSION_DENIED;
    }

    // 状态不匹配
    if (this.isStateMismatch(error, observation)) {
      return FailureType.STATE_MISMATCH;
    }

    return FailureType.UNKNOWN;
  }

  /**
   * 获取最后一步
   */
  private getLastStep(context: ExecutionContext): StepHistory | null {
    if (context.steps.length === 0) {
      return null;
    }
    return context.steps[context.steps.length - 1];
  }

  /**
   * 检查是否为元素未找到
   */
  private isElementNotFound(error: string, observation: string, toolResult?: any): boolean {
    const patterns = [
      /element not found/i,
      /no such element/i,
      /unable to locate/i,
      /cannot find element/i,
      /element.*not.*exist/i,
      /找不到元素/i,
      /元素未找到/i,
    ];

    const text = `${error} ${observation} ${JSON.stringify(toolResult || '')}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为元素不可点击
   */
  private isElementNotClickable(error: string, observation: string): boolean {
    const patterns = [
      /element not clickable/i,
      /element is not enabled/i,
      /element is not visible/i,
      /click intercepted/i,
      /other element would receive the click/i,
      /元素不可点击/i,
      /元素被遮挡/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为断言失败
   */
  private isAssertionFailed(error: string, observation: string): boolean {
    const patterns = [
      /assertion failed/i,
      /assert.*failed/i,
      /expected.*but got/i,
      /does not match/i,
      /not equal/i,
      /断言失败/i,
      /预期结果不匹配/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为超时
   */
  private isTimeout(error: string, observation: string): boolean {
    const patterns = [
      /timeout/i,
      /timed out/i,
      /time out/i,
      /exceeded.*time/i,
      /waiting.*failed/i,
      /超时/i,
      /等待超时/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为应用崩溃
   */
  private isCrash(error: string, observation: string): boolean {
    const patterns = [
      /crash/i,
      /crashed/i,
      /fatal exception/i,
      /force close/i,
      /application has stopped/i,
      /应用崩溃/i,
      /应用已停止/i,
      /闪退/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为 ANR
   */
  private isANR(error: string, observation: string): boolean {
    const patterns = [
      /anr/i,
      /application not responding/i,
      /not responding/i,
      /无响应/i,
      /应用无响应/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为网络错误
   */
  private isNetworkError(error: string, observation: string): boolean {
    const patterns = [
      /network error/i,
      /connection refused/i,
      /connection reset/i,
      /socket timeout/i,
      /no connection/i,
      /网络错误/i,
      /连接失败/i,
      /网络不可用/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为权限拒绝
   */
  private isPermissionDenied(error: string, observation: string): boolean {
    const patterns = [
      /permission denied/i,
      /no permission/i,
      /access denied/i,
      /权限拒绝/i,
      /没有权限/i,
      /权限不足/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为状态不匹配
   */
  private isStateMismatch(error: string, observation: string): boolean {
    const patterns = [
      /state mismatch/i,
      /unexpected state/i,
      /invalid state/i,
      /状态不匹配/i,
      /状态异常/i,
      /不符合预期状态/i,
    ];

    const text = `${error} ${observation}`;
    return patterns.some((pattern) => pattern.test(text));
  }
}
