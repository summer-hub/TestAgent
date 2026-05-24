/**
 * HypiumRpcDriver — RPC 增强的 HarmonyOS 设备驱动
 *
 * 架构: HypiumDriver (shell/uitest) + HypiumRpcClient (RPC TCP)
 *
 * ## 当前状态
 *
 * RPC TCP 通道因 HDC 3.2.0c 不支持 fport 命令而不可用。
 * HypiumRpcDriver 目前作为 HypiumDriver 的直接包装，
 * 但提供 RPC 协议规范 + 备用接口。
 *
 * ## 启用 RPC
 *
 * 参见 src/hypium/rpc/hypium-rpc.ts 中的条件。
 * 满足条件后，取消注释 connect() 中的 RPC 连接代码。
 *
 * ## UIComponent RPC 替代
 *
 *  | RPC 方法 | 当前替代 | 文件 |
 *  |----------|---------|------|
 *  | comp.click() | shell click | hypium-driver.ts |
 *  | comp.getText() | UI tree dump | hypium-driver.ts |
 *  | comp.getBounds() | UI tree dump | hypium-driver.ts |
 *  | waitForComponent | 轮询 + findElement | hypium-driver.ts |
 */

import { HypiumDriver, HypiumDriverConfig } from '../driver/hypium-driver';
import { By } from '../selectors/by';
import { Element } from '@core/types/element.type';

/** RPC 驱动配置 */
export type HypiumRpcDriverConfig = HypiumDriverConfig;

/**
 * HypiumRpcDriver — shell + RPC 双通道驱动
 *
 * 当前: 基于 HypiumDriver (shell/uitest)，RPC 通道预留。
 * 待 HDC 升级后激活 RPC 层实现组件级方法调用。
 */
export class HypiumRpcDriver extends HypiumDriver {
  /** RPC 是否可用 */
  private _rpcReady = false;

  constructor(config: Partial<HypiumRpcDriverConfig> = {}) {
    super(config);
  }

  /** 检查 RPC 是否可用 */
  get isRpcConnected(): boolean {
    return this._rpcReady;
  }

  /**
   * connect — 建立 shell 连接
   * RPC 连接待 HDC ≥ 4.0 后启用
   */
  async connect(deviceId?: string): Promise<void> {
    await super.connect(deviceId);

    // 检查 HDC 版本是否支持 fport
    try {
      const { checkRpcSupport } = await import('../rpc/hypium-rpc');
      const supported = await checkRpcSupport();
      if (supported) {
        console.log('[HypiumRpcDriver] HDC 支持 fport，RPC 通道待激活');
        // TODO: 在 connect 中建立 RPC TCP 连接
        // const rpc = new HypiumRpcClient({ ... });
        // await rpc.connect(deviceId);
      }
    } catch {
      // HDC 版本检查失败，忽略
    }
  }

  async disconnect(): Promise<void> {
    await super.disconnect();
  }

  /**
   * 等待组件并返回 Element (shell 层)
   * RPC 版 (返回 UiComponent) 待 HDC ≥ 4.0 后实现
   */
  async waitForComponentRpc(by: By, timeoutMs = 10000): Promise<Element> {
    return this.waitForElement(by.toLocator(), timeoutMs);
  }

  /**
   * 查找组件并返回 Element (shell 层)
   */
  async findComponentRpc(by: By): Promise<Element | null> {
    return this.findComponent(by);
  }

  /** RPC 可用性内存标记 (供手动激活) */
  setRpcReady(ready: boolean): void {
    this._rpcReady = ready;
  }
}
