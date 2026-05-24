/**
 * BenchmarkRunner - 评测执行器
 * 加载数据集，逐样本执行，收集结果
 */

import { Comparator } from './comparator';
import { MetricsCalculator } from './metrics-calculator';
import { ReportGenerator } from './report-generator';
import type { ITestAgent } from '@core/interfaces/agent.interface';
import type {
  EvalSample,
  EvalSampleResult,
  EvalReport,
  EvalConfig,
  StepComparison,
} from './types';
import { uuid } from '@utils/helpers';

/**
 * BenchmarkRunner - 评测运行器
 */
export class BenchmarkRunner {
  private comparator = new Comparator();
  private metricsCalculator: MetricsCalculator;
  private reportGenerator = new ReportGenerator();

  constructor(metricsWeights?: ConstructorParameters<typeof MetricsCalculator>[0]) {
    this.metricsCalculator = new MetricsCalculator(metricsWeights);
  }

  /**
   * 执行评测
   * @param agent 已初始化的 TestAgent 实例
   * @param config 评测配置
   */
  async run(
    agent: ITestAgent,
    config: EvalConfig
  ): Promise<{ report: EvalReport; results: EvalSampleResult[] }> {
    const startTime = Date.now();
    const results: EvalSampleResult[] = [];

    // 逐样本执行
    const samples = config.dataset;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      const sampleStart = Date.now();

      try {
        const sampleResult = await this.evaluateSample(agent, sample, config);
        results.push(sampleResult);
      } catch (error) {
        results.push(this.errorResult(sample, error));
      }

      const elapsed = Date.now() - sampleStart;
      if (config.verbose) {
        console.log(
          `[${i + 1}/${samples.length}] ${sample.id} (${sample.difficulty}) - ${elapsed}ms`
        );
      }
    }

    const totalDuration = Date.now() - startTime;

    // 计算指标
    const { metrics, levelScores, categoryScores, summary } =
      this.metricsCalculator.calculate(results, totalDuration);

    // 生成报告
    const report: EvalReport = {
      id: uuid(),
      timestamp: Date.now(),
      version: config.version ?? '1.0.0',
      totalSamples: samples.length,
      totalDuration,
      metrics,
      levelScores,
      categoryScores,
      details: results,
      summary,
    };

    return { report, results };
  }

  /**
   * 评测单个样本
   */
  private async evaluateSample(
    agent: ITestAgent,
    sample: EvalSample,
    config: EvalConfig
  ): Promise<EvalSampleResult> {
    const startTime = Date.now();

    // 执行测试用例
    const context = await agent.execute(sample.task.testCase);

    // 与金标准对比
    const { stepComparisons, statusMatch } = this.comparator.compare(sample, context);

    // 计算单样本得分
    const scores = this.computeSampleScores(stepComparisons);

    const fixTriggered = stepComparisons.some(s => s.fixTriggered);
    const fixSuccess = fixTriggered
      ? stepComparisons.every(s => !s.fixTriggered || s.fixSuccess)
      : undefined;

    return {
      sampleId: sample.id,
      difficulty: sample.difficulty,
      category: sample.category,
      statusMatch,
      expectedStatus: sample.groundTruth.expectedStatus,
      actualStatus: this.safeStatus(context.status),
      stepComparisons,
      scores,
      fixTriggered,
      fixSuccess,
      duration: Date.now() - startTime,
      error: context.error,
    };
  }

  /**
   * 计算单样本的得分
   */
  private computeSampleScores(steps: StepComparison[]): EvalSampleResult['scores'] {
    if (steps.length === 0) {
      return { stepPassRate: 0, toolAccuracy: 0, locatorAccuracy: 0, paramAccuracy: 0, composite: 0 };
    }

    const total = steps.length;
    const passed = steps.filter(s => s.status === 'success' || s.status === 'fixed').length;
    const toolCorrect = steps.filter(s => s.toolMatch).length;
    const locatorSteps = steps.filter(s => s.expectedLocator !== undefined).length;
    const locatorCorrect = steps.filter(s => s.locatorMatch).length;
    const paramSteps = steps.filter(s => s.paramDetails.length > 0).length;
    const paramCorrect = steps.reduce((sum, s) =>
      sum + s.paramDetails.filter(d => d.match).length, 0
    );
    const paramTotal = steps.reduce((sum, s) => sum + s.paramDetails.length, 0);

    const stepPassRate = passed / total;
    const toolAccuracy = toolCorrect / total;
    const locatorAccuracy = locatorSteps > 0 ? locatorCorrect / locatorSteps : 1;
    const paramAccuracy = paramTotal > 0 ? paramCorrect / paramTotal : 1;
    const composite =
      stepPassRate * 0.35 + toolAccuracy * 0.30 + locatorAccuracy * 0.20 + paramAccuracy * 0.15;

    return {
      stepPassRate: round(stepPassRate),
      toolAccuracy: round(toolAccuracy),
      locatorAccuracy: round(locatorAccuracy),
      paramAccuracy: round(paramAccuracy),
      composite: round(composite),
    };
  }

  /**
   * 安全地将状态字符串转换为联合类型
   */
  private safeStatus(status: string): 'passed' | 'failed' | 'stopped' {
    if (status === 'passed' || status === 'failed' || status === 'stopped') return status;
    return 'failed';
  }

  /**
   * 错误兜底结果
   */
  private errorResult(sample: EvalSample, error: unknown): EvalSampleResult {
    return {
      sampleId: sample.id,
      difficulty: sample.difficulty,
      category: sample.category,
      statusMatch: false,
      expectedStatus: sample.groundTruth.expectedStatus,
      actualStatus: 'failed',
      stepComparisons: [],
      scores: { stepPassRate: 0, toolAccuracy: 0, locatorAccuracy: 0, paramAccuracy: 0, composite: 0 },
      fixTriggered: false,
      duration: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function round(n: number, d = 4): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
