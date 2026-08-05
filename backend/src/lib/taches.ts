// Types de tâche fermés + libellés partagés backend/frontend (même
// convention que PALIERS dans lib/paliers.ts) -- "autre" reste toujours
// disponible pour ne jamais bloquer une saisie imprévue.
export const TACHE_TYPE_LABELS: Record<string, string> = {
  releve_compteur: 'Relevé compteur imprimante',
  depot_facture: 'Déposer une facture',
  depot_courrier: 'Déposer un courrier client',
  recuperation_reglement: 'Récupérer un règlement',
  depot_banque: 'Dépôt en banque',
  livraison_toner: 'Livraison toner',
  livraison_bac_recuperation: 'Livraison bac de récupération',
  autre: 'Autre',
};

export const MODE_PAIEMENT_LABELS: Record<string, string> = {
  cheque: 'Chèque',
  espece: 'Espèces',
  autre: 'Autre',
};

export const MOTIF_REPORT_LABELS: Record<string, string> = {
  client_absent: 'Client absent',
  adresse_introuvable: 'Adresse introuvable',
  document_non_pret: 'Document/paiement non prêt',
  trafic_panne: 'Trafic / panne scooter',
  bureau_ferme: 'Bureau fermé',
  autre: 'Autre',
};

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

// Un modèle récurrent est dû un jour donné si son jour du mois configuré
// correspond au jour du mois de la date -- volontairement borné à 1-28 à la
// création (cf. route) pour ne jamais viser un jour qui n'existe pas dans
// un mois plus court (février notamment). getUTCDate()/getUTCDay() plutôt
// que leurs équivalents locaux : les dates de tâches sont stockées à
// minuit UTC (même convention que buildPeriod dans routes/reporting.ts),
// une version dépendant du fuseau du serveur pourrait décaler le jour
// d'une unité selon l'environnement.
//
// Un jour du mois qui tombe un samedi ou un dimanche ne déclenche jamais
// la tâche ce jour-là -- elle est reportée au lundi suivant (l'équipe
// coursiers ne travaille pas le week-end). On calcule ça par arithmétique
// de dates réelles (reculer de 1 ou 2 jours depuis un lundi) plutôt que
// par un calcul "candidat du mois", pour rester correct même quand le
// report fait franchir la fin du mois (ex: le 28 tombe un samedi fin de
// mois -> reporté au lundi du mois suivant).
export function modeleDuLe(jourDuMois: number, date: Date): boolean {
  const jourSemaine = date.getUTCDay(); // 0 = dimanche, 6 = samedi
  if (jourSemaine === 0 || jourSemaine === 6) return false;
  if (date.getUTCDate() === jourDuMois) return true;
  if (jourSemaine !== 1) return false; // seul un lundi peut être une date de report

  const veille = new Date(date.getTime() - MS_PAR_JOUR);
  if (veille.getUTCDay() === 0 && veille.getUTCDate() === jourDuMois) return true; // dimanche -> lundi

  const avantVeille = new Date(date.getTime() - 2 * MS_PAR_JOUR);
  if (avantVeille.getUTCDay() === 6 && avantVeille.getUTCDate() === jourDuMois) return true; // samedi -> lundi

  return false;
}

export interface TacheJournee {
  statut: 'a_faire' | 'faite' | 'annulee';
  date: Date | string;
  dateInitiale: Date | string;
}

export type StatutAffiche = 'a_faire' | 'faite' | 'reportee' | 'annulee';

// Statut "affiché" pour le récap d'une journée donnée : une tâche dont la
// date planifiée a été déplacée après coup (report par l'équipe coursiers)
// reste techniquement "à faire", mais doit apparaître comme "reportée" dans
// le bilan du jour où elle était initialement prévue -- jamais comme
// simplement "non faite", ce qui laisserait croire qu'elle a été oubliée.
export function statutAffiche(tache: TacheJournee): StatutAffiche {
  if (tache.statut === 'faite' || tache.statut === 'annulee') return tache.statut;
  const date = new Date(tache.date).toISOString().slice(0, 10);
  const dateInitiale = new Date(tache.dateInitiale).toISOString().slice(0, 10);
  return date !== dateInitiale ? 'reportee' : 'a_faire';
}

export interface ResumeJournee {
  total: number;
  faites: number;
  reportees: number;
  aFaire: number;
  annulees: number;
}

// Bilan de fin de journée pour les tâches initialement prévues à cette
// date-là (cf. route GET /taches?date=) -- calculé à la volée à partir de
// la même liste que celle affichée, jamais stocké séparément.
export function resumeJournee(taches: TacheJournee[]): ResumeJournee {
  const resume: ResumeJournee = { total: taches.length, faites: 0, reportees: 0, aFaire: 0, annulees: 0 };
  for (const t of taches) {
    const s = statutAffiche(t);
    if (s === 'faite') resume.faites++;
    else if (s === 'reportee') resume.reportees++;
    else if (s === 'annulee') resume.annulees++;
    else resume.aFaire++;
  }
  return resume;
}

export interface TacheRapportEntree extends TacheJournee {
  entite: string;
  coursierId: string | null;
  coursierNom: string | null;
}

export interface DecompteStatuts {
  total: number;
  faites: number;
  reportees: number;
  aFaire: number;
  annulees: number;
}

export interface PlanningRapport {
  parJour: (DecompteStatuts & { date: string })[];
  parCoursier: (DecompteStatuts & { coursierId: string | null; nom: string })[];
  reporteesParEntite: { entite: string; nombre: number }[];
  reporteesTotal: number;
  global: DecompteStatuts;
}

function decompteVide(): DecompteStatuts {
  return { total: 0, faites: 0, reportees: 0, aFaire: 0, annulees: 0 };
}

function accumuler(decompte: DecompteStatuts, statut: StatutAffiche) {
  decompte.total++;
  if (statut === 'faite') decompte.faites++;
  else if (statut === 'reportee') decompte.reportees++;
  else if (statut === 'annulee') decompte.annulees++;
  else decompte.aFaire++;
}

// Rapport agrégé sur une période -- toujours basé sur `dateInitiale` (le
// jour où chaque tâche était prévue à l'origine), jamais sur `date` (qui
// bouge dès qu'une tâche est reportée) : même convention que resumeJournee,
// pour qu'une tâche reportée hors de la période ne disparaisse jamais du
// décompte du jour où elle aurait dû être traitée.
export function buildPlanningRapport(taches: TacheRapportEntree[]): PlanningRapport {
  const parJourMap = new Map<string, DecompteStatuts>();
  const parCoursierMap = new Map<string, { nom: string; decompte: DecompteStatuts }>();
  const reporteesParEntiteMap = new Map<string, number>();
  const global = decompteVide();

  for (const t of taches) {
    const statut = statutAffiche(t);
    accumuler(global, statut);

    const jour = new Date(t.dateInitiale).toISOString().slice(0, 10);
    if (!parJourMap.has(jour)) parJourMap.set(jour, decompteVide());
    accumuler(parJourMap.get(jour)!, statut);

    const coursierKey = t.coursierId ?? '__non_assignee__';
    if (!parCoursierMap.has(coursierKey)) {
      parCoursierMap.set(coursierKey, { nom: t.coursierNom ?? 'Non assignée', decompte: decompteVide() });
    }
    accumuler(parCoursierMap.get(coursierKey)!.decompte, statut);

    if (statut === 'reportee') {
      reporteesParEntiteMap.set(t.entite, (reporteesParEntiteMap.get(t.entite) ?? 0) + 1);
    }
  }

  return {
    parJour: [...parJourMap.entries()].map(([date, decompte]) => ({ date, ...decompte })).sort((a, b) => a.date.localeCompare(b.date)),
    parCoursier: [...parCoursierMap.entries()]
      .map(([coursierId, { nom, decompte }]) => ({ coursierId: coursierId === '__non_assignee__' ? null : coursierId, nom, ...decompte }))
      .sort((a, b) => b.total - a.total),
    reporteesParEntite: [...reporteesParEntiteMap.entries()]
      .map(([entite, nombre]) => ({ entite, nombre }))
      .sort((a, b) => b.nombre - a.nombre),
    reporteesTotal: global.reportees,
    global,
  };
}
