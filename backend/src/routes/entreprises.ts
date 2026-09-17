import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { requireCapacite } from '../middleware/capacite';
import { createEntreprise, EntrepriseValidationError, listEntreprises, updateEntreprise } from '../services/entrepriseService';

export const entreprisesRouter = Router();
// tenantScope INDISPENSABLE : la table Entreprise est isolée par RLS. Sans
// contexte tenant posé, l'échappatoire RLS renverrait les entités de TOUTES les
// organisations — un client SaaS reverrait alors les entités du groupe dans son
// sélecteur. Le scope rattache chaque lecture/écriture à l'organisation courante.
entreprisesRouter.use(requireAuth, tenantScope);

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

// Créer une entité = fonction multi-entités (réservée PME/Grands comptes).
entreprisesRouter.post('/', requireRole('admin'), requireCapacite('multiEntites'), async (req, res, next) => {
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
