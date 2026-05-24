import { FailureType, FixStrategy } from '@core/interfaces/fixer.interface';
import type { ClassificationResult } from '../classifier/error-classifier';

/**
 * 修复策略评分
 */
interface StrategyScore {
  /** 策略类型 */
  strategy: FixStrategy;
  /** 总评分 (0-1) */
  score: number;
  /** 置信度评分 (0-1) */
  confidenceScore: number;
  /** 历史成功率评分 (0-1) */
  historyScore: number;
  /** 上下文匹配评分 (0-1) */
  contextScore: number;
}

/**
 * 决策结果
 */
export interface DecisionResult {
  /** 推荐的修复策略列表（按评分排序） */
  strategies: StrategyScore[];
  /** 最佳策略 */
  bestStrategy: FixStrategy;
  /** 最佳策略评分 */
  bestScore: number;
  /** 决策原因 */
  reasoning: string;
  /** 决策时间戳 */
  timestamp: number;
}

/**
 * 历史成功率记录
 */
interface StrategyHistory {
  /** 尝试次数 */
  attempts: number;
  /** 成功次数 */
  successes: number;
  /** 最后尝试时间 */
  lastAttemptTime: number;
}

/**
 * 证据项
 */
export interface EvidenceItem {
  /** 证据类型 */
  type: 'error_log' | 'screenshot' | 'ui_tree' | 'execution_log';
  /** 证据内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 附加数据 */
  data?: any;
}

/**
 * FixDecisionEngine - 修复决策引擎
 * 根据诊断结果、历史成功率和上下文匹配度，推荐最佳修复策略
 *
 * 评分公式：score = confidence × 0.5 + history × 0.3 + context × 0.2
 */
export class FixDecisionEngine {
  /** 历史成功率记录: key = `${failureType}:${strategy}` */
  private history: Map<string, StrategyHistory> = new Map();
  /** 决策日志 */
  private decisionLog: DecisionResult[] = [];

  /**
   * 做出修复决策
   * @param classification 错误分类结果
   * @param context 上下文信息
   */
  decide(classification: ClassificationResult, context?: Record<string, any>): DecisionResult {
    const { failureType, confidence } = classification;
    const candidateStrategies = this.getCandidateStrategies(failureType);

    // 对每个候选策略计算评分
    const scores: StrategyScore[] = candidateStrategies.map(strategy => {
      const confidenceScore = this.calculateConfidenceScore(strategy, failureType, confidence);
      const historyScore = this.calculateHistoryScore(failureType, strategy);
      const contextScore = this.calculateContextScore(strategy, context);

      const score = confidenceScore * 0.5 + historyScore * 0.3 + contextScore * 0.2;

      return {
        strategy,
        score,
        confidenceScore,
        historyScore,
        contextScore,
      };
    });

    // 按评分排序
    scores.sort((a, b) => b.score - a.score);

    const best = scores[0]!;
    const reasoning = this.buildReasoning(failureType, scores, classification);

    const decision: DecisionResult = {
      strategies: scores,
      bestStrategy: best.strategy,
      bestScore: best.score,
      reasoning,
      timestamp: Date.now(),
    };

    this.decisionLog.push(decision);
    return decision;
  }

  /**
   * 记录策略执行结果
   */
  recordResult(failureType: FailureType, strategy: FixStrategy, success: boolean): void {
    const key = `${failureType}:${strategy}`;
    const record = this.history.get(key) || { attempts: 0, successes: 0, lastAttemptTime: 0 };

    record.attempts++;
    if (success) record.successes++;
    record.lastAttemptTime = Date.now();

    this.history.set(key, record);
  }

  /**
   * 获取决策日志
   */
  getDecisionLog(): DecisionResult[] {
    return [...this.decisionLog];
  }

  /**
   * 导出决策日志
   */
  exportLog(): string {
    return JSON.stringify(this.decisionLog, null, 2);
  }

  /**
   * 获取历史成功率
   */
  getHistoryStats(failureType: FailureType, strategy: FixStrategy): { attempts: number; successes: number; successRate: number } {
    const key = `${failureType}:${strategy}`;
    const record = this.history.get(key);
    if (!record || record.attempts === 0) {
      return { attempts: 0, successes: 0, successRate: 0 };
    }
    return {
      attempts: record.attempts,
      successes: record.successes,
      successRate: record.successes / record.attempts,
    };
  }

  /**
   * 清空历史和决策日志
   */
  reset(): void {
    this.history.clear();
    this.decisionLog = [];
  }

  // ============ 私有方法 ============

  /**
   * 获取失败类型对应的候选修复策略
   */
  private getCandidateStrategies(failureType: FailureType): FixStrategy[] {
    switch (failureType) {
      case FailureType.ELEMENT_NOT_FOUND:
        return [
          FixStrategy.SCROLL_AND_RETRY,
          FixStrategy.ALTERNATIVE_LOCATOR,
          FixStrategy.WAIT_AND_RETRY,
        ];
      case FailureType.ELEMENT_NOT_CLICKABLE:
        return [
          FixStrategy.WAIT_AND_RETRY,
          FixStrategy.ALTERNATIVE_LOCATOR,
          FixStrategy.SCROLL_AND_RETRY,
        ];
      case FailureType.ASSERTION_FAILED:
        return [
          FixStrategy.RETRY,
          FixStrategy.ALTERNATIVE_LOCATOR,
        ];
      case FailureType.TIMEOUT:
        return [
          FixStrategy.WAIT_AND_RETRY,
          FixStrategy.RETRY,
          FixStrategy.RESTART_APP,
        ];
      case FailureType.CRASH:
      case FailureType.ANR:
        return [
          FixStrategy.RESTART_APP,
          FixStrategy.WAIT_AND_RETRY,
        ];
      case FailureType.NETWORK_ERROR:
        return [
          FixStrategy.WAIT_AND_RETRY,
          FixStrategy.RETRY,
        ];
      case FailureType.PERMISSION_DENIED:
        return [
          FixStrategy.RETRY,
        ];
      case FailureType.STATE_MISMATCH:
        return [
          FixStrategy.RETRY,
          FixStrategy.WAIT_AND_RETRY,
          FixStrategy.RESTART_APP,
        ];
      default:
        return [FixStrategy.RETRY];
    }
  }

  /**
   * 计算置信度评分
   * 如果策略与失败类型关联度高，则评分高
   */
  private calculateConfidenceScore(
    strategy: FixStrategy,
    failureType: FailureType,
    classificationConfidence: number
  ): number {
    // 策略与失败类型的关联度
    const relevanceMap: Record<string, Record<FixStrategy, number>> = {
      [FailureType.ELEMENT_NOT_FOUND]: {
        [FixStrategy.SCROLL_AND_RETRY]: 0.95,
        [FixStrategy.ALTERNATIVE_LOCATOR]: 0.85,
        [FixStrategy.WAIT_AND_RETRY]: 0.5,
        [FixStrategy.RETRY]: 0.3,
        [FixStrategy.RESTART_APP]: 0.1,
      },
      [FailureType.ELEMENT_NOT_CLICKABLE]: {
        [FixStrategy.WAIT_AND_RETRY]: 0.9,
        [FixStrategy.ALTERNATIVE_LOCATOR]: 0.7,
        [FixStrategy.SCROLL_AND_RETRY]: 0.5,
        [FixStrategy.RETRY]: 0.3,
        [FixStrategy.RESTART_APP]: 0.1,
      },
      [FailureType.TIMEOUT]: {
        [FixStrategy.WAIT_AND_RETRY]: 0.9,
        [FixStrategy.RETRY]: 0.6,
        [FixStrategy.RESTART_APP]: 0.3,
        [FixStrategy.SCROLL_AND_RETRY]: 0.1,
        [FixStrategy.ALTERNATIVE_LOCATOR]: 0.1,
      },
      [FailureType.CRASH]: {
        [FixStrategy.RESTART_APP]: 0.95,
        [FixStrategy.WAIT_AND_RETRY]: 0.5,
        [FixStrategy.RETRY]: 0.3,
        [FixStrategy.SCROLL_AND_RETRY]: 0.05,
        [FixStrategy.ALTERNATIVE_LOCATOR]: 0.05,
      },
    };

    const typeMap = relevanceMap[failureType];
    const relevance = typeMap?.[strategy] ?? 0.3;

    // 综合分类置信度和策略关联度
    return classificationConfidence * relevance;
  }

  /**
   * 计算历史成功率评分
   */
  private calculateHistoryScore(failureType: FailureType, strategy: FixStrategy): number {
    const key = `${failureType}:${strategy}`;
    const record = this.history.get(key);

    if (!record || record.attempts === 0) {
      // 无历史记录时给中等评分
      return 0.5;
    }

    const successRate = record.successes / record.attempts;

    // 样本量越大，历史数据越可靠
    const confidence = Math.min(record.attempts / 10, 1.0);
    return successRate * confidence + 0.5 * (1 - confidence);
  }

  /**
   * 计算上下文匹配评分
   */
  private calculateContextScore(strategy: FixStrategy, context?: Record<string, any>): number {
    if (!context) return 0.5;

    let score = 0.5;

    // 检查上下文是否提供对策略有用的信息
    switch (strategy) {
      case FixStrategy.ALTERNATIVE_LOCATOR:
        if (context.availableLocators) score += 0.3;
        if (context.locatorHistory) score += 0.2;
        break;
      case FixStrategy.SCROLL_AND_RETRY:
        if (context.scrollDirection) score += 0.3;
        if (context.scrollable) score += 0.2;
        break;
      case FixStrategy.WAIT_AND_RETRY:
        if (context.waitTime) score += 0.2;
        if (context.loading) score += 0.3;
        break;
      case FixStrategy.RESTART_APP:
        if (context.appState === 'crashed') score += 0.4;
        if (context.canRestart) score += 0.1;
        break;
      case FixStrategy.RETRY:
        if (context.retryCount !== undefined) score += 0.2;
        break;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 构建决策原因描述
   */
  private buildReasoning(
    failureType: FailureType,
    scores: StrategyScore[],
    classification: ClassificationResult
  ): string {
    const best = scores[0]!;
    const lines: string[] = [];

    lines.push(`Failure type: ${failureType} (confidence: ${(classification.confidence * 100).toFixed(1)}%)`);
    lines.push(`Recommended strategy: ${best.strategy} (score: ${(best.score * 100).toFixed(1)}%)`);
    lines.push(`  - Confidence score: ${(best.confidenceScore * 100).toFixed(1)}%`);
    lines.push(`  - History score: ${(best.historyScore * 100).toFixed(1)}%`);
    lines.push(`  - Context score: ${(best.contextScore * 100).toFixed(1)}%`);

    if (scores.length > 1) {
      lines.push(`Alternatives:`);
      for (let i = 1; i < Math.min(scores.length, 4); i++) {
        const s = scores[i]!;
        lines.push(`  ${i}. ${s.strategy} (${(s.score * 100).toFixed(1)}%)`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * 证据收集器
 * 收集诊断所需的证据（错误日志、截图、UI 树、执行日志）
 */
export class EvidenceCollector {
  private evidence: EvidenceItem[] = [];

  /**
   * 收集错误日志证据
   */
  addErrorLog(error: string): void {
    this.evidence.push({
      type: 'error_log',
      content: error,
      timestamp: Date.now(),
    });
  }

  /**
   * 收集截图证据
   */
  addScreenshot(data: Buffer | string): void {
    this.evidence.push({
      type: 'screenshot',
      content: typeof data === 'string' ? data : `[Buffer: ${data.length} bytes]`,
      timestamp: Date.now(),
      data: data,
    });
  }

  /**
   * 收集 UI 树证据
   */
  addUiTree(tree: string): void {
    this.evidence.push({
      type: 'ui_tree',
      content: tree,
      timestamp: Date.now(),
    });
  }

  /**
   * 收集执行日志证据
   */
  addExecutionLog(log: string): void {
    this.evidence.push({
      type: 'execution_log',
      content: log,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取所有证据
   */
  getEvidence(): EvidenceItem[] {
    // 按时间戳排序
    return [...this.evidence].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 导出证据为 JSON
   */
  exportJson(): string {
    return JSON.stringify(this.evidence, null, 2);
  }

  /**
   * 导出压缩证据
   */
  exportCompressed(): string {
    // 简化版：只保留非二进制证据
    const filtered = this.evidence.filter(e => e.type !== 'screenshot');
    return JSON.stringify(filtered);
  }

  /**
   * 清空证据
   */
  clear(): void {
    this.evidence = [];
  }

  /**
   * 获取证据数量
   */
  get count(): number {
    return this.evidence.length;
  }
}
