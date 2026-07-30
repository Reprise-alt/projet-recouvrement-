import { Router } from 'express';
import { prisma } from '../db';
import { Entite } from '../lib/entites';
import { assertEntiteInScope, requireAuth, requireRole } from '../middleware/auth';

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
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
