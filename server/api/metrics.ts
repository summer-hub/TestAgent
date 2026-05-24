import { Router, Request, Response } from 'express';
import * as device from '../data/device-data';
import * as mock from '../data/mock-data';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const metrics = await device.getMetrics();
    res.json({ success: true, data: metrics, source: 'device' });
  } catch {
    const metrics = mock.getMetrics();
    res.json({ success: true, data: metrics, source: 'mock' });
  }
});

export default router;
