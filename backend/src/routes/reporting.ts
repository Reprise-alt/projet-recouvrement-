import { Request, Router } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db';
import { requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { fmtDate, fmtFCFA } from '../lib/dates';
import {
  AgentActionEntry,
  AgentStat,
  buildAgentMontantRecouvre,
  buildAgentStats,
  buildReportingSummary,
  lastNMonthKeys,
  PaymentAttributionEntry,
  ReportingSummary,
} from '../lib/reporting';
import { clientEncours, clientPalier, clientRetardInhabituel, PALIERS } from '../lib/paliers';
import { getConfig } from '../services/configService';
import { AnalyseResult, buildAnalyse } from '../lib/analyse';

const EVOLUTION_MONTHS = 6;
const LOGO_DIR = path.join(__dirname, '..', '..', 'assets', 'logos');
const LOGO_FILES: Record<string, string> = { SORAM: 'soram.png', SIS: 'sis.png', IRIS: 'iris.png' };

function logoPath(entite: string): string | null {
  const file = LOGO_FILES[entite];
  if (!file) return null;
  const full = path.join(LOGO_DIR, file);
  return fs.existsSync(full) ? full : null;
}

// Un ou plusieurs logos selon le périmètre choisi : le logo de l'entité si
// une seule est sélectionnée, sinon les trois du groupe côte à côte.
function logosForScope(entiteFilter: Entite | 'ALL'): string[] {
  const codes = entiteFilter === 'ALL' ? Object.keys(LOGO_FILES) : [entiteFilter];
  return codes.map(logoPath).filter((p): p is string => p !== null);
}

export const reportingRouter = Router();
reportingRouter.use(requireAuth, requireAccesRecouvrement);

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

export interface Period {
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
}

export function buildPeriod(fromStr: string, toStr: string): Period | null {
  if (!fromStr || !toStr) return null;
  const from = new Date(`${fromStr}T00:00:00.000Z`);
  const to = new Date(`${toStr}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  return { from, to, fromStr, toStr };
}

function parsePeriod(query: Request['query']): Period | null {
  return buildPeriod(typeof query.from === 'string' ? query.from : '', typeof query.to === 'string' ? query.to : '');
}

// Période de même durée immédiatement avant `period`, pour une comparaison
// de tendance -- jamais approximée : si le calcul donnerait une date
// invalide, l'appelant reçoit null et saute simplement les règles de
// tendance plutôt que de comparer des périodes de longueurs différentes.
function previousPeriod(period: Period): Period {
  const durationMs = period.to.getTime() - period.from.getTime();
  const to = new Date(period.from.getTime() - 1);
  const from = new Date(to.getTime() - durationMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from, to, fromStr: iso(from), toStr: iso(to) };
}

async function computeSummaryForPeriod(period: Period, where: object): Promise<ReportingSummary> {
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

  return buildReportingSummary(
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
}

async function fetchReportingData(req: Request) {
  const period = parsePeriod(req.query);
  if (!period) return null;
  const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
  const where = entiteWhere(entiteFilter);
  const summary = await computeSummaryForPeriod(period, where);

  const factures = await prisma.facture.findMany({
    where: { statut: 'payee', datePaiement: { gte: period.from, lte: period.to }, client: where },
    include: { client: true },
    orderBy: { datePaiement: 'asc' },
  });

  return { summary, factures, period, entiteFilter };
}

// Charge de travail, délai après intervention et montant recouvré par
// agent sur une période -- voir le commentaire détaillé sur la route
// GET /agents plus bas, cette fonction en est l'extraction pour être
// réutilisée par GET /analyse.
export async function computeAgentStats(period: Period, where: object): Promise<(AgentStat & { utilisateurId: string })[]> {
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

  const parAgent = new Map<string, AgentStat>();
  for (const s of actionStats) parAgent.set(s.utilisateurId, s);
  for (const s of montantStats) {
    const existing = parAgent.get(s.utilisateurId);
    if (existing) {
      existing.montantRecouvre = s.montantRecouvre;
      existing.nombreFactures = s.nombreFactures;
    } else {
      parAgent.set(s.utilisateurId, {
        utilisateurId: s.utilisateurId,
        nom: s.nom,
        actions: 0,
        delaiMoyenApresIntervention: null,
        nombreDelaisMesures: 0,
        montantRecouvre: s.montantRecouvre,
        nombreFactures: s.nombreFactures,
      });
    }
  }

  return [...parAgent.values()].sort((a, b) => b.montantRecouvre - a.montantRecouvre || b.actions - a.actions);
}

// État actuel (pas un flux sur une période) des clients en contentieux et
// des signaux de retard inhabituel -- pour l'analyse qualitative
// uniquement. Volontairement séparé de computeSummaryForPeriod : ces deux
// mesures n'ont pas de sens "sur une période passée" faute d'historique de
// statut sauvegardé, donc on ne prétend pas les dater autrement qu'"au
// moment de l'export".
async function computeSnapshotKpis(where: object) {
  const config = await getConfig();
  const clients = await prisma.client.findMany({ where, include: { factures: true } });
  const enContentieux = clients.filter((c) => clientPalier(c, config) >= 6);
  return {
    clientsEnContentieux: { nombre: enContentieux.length, montant: enContentieux.reduce((s, c) => s + clientEncours(c), 0) },
    clientsRetardInhabituel: clients.filter((c) => clientRetardInhabituel(c)).length,
  };
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
    res.json(await computeAgentStats(period, entiteWhere(entiteFilter)));
  } catch (err) {
    next(err);
  }
});

// Comparaison de deux périodes arbitraires (choisies par l'utilisateur, pas
// une "date d'adoption de la plateforme" que rien ne permettrait de fixer
// objectivement) -- pensé pour préparer des métriques à présenter en board :
// montant encaissé, délai d'encaissement, volume de relances, période A vs
// période B, avec l'écart calculé côté serveur pour éviter toute divergence
// d'arrondi avec l'affichage.
reportingRouter.get('/comparaison', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const periodeA = buildPeriod(typeof req.query.fromA === 'string' ? req.query.fromA : '', typeof req.query.toA === 'string' ? req.query.toA : '');
    const periodeB = buildPeriod(typeof req.query.fromB === 'string' ? req.query.fromB : '', typeof req.query.toB === 'string' ? req.query.toB : '');
    if (!periodeA || !periodeB) {
      return res.status(400).json({ error: 'Périodes invalides — fromA, toA, fromB et toB sont requis (format AAAA-MM-JJ)' });
    }
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const where = entiteWhere(entiteFilter);

    const [summaryA, summaryB] = await Promise.all([computeSummaryForPeriod(periodeA, where), computeSummaryForPeriod(periodeB, where)]);

    const relancesTotalA = summaryA.relances.reduce((s, r) => s + r.nombre, 0);
    const relancesTotalB = summaryB.relances.reduce((s, r) => s + r.nombre, 0);

    function delta(a: number, b: number) {
      return { absolu: b - a, pourcent: a !== 0 ? Math.round(((b - a) / a) * 1000) / 10 : null };
    }

    res.json({
      periodeA: { label: `${fmtDate(periodeA.from)} au ${fmtDate(periodeA.to)}`, summary: summaryA, relancesTotal: relancesTotalA },
      periodeB: { label: `${fmtDate(periodeB.from)} au ${fmtDate(periodeB.to)}`, summary: summaryB, relancesTotal: relancesTotalB },
      deltas: {
        montantEncaisse: delta(summaryA.facturesPayees.montantTotal, summaryB.facturesPayees.montantTotal),
        facturesPayees: delta(summaryA.facturesPayees.nombre, summaryB.facturesPayees.nombre),
        delaiMoyen:
          summaryA.delaiEncaissement.global !== null && summaryB.delaiEncaissement.global !== null
            ? delta(summaryA.delaiEncaissement.global, summaryB.delaiEncaissement.global)
            : null,
        relancesTotal: delta(relancesTotalA, relancesTotalB),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Suggestions d'analyse qualitative pour la période -- point de départ
// éditable côté client avant export (cf. AnalyseResult), jamais le texte
// final imposé. Compare à la période de même durée immédiatement
// précédente pour les règles de tendance.
reportingRouter.get('/analyse', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (!period) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const where = entiteWhere(entiteFilter);

    const [actuel, precedentSummary, snapshot, agents] = await Promise.all([
      computeSummaryForPeriod(period, where),
      computeSummaryForPeriod(previousPeriod(period), where),
      computeSnapshotKpis(where),
      computeAgentStats(period, where),
    ]);

    const analyse = buildAnalyse({
      periodeLabel: `${fmtDate(period.from)} au ${fmtDate(period.to)}`,
      actuel,
      precedent: precedentSummary,
      clientsEnContentieux: snapshot.clientsEnContentieux,
      clientsRetardInhabituel: snapshot.clientsRetardInhabituel,
      agents,
    });

    res.json(analyse);
  } catch (err) {
    next(err);
  }
});

const XL_DARK = 'FF0E2A22';
const XL_ACCENT = 'FF1D9E75';
const XL_PAPER2 = 'FFECEAE2';
const XL_SUCCESS_SOFT = 'FFDEEAE0';
const XL_SUCCESS = 'FF2F6A3B';
const XL_AMBER_SOFT = 'FFF3E7C6';
const XL_AMBER = 'FF8A6608';
const XL_INK = 'FF1B2430';
const XL_INK_SOFT = 'FF4B5566';
const XL_WHITE = 'FFFFFFFF';

function styleTitleRow(ws: ExcelJS.Worksheet, rowIndex: number, text: string, lastCol: number) {
  ws.mergeCells(rowIndex, 1, rowIndex, lastCol);
  const cell = ws.getCell(rowIndex, 1);
  cell.value = text;
  cell.font = { bold: true, color: { argb: XL_WHITE }, size: 14 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_DARK } };
  cell.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(rowIndex).height = 28;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, rowIndex: number, lastCol: number) {
  const row = ws.getRow(rowIndex);
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: XL_INK_SOFT }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_PAPER2 } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDDAD0' } } };
  }
  row.height = 18;
}

function addBorderedTable(ws: ExcelJS.Worksheet, startRow: number, headers: string[], rows: (string | number)[][], colWidths: number[]) {
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = colWidths[i];
  });
  ws.getRow(startRow).values = headers;
  styleHeaderRow(ws, startRow, headers.length);
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + 1 + i);
    row.values = r;
    row.eachCell((cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFECEAE2' } } };
    });
  });
  return startRow + 1 + rows.length;
}

function addAnalyseSection(ws: ExcelJS.Worksheet, startRow: number, titre: string, items: string[], bg: string, fg: string, lastCol: number): number {
  if (!items.length) return startRow;
  ws.mergeCells(startRow, 1, startRow, lastCol);
  const titleCell = ws.getCell(startRow, 1);
  titleCell.value = titre;
  titleCell.font = { bold: true, color: { argb: fg }, size: 11 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  titleCell.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(startRow).height = 20;

  let row = startRow + 1;
  items.forEach((item) => {
    ws.mergeCells(row, 1, row, lastCol);
    const cell = ws.getCell(row, 1);
    cell.value = `•  ${item}`;
    cell.font = { color: { argb: XL_INK }, size: 10.5 };
    cell.alignment = { wrapText: true, vertical: 'top', indent: 1 };
    ws.getRow(row).height = Math.ceil(item.length / 90) * 15 + 5;
    row += 1;
  });
  return row + 1;
}

async function buildWorkbook(
  summary: ReportingSummary,
  agents: (AgentStat & { utilisateurId: string })[],
  factures: { client: { nom: string }; numero: string; montant: number; datePaiement: Date | null }[],
  period: Period,
  snapshot: { clientsEnContentieux: { nombre: number; montant: number }; clientsRetardInhabituel: number },
  analyse: AnalyseResult,
  logos: string[],
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Olu 360';
  wb.created = new Date();

  // --- Synthèse ---
  const synth = wb.addWorksheet('Synthèse', { views: [{ showGridLines: false }] });
  const lastCol = 5;
  styleTitleRow(synth, 1, `OLU 360 — REPORTING RECOUVREMENT`, lastCol);
  synth.mergeCells(2, 1, 2, lastCol);
  const sub = synth.getCell(2, 1);
  sub.value = `Période du ${fmtDate(period.from)} au ${fmtDate(period.to)}`;
  sub.font = { italic: true, color: { argb: XL_INK_SOFT }, size: 10.5 };

  for (const logo of logos.slice(0, 3)) {
    try {
      const imageId = wb.addImage({ filename: logo, extension: 'png' });
      synth.addImage(imageId, { tl: { col: lastCol + 0.3 + logos.indexOf(logo) * 1.6, row: 0.15 }, ext: { width: 90, height: 32 } });
    } catch {
      // logo manquant -- export non bloquant
    }
  }

  let r = 4;
  const kpiLabels = ['Factures payées', 'Montant encaissé', "Délai moyen d'encaissement", 'Clients en contentieux'];
  const kpiValues = [
    String(summary.facturesPayees.nombre),
    fmtFCFA(summary.facturesPayees.montantTotal),
    summary.delaiEncaissement.global !== null ? `${Math.round(summary.delaiEncaissement.global)} j` : 'N/A',
    `${snapshot.clientsEnContentieux.nombre} (${fmtFCFA(snapshot.clientsEnContentieux.montant)})`,
  ];
  kpiLabels.forEach((label, i) => {
    const labelCell = synth.getCell(r + i, 1);
    labelCell.value = label;
    labelCell.font = { color: { argb: XL_INK_SOFT }, size: 10 };
    const valueCell = synth.getCell(r + i, 2);
    valueCell.value = kpiValues[i];
    valueCell.font = { bold: true, color: { argb: XL_INK }, size: 12 };
  });
  synth.getColumn(1).width = 26;
  synth.getColumn(2).width = 22;
  synth.getColumn(3).width = 22;
  synth.getColumn(4).width = 22;
  synth.getColumn(5).width = 22;
  r += kpiLabels.length + 1;

  r = addAnalyseSection(synth, r, 'POINTS FORTS', analyse.pointsForts, XL_SUCCESS_SOFT, XL_SUCCESS, lastCol);
  r = addAnalyseSection(synth, r, 'ACTIONS POSITIVES', analyse.actionsPositives, XL_SUCCESS_SOFT, XL_SUCCESS, lastCol);
  r = addAnalyseSection(synth, r, 'POINTS DE VIGILANCE', analyse.pointsVigilance, XL_AMBER_SOFT, XL_AMBER, lastCol);
  r = addAnalyseSection(synth, r, "AXES D'AMÉLIORATION", analyse.axesAmelioration, XL_PAPER2, XL_INK_SOFT, lastCol);
  r = addAnalyseSection(synth, r, 'RECOMMANDATION', analyse.recommandations, XL_PAPER2, XL_INK_SOFT, lastCol);

  // --- Délai par entité ---
  if (summary.delaiEncaissement.parEntite.length > 0) {
    const ws = wb.addWorksheet('Délai par entité', { views: [{ state: 'frozen', ySplit: 1 }] });
    addBorderedTable(
      ws,
      1,
      ['Entité', 'Délai moyen pondéré (j)', 'Montant encaissé (FCFA)', 'Nombre de factures'],
      summary.delaiEncaissement.parEntite.map((r2) => [r2.entite, r2.delaiJours !== null ? Math.round(r2.delaiJours) : 'N/A', r2.montantTotal, r2.nombre]),
      [16, 22, 24, 20],
    );
  }

  // --- Évolution mensuelle ---
  {
    const ws = wb.addWorksheet('Évolution mensuelle', { views: [{ state: 'frozen', ySplit: 1 }] });
    addBorderedTable(
      ws,
      1,
      ['Mois', 'Délai moyen pondéré (j)', 'Montant encaissé (FCFA)', 'Nombre de factures'],
      summary.evolutionMensuelle.map((r2) => [r2.mois, r2.delaiJours !== null ? Math.round(r2.delaiJours) : 'N/A', r2.montantTotal, r2.nombre]),
      [12, 22, 24, 20],
    );
  }

  // --- Relances par palier ---
  {
    const ws = wb.addWorksheet('Relances par palier', { views: [{ state: 'frozen', ySplit: 1 }] });
    addBorderedTable(
      ws,
      1,
      ['Palier', 'Nombre de relances effectuées'],
      summary.relances.map((r2) => [r2.label, r2.nombre]),
      [26, 26],
    );
  }

  // --- Performance par agent ---
  if (agents.length > 0) {
    const ws = wb.addWorksheet('Performance par agent', { views: [{ state: 'frozen', ySplit: 1 }] });
    addBorderedTable(
      ws,
      1,
      ['Agent', 'Relances effectuées', 'Délai après intervention (j)', 'Nb mesures', 'Montant recouvré (FCFA)', 'Nb factures'],
      agents.map((a) => [
        a.nom,
        a.actions,
        a.delaiMoyenApresIntervention ?? 'N/A',
        a.nombreDelaisMesures,
        a.montantRecouvre,
        a.nombreFactures,
      ]),
      [22, 18, 22, 12, 22, 12],
    );
  }

  // --- Factures payées ---
  {
    const ws = wb.addWorksheet('Factures payées', { views: [{ state: 'frozen', ySplit: 1 }] });
    addBorderedTable(
      ws,
      1,
      ['Client', 'N° facture', 'Montant (FCFA)', 'Date de paiement'],
      factures.map((f) => [f.client.nom, f.numero, f.montant, fmtDate(f.datePaiement!)]),
      [28, 18, 18, 18],
    );
  }

  return wb;
}

reportingRouter.post('/export.xlsx', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as ExportBody;
    const period = buildPeriod(body.from ?? '', body.to ?? '');
    if (!period) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const entiteFilter = resolveEntiteScope(req.user!, body.entite);
    const where = entiteWhere(entiteFilter);

    const [summary, agents, snapshot, factures] = await Promise.all([
      computeSummaryForPeriod(period, where),
      computeAgentStats(period, where),
      computeSnapshotKpis(where),
      prisma.facture.findMany({
        where: { statut: 'payee', datePaiement: { gte: period.from, lte: period.to }, client: where },
        include: { client: true },
        orderBy: { datePaiement: 'asc' },
      }),
    ]);
    const analyse =
      body.analyse ??
      buildAnalyse({
        periodeLabel: `${fmtDate(period.from)} au ${fmtDate(period.to)}`,
        actuel: summary,
        precedent: await computeSummaryForPeriod(previousPeriod(period), where),
        clientsEnContentieux: snapshot.clientsEnContentieux,
        clientsRetardInhabituel: snapshot.clientsRetardInhabituel,
        agents,
      });

    const wb = await buildWorkbook(summary, agents, factures, period, snapshot, analyse, logosForScope(entiteFilter));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporting_${period.fromStr}_${period.toStr}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// La police standard PDF (Helvetica, encodage WinAnsi) n'a pas de glyphe pour
// l'espace fine insécable (U+202F) que toLocaleString('fr-FR') utilise comme
// séparateur de milliers — sans ça le nombre s'affiche avec un caractère
// erroné. On la remplace par une espace normale avant d'écrire dans le PDF.
function pdfSafe(s: string): string {
  return s
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\u2192/g, '->')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=');
}

const PDF_INK = '#1B2430';
const PDF_INK_SOFT = '#4B5566';
const PDF_DARK = '#0E2A22';
const PDF_ACCENT = '#1D9E75';
const PDF_LINE = '#DDDAD0';
const PDF_PAPER2 = '#ECEAE2';
const PDF_SUCCESS = '#3E7C4A';
const PDF_SUCCESS_SOFT = '#DEEAE0';
const PDF_AMBER = '#B8860A';
const PDF_AMBER_SOFT = '#F3E7C6';
const PDF_DANGER = '#A8382F';
const PAGE_MARGIN = 44;

function pdfPageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

// Bandeau de couverture -- logo(s) sur puce blanche (les logos du groupe ne
// se lisent pas posés directement sur un fond vert), titre et période en
// clair. Dessiné une fois par export, avant tout contenu.
function drawHeader(doc: PDFKit.PDFDocument, periodLabel: string, logos: string[]) {
  const w = doc.page.width;
  doc.rect(0, 0, w, 96).fill(PDF_DARK);

  // Les puces logo peuvent occuper une largeur significative (jusqu'à 3
  // logos avec des ratios très différents) -- on les mesure d'abord pour
  // borner la largeur du texte de titre et ne jamais les faire chevaucher,
  // plutôt que de risquer un chevauchement avec un long titre sur une ligne.
  const chipH = 44;
  const chipY = (96 - chipH) / 2;
  const openImage = (doc as unknown as { openImage(src: string): { width: number; height: number } }).openImage.bind(doc);
  const chips: { logoFile: string; iw: number; ih: number; chipW: number }[] = [];
  for (const logoFile of logos.slice(0, 3)) {
    try {
      const dims = openImage(logoFile);
      const scale = Math.min((chipH - 12) / dims.height, 1);
      const iw = dims.width * scale;
      const ih = dims.height * scale;
      chips.push({ logoFile, iw, ih, chipW: iw + 20 });
    } catch {
      // Logo manquant ou illisible -- on continue sans, jamais bloquant pour l'export.
    }
  }
  const logosWidth = chips.reduce((s, c) => s + c.chipW, 0) + Math.max(0, chips.length - 1) * 8;
  const titleWidth = w - PAGE_MARGIN * 2 - (logosWidth > 0 ? logosWidth + 20 : 0);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('Olu 360', PAGE_MARGIN, 28, { width: titleWidth });
  doc
    .fillColor('#B7D3C7')
    .font('Helvetica')
    .fontSize(10.5)
    .text(`${pdfSafe(periodLabel)} — Reporting recouvrement`, PAGE_MARGIN, 58, { width: titleWidth, ellipsis: true });

  let x = w - PAGE_MARGIN;
  for (const chip of chips.slice().reverse()) {
    x -= chip.chipW;
    doc.roundedRect(x, chipY, chip.chipW, chipH, 6).fill('#FFFFFF');
    doc.image(chip.logoFile, x + (chip.chipW - chip.iw) / 2, chipY + (chipH - chip.ih) / 2, { width: chip.iw, height: chip.ih });
    x -= 8;
  }
  doc.y = 118;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > doc.page.height - 100) doc.addPage();
  doc.moveDown(0.6);
  doc.font('Courier-Bold').fontSize(9.5).fillColor(PDF_INK_SOFT).text(pdfSafe(text.toUpperCase()), PAGE_MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.4);
}

function drawKpiRow(doc: PDFKit.PDFDocument, items: { label: string; value: string; tone?: 'success' | 'amber' | 'danger' }[]) {
  const toneColor = { success: PDF_SUCCESS, amber: PDF_AMBER, danger: PDF_DANGER } as const;
  const gap = 10;
  const w = (pdfPageWidth(doc) - gap * (items.length - 1)) / items.length;
  const y = doc.y;
  const h = 52;
  items.forEach((item, i) => {
    const x = PAGE_MARGIN + i * (w + gap);
    doc.roundedRect(x, y, w, h, 5).lineWidth(0.75).strokeColor(PDF_LINE).stroke();
    doc.font('Courier').fontSize(7.5).fillColor(PDF_INK_SOFT).text(pdfSafe(item.label.toUpperCase()), x + 10, y + 9, { width: w - 20 });
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(item.tone ? toneColor[item.tone] : PDF_INK)
      .text(pdfSafe(item.value), x + 10, y + 24, { width: w - 20 });
  });
  doc.y = y + h + 14;
}

function drawTable(doc: PDFKit.PDFDocument, headers: string[], rows: (string | number)[][], widths: number[]) {
  const startX = PAGE_MARGIN;
  const rowH = 20;
  if (doc.y > doc.page.height - 80) doc.addPage();
  let y = doc.y;

  doc.rect(startX, y, pdfPageWidth(doc), rowH).fill(PDF_PAPER2);
  let x = startX;
  doc.font('Courier-Bold').fontSize(8).fillColor(PDF_INK_SOFT);
  headers.forEach((h, i) => {
    doc.text(pdfSafe(h.toUpperCase()), x + 8, y + 6, { width: widths[i] - 12 });
    x += widths[i];
  });
  y += rowH;

  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_INK);
  rows.forEach((row) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    x = startX;
    row.forEach((cell, i) => {
      doc.text(pdfSafe(String(cell)), x + 8, y + 6, { width: widths[i] - 12 });
      x += widths[i];
    });
    doc
      .moveTo(startX, y + rowH)
      .lineTo(startX + pdfPageWidth(doc), y + rowH)
      .strokeColor(PDF_LINE)
      .lineWidth(0.5)
      .stroke();
    y += rowH;
  });
  doc.y = y + 10;
}

const CATEGORIE_STYLE: Record<keyof AnalyseResult, { titre: string; bg: string; fg: string; marque: string }> = {
  pointsForts: { titre: 'Points forts', bg: PDF_SUCCESS_SOFT, fg: PDF_SUCCESS, marque: '+' },
  actionsPositives: { titre: 'Actions positives', bg: PDF_SUCCESS_SOFT, fg: PDF_SUCCESS, marque: '+' },
  pointsVigilance: { titre: 'Points de vigilance', bg: PDF_AMBER_SOFT, fg: PDF_AMBER, marque: '!' },
  axesAmelioration: { titre: "Axes d'amélioration", bg: PDF_PAPER2, fg: PDF_INK_SOFT, marque: '→' },
  recommandations: { titre: 'Recommandation', bg: PDF_PAPER2, fg: PDF_INK_SOFT, marque: '→' },
};

function drawAnalyseBlock(doc: PDFKit.PDFDocument, key: keyof AnalyseResult, items: string[]) {
  if (!items.length) return;
  const style = CATEGORIE_STYLE[key];
  if (doc.y > doc.page.height - 100) doc.addPage();

  const w = pdfPageWidth(doc);
  const lineHeight = 13;
  doc.font('Helvetica').fontSize(9.5);
  const textHeights = items.map((t) => doc.heightOfString(pdfSafe(`${style.marque} ${t}`), { width: w - 24 }));
  const boxH = 26 + textHeights.reduce((s, h) => s + Math.max(h, lineHeight) + 4, 0);

  const y0 = doc.y;
  doc.roundedRect(PAGE_MARGIN, y0, w, boxH, 6).fill(style.bg);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(style.fg).text(pdfSafe(style.titre), PAGE_MARGIN + 14, y0 + 10);
  let y = y0 + 28;
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_INK);
  items.forEach((t, i) => {
    doc.text(pdfSafe(`${style.marque}  ${t}`), PAGE_MARGIN + 14, y, { width: w - 28 });
    y += Math.max(textHeights[i], lineHeight) + 4;
  });
  doc.y = y0 + boxH + 12;
}

interface ExportBody {
  from?: string;
  to?: string;
  entite?: string;
  analyse?: AnalyseResult;
}

reportingRouter.post('/export.pdf', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as ExportBody;
    const period = buildPeriod(body.from ?? '', body.to ?? '');
    if (!period) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const entiteFilter = resolveEntiteScope(req.user!, body.entite);
    const where = entiteWhere(entiteFilter);

    const [summary, agents, snapshot] = await Promise.all([
      computeSummaryForPeriod(period, where),
      computeAgentStats(period, where),
      computeSnapshotKpis(where),
    ]);
    const analyse =
      body.analyse ??
      buildAnalyse({
        periodeLabel: `${fmtDate(period.from)} au ${fmtDate(period.to)}`,
        actuel: summary,
        precedent: await computeSummaryForPeriod(previousPeriod(period), where),
        clientsEnContentieux: snapshot.clientsEnContentieux,
        clientsRetardInhabituel: snapshot.clientsRetardInhabituel,
        agents,
      });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporting_${period.fromStr}_${period.toStr}.pdf"`);

    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
    doc.pipe(res);

    drawHeader(doc, `Période du ${fmtDate(period.from)} au ${fmtDate(period.to)}`, logosForScope(entiteFilter));

    drawKpiRow(doc, [
      { label: 'Factures payées', value: String(summary.facturesPayees.nombre) },
      { label: 'Montant encaissé', value: fmtFCFA(summary.facturesPayees.montantTotal) },
      {
        label: "Délai moyen d'encaissement",
        value: summary.delaiEncaissement.global !== null ? `${Math.round(summary.delaiEncaissement.global)} j` : 'N/A',
      },
      {
        label: 'Contentieux (encours)',
        value: fmtFCFA(snapshot.clientsEnContentieux.montant),
        tone: snapshot.clientsEnContentieux.nombre > 0 ? 'danger' : 'success',
      },
    ]);

    drawSectionTitle(doc, 'Analyse de la période');
    drawAnalyseBlock(doc, 'pointsForts', analyse.pointsForts);
    drawAnalyseBlock(doc, 'actionsPositives', analyse.actionsPositives);
    drawAnalyseBlock(doc, 'pointsVigilance', analyse.pointsVigilance);
    drawAnalyseBlock(doc, 'axesAmelioration', analyse.axesAmelioration);
    drawAnalyseBlock(doc, 'recommandations', analyse.recommandations);

    if (summary.delaiEncaissement.parEntite.length > 1) {
      drawSectionTitle(doc, "Délai d'encaissement par entité");
      const w = pdfPageWidth(doc);
      drawTable(
        doc,
        ['Entité', 'Délai moyen pondéré', 'Montant encaissé', 'Factures'],
        summary.delaiEncaissement.parEntite.map((r) => [
          r.entite,
          r.delaiJours !== null ? `${Math.round(r.delaiJours)} j` : 'N/A',
          fmtFCFA(r.montantTotal),
          r.nombre,
        ]),
        [w * 0.22, w * 0.28, w * 0.3, w * 0.2],
      );
    }

    drawSectionTitle(doc, 'Relances effectuées par palier');
    {
      const w = pdfPageWidth(doc);
      drawTable(
        doc,
        ['Palier', 'Nombre de relances'],
        summary.relances.map((r) => [r.label, r.nombre]),
        [w * 0.6, w * 0.4],
      );
    }

    if (agents.length > 0) {
      drawSectionTitle(doc, 'Performance par agent');
      const w = pdfPageWidth(doc);
      drawTable(
        doc,
        ['Agent', 'Relances', 'Délai après intervention', 'Montant recouvré'],
        agents.map((a) => [
          a.nom,
          a.actions,
          a.delaiMoyenApresIntervention !== null ? `${a.delaiMoyenApresIntervention} j (sur ${a.nombreDelaisMesures})` : 'N/A',
          a.montantRecouvre > 0 ? fmtFCFA(a.montantRecouvre) : '—',
        ]),
        [w * 0.28, w * 0.16, w * 0.3, w * 0.26],
      );
    }

    drawSectionTitle(doc, `Évolution du délai d'encaissement (${EVOLUTION_MONTHS} derniers mois)`);
    {
      const w = pdfPageWidth(doc);
      drawTable(
        doc,
        ['Mois', 'Délai moyen pondéré', 'Montant encaissé', 'Factures'],
        summary.evolutionMensuelle.map((r) => [
          r.mois,
          r.delaiJours !== null ? `${Math.round(r.delaiJours)} j` : 'N/A',
          fmtFCFA(r.montantTotal),
          r.nombre,
        ]),
        [w * 0.22, w * 0.28, w * 0.3, w * 0.2],
      );
    }

    // Pied de page numéroté sur chaque page, ajouté à la fin une fois le
    // nombre total de pages connu (bufferPages: true plus haut). Le texte
    // est écrit dans la marge basse -- sans désactiver temporairement cette
    // marge, pdfkit considère qu'il déborde et ajoute une page blanche
    // supplémentaire à chaque itération (constaté en QA visuelle).
    const range = doc.bufferedPageRange();
    const bottomMargin = doc.page.margins.bottom;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .font('Courier')
        .fontSize(8)
        .fillColor(PDF_INK_SOFT)
        .text(`OLU 360  ·  ${i + 1}/${range.count}`, PAGE_MARGIN, doc.page.height - 30, { width: pdfPageWidth(doc), align: 'right' });
      doc.page.margins.bottom = bottomMargin;
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});
