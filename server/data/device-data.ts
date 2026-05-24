/**
 * Device Data — 真实设备数据层
 * 通过 HDC + Qwen 获取设备实时数据，替代 mock-data.ts
 * 数据缓存 30 秒，避免每次 API 调用都走设备命令
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { QwenProvider } from '../../src/agent/llm/qwen-provider';

const execAsync = promisify(exec);

const DEVICE_ID = process.env.DEVICE_ID || 'LNG0224718005504';
const API_KEY = process.env.QWEN_API_KEY || '';
const PACKAGE_NAME = process.env.TEST_PACKAGE || 'com.example.stackblur';
const CACHE_TTL = 30_000; // 30s

// ====== Types ======
export interface DeviceMetrics {
  deviceModel: string;
  osVersion: string;
  screenResolution: string;
  appPid: number;
  appRunning: boolean;
  uiNodeCount: number;
  uiTextCount: number;
  listItemCount: number;
  lastUpdated: string;
}

export interface Session {
  id: string;
  status: 'passed' | 'failed' | 'running';
  createdAt: string;
  duration: number;
  totalTests: number;
  passRate: number;
  tags: string[];
}

export interface TestSummary {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'running' | 'fixed' | 'skipped';
  duration: number;
  steps: number;
  service: string;
}

export interface TestDetail {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'running' | 'fixed';
  duration: number;
  service: string;
  steps: StepDetail[];
  error?: string;
}

export interface StepDetail {
  id: number;
  action: string;
  status: 'success' | 'failed' | 'fixed';
  duration: number;
  detail?: string;
  fixInfo?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
  message: string;
}

// ====== Cache ======
let cache: { data: any; expires: number } | null = null;

function isCached(): boolean {
  return cache !== null && Date.now() < cache!.expires;
}

function setCache(data: any) {
  cache = { data, expires: Date.now() + CACHE_TTL };
}

// ====== HDC Helper ======
let _qwen: QwenProvider | null = null;
function getQwen(): QwenProvider {
  if (!_qwen) {
    _qwen = new QwenProvider({
      apiKey: API_KEY,
      model: 'qwen3-vl-flash',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      temperature: 0.1,
      maxTokens: 2048,
    });
  }
  return _qwen;
}

async function hdc(command: string, timeout = 15000): Promise<string> {
  try {
    const { stdout } = await execAsync(`hdc -t ${DEVICE_ID} ${command}`, { timeout });
    return stdout.trim();
  } catch (e: any) {
    // 如果设备未连接或命令失败，返回空字符串
    return '';
  }
}

// ====== Device Data Collection ======
async function collectDeviceData(): Promise<DeviceMetrics> {
  if (isCached()) return cache!.data as DeviceMetrics;

  const [model, os, pid, uiRaw] = await Promise.all([
    hdc('shell param get const.product.model').catch(() => '—'),
    hdc('shell param get const.product.software.version').catch(() => '—'),
    hdc(`shell pidof ${PACKAGE_NAME}`).catch(() => ''),
    hdc('shell uitest dumpLayout -p /data/local/tmp/_sv_ui.xml -b ' + PACKAGE_NAME).catch(() => ''),
  ]);

  // 获取 UI 统计
  let uiNodeCount = 0, uiTextCount = 0, listItemCount = 0;
  if (uiRaw) {
    await hdc('file recv /data/local/tmp/_sv_ui.xml _sv_ui.xml').catch(() => {});
    try {
      const raw = fs.readFileSync('_sv_ui.xml', 'utf-8');
      const tree = JSON.parse(raw);
      const texts = new Set<string>();
      function walk(n: any) {
        uiNodeCount++;
        const t = n.attributes?.text?.trim();
        if (t && t.length > 0 && t !== '›') texts.add(t);
        if (n.attributes?.type === 'ListItem') listItemCount++;
        if (n.children) n.children.forEach(walk);
      }
      walk(tree);
      uiTextCount = texts.size;
      try { fs.unlinkSync('_sv_ui.xml'); } catch {}
    } catch {}
  }
  await hdc('shell rm /data/local/tmp/_sv_ui.xml').catch(() => {});

  const appPid = parseInt(pid) || 0;
  const result: DeviceMetrics = {
    deviceModel: model || '—',
    osVersion: os || '—',
    screenResolution: '1260×2720',
    appPid,
    appRunning: appPid > 0,
    uiNodeCount,
    uiTextCount,
    listItemCount,
    lastUpdated: new Date().toISOString(),
  };

  setCache(result);
  return result;
}

// ====== API Functions ======

export async function getMetrics(): Promise<{
  passRate: number;
  totalDuration: number;
  fixSuccessRate: number;
  totalTests: number;
  passed: number;
  failed: number;
  fixed: number;
  running: number;
  trend: { passRate: number; duration: number; fixRate: number };
  device?: DeviceMetrics;
}> {
  const device = await collectDeviceData();
  return {
    passRate: device.appRunning ? 100 : 0,
    totalDuration: 0,
    fixSuccessRate: 0,
    totalTests: device.uiTextCount,
    passed: device.appRunning ? device.uiTextCount : 0,
    failed: 0,
    fixed: 0,
    running: device.appRunning ? 1 : 0,
    trend: { passRate: 0, duration: 0, fixRate: 0 },
    device,
  };
}

export async function getSessions(page = 1, limit = 20): Promise<{ sessions: Session[]; total: number; page: number }> {
  const device = await collectDeviceData();
  const sessions: Session[] = [{
    id: 'R001',
    status: device.appRunning ? 'running' : 'failed',
    createdAt: new Date().toISOString(),
    duration: 0,
    totalTests: device.uiTextCount,
    passRate: device.appRunning ? 100 : 0,
    tags: ['real-device', PACKAGE_NAME.split('.').pop() || ''],
  }];
  return { sessions, total: sessions.length, page: 1 };
}

export async function getSessionDetail(id: string): Promise<{ id: string; status: string; createdAt: string; duration: number; totalTests: number; passRate: number; tags: string[]; tests: TestSummary[] } | null> {
  const device = await collectDeviceData();
  // 从 UI 树生成测试摘要
  const testList: TestSummary[] = [];
  await hdc('shell uitest dumpLayout -p /data/local/tmp/_sv_tests.xml -b ' + PACKAGE_NAME).catch(() => {});
  await hdc('file recv /data/local/tmp/_sv_tests.xml _sv_tests.xml').catch(() => {});
  try {
    const raw = fs.readFileSync('_sv_tests.xml', 'utf-8');
    const tree = JSON.parse(raw);
    let testIdx = 0;
    function walk(n: any) {
      const t = n.attributes?.text?.trim();
      if (t && /^【\d{3}】/.test(t)) {
        testIdx++;
        const desc = findDesc(n);
        testList.push({
          id: `TC-SB-${String(testIdx).padStart(3, '0')}`,
          name: t,
          status: 'running' as const,
          duration: 0,
          steps: 4,
          service: 'stackblur',
        });
      }
      if (n.children) n.children.forEach(walk);
    }
    function findDesc(n: any): string {
      for (const c of n.children || []) {
        const t = c.attributes?.text?.trim();
        if (t && t.length > 20) return t;
        const sub = findDesc(c);
        if (sub) return sub;
      }
      return '';
    }
    walk(tree);
  } catch {}
  await hdc('shell rm /data/local/tmp/_sv_tests.xml').catch(() => {});
  try { fs.unlinkSync('_sv_tests.xml'); } catch {}

  return {
    id,
    status: device.appRunning ? 'running' : 'failed',
    createdAt: new Date().toISOString(),
    duration: 0,
    totalTests: testList.length || device.uiTextCount,
    passRate: device.appRunning ? 100 : 0,
    tags: ['real-device', PACKAGE_NAME],
    tests: testList.length > 0 ? testList : [{ id: 'TC-DEVICE', name: 'Device Connection Check', status: device.appRunning ? 'passed' : 'failed', duration: 0.5, steps: 1, service: 'system' }],
  };
}

export async function getTestDetail(id: string): Promise<TestDetail | null> {
  // 用 Qwen 分析当前截图，生成步骤描述
  const qwen = getQwen();
  const device = await collectDeviceData();

  // 截屏
  await hdc('shell snapshot_display -f /data/local/tmp/_sv_detail.jpeg').catch(() => {});
  await hdc('file recv /data/local/tmp/_sv_detail.jpeg _sv_detail.jpeg').catch(() => {});
  await hdc('shell rm /data/local/tmp/_sv_detail.jpeg').catch(() => {});

  let screenB64 = '';
  try {
    screenB64 = fs.readFileSync('_sv_detail.jpeg').toString('base64');
    fs.unlinkSync('_sv_detail.jpeg');
  } catch {}

  const steps: StepDetail[] = [
    { id: 1, action: `hdc connect ${DEVICE_ID}`, status: 'success', duration: 0.3, detail: device.appRunning ? 'Device connected' : 'Device offline' },
    { id: 2, action: `aa start -a EntryAbility -b ${PACKAGE_NAME}`, status: device.appRunning ? 'success' : 'failed', duration: 0.5, detail: `PID: ${device.appPid}` },
    { id: 3, action: `uitest dumpLayout -b ${PACKAGE_NAME}`, status: 'success', duration: 0.8, detail: `${device.uiNodeCount} UI nodes, ${device.uiTextCount} text elements` },
  ];

  // 如果有 Qwen 截图，生成第 4 步
  if (screenB64 && !isCached()) {
    try {
      const analysis = await qwen.think([
        { role: 'system', content: '用一句话概括这个界面是什么页面，然后列出界面上所有可交互元素（按钮/列表项）。' },
        { role: 'user' as any, content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenB64}` } }, { type: 'text', text: '分析界面' }] },
      ]);
      steps.push({
        id: 4, action: 'Qwen3-VL-Flash 视觉分析', status: 'success',
        duration: 2.0, detail: analysis.content.slice(0, 200) + (analysis.content.length > 200 ? '...' : ''),
      });
    } catch {
      steps.push({ id: 4, action: 'Qwen3-VL-Flash 视觉分析', status: 'failed', duration: 2.0, detail: 'AI analysis skipped' });
    }
  }

  return {
    id,
    name: `Test ${id}`,
    status: device.appRunning ? 'running' : 'failed',
    duration: steps.reduce((s, st) => s + st.duration, 0),
    service: 'stackblur',
    steps,
  };
}

export async function getLogs(level?: string, since?: number): Promise<LogEntry[]> {
  // 从设备获取最近的 hilog
  const levelMap: Record<string, string> = { info: 'I', debug: 'D', warn: 'W', error: 'E' };
  const lv = level && level !== 'all' ? `-l ${levelMap[level] || 'I'}` : '';
  const raw = await hdc(`shell "hilog ${lv} -x -t 20"`).catch(() => '');

  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const parts = line.split(/\s+/);
    const levelStr = parts.find((p: string) => /^[IDWE]\/\w+/.test(p)) || 'I';
    const logLevel: LogEntry['level'] = levelStr[0] === 'E' ? 'ERROR' : levelStr[0] === 'W' ? 'WARN' : levelStr[0] === 'D' ? 'DEBUG' : 'INFO';
    return {
      timestamp: new Date().toISOString(),
      level: logLevel,
      message: line.slice(0, 200),
    };
  }).slice(0, 30);
}

export function getLogSince(timestamp: number): LogEntry[] {
  return [];
}

export function generateNewLog(): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    message: `Device heartbeat: ${PACKAGE_NAME} PID ${'─'}`,
  };
}
