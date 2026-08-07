// Agrégations pour le rapport COPIL (PPTX) -- calculs purs à partir des
// données déjà saisies/importées dans Parc d'impression. Aucune de ces
// fonctions ne touche à un champ montant : le schéma source n'en a pas.

function moisLabelUTC(date: Date): string {
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function cleMoisUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function versDate(v: Date | string): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

export interface EquipementModeleLike {
  modele: string;
  statut: 'actif' | 'retire' | 'introuvable';
}

export function equipementsParModele(equipements: EquipementModeleLike[]): { modele: string; qte: number }[] {
  const m = new Map<string, number>();
  for (const e of equipements) {
    if (e.statut !== 'actif') continue;
    m.set(e.modele, (m.get(e.modele) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([modele, qte]) => ({ modele, qte }))
    .sort((a, b) => b.qte - a.qte);
}

export interface InterventionSiteLike {
  site: string;
  dateCloture: Date | string | null;
}

export function interventionsParSite(interventions: InterventionSiteLike[]): { site: string; clotures: number; enCours: number; total: number }[] {
  const m = new Map<string, { clotures: number; enCours: number }>();
  for (const i of interventions) {
    const acc = m.get(i.site) ?? { clotures: 0, enCours: 0 };
    if (i.dateCloture != null) acc.clotures++;
    else acc.enCours++;
    m.set(i.site, acc);
  }
  return Array.from(m.entries())
    .map(([site, v]) => ({ site, ...v, total: v.clotures + v.enCours }))
    .sort((a, b) => b.total - a.total);
}

export function interventionsParMois(interventions: { dateDeclaration: Date | string }[]): { mois: string; total: number }[] {
  const m = new Map<string, number>();
  for (const i of interventions) {
    const cle = cleMoisUTC(versDate(i.dateDeclaration));
    m.set(cle, (m.get(cle) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cle, total]) => {
      const [y, mo] = cle.split('-').map(Number);
      return { mois: moisLabelUTC(new Date(Date.UTC(y, mo - 1, 1))), total };
    });
}

export function interventionsParType(interventions: { type: 'preventive' | 'curative' }[]): { type: string; total: number }[] {
  return [
    { type: 'Curative', total: interventions.filter((i) => i.type === 'curative').length },
    { type: 'Préventive', total: interventions.filter((i) => i.type === 'preventive').length },
  ];
}

export function consommablesParReference(
  livraisons: { reference: string; quantite: number }[],
  topN = 8
): { reference: string; qte: number }[] {
  const m = new Map<string, number>();
  for (const l of livraisons) m.set(l.reference, (m.get(l.reference) ?? 0) + l.quantite);
  return Array.from(m.entries())
    .map(([reference, qte]) => ({ reference, qte }))
    .sort((a, b) => b.qte - a.qte)
    .slice(0, topN);
}

// "Lignes de livraison" (une ligne = une paire BL + référence article), pas
// le nombre de bordereaux distincts -- l'export ARTIS ne permet pas de
// distinguer les deux de façon fiable.
export function consommablesParMois(livraisons: { date: Date | string }[]): { mois: string; nbLignes: number }[] {
  const m = new Map<string, number>();
  for (const l of livraisons) {
    const cle = cleMoisUTC(versDate(l.date));
    m.set(cle, (m.get(cle) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cle, nbLignes]) => {
      const [y, mo] = cle.split('-').map(Number);
      return { mois: moisLabelUTC(new Date(Date.UTC(y, mo - 1, 1))), nbLignes };
    });
}

export function volumetrieTriee<T extends { periode: string }>(releves: T[]): T[] {
  return [...releves].sort((a, b) => a.periode.localeCompare(b.periode));
}

export function periodeLabel(periode: string): string {
  const [y, mo] = periode.split('-').map(Number);
  if (!y || !mo) return periode;
  return moisLabelUTC(new Date(Date.UTC(y, mo - 1, 1)));
}
