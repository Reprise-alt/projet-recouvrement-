import { Router } from 'express';
import { prisma } from '../db';

export const facturesRouter = Router();

facturesRouter.patch('/:factureId/toggle-paid', async (req, res, next) => {
  try {
    const facture = await prisma.facture.findUnique({ where: { id: req.params.factureId } });
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });

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
});
