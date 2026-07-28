import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { listEntreprises } from '../services/entrepriseService';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('admin'));

const VALID_ROLES = ['admin', 'manager_entite', 'comptable'];

async function isKnownEntiteCode(code: string): Promise<boolean> {
  const entreprises = await listEntreprises(true);
  return entreprises.some((e) => e.code === code);
}

usersRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await prisma.utilisateur.findMany({ orderBy: { nom: 'asc' } }));
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const { nom, email, role, entite } = req.body ?? {};
    if (!nom || !email || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'nom, email et role (admin|manager_entite|comptable) sont requis' });
    }
    if (entite && !(await isKnownEntiteCode(entite))) {
      return res.status(400).json({ error: 'entite invalide' });
    }
    if (role === 'manager_entite' && !entite) {
      return res.status(400).json({ error: 'Un manager doit être rattaché à une entité' });
    }
    const created = await prisma.utilisateur.create({
      data: { nom, email, role, entite: entite || null },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const { nom, role, entite } = req.body ?? {};
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'role invalide' });
    }
    if (entite && !(await isKnownEntiteCode(entite))) {
      return res.status(400).json({ error: 'entite invalide' });
    }
    const updated = await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: {
        nom: typeof nom === 'string' ? nom : undefined,
        role: role || undefined,
        entite: entite === null ? null : entite || undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

usersRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.utilisateur.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
