/**
 * Hypium 驱动模块导出
 */

// 驱动
export { HypiumDriver } from './driver/hypium-driver';
export { HypiumDriverConfigSchema, DEFAULT_DRIVER_CONFIG, type HypiumDriverConfig } from './driver/driver-config';
export { ConnectionPool, HdcConnectionHandle, type ConnectionHandle, type ConnectionPoolConfig } from './driver/connection-pool';
export { DeviceStateMachine } from './driver/device-state-machine';
export { CommandQueue, type CommandQueueConfig } from './driver/command-queue';
export { HeartbeatMonitor, type HeartbeatConfig } from './driver/heartbeat-monitor';

// 选择器策略
export * from './selectors';

// 动作链
export * from './actions';

// 断言库
export * from './assertions';

// 应用管理
export { AppManager } from './app/app-manager';

// 手势
export * from './gesture';
