import { Router } from 'express';
import { prisma } from '../db';
import { getGmailCredential } from '../services/gmailCredentialService';
import { sendViaGmail } from '../lib/gmail';

export const contactRouter = Router();

const TYPES = ['investir', 'poc', 'autre'] as const;
type TypeDemande = (typeof TYPES)[number];

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

// Notification best-effort vers Florian via le compte Gmail IRIS déjà
// connecté pour les relances — la soumission reste enregistrée en base même
// si l'envoi échoue (aucun compte connecté, quota Google, etc.), pour ne
// jamais perdre un message faute d'intégration active.
async function notifyByEmail(type: TypeDemande, nom: string, email: string, societe: string | undefined, message: string) {
  const credential = await getGmailCredential('IRIS');
  if (!credential?.refreshToken || credential.statut !== 'actif') return;
  const typeLabel = type === 'investir' ? 'Investir' : type === 'poc' ? 'Devenir client pilote' : 'Autre';
  const subject = `[Olu 360 — vitrine] Nouvelle demande : ${typeLabel}`;
  const body = [
    `Type : ${typeLabel}`,
    `Nom : ${nom}`,
    `Email : ${email}`,
    societe ? `Société : ${societe}` : null,
    '',
    message,
  ]
    .filter((l) => l !== null)
    .join('\n');
  await sendViaGmail(credential.refreshToken, 'f.baudoin@iris-afrique.com', subject, body, []);
}

contactRouter.post('/', async (req, res, next) => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'Trop de demandes envoyées récemment — réessayez plus tard.' });
    }

    const { type, nom, email, societe, message } = (req.body ?? {}) as {
      type?: string;
      nom?: string;
      email?: string;
      societe?: string;
      message?: string;
    };

    if (!type || !TYPES.includes(type as TypeDemande)) {
      return res.status(400).json({ error: 'type invalide' });
    }
    if (!nom?.trim() || nom.length > 200) {
      return res.status(400).json({ error: 'nom requis' });
    }
    if (!email?.trim() || email.length > 320 || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'email invalide' });
    }
    if (!message?.trim() || message.length > 5000) {
      return res.status(400).json({ error: 'message requis (5000 caractères maximum)' });
    }
    if (societe && societe.length > 200) {
      return res.status(400).json({ error: 'société trop longue' });
    }

    await prisma.demandeContact.create({
      data: {
        type: type as TypeDemande,
        nom: nom.trim(),
        email: email.trim(),
        societe: societe?.trim() || null,
        message: message.trim(),
      },
    });

    try {
      await notifyByEmail(type as TypeDemande, nom.trim(), email.trim(), societe?.trim(), message.trim());
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
