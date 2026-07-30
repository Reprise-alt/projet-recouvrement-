import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { requireAuth, requireRole, assertEntiteInScope } from '../middleware/auth';
import { EmailAttachment, sendViaGmail } from '../lib/gmail';
import { getGmailCredential, touchGmailCredential } from '../services/gmailCredentialService';
import { PALIERS } from '../lib/paliers';
import { Entite } from '../lib/entites';

export const sendEmailRouter = Router();
sendEmailRouter.use(requireAuth, requireRole('admin', 'manager_entite'));

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES } });

function uploadAttachments(req: Request, res: Response, next: NextFunction) {
  upload.array('attachments', MAX_FILES)(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string })?.code;
    if (code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `Chaque pièce jointe doit faire moins de ${MAX_FILE_SIZE / (1024 * 1024)} Mo.` });
    if (code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: `Maximum ${MAX_FILES} pièces jointes par email.` });
    next(err);
  });
}

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
sendEmailRouter.post('/', uploadAttachments, async (req, res, next) => {
  try {
    const { to, subject, body } = (req.body ?? {}) as { to?: string; subject?: string; body?: string };
    const rawContext = (req.body as { context?: string | SendContext } | undefined)?.context;
    let context: SendContext | undefined;
    try {
      context = typeof rawContext === 'string' ? JSON.parse(rawContext) : rawContext;
    } catch {
      return res.status(400).json({ error: 'context invalide' });
    }
    if (!to || !subject || !body || !context) {
      return res.status(400).json({ error: 'to, subject, body et context sont requis' });
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_SIZE) {
      return res.status(400).json({ error: `Le total des pièces jointes doit rester sous ${MAX_TOTAL_SIZE / (1024 * 1024)} Mo.` });
    }
    const attachments: EmailAttachment[] = files.map((f) => ({
      filename: f.originalname,
      mimeType: f.mimetype || 'application/octet-stream',
      content: f.buffer,
    }));

    let entiteEnvoi: string;
    if (context.type === 'client_letter') {
      const client = await prisma.client.findUnique({ where: { id: context.clientId } });
      if (!client) return res.status(404).json({ error: 'Client introuvable' });
      if (!assertEntiteInScope(req, res, client.entite as Entite)) return;
      if (!PALIERS[context.palier]) return res.status(400).json({ error: 'Palier invalide' });
      entiteEnvoi = client.entite;
    } else if (context.type === 'contract_doc') {
      const contrat = await prisma.contrat.findUnique({ where: { id: context.contratId }, include: { client: true } });
      if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
      if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;
      entiteEnvoi = contrat.client.entite;
    } else {
      return res.status(400).json({ error: 'context.type invalide' });
    }

    // Chaque entité envoie depuis son propre compte Gmail connecté — pas de
    // repli sur un compte partagé, pour ne jamais expédier un mail SIS ou
    // IRIS depuis le compte connecté par erreur à SORAM (ou inversement).
    const credential = await getGmailCredential(entiteEnvoi);
    if (!credential?.refreshToken || credential.statut !== 'actif') {
      return res
        .status(409)
        .json({ error: `Gmail n'est pas connecté pour ${entiteEnvoi} — un admin doit le connecter depuis Utilisateurs/Intégrations.` });
    }

    await sendViaGmail(credential.refreshToken, to, subject, body, attachments);
    await touchGmailCredential(entiteEnvoi);

    const attachmentsNote = attachments.length ? ` (pièces jointes : ${attachments.map((a) => a.filename).join(', ')})` : '';

    if (context.type === 'client_letter') {
      await prisma.actionRecouvrement.create({
        data: {
          clientId: context.clientId,
          palier: context.palier,
          label: PALIERS[context.palier].label,
          note: `Envoyé par email à ${to}${attachmentsNote}`,
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
