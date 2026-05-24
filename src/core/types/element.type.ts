/**
 * 元素定位器类型枚举
 */
export enum LocatorType {
  TEXT = 'text',
  ID = 'id',
  XPATH = 'xpath',
  COORDINATE = 'coordinate',
  VISION = 'vision',
}

/**
 * 定位器接口
 */
export interface Locator {
  /** 定位器类型 */
  type: LocatorType;
  /** 定位器值 */
  value: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retryCount?: number;
}

/**
 * 坐标点接口
 */
export interface Point {
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
}

/**
 * 矩形区域接口
 */
export interface Rect {
  /** 左上角 X 坐标 */
  x: number;
  /** 左上角 Y 坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 元素接口
 * 描述 HarmonyOS UI 元素
 */
export interface Element {
  /** 元素唯一标识 */
  id: string;
  /** 元素类型 */
  type: string;
  /** 元素文本内容 */
  text?: string;
  /** 元素描述 */
  description?: string;
  /** 元素位置 */
  bounds: Rect;
  /** 元素中心点 */
  center: Point;
  /** 是否可见 */
  visible: boolean;
  /** 是否可点击 */
  clickable: boolean;
  /** 是否可用 */
  enabled: boolean;
  /** 是否已选中 */
  selected?: boolean;
  /** 是否可聚焦 */
  focusable?: boolean;
  /** 是否已聚焦 */
  focused?: boolean;
  /** 元素层级 */
  level: number;
  /** 父元素标识 */
  parentId?: string;
  /** 子元素标识列表 */
  childrenIds?: string[];
  /** 元素属性 */
  attributes: Record<string, any>;
  /** 资源标识符 */
  resourceId?: string;
  /** 类名 */
  className?: string;
  /** 包名 */
  packageName?: string;
  /** 内容描述 */
  contentDesc?: string;
}

/**
 * UI 树接口
 * 描述完整的界面元素树
 */
export interface UiTree {
  /** 根元素 */
  root: Element;
  /** 所有元素映射 */
  elements: Map<string, Element>;
  /** 元素总数 */
  totalCount: number;
  /** 可见元素数 */
  visibleCount: number;
  /** 屏幕尺寸 */
  screenSize: { width: number; height: number };
  /** 页面包名 */
  packageName: string;
  /** 页面类名 */
  activityName: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 设备信息接口
 */
export interface DeviceInfo {
  /** 设备唯一标识 */
  deviceId: string;
  /** 设备名称 */
  deviceName: string;
  /** 操作系统版本 */
  osVersion: string;
  /** 屏幕尺寸 */
  screenSize: { width: number; height: number };
  /** 屏幕密度 */
  density: number;
  /** 是否已 root */
  isRooted: boolean;
}

/**
 * 设备状态枚举
 */
export enum DeviceStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * 手势类型枚举
 */
export enum GestureType {
  SWIPE = 'swipe',
  TAP = 'tap',
  LONG_PRESS = 'long_press',
  DOUBLE_TAP = 'double_tap',
  PINCH = 'pinch',
  PINCH_OUT = 'pinch_out',
  DRAG = 'drag',
  ROTATE = 'rotate',
}
