import { PALIERS } from './paliers';

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
