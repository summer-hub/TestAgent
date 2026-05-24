/**
 * 差异结果接口
 * 用于比较预期结果和实际结果的差异
 */
export interface DiffResult {
  /** 是否通过 */
  passed: boolean;
  /** 差异详情 */
  differences?: Difference[];
  /** 错误信息列表 */
  errors?: string[];
  /** 预期值 */
  expected?: any;
  /** 实际值 */
  actual?: any;
  /** 差异类型 */
  diffType?: DiffType;
  /** 差异描述 */
  description?: string;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 差异类型枚举
 */
export enum DiffType {
  VALUE_MISMATCH = 'value_mismatch',       // 值不匹配
  MISSING_KEY = 'missing_key',             // 缺少键
  EXTRA_KEY = 'extra_key',                 // 额外键
  TYPE_MISMATCH = 'type_mismatch',         // 类型不匹配
  LENGTH_MISMATCH = 'length_mismatch',     // 长度不匹配
  ORDER_MISMATCH = 'order_mismatch',       // 顺序不匹配
  PARTIAL_MATCH = 'partial_match',         // 部分匹配
  COMPLETE_MATCH = 'complete_match',       // 完全匹配
}

/**
 * 单个差异项
 */
export interface Difference {
  /** 差异路径 */
  path: string;
  /** 差异类型 */
  type: DiffType;
  /** 预期值 */
  expected?: any;
  /** 实际值 */
  actual?: any;
  /** 差异描述 */
  message: string;
  /** 严重程度 */
  severity: 'critical' | 'major' | 'minor' | 'info';
}

/**
 * 预期规格接口
 * 定义测试的预期状态
 */
export interface ExpectedSpec {
  /** 预期状态 */
  expectedStates: Record<string, any>;
  /** 验证规则 */
  validationRules?: ValidationRule[];
  /** 忽略字段 */
  ignoreFields?: string[];
  /** 容忍阈值 */
  tolerance?: number;
}

/**
 * 验证规则
 */
export interface ValidationRule {
  /** 规则名称 */
  name: string;
  /** 规则类型 */
  type: 'equals' | 'contains' | 'regex' | 'range' | 'custom';
  /** 规则参数 */
  params?: Record<string, any>;
  /** 自定义验证函数 */
  validator?: (actual: any, expected: any) => boolean;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 六维度差异比对结果
 */
export interface SixDimensionDiff {
  /** 结构差异 */
  structureDiff: DiffResult;
  /** 值差异 */
  valueDiff: DiffResult;
  /** 类型差异 */
  typeDiff: DiffResult;
  /** 顺序差异 */
  orderDiff: DiffResult;
  /** 长度差异 */
  lengthDiff: DiffResult;
  /** 存在性差异 */
  existenceDiff: DiffResult;
  /** 综合结果 */
  overallResult: DiffResult;
}
