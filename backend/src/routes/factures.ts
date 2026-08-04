import { Router } from 'express';
import { prisma } from '../db';
import { Entite } from '../lib/entites';
import { assertEntiteInScope, requireAuth, requireRole } from '../middleware/auth';
import { fmtDate, fmtFCFA } from '../lib/dates';

export const facturesRouter = Router();
facturesRouter.use(requireAuth);

facturesRouter.patch(
  '/:factureId/toggle-paid',
  requireRole('admin', 'manager_entite', 'comptable'),
  async (req, res, next) => {
    try {
      const facture = await prisma.facture.findUnique({ where: { id: req.params.factureId }, include: { client: true } });
      if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
      if (!assertEntiteInScope(req, res, facture.client.entite as Entite)) return;

      const wasUnpaid = facture.statut === 'impayee';
      const updated = await prisma.facture.update({
        where: { id: facture.id },
        data: {
          statut: wasUnpaid ? 'payee' : 'impayee',
          datePaiement: wasUnpaid ? new Date() : null,
        },
      });

      if (wasUnpaid) {
        await prisma.actionRecouvrement.create({
          data: {
            clientId: facture.clientId,
            palier: 0,
            label: 'Facture réglée',
            note: `${facture.numero} — ${facture.montant.toLocaleString('fr-FR')} FCFA`,
            utilisateurId: req.user!.id,
          },
        });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// Corrige une facture après import (montant erroné, date mal renseignée...) —
// il n'existait jusque-là aucun moyen de rectifier une donnée corrompue sans
// accès direct à la base.
facturesRouter.patch('/:factureId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const facture = await prisma.facture.findUnique({ where: { id: req.params.factureId }, include: { client: true } });
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    if (!assertEntiteInScope(req, res, facture.client.entite as Entite)) return;

    const { montant, dateFacture, dateEcheance, designation } = req.body ?? {};
    if (montant !== undefined && (typeof montant !== 'number' || !Number.isFinite(montant) || montant < 0)) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const updated = await prisma.facture.update({
      where: { id: facture.id },
      data: {
        montant: typeof montant === 'number' ? montant : undefined,
        dateFacture: dateFacture ? new Date(dateFacture) : undefined,
        dateEcheance: dateEcheance ? new Date(dateEcheance) : undefined,
        designation: typeof designation === 'string' ? designation.trim() || null : undefined,
      },
    });

    // Trace de qui a corrigé quoi — nécessaire depuis qu'une donnée corrompue
    // à l'import a pu fausser le reporting sans qu'on sache qui l'a réparée.
    const changements: string[] = [];
    if (typeof montant === 'number' && montant !== facture.montant) {
      changements.push(`montant ${fmtFCFA(facture.montant)} → ${fmtFCFA(montant)}`);
    }
    if (dateFacture && (!facture.dateFacture || new Date(dateFacture).getTime() !== facture.dateFacture.getTime())) {
      changements.push(`date facture → ${fmtDate(dateFacture)}`);
    }
    if (dateEcheance && new Date(dateEcheance).getTime() !== facture.dateEcheance.getTime()) {
      changements.push(`échéance → ${fmtDate(dateEcheance)}`);
    }
    if (typeof designation === 'string' && designation.trim() !== (facture.designation ?? '')) {
      changements.push('désignation modifiée');
    }
    if (changements.length) {
      await prisma.actionRecouvrement.create({
        data: {
          clientId: facture.clientId,
          palier: 0,
          label: 'Facture corrigée',
          note: `${facture.numero} — ${changements.join(', ')} (par ${req.user!.nom})`,
          utilisateurId: req.user!.id,
        },
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

facturesRouter.delete('/:factureId', requireRole('admin'), async (req, res, next) => {
  try {
    const facture = await prisma.facture.findUnique({ where: { id: req.params.factureId }, include: { client: true } });
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    if (!assertEntiteInScope(req, res, facture.client.entite as Entite)) return;

    await prisma.facture.delete({ where: { id: facture.id } });
    await prisma.actionRecouvrement.create({
      data: {
        clientId: facture.clientId,
        palier: 0,
        label: 'Facture supprimée',
        note: `${facture.numero} — ${fmtFCFA(facture.montant)} (par ${req.user!.nom})`,
        utilisateurId: req.user!.id,
      },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
