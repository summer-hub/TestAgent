/**
 * notify-feishu.ts — 飞书通知
 *
 * 支持两种鉴权模式:
 *   1. 群机器人 Webhook: export FEISHU_WEBHOOK_URL="https://..."
 *   2. 应用机器人 (App): export FEISHU_APP_ID=cli_xxx
 *                           FEISHU_APP_SECRET=xxx
 *                           FEISHU_CHAT_ID=oc_xxx
 *
 * 用法:
 *   # Webhook 模式
 *   export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
 *   npx tsx scripts/notify-feishu.ts --pass 10 --fail 2 --duration 120
 *
 *   # App 模式
 *   export FEISHU_APP_ID="cli_xxx"
 *   export FEISHU_APP_SECRET="xxx"
 *   export FEISHU_CHAT_ID="oc_xxx"
 *   npx tsx scripts/notify-feishu.ts --pass 10 --fail 2 --duration 120
 */

const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL || '';
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
const FEISHU_CHAT_ID = process.env.FEISHU_CHAT_ID || '';
const CI_PIPELINE_URL = process.env.CI_PIPELINE_URL || process.env.GITHUB_SERVER_URL || '';

interface NotifyOptions {
  pass: number;
  fail: number;
  duration: number;
  branch: string;
  commit?: string;
  commitMsg?: string;
}

/** 获取飞书 tenant_access_token */
async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const json: any = await res.json();
  if (json.code !== 0) {
    throw new Error(`Auth failed: ${json.code} ${json.msg}`);
  }
  return json.tenant_access_token;
}

/** 通过应用机器人发送消息到群聊 */
async function sendAppMessage(token: string, chatId: string, title: string, content: string): Promise<void> {
  const payload = {
    receive_id: chatId,
    msg_type: 'post',
    content: JSON.stringify({
      zh_cn: {
        title,
        content: [[{ tag: 'text', text: content }]],
      },
    }),
  };

  const res = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    }
  );
  const json: any = await res.json();
  if (json.code !== 0) {
    throw new Error(`Send message failed: ${json.code} ${json.msg}`);
  }
  console.log(`  ✅ message_id=${json.data?.message_id}`);
}

/** 通过群机器人 Webhook 发送 */
async function sendWebhookMessage(webhookUrl: string, title: string, content: string): Promise<void> {
  const payload = {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title,
          content: [[{ tag: 'text', text: content }]],
        },
      },
    },
  };
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json: any = await res.json();
  if (json.code !== 0) {
    throw new Error(`Webhook failed: ${json.code} ${json.msg}`);
  }
  console.log(`  ✅ code=${json.code}`);
}

async function main() {
  const opts: NotifyOptions = {
    pass: parseInt(process.argv.find(a => a.startsWith('--pass='))?.split('=')[1] || '0', 10),
    fail: parseInt(process.argv.find(a => a.startsWith('--fail='))?.split('=')[1] || '0', 10),
    duration: parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] || '0', 10),
    branch: process.argv.find(a => a.startsWith('--branch='))?.split('=')[1] || process.env.GITHUB_REF_NAME || 'unknown',
    commit: process.argv.find(a => a.startsWith('--commit='))?.split('=')[1] || process.env.GITHUB_SHA || undefined,
    commitMsg: process.argv.find(a => a.startsWith('--commit-msg='))?.split('=')[1] || undefined,
  };

  const total = opts.pass + opts.fail;
  const passRate = total > 0 ? Math.round((opts.pass / total) * 100) : 0;
  const durationMin = (opts.duration / 60).toFixed(1);

  const title = opts.fail === 0
    ? `✅ 测试通过 — ${opts.pass}/${total} (${passRate}%)`
    : `❌ 测试失败 — ${opts.fail} 个失败 (${passRate}%)`;

  const content = [
    `**测试报告**`,
    `分支: ${opts.branch}${opts.commit ? ` (${opts.commit.slice(0, 7)})` : ''}`,
    opts.commitMsg ? `提交: ${opts.commitMsg}` : '',
    `通过: ${opts.pass} | 失败: ${opts.fail} | 总计: ${total}`,
    `通过率: ${passRate}% | 耗时: ${durationMin}min`,
    CI_PIPELINE_URL ? `[查看流水线](${CI_PIPELINE_URL})` : '',
  ].filter(Boolean).join('\n');

  // === 模式选择 ===
  if (FEISHU_APP_ID && FEISHU_APP_SECRET && FEISHU_CHAT_ID) {
    console.log('📤 应用机器人模式 (App ID + Secret)...');
    console.log(`   获取 tenant_access_token...`);
    const token = await getTenantToken(FEISHU_APP_ID, FEISHU_APP_SECRET);
    console.log(`   发送消息到 chat_id=${FEISHU_CHAT_ID}...`);
    await sendAppMessage(token, FEISHU_CHAT_ID, title, content);
    console.log(`\n✅ 飞书通知发送成功 (应用模式)`);
  } else if (FEISHU_WEBHOOK_URL) {
    console.log('📤 群机器人 Webhook 模式...');
    await sendWebhookMessage(FEISHU_WEBHOOK_URL, title, content);
    console.log(`\n✅ 飞书通知发送成功 (Webhook 模式)`);
  } else {
    console.log('⚠ 未设置飞书凭证，打印消息到控制台:\n');
    console.log(`标题: ${title}`);
    console.log(content);
  }
}

main().catch(err => {
  console.error(`\n❌ 飞书通知失败: ${err.message}`);
  process.exit(1);
});
