/**
 * AppInfo — 应用信息类型定义
 *
 * 对应 HarmonyOS `bm dump`、`aa` 等命令的输出结构。
 */

/** 应用安装来源 */
export enum AppSource {
  /** 预装应用 */
  PRE_INSTALLED = 'pre_installed',
  /** 用户安装 */
  USER_INSTALLED = 'user_installed',
  /** 第三方 */
  THIRD_PARTY = 'third_party',
  /** 未知 */
  UNKNOWN = 'unknown',
}

/** Ability 类型 */
export enum AbilityType {
  PAGE = 'page',
  SERVICE = 'service',
  DATA = 'data',
  FORM = 'form',
  UNKNOWN = 'unknown',
}

/** Ability 可见性 */
export enum AbilityVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  UNKNOWN = 'unknown',
}

/** Ability 启动模式 */
export enum AbilityLaunchType {
  SINGLETON = 'singleton',
  MULTITON = 'multiton',
  UNKNOWN = 'unknown',
}

/** 单个 Ability 信息 */
export interface AbilityInfo {
  /** Ability 名称 (如 .EntryAbility) */
  name: string;
  /** 完整类名 */
  className: string;
  /** 类型 */
  type: AbilityType;
  /** 可见性 */
  visibility: AbilityVisibility;
  /** 启动模式 */
  launchType: AbilityLaunchType;
  /** 是否为主要入口 */
  isMainEntry: boolean;
  /** 是否可见 */
  visible: boolean;
  /** 支持的设备类型 */
  supportedDevices: string[];
  /** 描述文字 */
  description: string;
  /** Skills/Intents */
  skills: AbilitySkill[];
  /** 原始 bm dump 数据 */
  raw: Record<string, any>;
}

/** Ability Skill/Intent */
export interface AbilitySkill {
  /** Action */
  action: string;
  /** URI */
  uri: string;
  /** Type */
  type: string;
  /** Entities */
  entities: string[];
}

/** 应用模块信息 (HAP) */
export interface HapModuleInfo {
  /** 模块名 */
  moduleName: string;
  /** 入口 */
  mainAbility: string;
  /** 描述 */
  description: string;
  /** 支持的设备类型 */
  supportedDeviceTypes: string[];
  /** 组件 */
  abilities: AbilityInfo[];
  /** 原始 bm dump 数据 */
  raw: Record<string, any>;
}

/** 完整的应用信息 */
export interface AppInfo {
  /** 包名 (bundleName) */
  bundleName: string;
  /** 应用名称 */
  appName: string;
  /** 厂商 */
  vendor: string;
  /** 版本号 (如 1.0.0) */
  versionName: string;
  /** 版本编码 (如 100000) */
  versionCode: number;
  /** 应用图标资源 ID */
  iconId: number;
  /** 应用标签资源 ID */
  labelId: number;
  /** 最小 SDK 版本 */
  minSdkVersion: number;
  /** 最大 SDK 版本 */
  maxSdkVersion: number;
  /** 安装来源 */
  source: AppSource;
  /** 是否已安装 */
  installed: boolean;
  /** 是否启用 */
  enabled: boolean;
  /** 是否系统应用 */
  isSystemApp: boolean;
  /** 是否可移除 */
  removable: boolean;
  /** 模块列表 */
  modules: HapModuleInfo[];
  /** 所有 Ability 扁平列表 */
  abilities: AbilityInfo[];
  /** 主 Ability (用于启动) */
  mainAbility: AbilityInfo | null;
  /** 原始 bm dump 数据 */
  raw: Record<string, any>;
}

/** 应用安装结果 */
export interface InstallResult {
  /** 是否成功 */
  success: boolean;
  /** 包名 */
  bundleName: string;
  /** 输出日志 */
  output: string;
  /** 错误信息 */
  error?: string;
}

/** 应用列表查询选项 */
export interface AppListQuery {
  /** 过滤系统应用 */
  includeSystem?: boolean;
  /** 只显示第三方应用 */
  thirdPartyOnly?: boolean;
  /** 按包名关键字搜索 */
  filterKeyword?: string;
}

/** 应用运行状态 */
export enum AppProcessStatus {
  /** 未运行 */
  NOT_RUNNING = 'not_running',
  /** 前台运行 */
  FOREGROUND = 'foreground',
  /** 后台运行 */
  BACKGROUND = 'background',
  /** 暂停 */
  SUSPENDED = 'suspended',
}

/** 应用运行时信息 */
export interface AppRuntimeInfo {
  /** 包名 */
  bundleName: string;
  /** 进程 PID */
  pid: number;
  /** 运行状态 */
  status: AppProcessStatus;
  /** 内存使用 (KB) */
  memoryKB: number;
  /** 前台时间 (ms) */
  foregroundTimeMs: number;
}
