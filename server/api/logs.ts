import { Router, Request, Response } from 'express';
import * as device from '../data/device-data';
import * as mock from '../data/mock-data';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const level = req.query.level as string;
  const since = req.query.since ? parseInt(req.query.since as string) : undefined;
  try {
    const logs = await device.getLogs(level, since);
    res.json({ success: true, data: logs, source: 'device' });
  } catch {
    const logs = mock.getLogs(level, since);
    res.json({ success: true, data: logs, source: 'mock' });
  }
});

router.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendLogs = (logs: any[]) => {
    res.write(`data: ${JSON.stringify({ type: 'init', data: logs })}\n\n`);
  };

  // Try device first
  (async () => {
    try {
      const logs = await device.getLogs(req.query.level as string);
      sendLogs(logs);
    } catch {
      const logs = mock.getLogs(req.query.level as string);
      sendLogs(logs);
    }
  })();

  const interval = setInterval(() => {
    const entry = mock.generateNewLog();
    res.write(`data: ${JSON.stringify({ type: 'entry', data: entry })}\n\n`);
  }, 3000 + Math.random() * 3000);

  req.on('close', () => clearInterval(interval));
});

export default router;
