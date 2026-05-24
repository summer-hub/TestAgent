/**
 * Skills 技能模块导出
 */

// 技能基类与上下文
export { Skill, type SkillMetadata, type SkillContext, type SkillResult } from './skill-base';

// 技能注册中心（原有）
export {
  SkillRegistry,
  type SkillRegistration,
  type SkillComposition,
} from './skill-registry';

// 扩展技能定义
export {
  type SkillDefinition,
  type SkillParameterDef,
  type WorkflowPhase,
  type SkillDependency,
  type SkillCategory,
  type SkillSource,
  toSkillMetadata,
} from './skill-definition';

// SKILL.md 解析器
export { SkillMarkdownParser, type ParseResult } from './skill-markdown-parser';

// 文件加载器
export { SkillFileLoader, type LoaderConfig, type LoadResult } from './skill-file-loader';

// 智能匹配器
export {
  SkillMatcher,
  type MatchQuery,
  type MatchResult,
} from './skill-matcher';

// 技能链引擎
export {
  SkillChainEngine,
  type ChainNode,
  type ExecutionPlan,
  type ChainExecutor,
} from './skill-chain-engine';

// 统一技能管理器（核心入口）
export {
  UnifiedSkillManager,
  type SkillManagerConfig,
  type SkillManagerStats,
} from './unified-skill-manager';

// HarmonyOS 内置技能
export { LoginSkill, type LoginParams, type LoginType, type ThirdPartyPlatform } from './harmony/login-skill';
export { FormFillSkill, type FormFillParams, type FormField, type FieldType } from './harmony/form-fill-skill';
export { NavigationSkill, type NavigationParams, type NavigationMode } from './harmony/navigation-skill';
export { ScrollSkill, type ScrollParams, type ScrollDirection } from './harmony/scroll-skill';
export { ScreenshotSkill, type ScreenshotParams, type ScreenshotMode } from './harmony/screenshot-skill';

// 便捷工厂
import { SkillRegistry } from './skill-registry';
import { LoginSkill } from './harmony/login-skill';
import { FormFillSkill } from './harmony/form-fill-skill';
import { NavigationSkill } from './harmony/navigation-skill';
import { ScrollSkill } from './harmony/scroll-skill';
import { ScreenshotSkill } from './harmony/screenshot-skill';

export function createDefaultSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(new LoginSkill(), { namespace: 'harmony' });
  registry.register(new FormFillSkill(), { namespace: 'harmony' });
  registry.register(new NavigationSkill(), { namespace: 'harmony' });
  registry.register(new ScrollSkill(), { namespace: 'harmony' });
  registry.register(new ScreenshotSkill(), { namespace: 'harmony' });
  return registry;
}
