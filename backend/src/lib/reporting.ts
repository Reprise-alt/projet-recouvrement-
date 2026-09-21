import { PALIERS } from './paliers';
import { daysDiff } from './dates';

export interface ReportingFacture {
  numero: string;
  montant: number;
  // Nullable : les imports historiques n'ont pas toujours renseigné la date
  // de facturation — ces lignes comptent dans le nombre/montant encaissé
  // mais sont exclues du calcul du délai (impossible à calculer sans point
  // de départ).
  dateFacture: Date | string | null;
  datePaiement: Date | string;
  clientNom: string;
  entite: string;
}

type DelaiEntry = { montant: number; dateFacture: Date | string; datePaiement: Date | string };

function hasDateFacture<T extends { dateFacture: Date | string | null }>(f: T): f is T & { dateFacture: Date | string } {
  return f.dateFacture !== null && f.dateFacture !== undefined;
}

export interface ReportingAction {
  palier: number;
}

export interface PalierCount {
  palier: number;
  label: string;
  nombre: number;
}

export interface DelaiParEntite {
  entite: string;
  delaiJours: number | null;
  montantTotal: number;
  nombre: number;
}

export interface EvolutionMoisEntry {
  mois: string;
  delaiJours: number | null;
  montantTotal: number;
  nombre: number;
}

export interface ReportingSummary {
  from: string;
  to: string;
  facturesPayees: { nombre: number; montantTotal: number };
  relances: PalierCount[];
  delaiEncaissement: { global: number | null; parEntite: DelaiParEntite[] };
  evolutionMensuelle: EvolutionMoisEntry[];
}

function joursEntre(a: Date | string, b: Date | string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

// Moyenne pondérée par montant du délai (en jours) entre émission et
// paiement — une grosse facture payée lentement pèse plus qu'une petite
// facture payée vite, ce qui reflète mieux l'impact réel sur la trésorerie
// qu'une simple moyenne par facture.
export function computeDelaiPondere(factures: DelaiEntry[]): number | null {
  const montantTotal = factures.reduce((s, f) => s + f.montant, 0);
  if (montantTotal <= 0) return null;
  const pondere = factures.reduce((s, f) => s + joursEntre(f.dateFacture, f.datePaiement) * f.montant, 0);
  return pondere / montantTotal;
}

export function buildDelaiParEntite(factures: ReportingFacture[]): DelaiParEntite[] {
  const groups = new Map<string, ReportingFacture[]>();
  for (const f of factures) {
    if (!groups.has(f.entite)) groups.set(f.entite, []);
    groups.get(f.entite)!.push(f);
  }
  return Array.from(groups.entries())
    .map(([entite, list]) => ({
      entite,
      delaiJours: computeDelaiPondere(list.filter(hasDateFacture)),
      montantTotal: list.reduce((s, f) => s + f.montant, 0),
      nombre: list.length,
    }))
    .sort((a, b) => a.entite.localeCompare(b.entite));
}

function monthKey(d: Date | string): string {
  const date = new Date(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Liste les N derniers mois glissants (le plus ancien en premier), au
// format 'AAAA-MM' — garantit une ligne par mois dans l'évolution même si
// aucune facture n'a été payée ce mois-là.
export function lastNMonthKeys(n: number, from: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    keys.push(monthKey(d));
  }
  return keys;
}

export function buildEvolutionMensuelle(
  factures: { montant: number; dateFacture: Date | string | null; datePaiement: Date | string }[],
  months: string[],
): EvolutionMoisEntry[] {
  return months.map((mois) => {
    const subset = factures.filter((f) => monthKey(f.datePaiement) === mois);
    return {
      mois,
      delaiJours: computeDelaiPondere(subset.filter(hasDateFacture)),
      montantTotal: subset.reduce((s, f) => s + f.montant, 0),
      nombre: subset.length,
    };
  });
}

// Agrège les factures payées et les relances effectuées sur une période —
// fonctions pures (pas d'accès DB) pour rester facilement testables ; les
// routes se chargent de la requête Prisma et leur passent les lignes brutes.
export function buildReportingSummary(
  from: string,
  to: string,
  factures: ReportingFacture[],
  actions: ReportingAction[],
  evolutionFactures: { montant: number; dateFacture: Date | string | null; datePaiement: Date | string }[],
  evolutionMonths: string[],
): ReportingSummary {
  const montantTotal = factures.reduce((sum, f) => sum + f.montant, 0);

  const counts: Record<number, number> = {};
  actions.forEach((a) => {
    counts[a.palier] = (counts[a.palier] ?? 0) + 1;
  });

  // Le palier 0 ("À jour") ne correspond à aucune relance envoyée — on ne
  // reporte que les paliers 1 à 7.
  const relances = PALIERS.filter((p) => p.id >= 1).map((p) => ({ palier: p.id, label: p.label, nombre: counts[p.id] ?? 0 }));

  return {
    from,
    to,
    facturesPayees: { nombre: factures.length, montantTotal },
    relances,
    delaiEncaissement: {
      global: computeDelaiPondere(factures.filter(hasDateFacture)),
      parEntite: buildDelaiParEntite(factures),
    },
    evolutionMensuelle: buildEvolutionMensuelle(evolutionFactures, evolutionMonths),
  };
}

// ── Balance âgée de l'encours (aging) ────────────────────────────────────────
// Répartit le montant des factures IMPAYÉES par tranche de retard (jours entre
// l'échéance et aujourd'hui). « À échoir » = pas encore exigible. Indicateur clé
// de trésorerie : montre où dort l'argent.
export interface TrancheAge {
  cle: 'a_echoir' | 'j0_30' | 'j31_60' | 'j61_90' | 'j90_plus';
  label: string;
  montant: number;
  nombre: number;
}

const TRANCHES_AGE: { cle: TrancheAge['cle']; label: string; min: number; max: number | null }[] = [
  { cle: 'a_echoir', label: 'À échoir', min: -Infinity, max: 0 },
  { cle: 'j0_30', label: '0–30 jours', min: 0, max: 30 },
  { cle: 'j31_60', label: '31–60 jours', min: 31, max: 60 },
  { cle: 'j61_90', label: '61–90 jours', min: 61, max: 90 },
  { cle: 'j90_plus', label: '+90 jours', min: 91, max: null },
];

export function buildBalanceAgee(
  factures: { montant: number; dateEcheance: Date | string; statut: 'impayee' | 'payee' }[],
  now: Date = new Date(),
): TrancheAge[] {
  const acc = new Map<TrancheAge['cle'], { montant: number; nombre: number }>();
  for (const t of TRANCHES_AGE) acc.set(t.cle, { montant: 0, nombre: 0 });
  for (const f of factures) {
    if (f.statut !== 'impayee') continue;
    const retard = Math.floor((now.getTime() - new Date(f.dateEcheance).getTime()) / 86_400_000);
    const tranche =
      retard <= 0 ? 'a_echoir' : retard <= 30 ? 'j0_30' : retard <= 60 ? 'j31_60' : retard <= 90 ? 'j61_90' : 'j90_plus';
    const bucket = acc.get(tranche)!;
    bucket.montant += f.montant;
    bucket.nombre += 1;
  }
  return TRANCHES_AGE.map((t) => ({ cle: t.cle, label: t.label, ...acc.get(t.cle)! }));
}

// ── Conversion des relances par palier ───────────────────────────────────────
// Pour chaque relance (palier ≥ 1) de la période, on regarde si un paiement du
// client est survenu dans les FENETRE_CONVERSION_JOURS suivants. Le taux de
// conversion par palier = part des relances suivies d'un paiement. C'est une
// corrélation (le paiement peut avoir d'autres causes), jamais une preuve — les
// libellés côté UI doivent rester honnêtes là-dessus.
export const FENETRE_CONVERSION_JOURS = 15;

export interface ConversionActionEntry {
  palier: number;
  date: Date | string;
  datesPaiementClient: (Date | string | null)[];
}

export interface ConversionPalier {
  palier: number;
  label: string;
  relances: number;
  converties: number;
  taux: number | null; // null si aucune relance à ce palier
}

export function buildConversionParPalier(
  actions: ConversionActionEntry[],
  fenetreJours: number = FENETRE_CONVERSION_JOURS,
): ConversionPalier[] {
  const parPalier = new Map<number, { relances: number; converties: number }>();
  for (const a of actions) {
    if (a.palier < 1) continue;
    let stat = parPalier.get(a.palier);
    if (!stat) {
      stat = { relances: 0, converties: 0 };
      parPalier.set(a.palier, stat);
    }
    stat.relances += 1;
    const t0 = new Date(a.date).getTime();
    const limite = t0 + fenetreJours * 86_400_000;
    const converti = a.datesPaiementClient.some((d) => {
      if (d == null) return false;
      const t = new Date(d).getTime();
      return t >= t0 && t <= limite;
    });
    if (converti) stat.converties += 1;
  }
  return PALIERS.filter((p) => p.id >= 1).map((p) => {
    const s = parPalier.get(p.id);
    return {
      palier: p.id,
      label: p.label,
      relances: s?.relances ?? 0,
      converties: s?.converties ?? 0,
      taux: s && s.relances > 0 ? Math.round((s.converties / s.relances) * 1000) / 10 : null,
    };
  });
}

export interface AgentActionEntry {
  utilisateurId: string;
  utilisateurNom: string;
  date: Date | string;
  // Dates de paiement des factures (payées) du client concerné par cette
  // action -- pour trouver le premier paiement survenu après l'action.
  datesPaiementClient: (Date | string | null)[];
}

export interface AgentStat {
  utilisateurId: string;
  nom: string;
  actions: number;
  // null s'il n'y a jamais eu de paiement observé après une action de cet
  // agent sur la période -- distinct de 0 (qui voudrait dire "immédiat").
  delaiMoyenApresIntervention: number | null;
  nombreDelaisMesures: number;
  // Renseignés séparément par routes/reporting.ts en fusionnant avec
  // buildAgentMontantRecouvre (attribution "dernier contact") -- absents de
  // ce que buildAgentStats calcule seul, donc à 0 par défaut ici.
  montantRecouvre: number;
  nombreFactures: number;
}

// Construit la performance par agent à partir d'actions de relance déjà
// filtrées à palier > 0 (appelant responsable d'exclure la tenue de dossier
// -- factures corrigées/supprimées, tranches réglées -- qui n'est pas de la
// relance). Le délai est une corrélation ("premier paiement après cette
// action"), jamais un lien de causalité prouvé -- voir le commentaire dans
// routes/reporting.ts.
export function buildAgentStats(actions: AgentActionEntry[]): AgentStat[] {
  const parAgent = new Map<string, { nom: string; actions: number; delais: number[] }>();

  for (const action of actions) {
    let stat = parAgent.get(action.utilisateurId);
    if (!stat) {
      stat = { nom: action.utilisateurNom, actions: 0, delais: [] };
      parAgent.set(action.utilisateurId, stat);
    }
    stat.actions++;

    const actionDate = new Date(action.date).getTime();
    const prochainPaiement = action.datesPaiementClient
      .filter((d): d is Date | string => d !== null && new Date(d).getTime() >= actionDate)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    if (prochainPaiement) stat.delais.push(daysDiff(action.date, prochainPaiement));
  }

  return [...parAgent.entries()]
    .map(([utilisateurId, s]) => ({
      utilisateurId,
      nom: s.nom,
      actions: s.actions,
      delaiMoyenApresIntervention: s.delais.length ? Math.round(s.delais.reduce((a, b) => a + b, 0) / s.delais.length) : null,
      nombreDelaisMesures: s.delais.length,
      montantRecouvre: 0,
      nombreFactures: 0,
    }))
    .sort((a, b) => b.actions - a.actions);
}

export interface PaymentAttributionEntry {
  montant: number;
  datePaiement: Date | string;
  // Toutes les actions de relance (palier > 0, agent connu) déjà faites sur
  // le client de cette facture -- pas seulement celles de la période
  // affichée, car l'action qui a mené à ce paiement peut être antérieure à
  // la période demandée (relancé en juin, payé en août).
  actionsClient: { utilisateurId: string; utilisateurNom: string; date: Date | string }[];
}

export interface AgentMontantStat {
  utilisateurId: string;
  nom: string;
  montantRecouvre: number;
  nombreFactures: number;
}

// Attribution "dernier contact" : chaque facture payée est créditée à
// l'agent dont l'action de relance est la plus proche (et antérieure ou
// égale) de la date de paiement -- la convention standard pour ce type de
// mesure, mais qui reste une corrélation, pas une preuve. Une facture sans
// aucune action de relance avant son paiement (réglée spontanément, ou par
// une action antérieure à l'ajout de ce suivi) n'est créditée à personne,
// plutôt que d'être arbitrairement attribuée.
export function buildAgentMontantRecouvre(payments: PaymentAttributionEntry[]): AgentMontantStat[] {
  const parAgent = new Map<string, { nom: string; montant: number; nombre: number }>();

  for (const p of payments) {
    const paiementTime = new Date(p.datePaiement).getTime();
    const dernierContact = p.actionsClient
      .filter((a) => new Date(a.date).getTime() <= paiementTime)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    if (!dernierContact) continue;

    let stat = parAgent.get(dernierContact.utilisateurId);
    if (!stat) {
      stat = { nom: dernierContact.utilisateurNom, montant: 0, nombre: 0 };
      parAgent.set(dernierContact.utilisateurId, stat);
    }
    stat.montant += p.montant;
    stat.nombre += 1;
  }

  return [...parAgent.entries()]
    .map(([utilisateurId, s]) => ({ utilisateurId, nom: s.nom, montantRecouvre: s.montant, nombreFactures: s.nombre }))
    .sort((a, b) => b.montantRecouvre - a.montantRecouvre);
}
