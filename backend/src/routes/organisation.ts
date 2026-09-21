import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { requireAuth, requireOrgRole } from '../middleware/auth';
import { emailMode, getEmailProvider } from '../lib/email/provider';
import { capacites } from '../lib/formules';
import { superAdminEmails } from '../lib/superAdmin';

// Types d'image acceptés pour le logo. PNG/JPEG/WebP s'affichent partout, y
// compris dans les emails ; SVG toléré (rendu via <img>, sans exécution de
// script) mais peu fiable en email.
const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const uploadLogo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

// Fiche de l'organisation SaaS (addendum §3, §4.3 étape 1) : identité, identifiants
// fiscaux, logo, instructions de paiement affichées aux débiteurs. Opère toujours
// sur l'organisation de l'utilisateur authentifié.
export const organisationRouter = Router();
organisationRouter.use(requireAuth);

// Champs modifiables de la fiche (le slug, la formule et le statut sont gérés
// ailleurs : abonnement / back-office).
const CHAMPS = [
  'raisonSociale',
  'pays',
  'identifiantFiscal',
  'rccm',
  'formeJuridique',
  'capitalSocial',
  'nomDirigeant',
  'cniDirigeant',
  'adresse',
  'logoUrl',
  'instructionsPaiement',
  'waveLien',
  'orangeMoneyNumero',
  'contactRecouvrement',
  'emailReponse',
] as const;

organisationRouter.get('/', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({ where: { id: req.user!.organisationId } });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable' });
    res.json(org);
  } catch (e) {
    next(e);
  }
});

// Réservé aux profils d'administration de l'organisation (propriétaire /
// administrateur) — cf. §3. Un gestionnaire ou un compte lecture ne modifie pas
// la fiche.
organisationRouter.patch('/', requireOrgRole('proprietaire', 'administrateur'), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const c of CHAMPS) {
      if (c in body) {
        const v = body[c];
        data[c] = typeof v === 'string' && v.trim() === '' ? null : v;
      }
    }
    if ('raisonSociale' in data && !String(data.raisonSociale ?? '').trim()) {
      return res.status(400).json({ error: 'La raison sociale est requise' });
    }
    const org = await prisma.organisation.update({ where: { id: req.user!.organisationId }, data: data as never });
    res.json(org);
  } catch (e) {
    next(e);
  }
});

// Activation en self-service du module Contentieux pour la formule « Petite
// structure » (option payante +10 000 FCFA/mois, cf. lib/formules). Le module
// est INCLUS pour PME et Grands comptes : l'option ne concerne donc que Petite.
// La facturation étant hors-ligne (comme tout l'abonnement), l'activation est
// immédiate et l'exploitant est notifié par email pour l'ajout au prochain
// prélèvement. Réservé aux profils d'administration de l'organisation.
organisationRouter.post('/option-contentieux', requireOrgRole('proprietaire', 'administrateur'), async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({
      where: { id: req.user!.organisationId },
      select: { id: true, raisonSociale: true, formule: true, optionContentieux: true },
    });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable' });
    // Sur PME / Grands comptes, le contentieux est déjà inclus : rien à activer.
    if (org.formule !== 'petite') {
      return res.status(400).json({ error: 'Le module contentieux est déjà inclus dans votre formule.' });
    }
    if (!org.optionContentieux) {
      await prisma.organisation.update({
        where: { id: org.id },
        data: { optionContentieux: true },
      });
      // Notification exploitant (best-effort : ne bloque pas l'activation si
      // l'email échoue — le drapeau est déjà posé en base).
      const dest = superAdminEmails();
      if (dest.length) {
        getEmailProvider()
          .send({
            to: dest.join(', '),
            subject: `Option Contentieux activée — ${org.raisonSociale ?? org.id}`,
            text:
              `L'organisation « ${org.raisonSociale ?? org.id} » (formule Petite structure) vient d'activer ` +
              `le module Contentieux en self-service.\n\n` +
              `➜ À ajouter au prochain prélèvement : +10 000 FCFA/mois.\n\n` +
              `Demandé par : ${req.user!.email}.`,
          })
          .catch((e) => console.error('[option-contentieux] notification exploitant échouée:', e));
      }
    }
    // Renvoie les capacités à jour pour que le front débloque l'onglet.
    res.json({ optionContentieux: true, capacites: capacites(org.formule, true) });
  } catch (e) {
    next(e);
  }
});

// Diagnostic d'envoi d'email : envoie un message de test à l'adresse de
// l'administrateur et renvoie un résultat STRUCTURÉ (mode actif + succès ou
// message d'erreur exact). Permet de vérifier la délivrabilité sans deviner —
// et de détecter qu'on est resté en mode « stub » (aucun envoi réel).
organisationRouter.post('/test-email', requireOrgRole('proprietaire', 'administrateur'), async (req, res, next) => {
  const mode = emailMode();
  // Diagnostic de la clé RÉELLEMENT vue par le processus en cours : source
  // (RESEND_API_KEY prime sur SMTP_PASS), aperçu masqué et longueur. Permet de
  // voir si la clé est vide, ancienne (aperçu), ou si un redéploiement manque
  // (le processus garde l'env de son démarrage). On ne révèle jamais la clé
  // entière — seulement les 4 premiers/derniers caractères.
  const rawKey = (process.env.RESEND_API_KEY || process.env.SMTP_PASS || '').trim();
  const keyDiag = {
    keySource: process.env.RESEND_API_KEY ? 'RESEND_API_KEY' : process.env.SMTP_PASS ? 'SMTP_PASS' : 'aucune',
    keyHint: rawKey ? `${rawKey.slice(0, 4)}…${rawKey.slice(-4)}` : '(vide)',
    keyLength: rawKey.length,
  };
  try {
    const to = req.user!.email;
    await getEmailProvider().send({
      to,
      subject: 'Test d’envoi — OLU 360',
      text: 'Cet email confirme que l’envoi depuis votre espace OLU 360 fonctionne. Si vous le recevez, vos relances partiront bien à vos débiteurs.',
    });
    // En mode stub, aucun email n'est réellement parti (juste journalisé).
    res.json({
      ok: mode !== 'stub',
      mode,
      to,
      ...keyDiag,
      message:
        mode !== 'stub'
          ? `Email de test envoyé à ${to} (via ${mode}). Vérifiez la réception (et les spams).`
          : "Mode « stub » actif : aucun email n'est réellement envoyé. Configurez EMAIL_PROVIDER=resend (ou smtp).",
    });
  } catch (e) {
    // On renvoie l'erreur exacte (auth SMTP, domaine non vérifié…) au lieu d'un
    // 500 opaque, plus le diagnostic de clé, pour que l'exploitant tranche.
    res.status(200).json({ ok: false, mode, ...keyDiag, error: e instanceof Error ? e.message : String(e) });
  }
});

// Téléversement du logo (fichier). Stocké en base et servi par l'endpoint public
// /api/logo/:orgId, dont l'URL absolue est écrite dans logoUrl (utilisable dans
// les emails). Réservé aux profils d'administration, comme la fiche.
organisationRouter.post('/logo', requireOrgRole('proprietaire', 'administrateur'), uploadLogo.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    if (!LOGO_MIMES.has(file.mimetype)) {
      return res.status(400).json({ error: 'Format non supporté (PNG, JPEG, WebP, GIF ou SVG attendu)' });
    }
    // URL publique absolue de l'endpoint de service (les emails ont besoin d'un
    // lien http(s) complet). Derrière le proxy Render, le schéma réel est dans
    // x-forwarded-proto.
    // En production (Render), le schéma est TOUJOURS https ; on le force pour ne
    // pas risquer une URL http bloquée en « contenu mixte » sur la page https.
    const proto = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const host = req.get('host');
    const orgId = req.user!.organisationId;
    const logoUrl = `${proto}://${host}/api/logo/${orgId}?v=${Date.now()}`;
    const org = await prisma.organisation.update({
      where: { id: orgId },
      data: { logoData: file.buffer, logoMime: file.mimetype, logoUrl },
    });
    res.json({ logoUrl: org.logoUrl });
  } catch (e) {
    next(e);
  }
});

// Types d'image acceptés pour le QR Wave (affiché dans les emails → images
// classiques uniquement, pas de PDF/SVG qui ne se rendent pas partout).
const QR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Téléversement du QR code marchand Wave (image). Même mécanisme que le logo :
// stocké en base, servi par /api/wave-qr/:orgId, URL absolue écrite dans waveQrUrl.
organisationRouter.post('/wave-qr', requireOrgRole('proprietaire', 'administrateur'), uploadLogo.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    if (!QR_MIMES.has(file.mimetype)) {
      return res.status(400).json({ error: 'Format non supporté (PNG, JPEG ou WebP attendu). Si vous avez le QR en PDF, faites une capture d’écran.' });
    }
    const proto = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const host = req.get('host');
    const orgId = req.user!.organisationId;
    const waveQrUrl = `${proto}://${host}/api/wave-qr/${orgId}?v=${Date.now()}`;
    const org = await prisma.organisation.update({
      where: { id: orgId },
      data: { waveQrData: file.buffer, waveQrMime: file.mimetype, waveQrUrl },
    });
    res.json({ waveQrUrl: org.waveQrUrl });
  } catch (e) {
    next(e);
  }
});

// Retrait du QR Wave.
organisationRouter.delete('/wave-qr', requireOrgRole('proprietaire', 'administrateur'), async (req, res, next) => {
  try {
    await prisma.organisation.update({
      where: { id: req.user!.organisationId },
      data: { waveQrData: null, waveQrMime: null, waveQrUrl: null },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
