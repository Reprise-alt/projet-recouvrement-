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
