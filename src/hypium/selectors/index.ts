/**
 * 选择器模块导出
 */

// Fluent API 选择器构建器
export { By, MatchPattern } from './by';

// 通用选择器策略
export {
  type ISelectorStrategy,
  IdSelectorStrategy,
  TextSelectorStrategy,
  XPathSelectorStrategy,
  CoordinateSelectorStrategy,
  VisionSelectorStrategy,
  SelectorFallbackChain,
} from './selector-strategy';

// OHOS 特有选择器策略
export {
  OhosTypeSelectorStrategy,
  OhosBundleSelectorStrategy,
  OhosKeySelectorStrategy,
  OhosPagePathSelectorStrategy,
} from './ohos-strategy';
