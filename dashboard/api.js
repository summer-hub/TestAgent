/**
 * API Client — 前端数据获取层
 * Base URL 自动检测开发/生产环境
 */
const BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? `http://${location.hostname}:3001`
  : '';

async function request(url) {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'API error');
  return json;
}

const api = {
  /** 总指标 */
  getMetrics() {
    return request('/api/metrics').then(r => r.data);
  },

  /** 会话列表 */
  getSessions(page = 1, limit = 20) {
    return request(`/api/sessions?page=${page}&limit=${limit}`);
  },

  /** 会话详情（含测试列表） */
  getSessionDetail(id) {
    return request(`/api/sessions/${id}`).then(r => r.data);
  },

  /** 单测试详情（含步骤时间线） */
  getTestDetail(id) {
    return request(`/api/tests/${id}`).then(r => r.data);
  },

  /** AI 对话 — 自然语言指令 */
  aiChat(message) {
    return fetch(`${BASE}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then(r => r.json());
  },

  /** 执行全自动流水线（下载→生成用例→脚本→执行） */
  runPipeline(packageName, repoUrl) {
    return fetch(`${BASE}/api/ai/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageName, repoUrl }),
    }).then(r => r.json());
  },

  /** 所有已注册的包列表 */
  getPackages() {
    return request('/api/packages').then(r => r.data);
  },

  /** 获取 AI 助手当前配置 */
  getAiConfig() {
    return fetch(`${BASE}/api/ai/config`).then(r => r.json());
  },

  /** 在设备上执行 E2E 测试 */
  runTest(bundleName) {
    return fetch(`${BASE}/api/run-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundleName }),
    }).then(r => r.json());
  },

  /** 日志查询 */
  getLogs(level, since) {
    const params = new URLSearchParams();
    if (level && level !== 'all') params.set('level', level);
    if (since) params.set('since', since);
    return request(`/api/logs?${params}`).then(r => r.data);
  },

  /** SSE 日志流 */
  subscribeLogs(level, onEntry, onInit) {
    const params = level && level !== 'all' ? `?level=${level}` : '';
    const es = new EventSource(`${BASE}/api/logs/stream${params}`);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'init' && onInit) onInit(msg.data);
      else if (msg.type === 'entry' && onEntry) onEntry(msg.data);
    };

    es.onerror = () => {
      // 自动重连
    };

    return () => es.close();
  },
};

window.api = api;
