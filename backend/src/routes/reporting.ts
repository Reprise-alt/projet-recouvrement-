import { Request, Router } from 'express';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { prisma, rlsActive, withTenant, currentOrganisationId } from '../db';
import { getEmailProvider } from '../lib/email/provider';
import { requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { fmtDate, fmtFCFA } from '../lib/dates';
import {
  AgentActionEntry,
  AgentStat,
  buildAgentMontantRecouvre,
  buildAgentStats,
  buildBalanceAgee,
  buildConversionParPalier,
  buildReportingSummary,
  lastNMonthKeys,
  PaymentAttributionEntry,
  ReportingSummary,
} from '../lib/reporting';
import { clientEncours, clientJoursRetard, clientPalier, clientRetardInhabituel, PALIERS } from '../lib/paliers';
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
import { tenantScope } from '../middleware/tenant';
import { requireAbonnementActif } from '../middleware/abonnement';
import { requireCapacite } from '../middleware/capacite';

reportingRouter.use(requireAuth, requireAbonnementActif, requireCapacite('reporting'), requireAccesRecouvrement, tenantScope);

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

// Réglage de l'envoi automatique du rapport mensuel : adresse destinataire.
reportingRouter.get('/reglages', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({ where: { id: req.user!.organisationId }, select: { reportingEmail: true } });
    res.json({ reportingEmail: org?.reportingEmail ?? null });
  } catch (err) {
    next(err);
  }
});

reportingRouter.put('/reglages', requireRole('admin'), async (req, res, next) => {
  try {
    const raw = (req.body?.reportingEmail ?? '').toString().trim();
    const email = raw || null; // vide = désactive l'envoi automatique
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });
    await prisma.organisation.update({ where: { id: req.user!.organisationId }, data: { reportingEmail: email } });
    res.json({ reportingEmail: email });
  } catch (err) {
    next(err);
  }
});

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
  const enContentieux = clients.filter((c) => clientPalier(c, config) >= 7);
  return {
    clientsEnContentieux: { nombre: enContentieux.length, montant: enContentieux.reduce((s, c) => s + clientEncours(c), 0) },
    clientsRetardInhabituel: clients.filter((c) => clientRetardInhabituel(c)).length,
  };
}

// Pilotage mono-société : balance âgée de l'encours, top débiteurs, conversion
// des relances par palier et taux de recouvrement sur la période. Complète
// /summary (qui reste centré sur les encaissements de la période).
export async function computePilotage(period: Period, where: object) {
  const config = await getConfig();
  const clients = await prisma.client.findMany({
    where,
    include: {
      factures: true,
      actions: { where: { palier: { gte: 1 } }, orderBy: { date: 'desc' }, take: 1, select: { date: true, label: true, palier: true } },
    },
  });

  // Balance âgée : sur toutes les factures impayées, réparties par tranche de retard.
  const facturesImpayees = clients.flatMap((c) =>
    c.factures.map((f) => ({ montant: f.montant, dateEcheance: f.dateEcheance, statut: f.statut as 'impayee' | 'payee' })),
  );
  const balanceAgee = buildBalanceAgee(facturesImpayees);

  // Top débiteurs : plus gros encours en retard, avec leur dernier palier relancé.
  const topDebiteurs = clients
    .map((c) => ({
      nom: c.nom,
      encours: clientEncours(c as never),
      joursRetard: clientJoursRetard(c as never),
      palier: clientPalier(c as never, config),
      dernierPalierLabel: c.actions[0]?.label ?? null,
      derniereRelance: c.actions[0]?.date ?? null,
    }))
    .filter((d) => d.encours > 0 && d.joursRetard > 0)
    .sort((a, b) => b.encours - a.encours)
    .slice(0, 8);

  // Taux de recouvrement : part (en montant) des factures échues SUR LA PÉRIODE
  // qui ont été payées. Mesure honnête « de ce qui devenait exigible, combien a
  // rentré ».
  let montantEchu = 0;
  let montantPaye = 0;
  for (const c of clients) {
    for (const f of c.factures) {
      const ech = new Date(f.dateEcheance).getTime();
      if (ech >= period.from.getTime() && ech <= period.to.getTime()) {
        montantEchu += f.montant;
        if (f.statut === 'payee') montantPaye += f.montant;
      }
    }
  }
  const tauxRecouvrement = montantEchu > 0 ? Math.round((montantPaye / montantEchu) * 1000) / 10 : null;

  // Conversion des relances par palier sur la période.
  const actions = await prisma.actionRecouvrement.findMany({
    where: { palier: { gte: 1 }, date: { gte: period.from, lte: period.to }, client: where },
    include: { client: { include: { factures: { where: { statut: 'payee' }, select: { datePaiement: true } } } } },
  });
  const conversion = buildConversionParPalier(
    actions.map((a) => ({ palier: a.palier, date: a.date, datesPaiementClient: a.client.factures.map((f) => f.datePaiement) })),
  );

  return {
    balanceAgee,
    topDebiteurs,
    recouvrement: { montantEchu, montantPaye, taux: tauxRecouvrement },
    conversion,
  };
}

reportingRouter.get('/pilotage', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (!period) return res.status(400).json({ error: 'Période invalide — from et to sont requis (format AAAA-MM-JJ)' });
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    res.json(await computePilotage(period, entiteWhere(entiteFilter)));
  } catch (err) {
    next(err);
  }
});

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
      mono: rlsActive(),    });

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
        mono: rlsActive(),      });

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

// Palette direction B « Encre & Menthe ».
const PDF_INK = '#0E1D33';
const PDF_INK_SOFT = '#5A6472';
const PDF_DARK = '#0E1D33';
const PDF_ACCENT = '#0E7C5A';
const PDF_MINT = '#4BD0A0';
const PDF_LINE = '#E7EAE7';
const PDF_PAPER2 = '#F1F3EF';
const PDF_SUCCESS = '#0E7C5A';
const PDF_SUCCESS_SOFT = '#E3F2EC';
const PDF_AMBER = '#B0700F';
const PDF_AMBER_SOFT = '#FBF1DE';
const PDF_DANGER = '#C0392B';
const PDF_DANGER_SOFT = '#FBEAE8';
const PAGE_MARGIN = 44;

// Montant compact pour les espaces contraints (155 433 850 → « 155,4 M »).
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const f = (x: number, s: string) => `${x.toFixed(1).replace(/\.0$/, '').replace('.', ',')} ${s}`;
  if (abs >= 1e9) return f(n / 1e9, 'Md');
  if (abs >= 1e6) return f(n / 1e6, 'M');
  if (abs >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(Math.round(n));
}

// Pièce Feyma dessinée en vectoriel (émeraude + « F » blanc) : nette à toute
// taille, aucun asset. Le « F » est fait de 3 traits ronds, comme le logo.
function drawFeymaMark(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number) {
  doc.save();
  doc.circle(cx, cy, r).fill(PDF_ACCENT);
  doc.circle(cx, cy, r * 0.84).lineWidth(r * 0.04).strokeColor('#FFFFFF').strokeOpacity(0.35).stroke();
  doc.strokeOpacity(1);
  const s = r * 0.9; // demi-largeur du F
  const lw = r * 0.22;
  const left = cx - s * 0.55;
  const top = cy - s * 0.75;
  const bot = cy + s * 0.75;
  const mid = cy;
  doc.lineWidth(lw).strokeColor('#FFFFFF').lineCap('round').lineJoin('round');
  doc.moveTo(left, top).lineTo(cx + s * 0.62, top).stroke(); // barre haute
  doc.moveTo(left, top).lineTo(left, bot).stroke(); // verticale
  doc.moveTo(left, mid).lineTo(cx + s * 0.42, mid).stroke(); // barre médiane
  doc.restore();
}

// Camembert (donut) dessiné en secteurs SVG, avec un trou blanc au centre.
function drawDonut(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, segments: { value: number; color: string }[]) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  doc.save();
  if (total <= 0) {
    doc.circle(cx, cy, r).fill(PDF_LINE);
  } else {
    let a0 = -Math.PI / 2;
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const a1 = a0 + (seg.value / total) * Math.PI * 2;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      doc.path(`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`).fill(seg.color);
      a0 = a1;
    }
  }
  doc.circle(cx, cy, r * 0.58).fill('#FFFFFF');
  doc.restore();
}

// Histogramme vertical simple (montants par mois), avec valeur compacte au-dessus.
function drawBarChart(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, data: { label: string; value: number }[]) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const gap = 10;
  const bw = Math.min(46, (w - gap * (n - 1)) / n);
  const step = (w - bw) / Math.max(1, n - 1);
  data.forEach((d, i) => {
    const bx = x + i * step;
    const bh = Math.max(2, (d.value / max) * (h - 26));
    const by = y + (h - 16) - bh;
    doc.roundedRect(bx, by, bw, bh, 3).fill(PDF_ACCENT);
    doc.font('Courier').fontSize(6.8).fillColor(PDF_INK).text(fmtCompact(d.value), bx - 6, by - 11, { width: bw + 12, align: 'center' });
    doc.font('Courier').fontSize(7).fillColor(PDF_INK_SOFT).text(pdfSafe(d.label), bx - 6, y + h - 12, { width: bw + 12, align: 'center' });
  });
}

function pdfPageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - PAGE_MARGIN * 2;
}

// Bandeau de couverture -- logo(s) sur puce blanche (les logos du groupe ne
// se lisent pas posés directement sur un fond vert), titre et période en
// clair. Dessiné une fois par export, avant tout contenu.
function drawHeader(doc: PDFKit.PDFDocument, periodLabel: string, marque: string, clientLogo?: { data: Buffer; mime: string } | null) {
  const w = doc.page.width;
  const H = 94;
  doc.rect(0, 0, w, H).fill(PDF_DARK);

  // Marque Feyma (pièce vectorielle + mot).
  drawFeymaMark(doc, PAGE_MARGIN + 15, H / 2 - 4, 15);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(19).text('Feyma', PAGE_MARGIN + 40, 25);
  doc
    .fillColor(PDF_MINT)
    .font('Helvetica')
    .fontSize(10)
    .text(pdfSafe(`Rapport de recouvrement · ${periodLabel}`), PAGE_MARGIN + 40, 51, { width: w - 320, ellipsis: true });

  // Logo du client (sur puce blanche) ou, à défaut, sa raison sociale.
  const chipW = 132;
  const chipH = 48;
  const chipX = w - PAGE_MARGIN - chipW;
  const chipY = (H - chipH) / 2;
  let logoOk = false;
  if (clientLogo?.data?.length) {
    try {
      doc.roundedRect(chipX, chipY, chipW, chipH, 7).fill('#FFFFFF');
      doc.image(clientLogo.data, chipX + 9, chipY + 8, { fit: [chipW - 18, chipH - 16], align: 'center', valign: 'center' });
      logoOk = true;
    } catch {
      // Logo illisible : on retombe sur le texte.
    }
  }
  if (!logoOk && marque && marque !== 'Feyma') {
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text(pdfSafe(marque), w - PAGE_MARGIN - 230, 40, { width: 230, align: 'right', ellipsis: true });
  }
  doc.y = H + 20;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, text: string) {
  if (doc.y > doc.page.height - 100) doc.addPage();
  doc.moveDown(0.6);
  doc.font('Courier-Bold').fontSize(9.5).fillColor(PDF_INK_SOFT).text(pdfSafe(text.toUpperCase()), PAGE_MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.4);
}

function drawKpiRow(doc: PDFKit.PDFDocument, items: { label: string; value: string; sub?: string; tone?: 'success' | 'amber' | 'danger' }[]) {
  const toneColor = { success: PDF_SUCCESS, amber: PDF_AMBER, danger: PDF_DANGER } as const;
  const gap = 10;
  const w = (pdfPageWidth(doc) - gap * (items.length - 1)) / items.length;
  const y = doc.y;
  const h = 60;
  items.forEach((item, i) => {
    const x = PAGE_MARGIN + i * (w + gap);
    doc.roundedRect(x, y, w, h, 6).lineWidth(0.75).strokeColor(PDF_LINE).stroke();
    // Libellé sur une ligne (ellipsis) pour ne jamais chevaucher la valeur.
    doc.font('Courier').fontSize(6.8).fillColor(PDF_INK_SOFT).text(pdfSafe(item.label.toUpperCase()), x + 10, y + 10, { width: w - 20, lineBreak: false, ellipsis: true });
    // Valeur compacte, une seule ligne (lineBreak:false = jamais de retour → pas de superposition).
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(item.tone ? toneColor[item.tone] : PDF_INK)
      .text(pdfSafe(item.value), x + 10, y + 25, { width: w - 20, lineBreak: false, ellipsis: true });
    if (item.sub) {
      doc.font('Helvetica').fontSize(7).fillColor(PDF_INK_SOFT).text(pdfSafe(item.sub), x + 10, y + 46, { width: w - 20, lineBreak: false, ellipsis: true });
    }
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
    // Hauteur réelle de la ligne : on mesure chaque cellule au repli (les noms
    // longs, ex. « SOCIETE EIFFAGE DE LA CONCESSION… », tiennent sur 2–3 lignes)
    // et on prend la plus haute — sinon le texte déborde et chevauche la ligne
    // suivante (cf. bug reporting).
    const cellHeights = row.map((cell, i) =>
      doc.heightOfString(pdfSafe(String(cell)), { width: widths[i] - 12 }),
    );
    const contentH = Math.max(...cellHeights);
    const thisRowH = Math.max(rowH, contentH + 12);
    if (y + thisRowH > doc.page.height - 60) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    x = startX;
    row.forEach((cell, i) => {
      doc.text(pdfSafe(String(cell)), x + 8, y + 6, { width: widths[i] - 12 });
      x += widths[i];
    });
    doc
      .moveTo(startX, y + thisRowH)
      .lineTo(startX + pdfPageWidth(doc), y + thisRowH)
      .strokeColor(PDF_LINE)
      .lineWidth(0.5)
      .stroke();
    y += thisRowH;
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

interface ReportingPdfData {
  summary: ReportingSummary;
  agents: (AgentStat & { utilisateurId: string })[];
  snapshot: { clientsEnContentieux: { nombre: number; montant: number }; clientsRetardInhabituel: number };
  analyse: AnalyseResult;
  pilotage: Awaited<ReturnType<typeof computePilotage>>;
  marque: string;
  clientLogo?: { data: Buffer; mime: string } | null;
}

const AGE_PDF: Record<string, { label: string; color: string }> = {
  j0_30: { label: '0–30 j', color: PDF_ACCENT },
  j31_60: { label: '31–60 j', color: PDF_MINT },
  j61_90: { label: '61–90 j', color: PDF_AMBER },
  j90_plus: { label: '+90 j', color: PDF_DANGER },
};

// Encadré de synthèse (« La lecture du mois »).
function drawSynthese(doc: PDFKit.PDFDocument, texte: string) {
  const w = pdfPageWidth(doc);
  const x = PAGE_MARGIN;
  doc.font('Helvetica').fontSize(10.5);
  const th = doc.heightOfString(pdfSafe(texte), { width: w - 28, lineGap: 2 });
  const h = th + 42;
  const y = doc.y;
  doc.roundedRect(x, y, w, h, 8).fill(PDF_SUCCESS_SOFT);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_ACCENT).text('La lecture du mois', x + 14, y + 12);
  doc.font('Helvetica').fontSize(10.5).fillColor(PDF_INK).text(pdfSafe(texte), x + 14, y + 30, { width: w - 28, lineGap: 2 });
  doc.y = y + h + 14;
}

// Bloc « Santé de la trésorerie » : camembert de la balance âgée + légende.
function drawBalanceAgee(doc: PDFKit.PDFDocument, tranches: { cle: string; label: string; montant: number; nombre: number }[]) {
  const overdue = tranches.filter((t) => t.cle !== 'a_echoir');
  const total = overdue.reduce((s, t) => s + t.montant, 0);
  const w = pdfPageWidth(doc);
  const x = PAGE_MARGIN;
  const h = 148;
  const y = doc.y;
  doc.roundedRect(x, y, w, h, 8).lineWidth(0.75).strokeColor(PDF_LINE).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_INK).text('Balance âgée de l’encours en retard', x + 16, y + 14);

  const cx = x + 78;
  const cy = y + h / 2 + 10;
  const r = 42;
  drawDonut(doc, cx, cy, r, overdue.map((t) => ({ value: t.montant, color: AGE_PDF[t.cle]?.color ?? PDF_LINE })));
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_INK).text(fmtCompact(total), cx - r, cy - 8, { width: r * 2, align: 'center' });
  doc.font('Courier').fontSize(6.5).fillColor(PDF_INK_SOFT).text('EN RETARD', cx - r, cy + 6, { width: r * 2, align: 'center' });

  // Légende à droite.
  let ly = y + 40;
  const lx = x + 170;
  for (const t of overdue) {
    const c = AGE_PDF[t.cle];
    doc.roundedRect(lx, ly + 1, 9, 9, 2).fill(c?.color ?? PDF_LINE);
    doc.font('Helvetica').fontSize(9.5).fillColor(PDF_INK).text(pdfSafe(c?.label ?? t.label), lx + 16, ly);
    doc.font('Courier').fontSize(9).fillColor(PDF_INK).text(pdfSafe(fmtFCFA(t.montant)), lx + 16, ly, { width: w - (lx - x) - 30, align: 'right' });
    ly += 20;
  }
  doc.y = y + h + 14;
}

// Dessine tout le rapport (en-tête → pied de page). Partagé par l'export à la
// demande (stream) et l'envoi automatique (buffer). Rapport DG : KPIs, synthèse,
// balance âgée, alertes, puis détail (encaissements, conversion, top débiteurs).
function drawReportingDocument(doc: PDFKit.PDFDocument, period: Period, data: ReportingPdfData) {
  const { summary, snapshot, analyse, pilotage, marque, clientLogo } = data;
  const overdue = pilotage.balanceAgee.filter((t) => t.cle !== 'a_echoir');
  const overdueTotal = overdue.reduce((s, t) => s + t.montant, 0);
  const overdueCount = overdue.reduce((s, t) => s + t.nombre, 0);
  const plus90 = overdue.find((t) => t.cle === 'j90_plus');
  const dso = summary.delaiEncaissement.global;

  drawHeader(doc, `${fmtDate(period.from)} au ${fmtDate(period.to)}`, marque, clientLogo);

  // ── KPIs (compacts, jamais de superposition) ──
  drawKpiRow(doc, [
    { label: 'Encaissé', value: `${fmtCompact(summary.facturesPayees.montantTotal)} FCFA`, sub: `${summary.facturesPayees.nombre} factures réglées`, tone: 'success' },
    { label: 'Taux de recouvrement', value: pilotage.recouvrement.taux !== null ? `${pilotage.recouvrement.taux} %` : '—', sub: 'du montant échu' },
    { label: 'Délai moyen (DSO)', value: dso !== null ? `${Math.round(dso)} j` : '—', sub: 'pondéré par montant' },
    { label: 'Encours en retard', value: `${fmtCompact(overdueTotal)} FCFA`, sub: `${overdueCount} factures échues`, tone: overdueTotal > 0 ? 'amber' : 'success' },
  ]);

  // ── Synthèse ──
  const lecture =
    `Vous avez encaissé ${fmtFCFA(summary.facturesPayees.montantTotal)} sur ${summary.facturesPayees.nombre} facture${summary.facturesPayees.nombre > 1 ? 's' : ''}` +
    (dso !== null ? `, pour un délai moyen d'encaissement de ${Math.round(dso)} jours` : '') +
    '. ' +
    (plus90 && plus90.montant > 0
      ? `Point d'attention : ${fmtFCFA(plus90.montant)} d'encours dépassent 90 jours de retard — c'est là que se concentre le risque.`
      : overdueTotal > 0
        ? `L'encours en retard (${fmtFCFA(overdueTotal)}) reste sans créance ancienne majeure.`
        : `Aucun encours en retard sur la période.`);
  drawSynthese(doc, lecture);

  // ── Balance âgée (camembert) ──
  drawBalanceAgee(doc, pilotage.balanceAgee);

  // ── Alertes / recommandations ──
  drawSectionTitle(doc, "Alertes & recommandations");
  drawAnalyseBlock(doc, 'pointsForts', analyse.pointsForts);
  drawAnalyseBlock(doc, 'pointsVigilance', analyse.pointsVigilance);
  drawAnalyseBlock(doc, 'recommandations', analyse.recommandations);

  // ── Page 2 : détail ──
  doc.addPage();

  drawSectionTitle(doc, `Encaissements par mois (${EVOLUTION_MONTHS} derniers mois)`);
  {
    const w = pdfPageWidth(doc);
    const y = doc.y;
    const h = 150;
    doc.roundedRect(PAGE_MARGIN, y, w, h, 8).lineWidth(0.75).strokeColor(PDF_LINE).stroke();
    drawBarChart(
      doc,
      PAGE_MARGIN + 18,
      y + 16,
      w - 36,
      h - 24,
      summary.evolutionMensuelle.map((m) => ({ label: m.mois.slice(5), value: m.montantTotal })),
    );
    doc.y = y + h + 14;
  }

  // Efficacité des relances (conversion par palier).
  const convRows = pilotage.conversion.filter((c) => c.relances > 0);
  if (convRows.length > 0) {
    drawSectionTitle(doc, 'Efficacité des relances (payé sous 15 j)');
    const w = pdfPageWidth(doc);
    drawTable(
      doc,
      ['Palier', 'Relances', 'Payé sous 15 j', 'Taux'],
      convRows.map((c) => [c.label, c.relances, c.converties, c.taux !== null ? `${c.taux} %` : '—']),
      [w * 0.4, w * 0.2, w * 0.24, w * 0.16],
    );
  }

  // Top débiteurs.
  if (pilotage.topDebiteurs.length > 0) {
    drawSectionTitle(doc, 'Top débiteurs à surveiller');
    const w = pdfPageWidth(doc);
    drawTable(
      doc,
      ['Client', 'Encours', 'Retard', 'Dernier palier'],
      pilotage.topDebiteurs.map((d) => [d.nom, fmtFCFA(d.encours), `+${d.joursRetard} j`, d.dernierPalierLabel ?? '—']),
      [w * 0.34, w * 0.26, w * 0.14, w * 0.26],
    );
  }

  // Litige (palier élevé) — rappel chiffré.
  if (snapshot.clientsEnContentieux.nombre > 0) {
    drawSectionTitle(doc, 'En litige (palier élevé)');
    doc.font('Helvetica').fontSize(10).fillColor(PDF_INK).text(
      pdfSafe(`${snapshot.clientsEnContentieux.nombre} client(s) en litige, représentant ${fmtFCFA(snapshot.clientsEnContentieux.montant)} d'encours immobilisé.`),
      PAGE_MARGIN,
      doc.y,
      { width: pdfPageWidth(doc) },
    );
    doc.moveDown(0.6);
  }

  // ── Pied de page numéroté (voir note pdfkit sur la marge basse). ──
  const range = doc.bufferedPageRange();
  const bottomMargin = doc.page.margins.bottom;
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .font('Courier')
      .fontSize(8)
      .fillColor(PDF_INK_SOFT)
      .text(`${pdfSafe(marque)}  ·  via Feyma  ·  ${i + 1}/${range.count}`, PAGE_MARGIN, doc.page.height - 30, { width: pdfPageWidth(doc), align: 'right' });
    doc.page.margins.bottom = bottomMargin;
  }
}

// Génère le rapport en Buffer (pour l'envoi par email). Même rendu que l'export.
export function genererReportingPdfBuffer(period: Period, data: ReportingPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawReportingDocument(doc, period, data);
    doc.end();
  });
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
        mono: rlsActive(),      });

    const pilotage = await computePilotage(period, where);
    const org = await chargerOrgPdf();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporting_${period.fromStr}_${period.toStr}.pdf"`);

    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
    doc.pipe(res);
    drawReportingDocument(doc, period, { summary, agents, snapshot, analyse, pilotage, marque: org.marque, clientLogo: org.clientLogo });
    doc.end();
  } catch (err) {
    next(err);
  }
});

// Marque + logo du client courant pour l'en-tête du PDF (tenant en cours).
async function chargerOrgPdf(): Promise<{ marque: string; clientLogo: { data: Buffer; mime: string } | null }> {
  if (!rlsActive()) return { marque: 'Olu 360', clientLogo: null };
  const orgId = currentOrganisationId();
  if (!orgId) return { marque: 'Feyma', clientLogo: null };
  const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { raisonSociale: true, logoData: true, logoMime: true } });
  const clientLogo = org?.logoData ? { data: Buffer.from(org.logoData), mime: org.logoMime ?? 'image/png' } : null;
  return { marque: org?.raisonSociale ?? 'Feyma', clientLogo };
}

// ── Envoi automatique du rapport mensuel par email ───────────────────────────
// Cron externe (Render) → génère le PDF du mois civil écoulé pour chaque org
// ayant renseigné une adresse de reporting, et l'envoie en pièce jointe. Même
// authentification que le cron des relances (secret partagé). Exige la RLS.
export const reportingCronRouter = Router();

function moisPrecedent(now: Date = new Date()): Period {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // dernier jour du mois précédent
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from, to, fromStr: iso(from), toStr: iso(to) };
}

reportingCronRouter.post('/', async (req, res, next) => {
  try {
    const secret = process.env.RELANCES_CRON_SECRET;
    if (!secret) return res.status(503).json({ error: 'Déclencheur cron désactivé (RELANCES_CRON_SECRET non défini)' });
    if (req.header('x-cron-secret') !== secret) return res.status(401).json({ error: 'Secret cron invalide' });
    if (!rlsActive()) return res.status(503).json({ error: 'RLS requis pour l’envoi multi-tenant (RLS_ENABLED != true)' });

    const period = moisPrecedent();
    // Hors contexte tenant : l'échappatoire RLS autorise la lecture des orgs éligibles.
    const orgs = await prisma.organisation.findMany({
      where: { reportingEmail: { not: null }, statut: { in: ['essai', 'actif'] } },
      select: { id: true, reportingEmail: true, raisonSociale: true, emailReponse: true, logoData: true, logoMime: true },
    });

    const resultats: { organisationId: string; envoye?: boolean; erreur?: string }[] = [];
    for (const org of orgs) {
      try {
        await withTenant(org.id, async () => {
          const where = {}; // tout le tenant (scopé par RLS)
          const [summary, agents, snapshot, pilotage] = await Promise.all([
            computeSummaryForPeriod(period, where),
            computeAgentStats(period, where),
            computeSnapshotKpis(where),
            computePilotage(period, where),
          ]);
          const analyse = buildAnalyse({
            periodeLabel: `${fmtDate(period.from)} au ${fmtDate(period.to)}`,
            actuel: summary,
            precedent: await computeSummaryForPeriod(previousPeriod(period), where),
            clientsEnContentieux: snapshot.clientsEnContentieux,
            clientsRetardInhabituel: snapshot.clientsRetardInhabituel,
            agents,
            mono: rlsActive(),
          });
          const marque = org.raisonSociale ?? 'Feyma';
          const clientLogo = org.logoData ? { data: Buffer.from(org.logoData), mime: org.logoMime ?? 'image/png' } : null;
          const pdf = await genererReportingPdfBuffer(period, { summary, agents, snapshot, analyse, pilotage, marque, clientLogo });
          await getEmailProvider().send({
            to: org.reportingEmail!,
            subject: `Rapport de recouvrement — ${fmtDate(period.from)} au ${fmtDate(period.to)}`,
            text:
              `Bonjour,\n\nVeuillez trouver ci-joint le rapport de recouvrement du mois écoulé ` +
              `(${fmtDate(period.from)} au ${fmtDate(period.to)}).\n\n— ${marque}, via Feyma`,
            fromName: marque,
            replyTo: org.emailReponse ?? undefined,
            attachments: [
              { filename: `rapport_${period.fromStr}_${period.toStr}.pdf`, content: pdf, contentType: 'application/pdf' },
            ],
          });
        });
        resultats.push({ organisationId: org.id, envoye: true });
      } catch (e) {
        resultats.push({ organisationId: org.id, erreur: e instanceof Error ? e.message : 'erreur' });
      }
    }

    res.json({ periode: { from: period.fromStr, to: period.toStr }, organisations: orgs.length, resultats });
  } catch (err) {
    next(err);
  }
});
