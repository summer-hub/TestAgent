/**
 * 测试用例优先级枚举
 */
export enum TestPriority {
  P0 = 'P0',  // 核心功能 - 阻塞性缺陷
  P1 = 'P1',  // 重要功能 - 高优先级
  P2 = 'P2',  // 一般功能 - 中优先级
  P3 = 'P3',  // 低优先级 - 优化建议
}

/**
 * 测试用例类别枚举
 */
export enum TestCategory {
  POSITIVE = 'positive',           // 正向用例
  NEGATIVE = 'negative',           // 负向用例
  BOUNDARY = 'boundary',           // 边界用例
  PERFORMANCE = 'performance',     // 性能用例
  SECURITY = 'security',           // 安全用例
  COMPATIBILITY = 'compatibility',  // 兼容性用例
}

/**
 * 测试用例接口
 * 定义单个测试用例的结构
 */
export interface TestCase {
  /** 用例唯一标识 */
  id: string;
  /** 用例标题 */
  title: string;
  /** 用例描述 */
  description?: string;
  /** 用例类别 */
  category: TestCategory | string;
  /** 优先级 */
  priority: TestPriority | string;
  /** 前置条件 */
  precondition?: string;
  /** 测试步骤列表 */
  steps: string[];
  /** 预期结果 */
  expectedResult: string;
  /** 测试数据 */
  testData?: Record<string, any>;
  /** 标签列表 */
  tags?: string[];
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retry?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 测试套件接口
 * 包含多个测试用例的集合
 */
export interface TestSuite {
  /** 套件唯一标识 */
  id: string;
  /** 套件名称 */
  name: string;
  /** 套件描述 */
  description?: string;
  /** 测试用例列表 */
  testCases: TestCase[];
  /** 套件前置操作 */
  beforeAll?: () => Promise<void>;
  /** 套件后置操作 */
  afterAll?: () => Promise<void>;
  /** 用例前置操作 */
  beforeEach?: () => Promise<void>;
  /** 用例后置操作 */
  afterEach?: () => Promise<void>;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 测试计划接口
 * 包含多个测试套件的执行计划
 */
export interface TestPlan {
  /** 计划唯一标识 */
  id: string;
  /** 计划名称 */
  name: string;
  /** 计划描述 */
  description?: string;
  /** 测试套件列表 */
  testSuites: TestSuite[];
  /** 执行配置 */
  executionConfig: TestExecutionConfig;
  /** 报告配置 */
  reportConfig?: ReportConfig;
}

/**
 * 测试执行配置
 */
export interface TestExecutionConfig {
  /** 是否并行执行 */
  parallel?: boolean;
  /** 最大工作线程数 */
  maxWorkers?: number;
  /** 失败时是否重试 */
  retryFailed?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 失败时是否截图 */
  screenshotOnFailure?: boolean;
}

/**
 * 报告配置
 */
export interface ReportConfig {
  /** 报告格式 */
  format: 'html' | 'json' | 'xml' | 'all';
  /** 输出目录 */
  outputDir: string;
  /** 是否包含截图 */
  includeScreenshots?: boolean;
  /** 是否包含视频 */
  includeVideos?: boolean;
}
