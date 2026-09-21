import { Router } from 'express';
import { prisma, currentOrganisationId } from '../db';
import { getConfig, getPaliersActifs, getReglagesPaliers } from '../services/configService';
import { clientEncours, PALIERS } from '../lib/paliers';
import { ClientRelance, dansFenetreEnvoi, relancesDues } from '../lib/moteurRelances';
import { executerRelancesTenant, destinatairesRelance, reconstruireEmailRelance, PALIER_MAX_AUTO } from '../lib/executerRelances';
import {
  construireRelanceMarque,
  MODELES_DEFAUT,
  OrgIdentite,
  VARIABLES_RELANCE,
} from '../lib/modelesRelance';
import { chargerModelesOrg } from '../services/modeleRelanceService';
import { requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { requireAbonnementActif } from '../middleware/abonnement';

// Paliers dont le message part automatiquement (amiable) — l'éditeur ne porte
// que sur ceux-là (cf. PALIER_MAX_AUTO).
const PALIERS_MODIFIABLES = [1, 2, 3, 4, 5];

// Moteur de relances automatiques — aperçu (addendum §5). Slice 1 : lecture
// seule. Cet endpoint N'ENVOIE RIEN : il montre, pour le tenant courant, les
// relances qui partiraient automatiquement maintenant (moteur déterministe
// lib/moteurRelances), plus l'état de la fenêtre d'envoi (§5.2) et le drapeau
// « relances activées » de l'organisation (posé par la checklist §4.3).
export const relancesRouter = Router();
relancesRouter.use(requireAuth, requireAbonnementActif, requireAccesRecouvrement, tenantScope);

relancesRouter.get('/dues', async (_req, res, next) => {
  try {
    const config = await getConfig();
    const paliersActifs = await getPaliersActifs();
    // Libellés personnalisés de l'organisation (rename des paliers).
    const reglages = await getReglagesPaliers();
    const libelleParPalier = new Map(reglages.map((r) => [r.palier, r.libelle]));
    const clients = await prisma.client.findMany({
      include: {
        factures: true,
        // Tout l'historique d'actions : nécessaire pour la règle « une seule
        // relance par palier » (on regarde le palier max déjà relancé).
        actions: { select: { palier: true, date: true } },
        echeanciers: { select: { tranches: { select: { dateEcheance: true, statut: true } } } },
        // Contacts supplémentaires : mis en copie (CC) de la relance.
        contacts: { select: { email: true } },
      },
    });

    const now = new Date();
    const entree: ClientRelance[] = clients.map((c) => ({
      id: c.id,
      nom: c.nom,
      factures: c.factures,
      frequenceFacturation: c.frequenceFacturation,
      actions: c.actions,
      echeanciers: c.echeanciers,
      // enLitige / opposition : sources non encore câblées (portail débiteur, Lot 3).
    }));

    const encoursParClient = new Map(clients.map((c) => [c.id, clientEncours(c)]));
    // Destinataires effectifs (principal en « À » + contacts en copie) : le même
    // calcul que l'envoi réel, pour un aperçu fidèle.
    const destParClient = new Map(clients.map((c) => [c.id, destinatairesRelance(c.email, c.contacts)]));
    // Téléphone : sert à la relance manuelle par WhatsApp (lien wa.me côté front),
    // notamment pour les clients sans email.
    const telParClient = new Map(clients.map((c) => [c.id, c.tel]));

    const dues = relancesDues(entree, config, now, paliersActifs).map((d) => {
      const dest = destParClient.get(d.clientId) ?? null;
      return {
        ...d,
        palierLabel: libelleParPalier.get(d.palier) || PALIERS[d.palier]?.label || `Palier ${d.palier}`,
        encours: encoursParClient.get(d.clientId) ?? 0,
        email: dest?.to ?? null,
        ccCount: dest?.cc.length ?? 0,
        tel: telParClient.get(d.clientId) ?? null,
      };
    });

    // État « relances activées » de l'organisation courante (checklist §4.3).
    const orgId = currentOrganisationId();
    const org = orgId
      ? await prisma.organisation.findUnique({ where: { id: orgId }, select: { relancesActivees: true } })
      : null;

    // Séparation nette : les paliers amiables (≤ PALIER_MAX_AUTO) partent en
    // relance automatique ; les paliers contentieux (≥ 6) ne partent JAMAIS en
    // auto — ce sont des dossiers à basculer manuellement en contentieux. On ne
    // les mélange donc pas dans la liste des relances « à venir ».
    const aEnvoyer = dues.filter((d) => d.palier <= PALIER_MAX_AUTO);
    const contentieux = dues
      .filter((d) => d.palier > PALIER_MAX_AUTO)
      .map((d) => ({ clientId: d.clientId, nom: d.nom, palier: d.palier, palierLabel: d.palierLabel, joursRetard: d.joursRetard, encours: d.encours }));

    res.json({
      fenetreOuverte: dansFenetreEnvoi(now),
      relancesActivees: org?.relancesActivees ?? null,
      total: aEnvoyer.length,
      relances: aEnvoyer,
      // Clients ayant franchi le seuil contentieux (affichés à part côté front).
      contentieux,
    });
  } catch (err) {
    next(err);
  }
});

// Journal des relances (historique des actions/envois) du tenant courant,
// filtré par période (jour/semaine/mois) et palier. Renvoie la liste + un récap
// du nombre d'actions par palier. ActionRecouvrement est isolé par RLS.
relancesRouter.get('/journal', async (req, res, next) => {
  try {
    const periode = String(req.query.periode ?? 'semaine');
    const jours = periode === 'jour' ? 1 : periode === 'mois' ? 30 : 7;
    const depuis = new Date(Date.now() - jours * 86_400_000);
    const palierParam = req.query.palier != null && req.query.palier !== '' ? Number(req.query.palier) : null;

    const where: { date: { gte: Date }; palier?: number } = { date: { gte: depuis } };
    if (palierParam != null && !Number.isNaN(palierParam)) where.palier = palierParam;

    const actions = await prisma.actionRecouvrement.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500,
      select: {
        id: true, date: true, palier: true, label: true, note: true,
        // On lit ces colonnes pour n'exposer qu'un booléen « email archivé » dans
        // la liste ; le corps lui-même n'est jamais renvoyé ici (il se charge à la
        // demande via /journal/:id/email), pour garder la réponse légère.
        emailTexte: true, emailHtml: true,
        client: { select: { nom: true } },
      },
    });

    const reglages = await getReglagesPaliers();
    const libelleMap = new Map(reglages.map((r) => [r.palier, r.libelle]));
    const libelle = (p: number, fallback?: string | null) => libelleMap.get(p) || fallback || PALIERS[p]?.label || `Palier ${p}`;

    // Une action est un envoi email si sa note le dit (« … par email à … ») et
    // que son palier correspond à un modèle connu — seul cas où l'aperçu peut
    // être reconstitué. Les actions « Facture réglée/supprimée » ne matchent pas.
    const estEmail = (note: string | null, palier: number) => !!note && /par email à/i.test(note) && !!PALIERS[palier];

    const items = actions.map((a) => {
      const archive = !!(a.emailTexte || a.emailHtml);
      return {
        id: a.id,
        date: a.date.toISOString(),
        clientNom: a.client?.nom ?? '—',
        palier: a.palier,
        palierLabel: libelle(a.palier, a.label),
        note: a.note,
        // Vrai si le message exact envoyé a été archivé (chargeable via /email).
        emailArchive: archive,
        // Vrai si, faute d'archive, l'aperçu peut être RECONSTITUÉ (envoi email
        // antérieur à l'archivage) : même moteur, texte régénéré.
        emailReconstituable: !archive && estEmail(a.note, a.palier),
      };
    });

    const parPalier = new Map<number, number>();
    for (const a of actions) parPalier.set(a.palier, (parPalier.get(a.palier) ?? 0) + 1);
    const recap = [...parPalier.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([palier, count]) => ({ palier, palierLabel: libelle(palier), count }));

    res.json({ periode, total: actions.length, recap, items });
  } catch (err) {
    next(err);
  }
});

// Contenu EXACT de l'email archivé pour une action (relance auto ou manuelle).
// Chargé à la demande depuis le Journal (« voir l'email envoyé ») : l'agent
// relit le message réellement parti. ActionRecouvrement est isolé par RLS, donc
// findUnique ne renvoie que les actions du tenant courant.
relancesRouter.get('/journal/:id/email', async (req, res, next) => {
  try {
    const action = await prisma.actionRecouvrement.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, date: true, palier: true, label: true, note: true, clientId: true,
        emailSujet: true, emailTo: true, emailCc: true, emailHtml: true, emailTexte: true,
        client: { select: { nom: true } },
      },
    });
    if (!action) return res.status(404).json({ error: 'Action introuvable' });

    const meta = {
      id: action.id,
      date: action.date.toISOString(),
      clientNom: action.client?.nom ?? '—',
      palier: action.palier,
      palierLabel: action.label,
    };

    // 1) Archive exacte disponible → on renvoie le message tel qu'il est parti.
    if (action.emailTexte || action.emailHtml) {
      return res.json({
        ...meta,
        sujet: action.emailSujet,
        to: action.emailTo,
        cc: action.emailCc,
        html: action.emailHtml,
        texte: action.emailTexte,
        reconstitue: false,
      });
    }

    // 2) Pas d'archive (envoi antérieur à la fonctionnalité) : si l'action est
    // bien un envoi email, on RECONSTITUE l'aperçu avec le même moteur que
    // l'envoi. Sinon (action hors email), rien à montrer.
    const estEmail = !!action.note && /par email à/i.test(action.note) && !!PALIERS[action.palier];
    if (!estEmail) {
      return res.status(404).json({ error: 'Cette action n’est pas un envoi email.' });
    }
    const rec = await reconstruireEmailRelance(action.clientId, action.palier);
    if (!rec) return res.status(404).json({ error: 'Client introuvable pour la reconstitution.' });
    return res.json({
      ...meta,
      sujet: rec.sujet,
      // Destinataire réel de l'époque, si la note le mentionne ; sinon recalculé.
      to: (action.note?.match(/par email à\s+([^\s(]+)/i)?.[1]) ?? rec.to,
      cc: rec.cc || null,
      html: rec.html ?? null,
      texte: rec.texte,
      reconstitue: true,
    });
  } catch (err) {
    next(err);
  }
});

// Activer / suspendre l'envoi automatique des relances pour l'organisation.
// Interrupteur à double sens (l'onboarding ne faisait qu'activer) : permet de
// couper les envois pour un test, des congés, un litige, etc. Réservé aux
// administrateurs. Tant que c'est « en pause », le cron ne traite pas l'org.
relancesRouter.put('/envoi-automatique', requireRole('admin'), async (req, res, next) => {
  try {
    const actif = req.body?.actif === true;
    await prisma.organisation.update({
      where: { id: req.user!.organisationId },
      data: { relancesActivees: actif },
    });
    res.json({ relancesActivees: actif });
  } catch (err) {
    next(err);
  }
});

// Déclenchement (ou simulation) de l'envoi des relances dues pour le tenant
// courant. Réservé aux administrateurs. Par SÉCURITÉ, le dry-run est le défaut :
// il faut explicitement { dryRun: false } pour envoyer réellement (et rester
// dans la fenêtre d'envoi, sauf forcerHorsFenetre). Paliers ≥ 6 jamais envoyés
// automatiquement (action juridique manuelle).
relancesRouter.post('/executer', requireRole('admin'), async (req, res, next) => {
  try {
    const dryRun = req.body?.dryRun !== false; // défaut : true (simulation)
    const forcerHorsFenetre = req.body?.forcerHorsFenetre === true;
    const rapport = await executerRelancesTenant({ dryRun, forcerHorsFenetre });
    res.json(rapport);
  } catch (err) {
    next(err);
  }
});

// ── Éditeur de modèles de relance (addendum §5.3) ─────────────────────────────

// Liste des modèles par palier : le personnalisé du tenant s'il existe, sinon
// le modèle par défaut. + les variables disponibles pour l'éditeur.
relancesRouter.get('/modeles', async (_req, res, next) => {
  try {
    const overrides = await chargerModelesOrg();
    const modeles = PALIERS_MODIFIABLES.map((palier) => {
      const perso = overrides.get(palier);
      const modele = perso ?? MODELES_DEFAUT[palier];
      return {
        palier,
        label: PALIERS[palier]?.label ?? `Palier ${palier}`,
        sujet: modele.sujet,
        corps: modele.corps,
        personnalise: !!perso,
      };
    });
    res.json({ variables: VARIABLES_RELANCE, modeles });
  } catch (err) {
    next(err);
  }
});

// Enregistre (upsert) le modèle personnalisé d'un palier. Admin uniquement.
relancesRouter.put('/modeles/:palier', requireRole('admin'), async (req, res, next) => {
  try {
    const palier = Number(req.params.palier);
    if (!PALIERS_MODIFIABLES.includes(palier)) return res.status(400).json({ error: 'Palier non modifiable' });
    const sujet = String(req.body?.sujet ?? '').trim();
    const corps = String(req.body?.corps ?? '').trim();
    if (!sujet || !corps) return res.status(400).json({ error: 'Sujet et corps requis' });
    const orgId = currentOrganisationId();
    // upsert par (organisationId, palier). Sans contexte tenant (legacy), on
    // retombe sur l'org socle — cohérent avec le défaut de la colonne.
    const existing = await prisma.modeleRelanceOrg.findFirst({ where: { palier } });
    const row = existing
      ? await prisma.modeleRelanceOrg.update({ where: { id: existing.id }, data: { sujet, corps } })
      : await prisma.modeleRelanceOrg.create({ data: { palier, sujet, corps, ...(orgId ? { organisationId: orgId } : {}) } });
    res.json({ palier: row.palier, sujet: row.sujet, corps: row.corps, personnalise: true });
  } catch (err) {
    next(err);
  }
});

// Réinitialise un palier au modèle par défaut (supprime la surcharge). Admin.
relancesRouter.delete('/modeles/:palier', requireRole('admin'), async (req, res, next) => {
  try {
    const palier = Number(req.params.palier);
    if (!PALIERS_MODIFIABLES.includes(palier)) return res.status(400).json({ error: 'Palier non modifiable' });
    const existing = await prisma.modeleRelanceOrg.findFirst({ where: { palier } });
    if (existing) await prisma.modeleRelanceOrg.delete({ where: { id: existing.id } });
    const modele = MODELES_DEFAUT[palier];
    res.json({ palier, sujet: modele.sujet, corps: modele.corps, personnalise: false });
  } catch (err) {
    next(err);
  }
});

// Aperçu de marque d'un modèle (HTML rendu sur un exemple), pour l'éditeur.
// N'enregistre rien : rend le sujet/corps fournis (ou le modèle courant).
relancesRouter.post('/modeles/:palier/apercu', async (req, res, next) => {
  try {
    const palier = Number(req.params.palier);
    if (!PALIERS_MODIFIABLES.includes(palier)) return res.status(400).json({ error: 'Palier non modifiable' });
    const orgId = currentOrganisationId();
    const org = orgId
      ? await prisma.organisation.findUnique({
          where: { id: orgId },
          select: {
            raisonSociale: true, logoUrl: true, adresse: true, identifiantFiscal: true,
            rccm: true, formeJuridique: true, capitalSocial: true, contactRecouvrement: true,
            instructionsPaiement: true, waveLien: true, waveQrUrl: true, orangeMoneyNumero: true, pays: true,
          },
        })
      : null;
    const identite: OrgIdentite = {
      raisonSociale: org?.raisonSociale ?? 'Votre entreprise',
      logoUrl: org?.logoUrl, adresse: org?.adresse, identifiantFiscal: org?.identifiantFiscal,
      rccm: org?.rccm, formeJuridique: org?.formeJuridique, capitalSocial: org?.capitalSocial,
      contactRecouvrement: org?.contactRecouvrement,
      instructionsPaiement: org?.instructionsPaiement, waveLien: org?.waveLien,
      waveQrUrl: org?.waveQrUrl, orangeMoneyNumero: org?.orangeMoneyNumero, pays: org?.pays,
    };
    const sujet = req.body?.sujet != null ? String(req.body.sujet) : MODELES_DEFAUT[palier].sujet;
    const corps = req.body?.corps != null ? String(req.body.corps) : MODELES_DEFAUT[palier].corps;
    // Client fictif pour l'aperçu (échéance ~ selon le palier).
    const jours = [0, 3, 10, 20, 35, 50][palier] ?? 20;
    const exemple = {
      nom: 'Client Exemple SARL',
      factures: [{
        montant: 250000,
        dateEcheance: new Date(Date.now() - jours * 86_400_000).toISOString(),
        statut: 'impayee' as const,
        numero: 'FA-2026-0042',
      }],
    };
    const rendu = construireRelanceMarque(exemple, identite, palier, { sujet, corps });
    res.json({ sujet: rendu.sujet, texte: rendu.texte, html: rendu.html });
  } catch (err) {
    next(err);
  }
});
