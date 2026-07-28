import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { createEntreprise, EntrepriseValidationError, listEntreprises, updateEntreprise } from '../services/entrepriseService';

export const entreprisesRouter = Router();
entreprisesRouter.use(requireAuth);

// Toute personne connectée peut lister les entités (noms de sociétés, pas de
// données sensibles) — nécessaire pour l'onglet de filtre et les menus.
// `?all=true` (admin uniquement) inclut aussi les entités désactivées, pour
// le panneau de gestion.
entreprisesRouter.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.all === 'true' && req.user!.role === 'admin';
    res.json(await listEntreprises(includeInactive));
  } catch (err) {
    next(err);
  }
});

entreprisesRouter.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { code, nom } = req.body ?? {};
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Code requis' });
    const created = await createEntreprise(code, typeof nom === 'string' ? nom : code);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof EntrepriseValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

entreprisesRouter.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { nom, actif } = req.body ?? {};
    const updated = await updateEntreprise(req.params.id, {
      nom: typeof nom === 'string' ? nom : undefined,
      actif: typeof actif === 'boolean' ? actif : undefined,
    });
    res.json(updated);
  } catch (err) {
    if (err instanceof EntrepriseValidationError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
