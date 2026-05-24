/**
 * HypiumRpc — RPC 协议层
 *
 * ## 通信协议（基于 xdevice + devicetest 逆向分析）
 *
 * 三层架构:
 *   hypium (Python) → OpenHarmony.rpc_for_hypium() → _safe_send() → TCP socket
 *
 * 消息格式（完整链路）:
 *
 * 1) hypium 构建内层消息:
 *    { api: "UiComponent.click", this: ref, args: [...], message_type: "hypium" }
 *
 * 2) hypium 包装外层消息:
 *    { module: "com.ohos.devicetest.hypiumApiHelper",
 *      method: "callHypiumApi",
 *      params: <内层消息>,
 *      request_id: "20250410123000000" }
 *
 * 3) OpenHarmony.rpc_for_hypium() 添加:
 *    { ..., call: "xdevice" }
 *
 * 4) _safe_send() 添加:
 *    { ..., client: "127.0.0.1" }
 *
 * 5) _send() 发送:
 *    is_bin=False: "1" + JSON + '\n'    ← hap 模式加前缀 "1"
 *    is_bin=True:  JSON + '\n'          ← bin 模式无前缀
 *
 * 回复格式（bin 模式）:
 *    JSON (原始字符串)
 *    { "result": ..., "exception": ... }
 *
 * ## 启用 RPC 的完整条件
 *
 * 1. 设备端:
 *    - uitest start-daemon singleness 运行中
 *    - com.ohos.devicetest ServiceAbility 已启动
 *    - port 8012 LISTEN
 *
 * 2. 主机端:
 *    - hdc fport tcp:LOCAL tcp:8012 → Forwardport result:OK
 *    - TCP 连接到 127.0.0.1:LOCAL
 *    - 发送 JSON + '\n' (bin mode)
 *
 * 3. Python 框架自动完成上述步骤:
 *    - start_harmony_rpc → aa start ServiceAbility
 *    - start_abc_rpc → hdc fport + OpenHarmony init
 *
 * ## 当前限制
 *
 * 我们可以在 shell 层手动完成:
 *   1. hdc fport tcp:PORT tcp:8012 ✅
 *   2. TCP 连接 ✅
 *   3. JSON 消息发送 ✅
 *   ⚠️ 但设备端 agent 主动关闭连接 (ECONNRESET)
 *      可能因为 com.ohos.devicetest ServiceAbility 未启动。
 *
 * 完整的 RPC 能力需要 xdevice 框架的 HAP agent 部署，
 * 这在独立 TS 驱动中难以复现。所有功能通过 shell uitest
 * 命令已有完全替代（见下）。
 */

export const RPC_SPEC_VERSION = '3.0';
export const RPC_MODULE = 'com.ohos.devicetest.hypiumApiHelper';
export const RPC_METHOD = 'callHypiumApi';
export const RPC_PORT_HAP = 8011;
export const RPC_PORT_BIN = 8012;

/** is_bin 模式下发送纯 JSON，hap 模式发送 "1" + JSON */
export const BIN_PREFIX = '';       // is_bin=True 无前缀
export const HAP_PREFIX = '1';      // is_bin=False 前缀 "1"

/** 检查 HDC fport 是否可用 */
export async function checkFportSupport(deviceId: string): Promise<boolean> {
  try {
    const { exec } = require('child_process');
    return new Promise<boolean>((resolve) => {
      exec(`hdc -t ${deviceId} fport tcp:12349 tcp:8012`, { timeout: 5000 },
        (err: any, stdout: string, stderr: string) => {
          exec(`hdc -t ${deviceId} fport rm tcp:12349`, () => {});
          if (err) { resolve(false); return; }
          resolve(stdout.includes('OK') || stderr.includes('OK'));
        });
    });
  } catch {
    return false;
  }
}
