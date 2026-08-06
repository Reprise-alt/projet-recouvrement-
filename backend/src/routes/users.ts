import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { listEntreprises } from '../services/entrepriseService';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('admin'));

const VALID_ROLES = ['admin', 'manager_entite', 'comptable'];
const VALID_ROLES_OPERATIONS = ['directrice_operations', 'charge_compte', 'direction_generale'];

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
    const { nom, email, role, entite, estAgentRecouvrement, accesRecouvrement, roleOperations } = req.body ?? {};
    if (!nom || !email || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'nom, email et role (admin|manager_entite|comptable) sont requis' });
    }
    if (entite && !(await isKnownEntiteCode(entite))) {
      return res.status(400).json({ error: 'entite invalide' });
    }
    if (role === 'manager_entite' && !entite) {
      return res.status(400).json({ error: 'Un manager doit être rattaché à une entité' });
    }
    if (roleOperations != null && !VALID_ROLES_OPERATIONS.includes(roleOperations)) {
      return res.status(400).json({ error: 'roleOperations invalide' });
    }
    if (roleOperations && roleOperations !== 'direction_generale' && !entite) {
      return res.status(400).json({ error: 'Une directrice ou un chargé de compte Opérations doit être rattaché à une entité' });
    }
    const created = await prisma.utilisateur.create({
      data: {
        nom,
        email,
        role,
        entite: entite || null,
        // Par défaut un admin n'est pas un agent de terrain (cohérent avec
        // les comptes existants migrés) ; les autres rôles le sont, sauf
        // décision explicite au moment de la création.
        estAgentRecouvrement: typeof estAgentRecouvrement === 'boolean' ? estAgentRecouvrement : role !== 'admin',
        accesRecouvrement: typeof accesRecouvrement === 'boolean' ? accesRecouvrement : true,
        roleOperations: roleOperations || null,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const { nom, role, entite, estAgentRecouvrement, accesRecouvrement, roleOperations } = req.body ?? {};
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'role invalide' });
    }
    if (entite && !(await isKnownEntiteCode(entite))) {
      return res.status(400).json({ error: 'entite invalide' });
    }
    if (roleOperations !== undefined && roleOperations != null && !VALID_ROLES_OPERATIONS.includes(roleOperations)) {
      return res.status(400).json({ error: 'roleOperations invalide' });
    }
    const updated = await prisma.utilisateur.update({
      where: { id: req.params.id },
      data: {
        nom: typeof nom === 'string' ? nom : undefined,
        role: role || undefined,
        entite: entite === null ? null : entite || undefined,
        estAgentRecouvrement: typeof estAgentRecouvrement === 'boolean' ? estAgentRecouvrement : undefined,
        accesRecouvrement: typeof accesRecouvrement === 'boolean' ? accesRecouvrement : undefined,
        roleOperations: roleOperations !== undefined ? roleOperations || null : undefined,
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
