import { FailureType } from '@core/interfaces/fixer.interface';

/**
 * 分类规则
 */
interface ClassificationRule {
  /** 正则匹配模式 */
  pattern: RegExp;
  /** 失败类型 */
  failureType: FailureType;
  /** 规则权重 (0-1) */
  weight: number;
  /** 规则描述 */
  description: string;
}

/**
 * 分类结果
 */
export interface ClassificationResult {
  /** 失败类型 */
  failureType: FailureType;
  /** 置信度 (0-1) */
  confidence: number;
  /** 匹配的规则 */
  matchedRules: Array<{
    pattern: string;
    failureType: FailureType;
    weight: number;
  }>;
  /** 上下文信息 */
  context: {
    errorSnippet: string;
    observationSnippet: string;
  };
}

/**
 * ErrorClassifier - 错误分类器
 * 基于正则规则和权重对错误进行分类
 * 置信度 = 规则权重 × 上下文匹配度
 */
export class ErrorClassifier {
  private rules: ClassificationRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  /**
   * 分类错误
   * @param error 错误信息
   * @param observation 观察信息
   * @param context 上下文信息
   */
  classify(error: string, observation: string, context?: Record<string, any>): ClassificationResult {
    const text = `${error} ${observation}`.trim();
    const matchedRules: ClassificationResult['matchedRules'] = [];

    // 对每条规则进行匹配
    for (const rule of this.rules) {
      if (rule.pattern.test(text)) {
        matchedRules.push({
          pattern: rule.pattern.source,
          failureType: rule.failureType,
          weight: rule.weight,
        });
      }
    }

    // 如果没有匹配到任何规则
    if (matchedRules.length === 0) {
      return {
        failureType: FailureType.UNKNOWN,
        confidence: 0,
        matchedRules: [],
        context: {
          errorSnippet: error.slice(0, 200),
          observationSnippet: observation.slice(0, 200),
        },
      };
    }

    // 按失败类型聚合权重
    const typeWeights = new Map<FailureType, number>();
    for (const match of matchedRules) {
      const current = typeWeights.get(match.failureType) || 0;
      typeWeights.set(match.failureType, current + match.weight);
    }

    // 选择权重最高的类型
    let bestType = FailureType.UNKNOWN;
    let bestWeight = 0;
    for (const [type, weight] of typeWeights.entries()) {
      if (weight > bestWeight) {
        bestType = type;
        bestWeight = weight;
      }
    }

    // 计算置信度
    // 置信度 = min(规则权重总和, 1.0) × 上下文匹配度
    const ruleConfidence = Math.min(bestWeight, 1.0);
    const contextFactor = this.calculateContextFactor(error, observation, context);
    const confidence = ruleConfidence * (0.6 + 0.4 * contextFactor);

    return {
      failureType: bestType,
      confidence: Math.min(confidence, 1.0),
      matchedRules,
      context: {
        errorSnippet: error.slice(0, 200),
        observationSnippet: observation.slice(0, 200),
      },
    };
  }

  /**
   * 添加自定义分类规则
   */
  addRule(pattern: RegExp, failureType: FailureType, weight: number, description: string): void {
    this.rules.push({ pattern, failureType, weight, description });
  }

  /**
   * 移除分类规则
   */
  removeRule(description: string): void {
    this.rules = this.rules.filter(r => r.description !== description);
  }

  /**
   * 获取所有规则
   */
  getRules(): ReadonlyArray<ClassificationRule> {
    return this.rules;
  }

  // ============ 私有方法 ============

  private registerDefaultRules(): void {
    // 元素未找到
    this.rules.push(
      { pattern: /element not found/i, failureType: FailureType.ELEMENT_NOT_FOUND, weight: 0.95, description: 'element not found (EN)' },
      { pattern: /no such element/i, failureType: FailureType.ELEMENT_NOT_FOUND, weight: 0.95, description: 'no such element (EN)' },
      { pattern: /unable to locate/i, failureType: FailureType.ELEMENT_NOT_FOUND, weight: 0.9, description: 'unable to locate (EN)' },
      { pattern: /cannot find element/i, failureType: FailureType.ELEMENT_NOT_FOUND, weight: 0.9, description: 'cannot find element (EN)' },
      { pattern: /元素未找到/i, failureType: FailureType.ELEMENT_NOT_FOUND, weight: 0.95, description: '元素未找到 (CN)' },
      { pattern: /找不到元素/i, failureType: FailureType.ELEMENT_NOT_FOUND, weight: 0.95, description: '找不到元素 (CN)' },
    );

    // 元素不可点击
    this.rules.push(
      { pattern: /element not clickable/i, failureType: FailureType.ELEMENT_NOT_CLICKABLE, weight: 0.95, description: 'element not clickable (EN)' },
      { pattern: /element is not enabled/i, failureType: FailureType.ELEMENT_NOT_CLICKABLE, weight: 0.9, description: 'element not enabled (EN)' },
      { pattern: /click intercepted/i, failureType: FailureType.ELEMENT_NOT_CLICKABLE, weight: 0.9, description: 'click intercepted (EN)' },
      { pattern: /元素不可点击/i, failureType: FailureType.ELEMENT_NOT_CLICKABLE, weight: 0.95, description: '元素不可点击 (CN)' },
      { pattern: /元素被遮挡/i, failureType: FailureType.ELEMENT_NOT_CLICKABLE, weight: 0.9, description: '元素被遮挡 (CN)' },
    );

    // 断言失败
    this.rules.push(
      { pattern: /assertion failed/i, failureType: FailureType.ASSERTION_FAILED, weight: 0.95, description: 'assertion failed (EN)' },
      { pattern: /assert.*failed/i, failureType: FailureType.ASSERTION_FAILED, weight: 0.85, description: 'assert failed (EN)' },
      { pattern: /expected.*but got/i, failureType: FailureType.ASSERTION_FAILED, weight: 0.9, description: 'expected but got (EN)' },
      { pattern: /断言失败/i, failureType: FailureType.ASSERTION_FAILED, weight: 0.95, description: '断言失败 (CN)' },
      { pattern: /预期结果不匹配/i, failureType: FailureType.ASSERTION_FAILED, weight: 0.9, description: '预期结果不匹配 (CN)' },
    );

    // 超时
    this.rules.push(
      { pattern: /timeout/i, failureType: FailureType.TIMEOUT, weight: 0.9, description: 'timeout (EN)' },
      { pattern: /timed out/i, failureType: FailureType.TIMEOUT, weight: 0.95, description: 'timed out (EN)' },
      { pattern: /超时/i, failureType: FailureType.TIMEOUT, weight: 0.95, description: '超时 (CN)' },
      { pattern: /等待超时/i, failureType: FailureType.TIMEOUT, weight: 0.95, description: '等待超时 (CN)' },
    );

    // 崩溃
    this.rules.push(
      { pattern: /crash/i, failureType: FailureType.CRASH, weight: 0.95, description: 'crash (EN)' },
      { pattern: /fatal exception/i, failureType: FailureType.CRASH, weight: 0.95, description: 'fatal exception (EN)' },
      { pattern: /应用崩溃/i, failureType: FailureType.CRASH, weight: 0.95, description: '应用崩溃 (CN)' },
      { pattern: /闪退/i, failureType: FailureType.CRASH, weight: 0.95, description: '闪退 (CN)' },
    );

    // ANR
    this.rules.push(
      { pattern: /application not responding/i, failureType: FailureType.ANR, weight: 0.95, description: 'ANR (EN)' },
      { pattern: /\banr\b/i, failureType: FailureType.ANR, weight: 0.85, description: 'ANR keyword (EN)' },
      { pattern: /应用无响应/i, failureType: FailureType.ANR, weight: 0.95, description: '应用无响应 (CN)' },
    );

    // 网络错误
    this.rules.push(
      { pattern: /network error/i, failureType: FailureType.NETWORK_ERROR, weight: 0.95, description: 'network error (EN)' },
      { pattern: /connection refused/i, failureType: FailureType.NETWORK_ERROR, weight: 0.9, description: 'connection refused (EN)' },
      { pattern: /connection reset/i, failureType: FailureType.NETWORK_ERROR, weight: 0.9, description: 'connection reset (EN)' },
      { pattern: /网络错误/i, failureType: FailureType.NETWORK_ERROR, weight: 0.95, description: '网络错误 (CN)' },
      { pattern: /连接失败/i, failureType: FailureType.NETWORK_ERROR, weight: 0.9, description: '连接失败 (CN)' },
    );

    // 权限拒绝
    this.rules.push(
      { pattern: /permission denied/i, failureType: FailureType.PERMISSION_DENIED, weight: 0.95, description: 'permission denied (EN)' },
      { pattern: /access denied/i, failureType: FailureType.PERMISSION_DENIED, weight: 0.9, description: 'access denied (EN)' },
      { pattern: /权限拒绝/i, failureType: FailureType.PERMISSION_DENIED, weight: 0.95, description: '权限拒绝 (CN)' },
      { pattern: /没有权限/i, failureType: FailureType.PERMISSION_DENIED, weight: 0.9, description: '没有权限 (CN)' },
    );

    // 状态不匹配
    this.rules.push(
      { pattern: /state mismatch/i, failureType: FailureType.STATE_MISMATCH, weight: 0.95, description: 'state mismatch (EN)' },
      { pattern: /unexpected state/i, failureType: FailureType.STATE_MISMATCH, weight: 0.9, description: 'unexpected state (EN)' },
      { pattern: /状态不匹配/i, failureType: FailureType.STATE_MISMATCH, weight: 0.95, description: '状态不匹配 (CN)' },
      { pattern: /状态异常/i, failureType: FailureType.STATE_MISMATCH, weight: 0.85, description: '状态异常 (CN)' },
    );
  }

  /**
   * 计算上下文匹配因子
   * 如果上下文信息与匹配结果一致，则提高置信度
   */
  private calculateContextFactor(
    error: string,
    observation: string,
    context?: Record<string, any>
  ): number {
    let factor = 0.5; // 基础因子

    // 如果有错误信息，增加因子
    if (error && error.length > 0) factor += 0.2;
    // 如果有观察信息，增加因子
    if (observation && observation.length > 0) factor += 0.2;
    // 如果有额外上下文，增加因子
    if (context && Object.keys(context).length > 0) factor += 0.1;

    return Math.min(factor, 1.0);
  }
}
