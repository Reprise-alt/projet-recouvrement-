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

// La période affichée en tête du rapport reflète les dates réellement
// présentes dans les données importées (déclarations d'intervention,
// livraisons, périodes de volumétrie) -- jamais une plage choisie a priori,
// puisque les fichiers ARTIS reçus ne couvrent pas forcément un trimestre
// entier (cf. l'export SSC de juillet reçu qui ne couvrait que ce mois-là).
export function calculerPeriodeReelle(dates: (Date | string)[], periodesVolumetrie: string[] = []): string | null {
  const toutes: Date[] = [
    ...dates.map(versDate),
    ...periodesVolumetrie
      .map((p) => {
        const [y, mo] = p.split('-').map(Number);
        return y && mo ? new Date(Date.UTC(y, mo - 1, 1)) : null;
      })
      .filter((d): d is Date => d !== null),
  ].filter((d) => !isNaN(d.getTime()));
  if (toutes.length === 0) return null;
  const min = new Date(Math.min(...toutes.map((d) => d.getTime())));
  const max = new Date(Math.max(...toutes.map((d) => d.getTime())));
  const labelMin = moisLabelUTC(min);
  const labelMax = moisLabelUTC(max);
  return labelMin === labelMax ? labelMin : `${labelMin} – ${labelMax}`;
}

// Les tableaux "par modèle" / "par site" débordent facilement d'une diapo
// dès que le parc réel a des dizaines de sites (76 constatés sur un export
// ARTIS réel) -- on garde les plus significatifs et on regroupe le reste
// sous "Autres", exactement le motif déjà présent dans le gabarit COPIL
// d'origine ("AUTRES VILLES").
export function capParModeleAvecAutres(items: { modele: string; qte: number }[], max = 8): { modele: string; qte: number }[] {
  if (items.length <= max) return items;
  const top = items.slice(0, max - 1);
  const reste = items.slice(max - 1);
  const qte = reste.reduce((s, r) => s + r.qte, 0);
  return [...top, { modele: `Autres modèles (${reste.length})`, qte }];
}

export function capParSiteAvecAutres(
  items: { site: string; clotures: number; enCours: number; total: number }[],
  max = 9
): { site: string; clotures: number; enCours: number; total: number }[] {
  if (items.length <= max) return items;
  const top = items.slice(0, max - 1);
  const reste = items.slice(max - 1);
  const acc = reste.reduce(
    (a, r) => ({ clotures: a.clotures + r.clotures, enCours: a.enCours + r.enCours, total: a.total + r.total }),
    { clotures: 0, enCours: 0, total: 0 }
  );
  return [...top, { site: `Autres sites (${reste.length})`, ...acc }];
}

// Alertes du rapport COPIL -- basées sur la volumétrie et les interventions
// PAR MACHINE (colonne "Bien facturé" de l'export SSC = n° de série), que
// l'agrégat client seul (ReleveVolumetrie) ne permet pas de calculer.

export interface MachineVolumetrieLike {
  numeroSerie: string;
  modele: string;
  site: string;
  periode: string;
  copiesNB: number;
  copiesCouleur: number;
}

export interface AlerteVolumetrie {
  numeroSerie: string;
  modele: string;
  site: string;
  periode: string;
  total: number;
}

export function alertesVolumetrieMensuelle(rows: MachineVolumetrieLike[], seuil = 10000): AlerteVolumetrie[] {
  return rows
    .map((r) => ({ numeroSerie: r.numeroSerie, modele: r.modele, site: r.site, periode: r.periode, total: r.copiesNB + r.copiesCouleur }))
    .filter((r) => r.total > seuil)
    .sort((a, b) => b.total - a.total);
}

export interface AlerteCompteur {
  numeroSerie: string;
  modele: string;
  site: string;
  total: number;
}

// Compteur total = cumul TOUTES périodes confondues pour la machine, jamais
// limité à la fenêtre du rapport -- c'est un compteur de vie de la machine,
// pas un indicateur de la période affichée.
export function alertesCompteurTotal(rows: MachineVolumetrieLike[], seuil = 700000): AlerteCompteur[] {
  const m = new Map<string, AlerteCompteur>();
  for (const r of rows) {
    const acc = m.get(r.numeroSerie) ?? { numeroSerie: r.numeroSerie, modele: r.modele, site: r.site, total: 0 };
    acc.total += r.copiesNB + r.copiesCouleur;
    m.set(r.numeroSerie, acc);
  }
  return Array.from(m.values())
    .filter((r) => r.total > seuil)
    .sort((a, b) => b.total - a.total);
}

export interface MachineInterventionLike {
  numeroSerie: string;
  modele: string;
  site: string;
}

export function alertesInterventionsFrequentes(rows: MachineInterventionLike[], seuil = 4): AlerteCompteur[] {
  const m = new Map<string, AlerteCompteur>();
  for (const r of rows) {
    const acc = m.get(r.numeroSerie) ?? { numeroSerie: r.numeroSerie, modele: r.modele, site: r.site, total: 0 };
    acc.total++;
    m.set(r.numeroSerie, acc);
  }
  return Array.from(m.values())
    .filter((r) => r.total > seuil)
    .sort((a, b) => b.total - a.total);
}

// Le(s) site(s) en tête, en gérant l'égalité -- appeler sur la liste NON
// cappée par capParSiteAvecAutres, sans quoi un site fondu dans "Autres"
// pourrait masquer le vrai premier de la liste (impossible en pratique
// puisque triée décroissante, mais gardé explicite pour ne pas dépendre de
// l'ordre d'appel).
export function sitesTopInterventions(parSite: { site: string; total: number }[]): { site: string; total: number }[] {
  if (parSite.length === 0) return [];
  const max = Math.max(...parSite.map((s) => s.total));
  if (max === 0) return [];
  return parSite.filter((s) => s.total === max);
}
