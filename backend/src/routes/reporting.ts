import { Request, Router } from 'express';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { fmtDate, fmtFCFA } from '../lib/dates';
import {
  AgentActionEntry,
  buildAgentMontantRecouvre,
  buildAgentStats,
  buildReportingSummary,
  lastNMonthKeys,
  PaymentAttributionEntry,
} from '../lib/reporting';
import { PALIERS } from '../lib/paliers';

const EVOLUTION_MONTHS = 6;

export const reportingRouter = Router();
reportingRouter.use(requireAuth);

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

interface Period {
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
}

function parsePeriod(query: Request['query']): Period | null {
  const fromStr = typeof query.from === 'string' ? query.from : '';
  const toStr = typeof query.to === 'string' ? query.to : '';
  if (!fromStr || !toStr) return null;
  const from = new Date(`${fromStr}T00:00:00.000Z`);
  const to = new Date(`${toStr}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  return { from, to, fromStr, toStr };
}

async function fetchReportingData(req: Request) {
  const period = parsePeriod(req.query);
  if (!period) return null;
  const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
  const where = entiteWhere(entiteFilter);

  const factures = await prisma.facture.findMany({
    where: { statut: 'payee', datePaiement: { gte: period.from, lte: period.to }, client: where },
    include: { client: true },
    orderBy: { datePaiement: 'asc' },
  });
  const actions = await prisma.actionRecouvrement.findMany({
    where: { date: { gte: period.from, lte: period.to }, client: where },
  });

  // Évolution du délai d'encaissement sur les derniers mois glissants —
  // indépendante de la période choisie ci-dessus, pour suivre une vraie
  // tendance dans le temps plutôt qu'un instantané.
  const evolutionMonths = lastNMonthKeys(EVOLUTION_MONTHS);
  const evolutionFrom = new Date(`${evolutionMonths[0]}-01T00:00:00.000Z`);
  const facturesEvolution = await prisma.facture.findMany({
    where: { statut: 'payee', datePaiement: { gte: evolutionFrom }, client: where },
  });

  const summary = buildReportingSummary(
    period.fromStr,
    period.toStr,
    factures.map((f) => ({
      numero: f.numero,
      montant: f.montant,
      dateFacture: f.dateFacture,
      datePaiement: f.datePaiement!,
      clientNom: f.client.nom,
      entite: f.client.entite,
    })),
    actions,
    facturesEvolution.map((f) => ({ montant: f.montant, dateFacture: f.dateFacture, datePaiement: f.datePaiement! })),
    evolutionMonths,
  );

  return { summary, factures, period };
}

reportingRouter.get('/summary', async (req, res, next) => {
  try {
    const data = await fetchReportingData(req);
    if (!data) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    res.json(data.summary);
  } catch (err) {
    next(err);
  }
});

// Détail des relances d'un palier donné sur la période — permet de cliquer
// sur un compteur du tableau "Relances effectuées" pour voir concrètement
// qui a été relancé, quand, et avec quel commentaire éventuel.
reportingRouter.get('/relances', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (!period) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const palier = parseInt(req.query.palier as string, 10);
    if (Number.isNaN(palier) || !PALIERS[palier] || palier < 1) {
      return res.status(400).json({ error: 'Palier invalide' });
    }
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const where = entiteWhere(entiteFilter);

    const actions = await prisma.actionRecouvrement.findMany({
      where: { palier, date: { gte: period.from, lte: period.to }, client: where },
      include: { client: true },
      orderBy: { date: 'desc' },
    });

    res.json(
      actions.map((a) => ({
        id: a.id,
        date: a.date,
        note: a.note,
        clientId: a.clientId,
        clientNom: a.client.nom,
        entite: a.client.entite,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// Performance par agent sur la période -- réservé à admin/manager_entite,
// jamais un comptable (cf. §visibilité). Trois mesures volontairement
// distinctes :
//  - "actions" = charge de travail, un compte brut, sans ambiguïté.
//  - "delaiMoyenApresIntervention" = jours entre une relance (palier > 0)
//    de l'agent et le paiement suivant enregistré pour ce client.
//  - "montantRecouvre" = montant des factures payées sur la période,
//    créditées à l'agent du dernier contact avant le paiement.
// Les deux dernières sont des corrélations, jamais une preuve que l'agent
// est la cause du paiement — les noms de champs et les libellés côté UI
// doivent rester honnêtes là-dessus.
// Seules les actions palier > 0 comptent (la tenue de dossier -- facture
// corrigée/supprimée, tranche réglée -- fausserait les trois métriques), et
// seuls les utilisateurs marqués agent de recouvrement apparaissent : un
// admin qui consulte la plateforme sans faire de relance n'a pas à
// apparaître dans ce tableau (cf. Utilisateur.estAgentRecouvrement).
reportingRouter.get('/agents', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (!period) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const where = entiteWhere(entiteFilter);
    const agentActionWhere = { palier: { gt: 0 }, utilisateurId: { not: null }, utilisateur: { estAgentRecouvrement: true } } as const;

    const actions = await prisma.actionRecouvrement.findMany({
      where: { ...agentActionWhere, date: { gte: period.from, lte: period.to }, client: where },
      include: {
        utilisateur: true,
        client: { include: { factures: { where: { statut: 'payee' }, select: { datePaiement: true } } } },
      },
      orderBy: { date: 'asc' },
    });

    const actionEntries: AgentActionEntry[] = actions
      .filter((a): a is typeof a & { utilisateurId: string; utilisateur: NonNullable<typeof a.utilisateur> } => a.utilisateur !== null)
      .map((a) => ({
        utilisateurId: a.utilisateurId,
        utilisateurNom: a.utilisateur.nom,
        date: a.date,
        datesPaiementClient: a.client.factures.map((f) => f.datePaiement),
      }));

    // Factures payées sur la période, avec tout l'historique de relance du
    // client (pas limité à la période -- voir le commentaire sur
    // PaymentAttributionEntry) pour l'attribution "dernier contact".
    const payeesPeriode = await prisma.facture.findMany({
      where: { statut: 'payee', datePaiement: { gte: period.from, lte: period.to }, client: where },
      include: { client: { include: { actions: { where: agentActionWhere, include: { utilisateur: true } } } } },
    });

    const paymentEntries: PaymentAttributionEntry[] = payeesPeriode.map((f) => ({
      montant: f.montant,
      datePaiement: f.datePaiement!,
      actionsClient: f.client.actions
        .filter((a): a is typeof a & { utilisateurId: string; utilisateur: NonNullable<typeof a.utilisateur> } => a.utilisateur !== null)
        .map((a) => ({ utilisateurId: a.utilisateurId, utilisateurNom: a.utilisateur.nom, date: a.date })),
    }));

    const actionStats = buildAgentStats(actionEntries);
    const montantStats = buildAgentMontantRecouvre(paymentEntries);

    const parAgent = new Map<string, { nom: string; actions: number; delaiMoyenApresIntervention: number | null; nombreDelaisMesures: number; montantRecouvre: number; nombreFactures: number }>();
    for (const s of actionStats) {
      parAgent.set(s.utilisateurId, {
        nom: s.nom,
        actions: s.actions,
        delaiMoyenApresIntervention: s.delaiMoyenApresIntervention,
        nombreDelaisMesures: s.nombreDelaisMesures,
        montantRecouvre: 0,
        nombreFactures: 0,
      });
    }
    for (const s of montantStats) {
      const existing = parAgent.get(s.utilisateurId);
      if (existing) {
        existing.montantRecouvre = s.montantRecouvre;
        existing.nombreFactures = s.nombreFactures;
      } else {
        parAgent.set(s.utilisateurId, {
          nom: s.nom,
          actions: 0,
          delaiMoyenApresIntervention: null,
          nombreDelaisMesures: 0,
          montantRecouvre: s.montantRecouvre,
          nombreFactures: s.nombreFactures,
        });
      }
    }

    const result = [...parAgent.entries()]
      .map(([utilisateurId, s]) => ({ utilisateurId, ...s }))
      .sort((a, b) => b.montantRecouvre - a.montantRecouvre || b.actions - a.actions);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

reportingRouter.get('/export.xlsx', async (req, res, next) => {
  try {
    const data = await fetchReportingData(req);
    if (!data) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const { summary, factures, period } = data;

    const wb = XLSX.utils.book_new();

    const resumeRows: (string | number)[][] = [
      ['Période', `${fmtDate(period.from)} au ${fmtDate(period.to)}`],
      ['Factures payées (nombre)', summary.facturesPayees.nombre],
      ['Montant total encaissé (FCFA)', summary.facturesPayees.montantTotal],
      ['Délai moyen d\'encaissement pondéré (jours)', summary.delaiEncaissement.global !== null ? Math.round(summary.delaiEncaissement.global) : 'N/A'],
      [],
      ['Palier', 'Nombre de relances effectuées'],
      ...summary.relances.map((r) => [r.label, r.nombre]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumeRows), 'Résumé');

    const delaiRows: (string | number)[][] = [
      ['Entité', 'Délai moyen pondéré (jours)', 'Montant encaissé (FCFA)', 'Nombre de factures'],
      ...summary.delaiEncaissement.parEntite.map((r) => [r.entite, r.delaiJours !== null ? Math.round(r.delaiJours) : 'N/A', r.montantTotal, r.nombre]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(delaiRows), 'Délai par entité');

    const evolutionRows: (string | number)[][] = [
      ['Mois', 'Délai moyen pondéré (jours)', 'Montant encaissé (FCFA)', 'Nombre de factures'],
      ...summary.evolutionMensuelle.map((r) => [r.mois, r.delaiJours !== null ? Math.round(r.delaiJours) : 'N/A', r.montantTotal, r.nombre]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(evolutionRows), 'Évolution mensuelle');

    const facturesRows: (string | number)[][] = [
      ['Client', 'N° facture', 'Montant (FCFA)', 'Date de paiement'],
      ...factures.map((f) => [f.client.nom, f.numero, f.montant, fmtDate(f.datePaiement!)]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(facturesRows), 'Factures payées');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporting_${period.fromStr}_${period.toStr}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// La police standard PDF (Helvetica, encodage WinAnsi) n'a pas de glyphe pour
// l'espace fine insécable (U+202F) que toLocaleString('fr-FR') utilise comme
// séparateur de milliers — sans ça le nombre s'affiche avec un caractère
// erroné. On la remplace par une espace normale avant d'écrire dans le PDF.
function pdfSafe(s: string): string {
  return s.replace(/[\u202f\u00a0]/g, ' ');
}

reportingRouter.get('/export.pdf', async (req, res, next) => {
  try {
    const data = await fetchReportingData(req);
    if (!data) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const { summary, period } = data;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporting_${period.fromStr}_${period.toStr}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).fillColor('#1B2430').text('Olu 360 — Reporting recouvrement');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#4B5566').text(pdfSafe(`Période : ${fmtDate(period.from)} au ${fmtDate(period.to)}`));
    doc.moveDown(1.2);

    doc.fontSize(13).fillColor('#1B2430').text('Factures payées');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#1B2430').text(`Nombre : ${summary.facturesPayees.nombre}`);
    doc.text(pdfSafe(`Montant total encaissé : ${fmtFCFA(summary.facturesPayees.montantTotal)}`));
    doc.text(
      `Délai moyen d'encaissement (pondéré) : ${summary.delaiEncaissement.global !== null ? `${Math.round(summary.delaiEncaissement.global)} jours` : 'N/A'}`,
    );
    doc.moveDown(1.2);

    if (summary.delaiEncaissement.parEntite.length > 1) {
      doc.fontSize(13).text('Délai d\'encaissement par entité');
      doc.moveDown(0.4);
      summary.delaiEncaissement.parEntite.forEach((r) => {
        doc.fontSize(11).text(`${r.entite} : ${r.delaiJours !== null ? `${Math.round(r.delaiJours)} jours` : 'N/A'}`);
      });
      doc.moveDown(1.2);
    }

    doc.fontSize(13).text('Relances effectuées par palier');
    doc.moveDown(0.4);
    summary.relances.forEach((r) => {
      doc.fontSize(11).text(`${r.label} : ${r.nombre}`);
    });
    doc.moveDown(1.2);

    doc.fontSize(13).text(`Évolution du délai d'encaissement (${EVOLUTION_MONTHS} derniers mois)`);
    doc.moveDown(0.4);
    summary.evolutionMensuelle.forEach((r) => {
      doc.fontSize(11).text(`${r.mois} : ${r.delaiJours !== null ? `${Math.round(r.delaiJours)} jours` : 'N/A'} (${r.nombre} facture(s))`);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
});
