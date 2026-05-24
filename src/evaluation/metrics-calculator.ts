/**
 * MetricsCalculator - 评测指标计算器
 * 从样本结果中聚合计算全部 15 个评测指标
 */

import type {
  EvalSampleResult,
  EvalReport,
  EvalMetrics,
  LevelScores,
  CategoryScores,
  StepComparison,
  MetricWeights,
  EvalDifficulty,
} from './types';

const DEFAULT_WEIGHTS: MetricWeights = {
  taskSuccess: 0.30,
  fixCapability: 0.20,
  efficiency: 0.20,
  correctness: 0.30,
};

/**
 * MetricsCalculator - 指标计算器
 */
export class MetricsCalculator {
  private weights: MetricWeights;

  constructor(weights?: Partial<MetricWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /**
   * 从样本结果列表中计算全部指标
   */
  calculate(
    results: EvalSampleResult[],
    totalDuration: number
  ): { metrics: EvalMetrics; levelScores: LevelScores; categoryScores: CategoryScores; summary: string } {
    if (results.length === 0) {
      return {
        metrics: this.emptyMetrics(),
        levelScores: this.emptyLevelScores(),
        categoryScores: {},
        summary: 'No samples evaluated.',
      };
    }

    const metrics = this.computeMetrics(results, totalDuration);
    const levelScores = this.computeLevelScores(results);
    const categoryScores = this.computeCategoryScores(results);
    const summary = this.generateSummary(metrics, levelScores);

    return { metrics, levelScores, categoryScores, summary };
  }

  // ============ 全局指标计算 ============

  private computeMetrics(results: EvalSampleResult[], totalDuration: number): EvalMetrics {
    const totalSamples = results.length;

    // --- 任务成功指标 ---
    const casePassRate = results.filter(r => r.statusMatch).length / totalSamples;

    let totalSteps = 0;
    let passedSteps = 0;
    let firstAttemptSteps = 0;
    for (const r of results) {
      totalSteps += r.stepComparisons.length;
      passedSteps += r.stepComparisons.filter(s =>
        s.status === 'success' || s.status === 'fixed'
      ).length;
      firstAttemptSteps += r.stepComparisons.filter(s =>
        s.status === 'success' && !s.fixTriggered
      ).length;
    }
    const stepPassRate = totalSteps > 0 ? passedSteps / totalSteps : 0;
    const firstAttemptRate = totalSteps > 0 ? firstAttemptSteps / totalSteps : 0;

    // --- 自愈指标 ---
    const fixableSamples = results.filter(r => r.fixTriggered);
    const fixTriggerRate = fixableSamples.length / totalSamples;
    const successfulFixes = fixableSamples.filter(r => r.fixSuccess).length;
    const fixSuccessRate = fixableSamples.length > 0
      ? successfulFixes / fixableSamples.length
      : 1; // 不需要自愈视为满分

    const fixOverheadMs = fixableSamples.length > 0
      ? fixableSamples.reduce((sum, r) => sum + r.duration, 0) / fixableSamples.length
        - results.filter(r => !r.fixTriggered).reduce((sum, r) => sum + r.duration, 0)
        / Math.max(results.filter(r => !r.fixTriggered).length, 1)
      : 0;

    // --- 效率指标 ---
    const avgStepsPerCase = totalSteps / totalSamples;
    const avgCaseDurationMs = totalDuration / totalSamples;

    let thinkCount = 0;
    let actCount = 0;
    for (const r of results) {
      for (const s of r.stepComparisons) {
        if (s.actualTool === 'think') thinkCount++;
        else actCount++;
      }
    }
    const avgThinkLatencyMs = totalDuration / Math.max(totalSteps, 1);
    const avgActLatencyMs = avgCaseDurationMs;

    // --- 正确性指标 ---
    let toolAccuracySum = 0;
    let locatorAccuracySum = 0;
    let paramAccuracySum = 0;
    let assertionSteps = 0;
    let assertionCorrect = 0;

    for (const r of results) {
      toolAccuracySum += r.scores.toolAccuracy;
      locatorAccuracySum += r.scores.locatorAccuracy;
      paramAccuracySum += r.scores.paramAccuracy;

      for (const s of r.stepComparisons) {
        if (s.expectedTool.toLowerCase().includes('assert') ||
            s.expectedTool.toLowerCase().includes('verify')) {
          assertionSteps++;
          if (s.toolMatch && s.status === 'success') assertionCorrect++;
        }
      }
    }

    const toolAccuracy = toolAccuracySum / totalSamples;
    const locatorAccuracy = locatorAccuracySum / totalSamples;
    const paramAccuracy = paramAccuracySum / totalSamples;
    const assertionAccuracy = assertionSteps > 0
      ? assertionCorrect / assertionSteps
      : 1;

    // --- 加权综合得分 (0-100) ---
    const taskScore = (casePassRate * 0.6 + stepPassRate * 0.3 + firstAttemptRate * 0.1) * 100;
    const fixScore = fixSuccessRate * 100;
    const effScore = Math.max(0, 100 - (avgStepsPerCase * 5) - (avgCaseDurationMs / 1000));
    const corrScore = (toolAccuracy * 0.4 + locatorAccuracy * 0.3 + paramAccuracy * 0.2 + assertionAccuracy * 0.1) * 100;

    const weightedScore =
      taskScore * this.weights.taskSuccess +
      fixScore * this.weights.fixCapability +
      effScore * this.weights.efficiency +
      corrScore * this.weights.correctness;

    return {
      casePassRate: round(casePassRate),
      stepPassRate: round(stepPassRate),
      firstAttemptRate: round(firstAttemptRate),
      fixTriggerRate: round(fixTriggerRate),
      fixSuccessRate: round(fixSuccessRate),
      fixOverheadMs: Math.round(fixOverheadMs),
      avgStepsPerCase: round(avgStepsPerCase),
      avgThinkLatencyMs: Math.round(avgThinkLatencyMs),
      avgActLatencyMs: Math.round(avgActLatencyMs),
      avgCaseDurationMs: Math.round(avgCaseDurationMs),
      toolAccuracy: round(toolAccuracy),
      locatorAccuracy: round(locatorAccuracy),
      paramAccuracy: round(paramAccuracy),
      assertionAccuracy: round(assertionAccuracy),
      weightedScore: round(weightedScore),
    };
  }

  // ============ 分层得分 ============

  private computeLevelScores(results: EvalSampleResult[]): LevelScores {
    const empty = () => ({
      count: 0,
      scores: { stepPassRate: 0, toolAccuracy: 0, locatorAccuracy: 0, paramAccuracy: 0, composite: 0 },
    });

    const levels: Record<EvalDifficulty, EvalSampleResult[]> = { L0: [], L1: [], L2: [], L3: [] };
    for (const r of results) {
      levels[r.difficulty]?.push(r);
    }

    return {
      L0: this.aggregateLevel(levels.L0),
      L1: this.aggregateLevel(levels.L1),
      L2: this.aggregateLevel(levels.L2),
      L3: this.aggregateLevel(levels.L3),
    };
  }

  private aggregateLevel(samples: EvalSampleResult[]): LevelScores['L0'] {
    if (samples.length === 0) {
      return { count: 0, scores: { stepPassRate: 0, toolAccuracy: 0, locatorAccuracy: 0, paramAccuracy: 0, composite: 0 } };
    }
    return {
      count: samples.length,
      scores: {
        stepPassRate: round(mean(samples.map(s => s.scores.stepPassRate))),
        toolAccuracy: round(mean(samples.map(s => s.scores.toolAccuracy))),
        locatorAccuracy: round(mean(samples.map(s => s.scores.locatorAccuracy))),
        paramAccuracy: round(mean(samples.map(s => s.scores.paramAccuracy))),
        composite: round(mean(samples.map(s => s.scores.composite))),
      },
    };
  }

  // ============ 分类得分 ============

  private computeCategoryScores(results: EvalSampleResult[]): CategoryScores {
    const cats: Record<string, EvalSampleResult[]> = {};
    for (const r of results) {
      const cat = r.category || 'uncategorized';
      if (!cats[cat]) cats[cat] = [];
      cats[cat]!.push(r);
    }

    const scores: CategoryScores = {};
    for (const [cat, samples] of Object.entries(cats)) {
      scores[cat] = {
        count: samples.length,
        scores: {
          stepPassRate: round(mean(samples.map(s => s.scores.stepPassRate))),
          toolAccuracy: round(mean(samples.map(s => s.scores.toolAccuracy))),
          locatorAccuracy: round(mean(samples.map(s => s.scores.locatorAccuracy))),
          paramAccuracy: round(mean(samples.map(s => s.scores.paramAccuracy))),
          composite: round(mean(samples.map(s => s.scores.composite))),
        },
      };
    }
    return scores;
  }

  // ============ 摘要生成 ============

  private generateSummary(metrics: EvalMetrics, levels: LevelScores): string {
    const lines = [
      `加权综合得分: ${metrics.weightedScore.toFixed(1)} / 100`,
      '',
      `任务成功: 用例通过率 ${(metrics.casePassRate * 100).toFixed(1)}%, 步骤通过率 ${(metrics.stepPassRate * 100).toFixed(1)}%, 一次通过率 ${(metrics.firstAttemptRate * 100).toFixed(1)}%`,
      `自愈能力: 触发率 ${(metrics.fixTriggerRate * 100).toFixed(1)}%, 成功率 ${(metrics.fixSuccessRate * 100).toFixed(1)}%`,
      `效率: 平均 ${metrics.avgStepsPerCase.toFixed(1)} 步/用例, ${metrics.avgCaseDurationMs}ms/用例`,
      `正确性: 工具 ${(metrics.toolAccuracy * 100).toFixed(1)}%, 定位 ${(metrics.locatorAccuracy * 100).toFixed(1)}%, 参数 ${(metrics.paramAccuracy * 100).toFixed(1)}%`,
      '',
      '分层表现:',
      ...(['L0', 'L1', 'L2', 'L3'] as EvalDifficulty[]).map(l =>
        `  ${l}: ${levels[l].count} 样本, 综合 ${(levels[l].scores.composite * 100).toFixed(1)}%`
      ),
    ];

    return lines.join('\n');
  }

  // ============ 工具方法 ============

  private emptyMetrics(): EvalMetrics {
    return {
      casePassRate: 0,
      stepPassRate: 0,
      firstAttemptRate: 0,
      fixTriggerRate: 0,
      fixSuccessRate: 0,
      fixOverheadMs: 0,
      avgStepsPerCase: 0,
      avgThinkLatencyMs: 0,
      avgActLatencyMs: 0,
      avgCaseDurationMs: 0,
      toolAccuracy: 0,
      locatorAccuracy: 0,
      paramAccuracy: 0,
      assertionAccuracy: 0,
      weightedScore: 0,
    };
  }

  private emptyLevelScores(): LevelScores {
    const empty = { count: 0, scores: { stepPassRate: 0, toolAccuracy: 0, locatorAccuracy: 0, paramAccuracy: 0, composite: 0 } };
    return { L0: empty, L1: empty, L2: empty, L3: empty };
  }
}

// ============ 工具函数 ============

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function round(n: number, decimals = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
