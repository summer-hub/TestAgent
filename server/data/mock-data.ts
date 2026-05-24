/**
 * Mock Data Layer — 提供结构与真实数据一致的测试数据
 * 后续可替换为对 ai-test-agent-ts 库的真实调用
 */

// ====== Types ======
export interface MetricSummary {
  passRate: number;
  totalDuration: number;
  fixSuccessRate: number;
  totalTests: number;
  passed: number;
  failed: number;
  fixed: number;
  running: number;
  trend: { passRate: number; duration: number; fixRate: number };
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

export interface SessionDetail extends Session {
  tests: TestSummary[];
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

// ====== Mock Data ======

const sessions: Session[] = [
  { id: 'S042', status: 'passed', createdAt: new Date(Date.now() - 120_000).toISOString(), duration: 12.3, totalTests: 12, passRate: 98.5, tags: ['regression', 'nightly'] },
  { id: 'S041', status: 'passed', createdAt: new Date(Date.now() - 1_500_000).toISOString(), duration: 15.2, totalTests: 12, passRate: 92.3, tags: ['smoke', 'feature-auth'] },
  { id: 'S040', status: 'failed', createdAt: new Date(Date.now() - 3_600_000).toISOString(), duration: 18.7, totalTests: 8, passRate: 62.5, tags: ['integration'] },
  { id: 'S039', status: 'passed', createdAt: new Date(Date.now() - 10_800_000).toISOString(), duration: 22.1, totalTests: 15, passRate: 100, tags: ['smoke', 'all-passed'] },
  { id: 'S038', status: 'passed', createdAt: new Date(Date.now() - 28_800_000).toISOString(), duration: 9.8, totalTests: 6, passRate: 83.3, tags: ['sanity'] },
  { id: 'S037', status: 'failed', createdAt: new Date(Date.now() - 86_400_000).toISOString(), duration: 45.6, totalTests: 24, passRate: 75.0, tags: ['full-regression'] },
  { id: 'S036', status: 'passed', createdAt: new Date(Date.now() - 172_800_000).toISOString(), duration: 14.5, totalTests: 10, passRate: 90.0, tags: ['smoke', 'payment'] },
  { id: 'S035', status: 'running', createdAt: new Date().toISOString(), duration: 3.2, totalTests: 4, passRate: 75.0, tags: ['quick', 'search'] },
];

const testsBySession: Record<string, TestSummary[]> = {
  S042: [
    { id: 'TC-042', name: 'User Login Flow', status: 'passed', duration: 1.2, steps: 4, service: 'auth-service' },
    { id: 'TC-043', name: 'User Registration', status: 'failed', duration: 3.5, steps: 5, service: 'auth-service' },
    { id: 'TC-044', name: 'Checkout Flow', status: 'fixed', duration: 5.1, steps: 6, service: 'payment-service' },
    { id: 'TC-045', name: 'Search Functionality', status: 'running', duration: 2.3, steps: 3, service: 'search-service' },
    { id: 'TC-046', name: 'Payment Integration', status: 'passed', duration: 0.9, steps: 3, service: 'payment-service' },
    { id: 'TC-047', name: 'Product Listing', status: 'passed', duration: 1.5, steps: 4, service: 'catalog-service' },
    { id: 'TC-048', name: 'Add to Cart', status: 'passed', duration: 0.8, steps: 2, service: 'cart-service' },
    { id: 'TC-049', name: 'Remove from Cart', status: 'passed', duration: 0.6, steps: 2, service: 'cart-service' },
    { id: 'TC-050', name: 'User Profile Update', status: 'passed', duration: 2.1, steps: 4, service: 'user-service' },
    { id: 'TC-051', name: 'Password Reset', status: 'fixed', duration: 3.8, steps: 5, service: 'auth-service' },
    { id: 'TC-052', name: 'Logout Flow', status: 'passed', duration: 0.4, steps: 2, service: 'auth-service' },
    { id: 'TC-053', name: 'Session Timeout', status: 'passed', duration: 2.0, steps: 3, service: 'auth-service' },
  ],
};

const stepDetails: Record<string, StepDetail[]> = {
  'TC-042': [
    { id: 1, action: 'navigate_to_url(/login)', status: 'success', duration: 0.3, detail: 'page loaded in 287ms' },
    { id: 2, action: 'input_text(login-input, "admin")', status: 'success', duration: 0.2, detail: 'element found by ID' },
    { id: 3, action: 'input_text(password-input, "••••")', status: 'fixed', duration: 2.5, detail: 'ElementNotFoundError: password-input', fixInfo: '↻ Fix: alternative_locator → XPATH · attempt #1 succeeded' },
    { id: 4, action: 'click(submit-button)', status: 'success', duration: 0.3, detail: 'login successful, redirect to /dashboard' },
  ],
  'TC-043': [
    { id: 1, action: 'navigate_to_url(/register)', status: 'success', duration: 0.4 },
    { id: 2, action: 'input_text(name-input, "Test User")', status: 'success', duration: 0.3 },
    { id: 3, action: 'input_text(email-input, "test@example.com")', status: 'success', duration: 0.2 },
    { id: 4, action: 'click(register-button)', status: 'failed', duration: 2.6, detail: 'ElementClickInterceptedError: register-button obscured by overlay' },
  ],
  'TC-044': [
    { id: 1, action: 'add_to_cart(item-001)', status: 'success', duration: 0.5 },
    { id: 2, action: 'click(checkout-button)', status: 'fixed', duration: 2.8, detail: 'StaleElementReference — page re-rendered', fixInfo: '↻ Fix: wait_and_retry · retry #2 succeeded after 2s wait' },
    { id: 3, action: 'input_text(card-number, "••••4242")', status: 'success', duration: 0.8 },
    { id: 4, action: 'click(place-order)', status: 'success', duration: 0.5 },
  ],
  'TC-045': [
    { id: 1, action: 'input_text(search-input, "test product")', status: 'success', duration: 0.3 },
    { id: 2, action: 'click(search-submit)', status: 'success', duration: 0.4, detail: 'awaiting results... 62%' },
  ],
  'TC-046': [
    { id: 1, action: 'navigate_to_url(/payment)', status: 'success', duration: 0.3 },
    { id: 2, action: 'input_text(card-input, "••••")', status: 'success', duration: 0.2 },
    { id: 3, action: 'click(pay-now)', status: 'success', duration: 0.4, detail: 'payment processed successfully' },
  ],
};

const logStream: LogEntry[] = [
  { timestamp: new Date().toISOString(), level: 'INFO', message: 'Session started: session_42' },
  { timestamp: new Date(Date.now() - 1000).toISOString(), level: 'DEBUG', message: 'Connecting to device emulator-01' },
  { timestamp: new Date(Date.now() - 2000).toISOString(), level: 'INFO', message: 'Running TC-042 · User Login Flow' },
  { timestamp: new Date(Date.now() - 3000).toISOString(), level: 'DEBUG', message: 'navigate_to_url(/login)' },
  { timestamp: new Date(Date.now() - 4000).toISOString(), level: 'INFO', message: '✓ Step 1 passed (287ms)' },
  { timestamp: new Date(Date.now() - 5000).toISOString(), level: 'ERROR', message: '✗ Step 3 failed: ElementNotFoundError' },
  { timestamp: new Date(Date.now() - 6000).toISOString(), level: 'WARN', message: '↻ Triggering fix: alternative_locator' },
  { timestamp: new Date(Date.now() - 7000).toISOString(), level: 'INFO', message: '✓ Step 3 fixed by alternative_locator (412ms)' },
  { timestamp: new Date(Date.now() - 8000).toISOString(), level: 'INFO', message: '✓ TC-042 passed (3.2s total)' },
  { timestamp: new Date(Date.now() - 9000).toISOString(), level: 'ERROR', message: '✗ TC-043 failed: ElementClickInterceptedError' },
  { timestamp: new Date(Date.now() - 10000).toISOString(), level: 'WARN', message: '↻ Fix attempts exhausted · maxFixAttempts (3) reached' },
  { timestamp: new Date(Date.now() - 11000).toISOString(), level: 'INFO', message: '✓ TC-044 passed after 1 fix (5.1s)' },
  { timestamp: new Date(Date.now() - 12000).toISOString(), level: 'INFO', message: 'Running TC-045 · Search Functionality' },
];

// ====== Metrics Calculation ======
function calculateMetrics(): MetricSummary {
  const allTests = Object.values(testsBySession).flat();
  const total = allTests.length;
  const passed = allTests.filter(t => t.status === 'passed').length;
  const failed = allTests.filter(t => t.status === 'failed').length;
  const fixed = allTests.filter(t => t.status === 'fixed').length;
  const running = allTests.filter(t => t.status === 'running').length;
  const totalDur = allTests.reduce((s, t) => s + t.duration, 0);

  return {
    passRate: total > 0 ? Math.round(((passed + fixed) / total) * 1000) / 10 : 0,
    totalDuration: Math.round(totalDur * 10) / 10,
    fixSuccessRate: (passed + fixed + failed + running) > 0
      ? Math.round((fixed / (fixed + failed + running)) * 1000) / 10
      : 0,
    totalTests: total,
    passed, failed, fixed, running,
    trend: { passRate: 2.1, duration: -1.2, fixRate: 5.0 },
  };
}

// ====== Data Access Functions ======

export function getMetrics(): MetricSummary {
  return calculateMetrics();
}

export function getSessions(page = 1, limit = 20): { sessions: Session[]; total: number; page: number } {
  const sorted = [...sessions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const start = (page - 1) * limit;
  return { sessions: sorted.slice(start, start + limit), total: sorted.length, page };
}

export function getSessionDetail(id: string): SessionDetail | null {
  const session = sessions.find(s => s.id === id);
  if (!session) return null;
  const tests = testsBySession[id] || [];
  return { ...session, tests };
}

export function getTestDetail(id: string): TestDetail | null {
  let found: TestSummary | undefined;
  let sessionId = '';
  for (const [sid, tests] of Object.entries(testsBySession)) {
    const t = tests.find(tc => tc.id === id);
    if (t) { found = t; sessionId = sid; break; }
  }
  if (!found) return null;

  const steps = stepDetails[id] || [];
  return {
    id: found.id,
    name: found.name,
    status: found.status,
    duration: found.duration,
    service: found.service,
    steps,
    error: steps.find(s => s.status === 'failed')?.detail,
  };
}

export function getLogs(level?: string, since?: number): LogEntry[] {
  let filtered = [...logStream];
  if (level && level !== 'all') {
    filtered = filtered.filter(l => l.level === level.toUpperCase());
  }
  if (since) {
    const sinceDate = new Date(since).getTime();
    filtered = filtered.filter(l => new Date(l.timestamp).getTime() > sinceDate);
  }
  return filtered;
}

export function getLogSince(timestamp: number): LogEntry[] {
  return logStream.filter(l => new Date(l.timestamp).getTime() > timestamp);
}

export function generateNewLog(): LogEntry {
  const levels: LogEntry['level'][] = ['INFO', 'DEBUG', 'WARN', 'ERROR'];
  const msgs = [
    'Running TC-046 · Payment Integration',
    'navigate_to_url(/payment)',
    '✓ Step 1 passed (312ms)',
    'input_text(card-input, "••••")',
    '✓ Step 2 passed (198ms)',
    '✓ TC-046 passed (1.2s)',
    'Waiting for next test cycle...',
    'Heartbeat check: device emulator-01 OK',
  ];
  return {
    timestamp: new Date().toISOString(),
    level: levels[Math.floor(Math.random() * levels.length)],
    message: msgs[Math.floor(Math.random() * msgs.length)],
  };
}
