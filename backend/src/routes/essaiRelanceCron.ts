import { Router } from 'express';
import { prisma, withTenant, rlsActive } from '../db';
import { getEmailProvider } from '../lib/email/provider';

// Relance d'essai « pensez à importer » (J+2) : nudge automatique vers les
// comptes en essai qui n'ont encore importé AUCUNE créance réelle. Objectif
// d'activation — sans import, le prospect ne voit jamais le produit tourner.
// Déclenché par un ordonnanceur externe (cron Render), authentifié par secret
// partagé (même RELANCES_CRON_SECRET). Envoyé une seule fois par compte
// (garde-fou relanceEssaiImportEnvoyee).
export const essaiRelanceCronRouter = Router();

const JOUR_MS = 24 * 60 * 60 * 1000;
const DELAI_MIN_JOURS = 2; // on laisse 48 h avant de relancer un nouveau compte

function corpsTexte(prenom: string | null, joursRestants: number, lien: string): string {
  return [
    `Bonjour${prenom ? ' ' + prenom : ''},`,
    '',
    'Votre espace Feyma est prêt — il ne lui manque que vos créances pour commencer à travailler pour vous.',
    '',
    "Importez votre fichier de factures impayées (un simple export Excel ou CSV de votre logiciel suffit : on détecte vos colonnes automatiquement, vous les confirmez, c'est importé). Les relances pourront ensuite partir toutes seules, à votre nom.",
    '',
    `Importer maintenant : ${lien}`,
    '',
    joursRestants > 0
      ? `Il vous reste ${joursRestants} jour${joursRestants > 1 ? 's' : ''} d'essai.`
      : "Votre période d'essai touche à sa fin.",
    '',
    'Besoin d\'un coup de main pour préparer votre fichier ? Répondez simplement à cet email.',
    '',
    '— L\'équipe Feyma',
  ].join('\n');
}

function corpsHtml(prenom: string | null, joursRestants: number, lien: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#0E1D33">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:700;font-size:20px;color:#1D9E75;margin-bottom:18px">Feyma</div>
    <p style="font-size:15px;line-height:1.5">Bonjour${prenom ? ' ' + prenom : ''},</p>
    <p style="font-size:15px;line-height:1.5">Votre espace Feyma est prêt — il ne lui manque que <b>vos créances</b> pour commencer à travailler pour vous.</p>
    <p style="font-size:15px;line-height:1.5">Importez votre fichier de factures impayées : un simple export Excel ou CSV suffit. On détecte vos colonnes automatiquement, vous les confirmez, c'est importé. Les relances partent ensuite toutes seules, à votre nom.</p>
    <p style="text-align:center;margin:26px 0">
      <a href="${lien}" style="background:#1D9E75;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block">Importer mes créances</a>
    </p>
    <p style="font-size:13.5px;color:#55606b">${
      joursRestants > 0
        ? `Il vous reste <b>${joursRestants} jour${joursRestants > 1 ? 's' : ''}</b> d'essai.`
        : "Votre période d'essai touche à sa fin."
    } Besoin d'aide pour préparer votre fichier ? Répondez simplement à cet email.</p>
    <p style="font-size:13.5px;color:#55606b">— L'équipe Feyma</p>
  </div>
</body></html>`;
}

essaiRelanceCronRouter.post('/', async (req, res, next) => {
  try {
    const secret = process.env.RELANCES_CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'Déclencheur cron désactivé (RELANCES_CRON_SECRET non défini)' });
    }
    if (req.header('x-cron-secret') !== secret) {
      return res.status(401).json({ error: 'Secret cron invalide' });
    }
    // Comptage des créances par organisation = scope tenant : exige la RLS.
    if (!rlsActive()) {
      return res.status(503).json({ error: 'RLS requis pour le ciblage par organisation (RLS_ENABLED != true)' });
    }

    const now = new Date();
    const avant = new Date(now.getTime() - DELAI_MIN_JOURS * JOUR_MS);
    const front = process.env.FRONTEND_URL?.replace(/\/$/, '') || '';

    // Comptes en essai, jamais relancés, essai encore en cours, créés il y a au
    // moins 48 h. Lecture hors tenant (échappatoire RLS pour la table org).
    const orgs = await prisma.organisation.findMany({
      where: {
        statut: 'essai',
        relanceEssaiImportEnvoyee: false,
        createdAt: { lte: avant },
        dateFinEssai: { gt: now },
      },
      select: { id: true, raisonSociale: true, dateFinEssai: true },
    });

    const resultats: { organisationId: string; envoye?: boolean; raison?: string }[] = [];
    for (const org of orgs) {
      try {
        const { nbReelles, admin } = await withTenant(org.id, async () => {
          const nbReelles = await prisma.client.count({ where: { estExemple: false } });
          const admin = await prisma.utilisateur.findFirst({
            where: { role: 'admin' },
            select: { email: true, nom: true },
          });
          return { nbReelles, admin };
        });

        if (nbReelles > 0) {
          resultats.push({ organisationId: org.id, raison: 'a déjà importé' });
          continue;
        }
        if (!admin?.email) {
          resultats.push({ organisationId: org.id, raison: 'pas de destinataire admin' });
          continue;
        }

        const joursRestants = org.dateFinEssai
          ? Math.max(0, Math.ceil((org.dateFinEssai.getTime() - now.getTime()) / JOUR_MS))
          : 0;
        const prenom = admin.nom ? admin.nom.split(' ')[0] : null;

        await getEmailProvider().send({
          to: admin.email,
          subject: 'Votre espace Feyma est prêt — importez vos créances en 2 minutes',
          text: corpsTexte(prenom, joursRestants, front || 'votre console Feyma'),
          html: corpsHtml(prenom, joursRestants, front || '#'),
          fromName: 'Feyma',
        });
        await prisma.organisation.update({
          where: { id: org.id },
          data: { relanceEssaiImportEnvoyee: true },
        });
        resultats.push({ organisationId: org.id, envoye: true });
      } catch (e) {
        resultats.push({ organisationId: org.id, raison: e instanceof Error ? e.message : 'erreur' });
      }
    }

    res.json({ candidats: orgs.length, envoyees: resultats.filter((r) => r.envoye).length, resultats });
  } catch (err) {
    next(err);
  }
});
