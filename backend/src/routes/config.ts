import { Router } from 'express';
import { getConfig, updateConfig } from '../services/configService';
import { requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';

export const configRouter = Router();
// Config des paliers = config globale du groupe — admin uniquement (§4).
configRouter.use(requireAuth, requireAccesRecouvrement, requireRole('admin'));

configRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await getConfig());
  } catch (err) {
    next(err);
  }
});

configRouter.put('/', async (req, res, next) => {
  try {
    const { j1, j2, j3, j4, j5, j6, j7 } = req.body ?? {};
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries({ j1, j2, j3, j4, j5, j6, j7 })) {
      if (typeof v === 'number' && v > 0) patch[k] = v;
    }
    res.json(await updateConfig(patch));
  } catch (err) {
    next(err);
  }
});
