import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, assertEntiteInScope } from '../middleware/auth';
import { sendViaGmail } from '../lib/gmail';
import { getGmailCredential, touchGmailCredential } from '../services/gmailCredentialService';
import { PALIERS } from '../lib/paliers';
import { Entite } from '../lib/entites';

export const sendEmailRouter = Router();
sendEmailRouter.use(requireAuth, requireRole('admin', 'manager_entite'));

interface ClientLetterContext {
  type: 'client_letter';
  clientId: string;
  palier: number;
}
interface ContractDocContext {
  type: 'contract_doc';
  contratId: string;
}
type SendContext = ClientLetterContext | ContractDocContext;

// Point d'envoi unique : que ce soit une relance client ou un avenant de
// contrat, la validation manuelle a déjà eu lieu côté frontend (l'utilisateur
// relit le texte avant de confirmer) — ici on envoie réellement via Gmail
// puis on enregistre la trace (action ou envoi) uniquement si l'envoi a
// réussi, jamais avant.
sendEmailRouter.post('/', async (req, res, next) => {
  try {
    const { to, subject, body, context } = (req.body ?? {}) as { to?: string; subject?: string; body?: string; context?: SendContext };
    if (!to || !subject || !body || !context) {
      return res.status(400).json({ error: 'to, subject, body et context sont requis' });
    }

    if (context.type === 'client_letter') {
      const client = await prisma.client.findUnique({ where: { id: context.clientId } });
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
      if (!assertEntiteInScope(req, res, client.entite as Entite)) return;
      if (!PALIERS[context.palier]) return res.status(400).json({ error: 'Palier invalide' });
    } else if (context.type === 'contract_doc') {
      const contrat = await prisma.contrat.findUnique({ where: { id: context.contratId }, include: { client: true } });
      if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
      if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;
    } else {
      return res.status(400).json({ error: 'context.type invalide' });
    }

    const credential = await getGmailCredential();
    if (!credential?.refreshToken || credential.statut !== 'actif') {
      return res.status(409).json({ error: "Gmail n'est pas connecté — un admin doit le connecter depuis Utilisateurs/Intégrations." });
    }

    await sendViaGmail(credential.refreshToken, to, subject, body);
    await touchGmailCredential();

    if (context.type === 'client_letter') {
      await prisma.actionRecouvrement.create({
        data: {
          clientId: context.clientId,
          palier: context.palier,
          label: PALIERS[context.palier].label,
          note: `Envoyé par email à ${to}`,
        },
      });
    } else {
      await prisma.envoiContrat.create({
        data: { contratId: context.contratId, label: subject, destinataire: to, sujet: subject, corps: body, statutEnvoi: 'envoye' },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
