import { Router } from 'express';
import { prisma } from '../db';
import { creerCodeOtp, verifierCodeOtp, normaliserEmail } from '../lib/otp';
import { getEmailProvider } from '../lib/email/provider';
import { signerSession } from '../lib/authToken';
import { slugify } from '../lib/tenant';

// Inscription / connexion self-service par email à usage unique (addendum §4).
// Routes PUBLIQUES (pré-auth), montées hors de tout middleware d'authentification.
//   POST /api/auth/otp/request { email }              -> envoie un code
//   POST /api/auth/otp/verify  { email, code, ... }   -> connecte, ou INSCRIT
export const authOtpRouter = Router();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const TRANCHES = ['moins_50', 'entre_50_500', 'plus_500'] as const;
type Tranche = (typeof TRANCHES)[number];

// Formule recommandée d'après le volume déclaré (addendum §4.2 → §8.2).
// Simple aiguillage ; le prospect reste libre de choisir à la souscription.
function formuleRecommandee(tranche: Tranche | null): 'petite' | 'pme' | 'grands_comptes' {
  if (tranche === 'moins_50') return 'petite';
  if (tranche === 'plus_500') return 'grands_comptes';
  return 'pme';
}

authOtpRouter.post('/request', async (req, res, next) => {
  try {
    const email = normaliserEmail(req.body?.email);
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email invalide' });
    const r = await creerCodeOtp(email);
    if ('erreur' in r) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques minutes' });
    await getEmailProvider().sendOtp(email, r.code);
    // On ne révèle jamais si l'email existe déjà (même réponse inscription/connexion).
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authOtpRouter.post('/verify', async (req, res, next) => {
  try {
    const email = normaliserEmail(req.body?.email);
    const code = String(req.body?.code ?? '').trim();
    if (!email || !code) return res.status(400).json({ error: 'Email et code requis' });

    const ok = await verifierCodeOtp(email, code);
    if (!ok) return res.status(401).json({ error: 'Code invalide ou expiré' });

    let utilisateur = await prisma.utilisateur.findUnique({ where: { email } });
    let inscription = false;

    if (!utilisateur) {
      // INSCRIPTION : création de l'organisation + du compte propriétaire.
      // Hors contexte tenant (route publique) : sous RLS, l'échappatoire autorise
      // ces insertions, l'organisationId étant fixé explicitement.
      inscription = true;
      const raisonSociale = String(req.body?.raisonSociale ?? '').trim() || email.split('@')[0];
      // Profilage optionnel (§4.2). Le secteur et l'outil de facturation sont du
      // texte libre ; la tranche est validée contre l'énumération.
      const secteur = String(req.body?.secteur ?? '').trim() || null;
      const outilFacturation = String(req.body?.outilFacturation ?? '').trim() || null;
      const trancheBrute = String(req.body?.trancheDebiteurs ?? '').trim();
      const trancheDebiteurs = (TRANCHES as readonly string[]).includes(trancheBrute)
        ? (trancheBrute as Tranche)
        : null;
      const org = await prisma.organisation.create({
        data: {
          raisonSociale,
          slug: await slugUnique(raisonSociale),
          statut: 'essai',
          secteur,
          outilFacturation,
          trancheDebiteurs,
          // Préremplit la formule recommandée (le client la confirme/ajuste plus tard).
          formule: formuleRecommandee(trancheDebiteurs),
        },
      });
      utilisateur = await prisma.utilisateur.create({
        data: {
          email,
          nom: raisonSociale,
          organisationId: org.id,
          role: 'admin', // rôle groupe historique requis (non nul) — non pertinent en SaaS
          roleOrg: 'proprietaire',
          accesRecouvrement: true,
        },
      });
    }

    const token = signerSession(utilisateur.id, utilisateur.organisationId);
    res.json({
      token,
      inscription,
      utilisateur: {
        id: utilisateur.id,
        email: utilisateur.email,
        nom: utilisateur.nom,
        organisationId: utilisateur.organisationId,
        roleOrg: utilisateur.roleOrg,
      },
    });
  } catch (e) {
    next(e);
  }
});

// Génère un slug d'organisation unique (suffixe -2, -3… en cas de collision).
async function slugUnique(nom: string): Promise<string> {
  const base = slugify(nom);
  for (let i = 0; i < 50; i++) {
    const candidat = i === 0 ? base : `${base}-${i + 1}`;
    const existe = await prisma.organisation.findUnique({ where: { slug: candidat } });
    if (!existe) return candidat;
  }
  return `${base}-${Date.now()}`;
}
