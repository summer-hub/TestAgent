/**
 * App — 企业级测试仪表盘主逻辑
 * 视图路由 + 测试执行 + 失败分析 + 用例管理
 */

// ====== State ======
const state = {
  view: 'dashboard',
  theme: localStorage.getItem('theme') || 'dark',
  particlesEnabled: true,
  parallaxEnabled: true,
  lastRunResult: null,
  testCases: [],
  runHistory: [],
  logCount: 0,
  sseActive: true,
};

let closeSSE = null;
let logFilter = 'all';

// ====== Theme ======
function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  document.querySelectorAll('.theme-option').forEach(b => b.classList.toggle('active', b.dataset.themeVal === theme));
  if (window.particleSystem) window.particleSystem.updateColors();
}

// ====== Particle System ======
class ParticleSystem {
  constructor() {
    this.canvas = document.getElementById('particleCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: -1000, y: -1000 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    this.init();
    this.animate();
  }
  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  get isDark() { return state.theme === 'dark' || state.theme === 'oled'; }
  init() {
    const count = Math.min(60, Math.floor(window.innerWidth * window.innerHeight / 15000));
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * this.canvas.width, y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      r: 1 + Math.random() * 2, alpha: 0.1 + Math.random() * 0.3,
    }));
  }
  updateColors() {}
  animate() {
    if (!state.particlesEnabled || !this.ctx) { requestAnimationFrame(() => this.animate()); return; }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const isDark = this.isDark;
    const color = isDark ? '148, 163, 184' : '71, 85, 105';
    const baseAlpha = isDark ? 0.25 : 0.15;
    const lineAlpha = isDark ? 0.08 : 0.05;
    for (const p of this.particles) {
      const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) { const f = (120 - dist) / 120 * 0.4; p.vx += (dx / dist) * f; p.vy += (dy / dist) * f; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = this.canvas.width; if (p.x > this.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.canvas.height; if (p.y > this.canvas.height) p.y = 0;
      p.vx *= 0.995; p.vy *= 0.995;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${color}, ${p.alpha * baseAlpha * 2})`; this.ctx.fill();
    }
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const a = this.particles[i], b = this.particles[j];
        const dx = a.x - b.x, dy = a.y - b.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y);
          this.ctx.strokeStyle = `rgba(${color}, ${lineAlpha * (1 - dist / 150)})`;
          this.ctx.lineWidth = 0.5; this.ctx.stroke();
        }
      }
    }
    requestAnimationFrame(() => this.animate());
  }
}

// ====== Helpers ======
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
function durationStr(ms) {
  const s = ms / 1000;
  return s < 1 ? `${Math.round(ms)}ms` : s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}
function statusIcon(st) { return { passed: '✓', failed: '✗', running: '⟳', fixed: '↻', skipped: '−', success: '✓' }[st] || '○'; }

// ====== View Routing ======
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'tests') renderTestCaseTable();
  if (view === 'history') renderHistory();
}

// ====== Device Info ======
async function updateDeviceInfo() {
  try {
    const m = await api.getMetrics();
    const info = document.getElementById('deviceInfo');
    if (m.source === 'device') {
      info.textContent = `📱 ${m.device?.deviceModel || 'Device'} · ${m.device?.osVersion || ''}`;
      document.getElementById('envBadge').textContent = 'LIVE';
      document.getElementById('envBadge').style.background = 'rgba(34,197,94,0.15)';
      document.getElementById('envBadge').style.color = 'var(--success)';
    } else {
      info.textContent = '💡 Mock Data (no device)';
      document.getElementById('envBadge').textContent = 'MOCK';
      document.getElementById('envBadge').style.background = 'rgba(245,158,11,0.15)';
      document.getElementById('envBadge').style.color = 'var(--warning)';
    }
  } catch {
    document.getElementById('deviceInfo').textContent = '⚠ Connection error';
  }
}

// ====== Metrics ======
async function loadMetrics() {
  try {
    const m = await api.getMetrics();
    const panel = document.getElementById('metricsPanel');
    const dot = document.getElementById('statusDot');
    const summary = document.getElementById('statusSummary');
    dot.className = `status-dot ${m.running > 0 ? 'running' : m.failed > 0 ? 'failed' : 'passed'}`;
    summary.textContent = `${m.passed} passed · ${m.failed} failed · ${m.passRate}% pass`;

    const cards = [
      { value: `${m.passRate}%`, label: 'Pass Rate', sub: `↑ ${m.trend.passRate}%`, color: 'var(--success)', chartData: [82, 85, 88, 91, 94, 96, m.passRate] },
      { value: durationStr(m.totalDuration * 1000), label: 'Duration', sub: `↓ ${Math.abs(m.trend.duration)}s`, color: 'var(--info)', chartData: [18, 16, 15, 14.5, 13.2, 12.8, m.totalDuration] },
      { value: `${m.fixSuccessRate}%`, label: 'Fix Rate', sub: `↑ ${m.trend.fixRate}%`, color: 'var(--fix)', chartData: [60, 65, 72, 78, 82, 85, m.fixSuccessRate] },
      { value: String(m.totalTests), label: 'Total Tests', sub: `${m.passed + m.failed} active`, color: 'var(--text-primary)', chartData: [8, 12, 10, 15, 18, 20, m.totalTests] },
    ];
    panel.innerHTML = cards.map(c => {
      const max = Math.max(...c.chartData, 1);
      const bars = c.chartData.map(v => `<div class="bar" style="height:${(v / max) * 100}%;background:${c.chartColor || c.color}"></div>`).join('');
      return `<div class="metric-card"><div class="metric-value" style="color:${c.color}">${c.value}</div><div class="metric-label">${c.label}</div><div class="metric-sub">${c.sub}</div><div class="metric-chart">${bars}</div></div>`;
    }).join('');
    return m;
  } catch (err) {
    document.getElementById('metricsPanel').innerHTML = `<div class="error-state"><span>⚠ ${err.message}</span><button class="topbar__btn" onclick="loadMetrics()">Retry</button></div>`;
  }
}

// ====== Render Test Suite Results (after Run) ======
function renderTestResult(data) {
  const container = document.getElementById('runResultContent');
  const badge = document.getElementById('suiteBadge');
  const passed = data.steps.filter(s => s.status === 'passed').length;
  const failed = data.steps.filter(s => s.status === 'failed').length;
  const allPassed = failed === 0;

  badge.textContent = allPassed ? `${passed}/${data.total} passed` : `${failed} failed`;
  badge.style.color = allPassed ? 'var(--success)' : 'var(--error)';

  // Build step rows with expandable failure detail
  const stepRows = data.steps.map((s, i) => {
    const isFail = s.status === 'failed';
    return `
      <div class="run-step ${s.status}" ${isFail ? `onclick="toggleFailure(${i})"` : ''}>
        <div class="step-main">
          <span class="step-icon">${statusIcon(s.status)}</span>
          <span class="step-name">${s.name}</span>
          <span class="step-duration">${durationStr(s.duration)}</span>
          ${isFail ? '<span class="step-toggle">▶</span>' : ''}
        </div>
        ${isFail ? `
          <div class="step-failure" id="failure-${i}" style="display:none">
            <div class="fail-section">
              <div class="fail-label">Error</div>
              <div class="fail-value">${s.error || 'Unknown error'}</div>
            </div>
            ${s.detail ? `
            <div class="fail-section">
              <div class="fail-label">UI Tree</div>
              <pre class="fail-pre">${escapeHtml(s.detail)}</pre>
            </div>` : ''}
            ${s.screenshot ? `
            <div class="fail-section">
              <div class="fail-label">Screenshot</div>
              <img class="fail-screenshot" src="data:image/jpeg;base64,${s.screenshot}" alt="Failure screenshot">
            </div>` : ''}
          </div>
        ` : ''}
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="suite-result ${allPassed ? 'passed' : 'failed'}">
      <div class="suite-header">
        <div class="suite-title">
          <span class="suite-icon">${allPassed ? '✅' : '❌'}</span>
          Test Suite ${allPassed ? 'Passed' : 'Failed'}
        </div>
        <div class="suite-meta">
          <span class="suite-badge">${data.bundleName}</span>
          <span class="suite-time">${durationStr(data.duration)}</span>
          <span class="suite-device">📱 ${data.deviceId}</span>
        </div>
      </div>
      <div class="suite-stats">
        <span class="stat pass">✓ ${passed} passed</span>
        ${failed > 0 ? `<span class="stat fail">✗ ${failed} failed</span>` : ''}
        <span class="stat total">Σ ${data.total} steps</span>
      </div>
      <div class="suite-steps">${stepRows}</div>
      <div class="suite-footer">${new Date(data.timestamp).toLocaleString()}</div>
    </div>`;

  // Save to test cases & history
  if (state.testCases.length === 0) {
    state.testCases = data.steps.map(s => ({
      name: s.name,
      status: s.status,
      lastRun: data.timestamp,
      duration: s.duration,
      error: s.error || null,
    }));
  } else {
    state.testCases = state.testCases.map(tc => {
      const match = data.steps.find(s => s.name === tc.name);
      if (match) return { ...tc, status: match.status, lastRun: data.timestamp, duration: match.duration, error: match.error || null };
      return tc;
    });
  }
  state.runHistory.unshift({
    id: `R${String(state.runHistory.length + 1).padStart(3, '0')}`,
    timestamp: data.timestamp,
    passed, failed, total: data.total,
    duration: data.duration,
  });
  renderTestCaseTable();
  renderHistory();
}

// Toggle failure detail expansion
function toggleFailure(index) {
  const el = document.getElementById(`failure-${index}`);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  const toggle = el.closest('.run-step')?.querySelector('.step-toggle');
  if (toggle) toggle.textContent = isOpen ? '▶' : '▼';
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ====== Run Suite ======
async function runTestSuite() {
  const btn = document.getElementById('btnRun');
  const meta = document.getElementById('statusMeta');
  const badge = document.getElementById('suiteBadge');
  const container = document.getElementById('runResultContent');
  const bundle = document.getElementById('cfgBundle')?.value || 'com.example.stackblur';

  btn.disabled = true;
  btn.textContent = '⟳ Running...';
  document.getElementById('statusDot').className = 'status-dot running';
  meta.textContent = 'Running test suite...';
  badge.textContent = 'running';
  badge.style.color = 'var(--warning)';

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state__icon" style="animation:spin 1s linear infinite">⟳</div>
      <div class="empty-state__title">Executing on Device...</div>
      <div class="empty-state__desc">Connecting → App Info → Launch → UI Tree → Elements → Gestures → Screenshot</div>
    </div>`;

  try {
    const result = await api.runTest(bundle);
    if (!result.success) throw new Error(result.error || 'Execution failed');
    const data = result.data;
    state.lastRunResult = data;

    renderTestResult(data);
    meta.textContent = `Last run: ${data.passed}/${data.total} passed in ${durationStr(data.duration)}`;
    // Switch to dashboard to show results
    switchView('dashboard');
    loadMetrics();
  } catch (err) {
    meta.textContent = `Error: ${err.message}`;
    document.getElementById('statusDot').className = 'status-dot error';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">❌</div>
        <div class="empty-state__title">Execution Failed</div>
        <div class="empty-state__desc">${err.message}</div>
        <button class="topbar__btn" onclick="runTestSuite()" style="margin-top:var(--space-3)">Retry</button>
      </div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Run Suite';
  }
}

// ====== Test Case Table ======
function renderTestCaseTable() {
  const container = document.getElementById('testCaseTable');
  const search = (document.getElementById('testSearch')?.value || '').toLowerCase();
  const filter = document.getElementById('testStatusFilter')?.value || 'all';

  let cases = state.testCases;
  if (search) cases = cases.filter(tc => tc.name.toLowerCase().includes(search));
  if (filter !== 'all') cases = cases.filter(tc => tc.status === filter);

  if (cases.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state__text">${state.testCases.length === 0 ? 'Run a test suite to populate test cases' : 'No matching test cases'}</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table class="test-table">
        <thead><tr><th>Status</th><th>Test Case</th><th>Duration</th><th>Last Run</th><th>Error</th></tr></thead>
        <tbody>
          ${cases.map(tc => `
            <tr class="${tc.status}">
              <td><span class="status-badge ${tc.status}">${statusIcon(tc.status)} ${tc.status}</span></td>
              <td>${tc.name}</td>
              <td class="cell-mono">${durationStr(tc.duration)}</td>
              <td class="cell-muted">${tc.lastRun ? timeAgo(tc.lastRun) : '—'}</td>
              <td class="cell-error">${tc.error ? escapeHtml(tc.error) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="table-footer">${cases.length} test case${cases.length > 1 ? 's' : ''}</div>`;
}

// ====== History ======
function renderHistory() {
  const container = document.getElementById('historyList');
  const badge = document.getElementById('historyBadge');
  badge.textContent = state.runHistory.length;

  if (state.runHistory.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state__text">No runs recorded yet</div></div>';
    return;
  }

  container.innerHTML = state.runHistory.map(r => `
    <div class="history-item ${r.failed > 0 ? 'failed' : 'passed'}" onclick="showRunDetail('${r.id}')">
      <div class="history-icon">${r.failed > 0 ? '❌' : '✅'}</div>
      <div class="history-body">
        <div class="history-title">#${r.id}</div>
        <div class="history-meta">${r.passed}/${r.total} passed · ${durationStr(r.duration)}</div>
      </div>
      <div class="history-time">${timeAgo(r.timestamp)}</div>
    </div>
  `).join('');
}

function showRunDetail(id) {
  switchView('dashboard');
  if (state.lastRunResult) renderTestResult(state.lastRunResult);
}

// ====== Sessions ======
async function loadSessions() {
  try {
    const result = await api.getSessions(1, 10);
    const list = document.getElementById('sessionList');
    if (!result.sessions || result.sessions.length === 0) {
      list.innerHTML = '<div class="empty-state small"><div class="empty-state__text">No runs yet</div></div>';
      return;
    }
    const badge = document.getElementById('sessionBadge');
    badge.textContent = result.total;
    list.innerHTML = result.sessions.map((s, i) => `
      <div class="session-item ${i === 0 ? 'active' : ''}" onclick="selectSession('${s.id}')">
        <div class="session-item__top">
          <span class="session-item__id ${s.status}">#${s.id}</span>
          <span class="session-item__time">${timeAgo(s.createdAt)}</span>
        </div>
        <div class="session-item__stats">${s.totalTests} tests · ${s.passRate}% pass</div>
      </div>
    `).join('');
    if (result.sessions.length > 0) {
      state.currentSessionId = result.sessions[0].id;
    }
  } catch {}
}

function selectSession(id) {
  document.querySelectorAll('.session-item').forEach(s => s.classList.toggle('active', s.dataset.id === id));
  state.currentSessionId = id;
}

// ====== Config ======
// ====== 包列表加载 ======
async function loadPackages() {
  const select = document.getElementById('cfgBundle');
  const hint = document.getElementById('bundleHint');
  try {
    const packages = await api.getPackages();
    // 保留第一行占位
    select.innerHTML = '<option value="">— 选择或输入包名 —</option>';
    for (const p of packages) {
      const opt = document.createElement('option');
      opt.value = p.packageName;
      const statusIcon = { awaiting_repo: '⏳', registered: '📦', repo_cloned: '📥', test_cases_generated: '📝', scripts_generated: '📄', tested: '✅' }[p.status] || '📦';
      opt.textContent = `${statusIcon} ${p.packageName}`;
      select.appendChild(opt);
    }
    // 恢复上次选中的
    const saved = localStorage.getItem('cfg_bundle') || 'com.example.stackblur';
    if (saved && [...select.options].some(o => o.value === saved)) {
      select.value = saved;
    }
    updateBundleHint(select.value);
    // 恢复设备 ID
    const savedDevice = localStorage.getItem('cfg_deviceId') || 'LNG0224718005504';
    document.getElementById('cfgDeviceId').value = savedDevice;
  } catch {
    // 如果 API 不可用, 用输入框模式
    toggleBundleInput(true);
  }
}

function updateBundleHint(pkgName) {
  const hint = document.getElementById('bundleHint');
  if (!pkgName) { hint.textContent = ''; return; }
  // 尝试从下拉的数据属性找信息
  const opt = [...document.getElementById('cfgBundle').options].find(o => o.value === pkgName);
  if (opt) hint.textContent = `${opt.textContent}`;
  else hint.textContent = `📦 ${pkgName}`;
}

let bundleInputMode = false; // false=select, true=text input

function toggleBundleInput(forceText) {
  const select = document.getElementById('cfgBundle');
  const input = document.getElementById('cfgBundleCustom');
  const btn = document.getElementById('btnToggleBundleInput');
  bundleInputMode = forceText !== undefined ? forceText : !bundleInputMode;
  select.style.display = bundleInputMode ? 'none' : '';
  input.style.display = bundleInputMode ? '' : 'none';
  btn.textContent = bundleInputMode ? '📋' : '✏️';
  if (bundleInputMode) {
    input.value = select.value && select.value !== '' ? select.value : '';
    input.focus();
  }
}

// 选择下拉时触发
document.addEventListener('DOMContentLoaded', () => {
  const select = document.getElementById('cfgBundle');
  if (select) {
    select.addEventListener('change', () => {
      updateBundleHint(select.value);
      localStorage.setItem('cfg_bundle', select.value);
      document.getElementById('cfgBundleCustom').value = select.value;
    });
  }
  const customInput = document.getElementById('cfgBundleCustom');
  if (customInput) {
    customInput.addEventListener('change', () => {
      const val = customInput.value.trim();
      if (val) localStorage.setItem('cfg_bundle', val);
    });
  }
});

function saveConfig() {
  const deviceId = document.getElementById('cfgDeviceId').value;
  const bundle = bundleInputMode
    ? document.getElementById('cfgBundleCustom').value.trim()
    : document.getElementById('cfgBundle').value;
  if (!bundle) { alert('请选择或输入包名'); return; }
  localStorage.setItem('cfg_deviceId', deviceId);
  localStorage.setItem('cfg_bundle', bundle);
  const btn = document.querySelector('.config-group:last-child .topbar__btn');
  btn.textContent = '✓ Saved';
  setTimeout(() => btn.textContent = '💾 Save Configuration', 2000);
}

async function testConnection() {
  const btn = document.querySelector('.config-group:first-child .topbar__btn');
  btn.textContent = '⟳ Testing...';
  btn.disabled = true;
  try {
    const bundle = bundleInputMode
      ? document.getElementById('cfgBundleCustom').value.trim()
      : document.getElementById('cfgBundle').value;
    const result = await api.runTest(bundle);
    btn.textContent = result.success ? '✅ Connected' : '❌ Failed';
  } catch (e) {
    btn.textContent = `❌ ${e.message}`;
  }
  btn.disabled = false;
  setTimeout(() => btn.textContent = 'Test Connection', 3000);
}

// ====== Logs ======
async function loadLogs() {
  try {
    const logs = await api.getLogs(logFilter);
    renderLogs(logs);
    subscribeSSE();
  } catch {
    document.getElementById('logBody').innerHTML = '<div class="log-line"><span class="log-msg">⚠ Log API error</span></div>';
  }
}

function renderLogs(logs) {
  const body = document.getElementById('logBody');
  if (!logs || logs.length === 0) {
    body.innerHTML = '<div class="log-line"><span class="log-msg">No log entries</span></div>';
    return;
  }
  body.innerHTML = logs.map(l => {
    const t = new Date(l.timestamp);
    const ts = `[${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}]`;
    return `<div class="log-line ${l.level}"><span class="log-time">${ts}</span><span class="log-level ${l.level}">${l.level}</span><span class="log-msg">${l.message}</span></div>`;
  }).join('');
  state.logCount = logs.length;
  updateLogCount();
  scrollLogBottom();
}

function appendLogEntry(entry) {
  const body = document.getElementById('logBody');
  const t = new Date(entry.timestamp);
  const ts = `[${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}]`;
  const div = document.createElement('div');
  div.className = `log-line ${entry.level}`;
  div.innerHTML = `<span class="log-time">${ts}</span><span class="log-level ${entry.level}">${entry.level}</span><span class="log-msg">${entry.message}</span>`;
  body.appendChild(div);
  state.logCount++;
  updateLogCount();
  if (document.getElementById('autoScroll').checked) scrollLogBottom();
}

function subscribeSSE() {
  if (closeSSE) closeSSE();
  closeSSE = api.subscribeLogs(logFilter, appendLogEntry, renderLogs);
}

function updateLogCount() { const el = document.getElementById('logCount'); if (el) el.textContent = `${state.logCount} lines`; }
function scrollLogBottom() { const b = document.getElementById('logBody'); if (b) b.scrollTop = b.scrollHeight; }

function copyLogs(e) {
  const lines = document.querySelectorAll('.log-line');
  const text = Array.from(lines).map(l => l.textContent.trim()).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = e.currentTarget;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = '📋', 1500);
  });
}

// ====== 3D Parallax ======
document.addEventListener('mousemove', e => {
  if (!state.parallaxEnabled) return;
  const x = (e.clientX / window.innerWidth - 0.5) * 2;
  const y = (e.clientY / window.innerHeight - 0.5) * 2;
  const stage = document.getElementById('dashboardStage');
  const bg = document.getElementById('bgGlow');
  if (stage) stage.style.transform = `rotateY(${x * 1}deg) rotateX(${-y * 0.5}deg)`;
  if (bg) bg.style.transform = `translate(${-x * 8}px, ${-y * 8}px)`;
});

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.body.classList.add('reduced-motion');
}

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
  setTheme(state.theme);

  // 加载包列表 + 恢复配置
  loadPackages();

  // Particle system
  window.particleSystem = new ParticleSystem();

  // Navigation tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Run button
  document.getElementById('btnRun').addEventListener('click', runTestSuite);

  // Settings
  document.getElementById('btnSettings').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('settingsDropdown').classList.toggle('open');
  });
  document.addEventListener('click', e => {
    const dd = document.getElementById('settingsDropdown');
    if (!dd.contains(e.target) && e.target.id !== 'btnSettings') dd.classList.remove('open');
  });

  // Theme
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.themeVal));
  });

  // Particles toggle
  const particlesToggle = document.querySelector('#settingParticles .toggle-switch input');
  if (particlesToggle) {
    particlesToggle.addEventListener('change', e => { state.particlesEnabled = e.target.checked; });
  }

  // Parallax toggle
  const parallaxToggle = document.querySelector('#settingParallax .toggle-switch input');
  if (parallaxToggle) {
    parallaxToggle.addEventListener('change', e => {
      state.parallaxEnabled = e.target.checked;
      const stage = document.getElementById('dashboardStage');
      if (!e.target.checked && stage) stage.style.transform = '';
    });
  }

  // Log filter
  document.getElementById('logFilter').addEventListener('change', () => {
    logFilter = document.getElementById('logFilter').value;
    loadLogs();
  });

  // ====== AI Chat ======
  const chatBtn = document.getElementById('aiChatBtn');
  const chatPanel = document.getElementById('aiChatPanel');
  const chatClose = document.getElementById('aiChatClose');
  const chatInput = document.getElementById('aiChatInput');
  const chatSend = document.getElementById('aiChatSend');
  const chatMessages = document.getElementById('aiChatMessages');

  function openChat() {
    chatPanel.classList.add('open');
    chatInput.focus();
  }
  function closeChat() {
    chatPanel.classList.remove('open');
  }

  chatBtn.addEventListener('click', () => {
    if (chatPanel.classList.contains('open')) closeChat();
    else openChat();
  });
  chatClose.addEventListener('click', closeChat);

  function addMessage(text, isUser) {
    const div = document.createElement('div');
    div.className = `ai-msg ${isUser ? 'ai-user' : 'ai-bot'}`;
    div.innerHTML = `
      <div class="ai-msg-avatar">${isUser ? '👤' : '🤖'}</div>
      <div class="ai-msg-bubble">${text}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    addMessage(text, true);

    // 添加 loading
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-msg ai-bot';
    loadingDiv.id = 'aiLoading';
    loadingDiv.innerHTML = '<div class="ai-msg-avatar">🤖</div><div class="ai-msg-bubble"><span class="loading-dots">⏳</span></div>';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const result = await api.aiChat(text);

      // 移除 loading
      const ld = document.getElementById('aiLoading');
      if (ld) ld.remove();

      addMessage(result.reply, false);

      // 处理 action
      if (result.action === 'config_update') {
        if (result.data?.bundleName) {
          localStorage.setItem('cfg_bundle', result.data.bundleName);
          // 刷新包下拉列表
          loadPackages();
        }
        if (result.data?.deviceId) {
          const el = document.getElementById('cfgDeviceId');
          if (el) { el.value = result.data.deviceId; localStorage.setItem('cfg_deviceId', result.data.deviceId); }
        }
      }

      if (result.action === 'run_test') {
        addMessage('🔄 正在执行测试，请稍候...', false);
        setTimeout(() => runTestSuite(), 500);
      }

      if (result.action === 'run_pipeline') {
        addMessage('⏳ 全自动流水线启动中...(下载仓库→生成用例→生成脚本→执行)', false);
        api.runPipeline(result.data.packageName, result.data.repoUrl).then(pr => {
          if (pr.success) {
            const d = pr.data;
            const passed = d.steps.filter(s => s.status === 'passed').length;
            const failed = d.steps.filter(s => s.status === 'failed').length;
            addMessage(
              `✅ **流水线完成**\n\n| 步骤 | 状态 |\n|---|---|\n${d.steps.map(s => `| ${s.name} | ${s.status === 'passed' ? '✅' : '❌'} |`).join('\n')}\n\n${d.report ? `📊 ${d.report.passed}/${d.report.total} 通过, ${(d.report.duration/1000).toFixed(1)}s` : ''}`,
              false
            );
            loadMetrics();
          } else {
            addMessage(`❌ 流水线失败: ${pr.error || '未知'}`, false);
          }
        }).catch(e => addMessage(`❌ 流水线请求失败: ${e.message}`, false));
      }

    } catch (err) {
      const ld = document.getElementById('aiLoading');
      if (ld) ld.remove();
      addMessage(`❌ 请求失败: ${err.message}`, false);
    }
  }

  chatSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });

  // 如果之前配置了 aiConfig，自动刷新
  api.getAiConfig().then(r => {
    if (r.success && r.data) {
      // AI 侧持久化了配置，可以同步到前端
      if (r.data.bundleName) {
        const el = document.getElementById('cfgBundle');
        if (el) el.value = r.data.bundleName;
      }
      if (r.data.deviceId) {
        const el = document.getElementById('cfgDeviceId');
        if (el) el.value = r.data.deviceId;
      }
    }
  }).catch(() => {});

  // Load data
  updateDeviceInfo();
  loadMetrics();
  loadSessions();
  loadLogs();
});
