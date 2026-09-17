import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { requireAuth, requireOrgRole } from '../middleware/auth';
import { emailMode, getEmailProvider } from '../lib/email/provider';

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

// Diagnostic d'envoi d'email : envoie un message de test à l'adresse de
// l'administrateur et renvoie un résultat STRUCTURÉ (mode actif + succès ou
// message d'erreur exact). Permet de vérifier la délivrabilité sans deviner —
// et de détecter qu'on est resté en mode « stub » (aucun envoi réel).
organisationRouter.post('/test-email', requireOrgRole('proprietaire', 'administrateur'), async (req, res, next) => {
  const mode = emailMode();
  try {
    const to = req.user!.email;
    await getEmailProvider().send({
      to,
      subject: 'Test d’envoi — OLU 360',
      text: 'Cet email confirme que l’envoi depuis votre espace OLU 360 fonctionne. Si vous le recevez, vos relances partiront bien à vos débiteurs.',
    });
    // En mode stub, aucun email n'est réellement parti (juste journalisé).
    res.json({
      ok: mode === 'smtp',
      mode,
      to,
      message:
        mode === 'smtp'
          ? `Email de test envoyé à ${to}. Vérifiez la réception (et les spams).`
          : "Mode « stub » actif : aucun email n'est réellement envoyé. Configurez EMAIL_PROVIDER=smtp et les identifiants SMTP.",
    });
  } catch (e) {
    // On renvoie l'erreur exacte (auth SMTP, domaine non vérifié…) au lieu d'un
    // 500 opaque, pour que l'exploitant diagnostique lui-même.
    res.status(200).json({ ok: false, mode, error: e instanceof Error ? e.message : String(e) });
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
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || req.protocol;
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
