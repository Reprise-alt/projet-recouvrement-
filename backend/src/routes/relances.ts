import { Router } from 'express';
import { prisma, currentOrganisationId } from '../db';
import { getConfig } from '../services/configService';
import { clientEncours, PALIERS } from '../lib/paliers';
import { ClientRelance, dansFenetreEnvoi, relancesDues } from '../lib/moteurRelances';
import { executerRelancesTenant } from '../lib/executerRelances';
import { requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';

// Moteur de relances automatiques — aperçu (addendum §5). Slice 1 : lecture
// seule. Cet endpoint N'ENVOIE RIEN : il montre, pour le tenant courant, les
// relances qui partiraient automatiquement maintenant (moteur déterministe
// lib/moteurRelances), plus l'état de la fenêtre d'envoi (§5.2) et le drapeau
// « relances activées » de l'organisation (posé par la checklist §4.3).
export const relancesRouter = Router();
relancesRouter.use(requireAuth, requireAccesRecouvrement, tenantScope);

relancesRouter.get('/dues', async (_req, res, next) => {
  try {
    const config = await getConfig();
    const clients = await prisma.client.findMany({
      include: {
        factures: true,
        // Tout l'historique d'actions : nécessaire pour la règle « une seule
        // relance par palier » (on regarde le palier max déjà relancé).
        actions: { select: { palier: true, date: true } },
        echeanciers: { select: { tranches: { select: { dateEcheance: true, statut: true } } } },
      },
    });

    const now = new Date();
    const entree: ClientRelance[] = clients.map((c) => ({
      id: c.id,
      nom: c.nom,
      factures: c.factures,
      frequenceFacturation: c.frequenceFacturation,
      actions: c.actions,
      echeanciers: c.echeanciers,
      // enLitige / opposition : sources non encore câblées (portail débiteur, Lot 3).
    }));

    const encoursParClient = new Map(clients.map((c) => [c.id, clientEncours(c)]));
    const emailParClient = new Map(clients.map((c) => [c.id, c.email]));

    const dues = relancesDues(entree, config, now).map((d) => ({
      ...d,
      palierLabel: PALIERS[d.palier]?.label ?? `Palier ${d.palier}`,
      encours: encoursParClient.get(d.clientId) ?? 0,
      email: emailParClient.get(d.clientId) ?? null,
    }));

    // État « relances activées » de l'organisation courante (checklist §4.3).
    const orgId = currentOrganisationId();
    const org = orgId
      ? await prisma.organisation.findUnique({ where: { id: orgId }, select: { relancesActivees: true } })
      : null;

    res.json({
      fenetreOuverte: dansFenetreEnvoi(now),
      relancesActivees: org?.relancesActivees ?? null,
      total: dues.length,
      relances: dues,
    });
  } catch (err) {
    next(err);
  }
});

// Déclenchement (ou simulation) de l'envoi des relances dues pour le tenant
// courant. Réservé aux administrateurs. Par SÉCURITÉ, le dry-run est le défaut :
// il faut explicitement { dryRun: false } pour envoyer réellement (et rester
// dans la fenêtre d'envoi, sauf forcerHorsFenetre). Paliers ≥ 6 jamais envoyés
// automatiquement (action juridique manuelle).
relancesRouter.post('/executer', requireRole('admin'), async (req, res, next) => {
  try {
    const dryRun = req.body?.dryRun !== false; // défaut : true (simulation)
    const forcerHorsFenetre = req.body?.forcerHorsFenetre === true;
    const rapport = await executerRelancesTenant({ dryRun, forcerHorsFenetre });
    res.json(rapport);
  } catch (err) {
    next(err);
  }
});
