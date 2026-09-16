import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireOrgRole } from '../middleware/auth';

// Fiche de l'organisation SaaS (addendum §3, §4.3 étape 1) : identité, identifiants
// fiscaux, logo, instructions de paiement affichées aux débiteurs. Opère toujours
// sur l'organisation de l'utilisateur authentifié.
export const organisationRouter = Router();
organisationRouter.use(requireAuth);

// Champs modifiables de la fiche (le slug, la formule et le statut sont gérés
// ailleurs : abonnement / back-office).
const CHAMPS = [
  'raisonSociale',
  'pays',
  'identifiantFiscal',
  'rccm',
  'adresse',
  'logoUrl',
  'instructionsPaiement',
  'contactRecouvrement',
] as const;

organisationRouter.get('/', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({ where: { id: req.user!.organisationId } });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable' });
    res.json(org);
  } catch (e) {
    next(e);
  }
});

// Réservé aux profils d'administration de l'organisation (propriétaire /
// administrateur) — cf. §3. Un gestionnaire ou un compte lecture ne modifie pas
// la fiche.
organisationRouter.patch('/', requireOrgRole('proprietaire', 'administrateur'), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const c of CHAMPS) {
      if (c in body) {
        const v = body[c];
        data[c] = typeof v === 'string' && v.trim() === '' ? null : v;
      }
    }
    if ('raisonSociale' in data && !String(data.raisonSociale ?? '').trim()) {
      return res.status(400).json({ error: 'La raison sociale est requise' });
    }
    const org = await prisma.organisation.update({ where: { id: req.user!.organisationId }, data: data as never });
    res.json(org);
  } catch (e) {
    next(e);
  }
});
