import { Router } from 'express';
import { prisma } from '../db';
import { getGmailCredential } from '../services/gmailCredentialService';
import { sendViaGmail } from '../lib/gmail';
import { emailMode, getEmailProvider } from '../lib/email/provider';

export const contactRouter = Router();

const TYPES = ['investir', 'poc', 'autre', 'rappel'] as const;
type TypeDemande = (typeof TYPES)[number];

const TYPE_LABELS: Record<TypeDemande, string> = {
  investir: 'Investir',
  poc: 'Devenir client pilote',
  autre: 'Autre',
  rappel: 'Demande de rappel (grand compte)',
};

const DESTINATAIRE = 'f.baudoin@iris-afrique.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Formulaire public (page vitrine, non authentifiée) — limite naïve en
// mémoire pour décourager le spam sans dépendance supplémentaire ; se
// réinitialise au redémarrage du serveur, ce qui est acceptable pour ce
// volume attendu (quelques soumissions par jour, pas un service à fort trafic).
const submissionsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (submissionsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  submissionsByIp.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

interface Demande {
  type: TypeDemande;
  nom: string;
  email: string;
  telephone?: string;
  societe?: string;
  message: string;
}

// Notification best-effort vers Florian. La demande est TOUJOURS enregistrée en
// base : une notification manquée ne doit jamais faire perdre un prospect.
// Deux canaux, dans l'ordre :
//   1) Gmail IRIS s'il est connecté (console groupe / relances) ;
//   2) sinon le fournisseur email configuré (SaaS Feyma : Resend en HTTP).
// replyTo = email du prospect → Florian répond directement depuis sa boîte.
async function notifyByEmail(d: Demande) {
  const typeLabel = TYPE_LABELS[d.type];
  const subject = `[Feyma — vitrine] Nouvelle demande : ${typeLabel}`;
  const body = [
    `Type : ${typeLabel}`,
    `Nom : ${d.nom}`,
    `Email : ${d.email}`,
    d.telephone ? `Téléphone : ${d.telephone}` : null,
    d.societe ? `Société : ${d.societe}` : null,
    '',
    d.message || '(aucun message)',
  ]
    .filter((l) => l !== null)
    .join('\n');

  const credential = await getGmailCredential('IRIS');
  if (credential?.refreshToken && credential.statut === 'actif') {
    await sendViaGmail(credential.refreshToken, DESTINATAIRE, subject, body, []);
    return;
  }
  if (emailMode() !== 'stub') {
    await getEmailProvider().send({ to: DESTINATAIRE, subject, text: body, replyTo: d.email });
    return;
  }
  console.warn('Contact : aucun canal email disponible — demande enregistrée en base uniquement');
}

contactRouter.post('/', async (req, res, next) => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Trop de demandes envoyées récemment — réessayez plus tard.' });
    }

    const { type, nom, email, telephone, societe, message } = (req.body ?? {}) as {
      type?: string;
      nom?: string;
      email?: string;
      telephone?: string;
      societe?: string;
      message?: string;
    };

    if (!type || !TYPES.includes(type as TypeDemande)) {
      return res.status(400).json({ error: 'type invalide' });
    }
    const t = type as TypeDemande;
    if (!nom?.trim() || nom.length > 200) {
      return res.status(400).json({ error: 'nom requis' });
    }
    if (!email?.trim() || email.length > 320 || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'email invalide' });
    }
    if (telephone && telephone.length > 40) {
      return res.status(400).json({ error: 'téléphone invalide' });
    }
    if (societe && societe.length > 200) {
      return res.status(400).json({ error: 'société trop longue' });
    }
    // Pour une demande de rappel, le téléphone est requis et le message
    // facultatif (on rappelle) ; pour les autres types, le message est requis.
    if (t === 'rappel') {
      if (!telephone?.trim()) {
        return res.status(400).json({ error: 'téléphone requis pour être rappelé' });
      }
    } else if (!message?.trim()) {
      return res.status(400).json({ error: 'message requis' });
    }
    if (message && message.length > 5000) {
      return res.status(400).json({ error: 'message trop long (5000 caractères maximum)' });
    }

    const demande: Demande = {
      type: t,
      nom: nom.trim(),
      email: email.trim(),
      telephone: telephone?.trim() || undefined,
      societe: societe?.trim() || undefined,
      message: message?.trim() || '',
    };

    await prisma.demandeContact.create({
      data: {
        type: demande.type,
        nom: demande.nom,
        email: demande.email,
        telephone: demande.telephone ?? null,
        societe: demande.societe ?? null,
        message: demande.message,
      },
    });

    try {
      await notifyByEmail(demande);
    } catch (emailErr) {
      // La demande est déjà enregistrée — une notification manquée n'est
      // jamais une raison de renvoyer une erreur à l'utilisateur.
      console.error('Notification email du formulaire de contact échouée', emailErr);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
