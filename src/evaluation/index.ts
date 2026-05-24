/**
 * Evaluation 评测模块导出
 */

// 类型
export type {
  EvalSample,
  EvalSampleResult,
  EvalReport,
  EvalMetrics,
  EvalConfig,
  EvalDifficulty,
  ExpectedAction,
  GroundTruth,
  ErrorInjection,
  StepComparison,
  LevelScores,
  CategoryScores,
  MetricWeights,
} from './types';

// 组件
export { Comparator } from './comparator';
export { MetricsCalculator } from './metrics-calculator';
export { DatasetBuilder, SampleBuilder } from './dataset-builder';
export { BenchmarkRunner } from './benchmark-runner';
export { ReportGenerator } from './report-generator';

// 种子数据
export { buildSeedDataset } from './seed-dataset';
