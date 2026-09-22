import { Router } from 'express';
import { prisma, withTenant } from '../db';
import { clientEncours, clientJoursRetard, clientPalier, enLitigeSignal } from '../lib/paliers';
import { getConfig } from '../services/configService';

// Pont inter-systèmes (lecture seule) : quand un client du groupe (ex. SORAM)
// gère désormais son recouvrement dans Feyma (SaaS, base séparée), la console
// Opérations du groupe n'a plus accès à ses vraies données. Cet endpoint, servi
// par le back-end SaaS, expose — pour UNE organisation, et uniquement le
// nécessaire — le signal de litige et deux indicateurs, afin que la console
// Opérations reste à jour. Aucune donnée financière détaillée ne franchit la
// frontière (pas de factures, pas de montant par pièce) : seulement un signal
// et deux agrégats par client. Authentifié par secret partagé.
export const integrationRouter = Router();

integrationRouter.get('/operations-signaux', async (req, res, next) => {
  try {
    const secret = process.env.OPERATIONS_BRIDGE_SECRET;
    // Endpoint inerte tant que le secret n'est pas configuré (ex. côté groupe).
    if (!secret || req.header('x-bridge-secret') !== secret) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const ref = String(req.query.org || '').trim();
    if (!ref) return res.status(400).json({ error: 'Paramètre « org » requis' });

    // Résolution de l'organisation par identifiant, à défaut par raison sociale
    // (insensible à la casse) — pour que la config groupe puisse pointer « SORAM
    // AFRIQUE » sans connaître l'ID interne.
    const org = await prisma.organisation.findFirst({
      where: { OR: [{ id: ref }, { raisonSociale: { equals: ref, mode: 'insensitive' } }] },
      select: { id: true, raisonSociale: true },
    });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable' });

    // Lecture scopée à l'organisation (RLS via withTenant + filtre explicite en
    // ceinture-bretelles, valable même si la RLS n'est pas activée).
    const { clients, config } = await withTenant(org.id, async () => {
      const clients = await prisma.client.findMany({
        where: { organisationId: org.id },
        include: { factures: true },
      });
      const config = await getConfig();
      return { clients, config };
    });

    const signaux = clients.map((c) => ({
      nom: c.nom,
      enLitige: enLitigeSignal(c.factures),
      encours: clientEncours(c),
      joursRetard: clientJoursRetard(c),
      palier: clientPalier(c, config),
    }));

    res.json({ organisation: { id: org.id, raisonSociale: org.raisonSociale }, signaux });
  } catch (err) {
    next(err);
  }
});
