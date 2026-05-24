import { DeviceStatus } from '@core/types/element.type';
import { DeviceConnectionError } from '@core/errors';

/**
 * 状态转换规则
 */
interface StateTransition {
  from: DeviceStatus;
  to: DeviceStatus;
  /** 转换条件 */
  condition?: () => boolean;
}

/**
 * 设备状态机
 * 管理 HarmonyOS 设备的连接状态转换
 *
 * 状态流转：
 * DISCONNECTED -> CONNECTING -> CONNECTED -> DISCONNECTED
 *                            -> ERROR -> CONNECTING (重连)
 *                            -> ERROR -> DISCONNECTED
 */
export class DeviceStateMachine {
  private _status: DeviceStatus = DeviceStatus.DISCONNECTED;
  private readonly transitions: StateTransition[] = [
    { from: DeviceStatus.DISCONNECTED, to: DeviceStatus.CONNECTING },
    { from: DeviceStatus.CONNECTING, to: DeviceStatus.CONNECTED },
    { from: DeviceStatus.CONNECTING, to: DeviceStatus.ERROR },
    { from: DeviceStatus.CONNECTED, to: DeviceStatus.DISCONNECTED },
    { from: DeviceStatus.CONNECTED, to: DeviceStatus.ERROR },
    { from: DeviceStatus.ERROR, to: DeviceStatus.CONNECTING },
    { from: DeviceStatus.ERROR, to: DeviceStatus.DISCONNECTED },
  ];

  /**
   * 获取当前状态
   */
  get status(): DeviceStatus {
    return this._status;
  }

  /**
   * 尝试转换状态
   * @throws DeviceConnectionError 如果转换不合法
   */
  transition(to: DeviceStatus): void {
    const allowed = this.transitions.some(
      (t) => t.from === this._status && t.to === to
      && (!t.condition || t.condition())
    );

    if (!allowed) {
      throw new DeviceConnectionError(
        `Invalid state transition: ${this._status} -> ${to}`,
        { currentStatus: this._status, targetStatus: to }
      );
    }

    this._status = to;
  }

  /**
   * 检查是否可以转换到目标状态
   */
  canTransition(to: DeviceStatus): boolean {
    return this.transitions.some(
      (t) => t.from === this._status && t.to === to
    );
  }

  /**
   * 重置状态机
   */
  reset(): void {
    this._status = DeviceStatus.DISCONNECTED;
  }

  /**
   * 是否已连接
   */
  get isConnected(): boolean {
    return this._status === DeviceStatus.CONNECTED;
  }

  /**
   * 是否处于可操作状态
   */
  get isOperable(): boolean {
    return this._status === DeviceStatus.CONNECTED;
  }
}
