/**
 * 错误类统一导出
 */

export { BaseError } from './base.error';
export {
  DeviceConnectionError,
  ElementNotFoundError,
  ElementOperationError,
  DeviceNotConnectedError,
  AppLaunchError,
} from './driver.error';
export {
  AgentExecutionError,
  StepTimeoutError,
  MaxRetriesExceededError,
  TestCaseFormatError,
  AgentNotInitializedError,
} from './agent.error';
export {
  MCPConnectionError,
  MCPCallError,
  ToolNotFoundError,
  ToolParameterError,
  MCPInitializationError,
} from './mcp.error';
export {
  FixFailedError,
  UndiagnosableError,
  StrategyNotSupportedError,
  FixTimeoutError,
} from './fixer.error';
