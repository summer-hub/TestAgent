import { Router, Request, Response } from 'express';
import * as device from '../data/device-data';
import * as mock from '../data/mock-data';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    const result = await device.getSessions(page, limit);
    res.json({ success: true, ...result, source: 'device' });
  } catch {
    const result = mock.getSessions(page, limit);
    res.json({ success: true, ...result, source: 'mock' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await device.getSessionDetail(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data: result, source: 'device' });
  } catch {
    const result = mock.getSessionDetail(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data: result, source: 'mock' });
  }
});

export default router;
