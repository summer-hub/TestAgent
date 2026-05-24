import { BaseError } from './base.error';

/**
 * 设备连接错误
 */
export class DeviceConnectionError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'DEVICE_CONNECTION_ERROR', 500, details);
  }
}

/**
 * 元素未找到错误
 */
export class ElementNotFoundError extends BaseError {
  constructor(locator: string, details?: Record<string, any>) {
    super(`Element not found: ${locator}`, 'ELEMENT_NOT_FOUND', 404, details);
  }
}

/**
 * 元素操作错误
 */
export class ElementOperationError extends BaseError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'ELEMENT_OPERATION_ERROR', 400, details);
  }
}

/**
 * 设备未连接错误
 */
export class DeviceNotConnectedError extends BaseError {
  constructor() {
    super('Device not connected', 'DEVICE_NOT_CONNECTED', 503);
  }
}

/**
 * 应用启动错误
 */
export class AppLaunchError extends BaseError {
  constructor(bundleName: string, details?: Record<string, any>) {
    super(`Failed to launch app: ${bundleName}`, 'APP_LAUNCH_ERROR', 500, details);
  }
}
