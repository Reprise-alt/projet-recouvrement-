import { PALIERS } from './paliers';

export interface ReportingFacture {
  numero: string;
  montant: number;
  datePaiement: Date | string;
  clientNom: string;
}

export interface ReportingAction {
  palier: number;
}

export interface PalierCount {
  palier: number;
  label: string;
  nombre: number;
}

export interface ReportingSummary {
  from: string;
  to: string;
  facturesPayees: { nombre: number; montantTotal: number };
  relances: PalierCount[];
}

// Agrège les factures payées et les relances effectuées sur une période —
// fonction pure (pas d'accès DB) pour rester facilement testable ; les
// routes se chargent de la requête Prisma et lui passent les lignes brutes.
export function buildReportingSummary(from: string, to: string, factures: ReportingFacture[], actions: ReportingAction[]): ReportingSummary {
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
  };
}
