import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import metricsRouter from './api/metrics';
import sessionsRouter from './api/sessions';
import testsRouter from './api/tests';
import logsRouter from './api/logs';
import runTestRouter from './api/run-test';
import aiRouter from './api/ai/chat';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// ====== API Routes ======
app.use('/api/metrics', metricsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/tests', testsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/run-test', runTestRouter);
app.use('/api/ai', aiRouter);

// Package list (from PackageDB)
import { packageDB } from './data/package-db';

app.get('/api/packages', (_req, res) => {
  const all = packageDB.getAll();
  res.json({ success: true, data: all.map(p => ({
    packageName: p.packageName,
    repoUrl: p.repoUrl,
    status: p.status,
    testCaseCount: p.testCases.length,
    reportCount: p.reports.length,
  }))});
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ====== Static Files ======
const dashboardPath = path.resolve(__dirname, '../dashboard');
app.use(express.static(dashboardPath));

// SPA fallback
app.use((_req, res) => {
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

// ====== 启动时检测设备 ======
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function detectDevice() {
  try {
    const { stdout } = await execAsync('hdc list targets', { timeout: 5000 });
    const targets = stdout.trim();
    if (targets && !targets.includes('[empty]')) {
      console.log(`  📱 检测到设备: ${targets.split('\n')[0]}`);
      console.log(`  💡 数据源: 真实设备 (auto-detected)`);
      return true;
    }
  } catch {}
  console.log(`  💡 数据源: Mock (未检测到设备)`);
  return false;
}

// ====== Start ======
app.listen(PORT, async () => {
  console.log(`\n  🚀 AI Test Agent · Dashboard Server`);
  console.log(`  ───────────────────────────────────`);
  console.log(`  API:    http://localhost:${PORT}/api/health`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  3D:       http://localhost:${PORT}/3d.html`);
  console.log(`  SSE Logs: http://localhost:${PORT}/api/logs/stream`);
  console.log(`  ───────────────────────────────────`);
  await detectDevice();
  console.log('');
});
