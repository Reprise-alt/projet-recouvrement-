import { Router } from 'express';
import {
  getConfig,
  getReglagesPaliers,
  PatchReglagePalier,
  updateConfig,
  updateReglagesPaliers,
} from '../services/configService';
import { requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';

export const configRouter = Router();
// Réglages des paliers = PROPRES à chaque organisation (RLS) : tenantScope
// indispensable pour poser le contexte tenant (lecture/écriture de PalierOrg).
// Lecture ouverte à tout utilisateur du recouvrement (les libellés/seuils
// s'affichent dans toute la console) ; écriture réservée aux admins (§4).
configRouter.use(requireAuth, requireAccesRecouvrement, tenantScope);

// Seuils de paliers en jours (rétro-compatible).
configRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await getConfig());
  } catch (err) {
    next(err);
  }
});

configRouter.put('/', requireRole('admin'), async (req, res, next) => {
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

// Réglages complets par palier : jours + activation + libellé personnalisé.
configRouter.get('/paliers', async (_req, res, next) => {
  try {
    res.json(await getReglagesPaliers());
  } catch (err) {
    next(err);
  }
});

configRouter.put('/paliers', requireRole('admin'), async (req, res, next) => {
  try {
    const body = req.body;
    const liste: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.paliers) ? body.paliers : [];
    const patchs: PatchReglagePalier[] = [];
    for (const item of liste) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const palier = Number(o.palier);
      if (!Number.isInteger(palier)) continue;
      const patch: PatchReglagePalier = { palier };
      if (typeof o.actif === 'boolean') patch.actif = o.actif;
      if (o.libelle === null || typeof o.libelle === 'string') patch.libelle = o.libelle as string | null;
      if (typeof o.jours === 'number' && o.jours > 0) patch.jours = o.jours;
      patchs.push(patch);
    }
    res.json(await updateReglagesPaliers(patchs));
  } catch (err) {
    next(err);
  }
});
