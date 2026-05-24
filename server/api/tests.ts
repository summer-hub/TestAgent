import { Router, Request, Response } from 'express';
import * as device from '../data/device-data';
import * as mock from '../data/mock-data';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await device.getTestDetail(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Test not found' });
    res.json({ success: true, data: result, source: 'device' });
  } catch {
    const result = mock.getTestDetail(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Test not found' });
    res.json({ success: true, data: result, source: 'mock' });
  }
});

export default router;
