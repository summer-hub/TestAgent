/**
 * Fixer 自愈模块导出
 */

// 诊断器
export { FailureDiagnoser } from './diagnoser/failure-diagnoser';

// 错误分类器
export { ErrorClassifier, type ClassificationResult } from './classifier/error-classifier';

// 决策引擎
export { FixDecisionEngine, EvidenceCollector, type DecisionResult, type EvidenceItem } from './decision/fix-decision-engine';

// 修复执行器
export { FixExecutor, type FixExecutorConfig } from './executor/fix-executor';

// 修复策略
export * from './strategies';
