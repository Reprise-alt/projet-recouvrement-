import { daysBetween, daysUntil } from './dates';

// Port fidèle de la logique métier du prototype olu360-suivi-operations.html,
// vérifiée formule par formule contre le cahier des charges OLU360 — Suivi
// des opérations (§4). "Le prototype fait foi pour le comportement, ce
// document fait foi pour l'intention" (préambule du cahier) : un seul écart
// assumé, documenté au fil du fichier, corrige un vrai bug du prototype
// plutôt que de le reproduire.

export interface ConfigOperationsLike {
  contactStdVigilance: number;
  contactStdRisque: number;
  contactVipVigilance: number;
  contactVipRisque: number;
  problemeVigilanceJours: number;
  problemeRisqueJours: number;
  problemeBloquantRisqueJours: number;
  demarrageRisqueRetardJours: number;
  finContratVigilanceJours: number;
  finContratRisqueJours: number;
}

export const DEFAULT_CONFIG_OPERATIONS: ConfigOperationsLike = {
  contactStdVigilance: 45,
  contactStdRisque: 60,
  contactVipVigilance: 25,
  contactVipRisque: 35,
  problemeVigilanceJours: 14,
  problemeRisqueJours: 30,
  problemeBloquantRisqueJours: 7,
  demarrageRisqueRetardJours: 15,
  finContratVigilanceJours: 90,
  finContratRisqueJours: 30,
};

/* ---------- Fonction d'interpolation (cahier §4.1) ---------- */

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function lerp(v: number | null, bon: number, mauvais: number): number {
  if (v == null) return 50;
  return clamp((100 * (mauvais - v)) / (mauvais - bon));
}

export interface SeuilContact {
  vigilance: number;
  risque: number;
}

// Grand compte (VIP) : rythme de contact resserré à un mois au lieu de deux
// (cahier §4.2).
export function seuilContact(vip: boolean, config: ConfigOperationsLike = DEFAULT_CONFIG_OPERATIONS): SeuilContact {
  return vip
    ? { vigilance: config.contactVipVigilance, risque: config.contactVipRisque }
    : { vigilance: config.contactStdVigilance, risque: config.contactStdRisque };
}

/* ---------- Problèmes ---------- */

export interface ProblemeLike {
  gravite: 'gene' | 'bloquant';
  ouvertLe: Date | string;
  resoluLe?: Date | string | null;
}

export function problemesOuverts<T extends ProblemeLike>(problemes: T[]): T[] {
  return problemes.filter((p) => !p.resoluLe);
}

export function problemesBloquants<T extends ProblemeLike>(problemes: T[]): T[] {
  return problemesOuverts(problemes).filter((p) => p.gravite === 'bloquant');
}

/* ---------- Démarrage de contrat (cahier §5.3) ---------- */

export interface EtapeDemarrageConfigLike {
  cle: string;
  libelle: string;
  delaiJours: number;
  ordre: number;
}

export interface EtapeDemarrageFaitLike {
  cle: string;
}

export interface DemarrageEtat {
  age: number;
  nbFaits: number;
  total: number;
  pct: number;
  restantes: EtapeDemarrageConfigLike[];
  retard: EtapeDemarrageConfigLike[];
}

export interface DemarrageClientLike {
  demarreLe: Date | string | null;
  demarrageCloture: boolean;
  resilie: boolean;
}

export function enDemarrage(client: DemarrageClientLike): boolean {
  return !!(client.demarreLe && !client.demarrageCloture && !client.resilie);
}

export function etatDemarrage(
  client: DemarrageClientLike,
  etapesConfig: EtapeDemarrageConfigLike[],
  faits: EtapeDemarrageFaitLike[],
): DemarrageEtat | null {
  if (!enDemarrage(client)) return null;
  const etapes = [...etapesConfig].sort((a, b) => a.ordre - b.ordre);
  const age = daysBetween(client.demarreLe!);
  const faitesCles = new Set(faits.map((f) => f.cle));
  const restantes = etapes.filter((e) => !faitesCles.has(e.cle));
  const retard = restantes.filter((e) => age > e.delaiJours);
  return {
    age,
    nbFaits: etapes.length - restantes.length,
    total: etapes.length,
    pct: etapes.length ? Math.round((100 * (etapes.length - restantes.length)) / etapes.length) : 100,
    restantes,
    retard,
  };
}

/* ---------- Score : 4 axes, tous sous la main des directrices (cahier §4.3) ---------- */

export interface ScoresAxes {
  contact: number;
  climat: number;
  problemes: number;
  engagements: number;
  global: number;
}

export interface ScoreClientLike extends DemarrageClientLike {
  vip: boolean;
  dernierContact: Date | string | null;
  climat: 'vert' | 'orange' | 'rouge' | null;
  action: string | null;
  actionEcheance: Date | string | null;
  actionFait: boolean;
  dernierCopil: Date | string | null;
  problemes: ProblemeLike[];
}

function memeMoisCalendaire(d: Date | string | null, from: Date = new Date()): boolean {
  if (!d) return false;
  const x = new Date(d);
  return x.getMonth() === from.getMonth() && x.getFullYear() === from.getFullYear();
}

export function scoresClient(
  client: ScoreClientLike,
  etapesConfig: EtapeDemarrageConfigLike[],
  faits: EtapeDemarrageFaitLike[],
  config: ConfigOperationsLike = DEFAULT_CONFIG_OPERATIONS,
): ScoresAxes {
  const seuil = seuilContact(client.vip, config);

  // Échanges : régularité du contact.
  const joursDepuisContact = client.dernierContact ? daysBetween(client.dernierContact) : null;
  const contact = lerp(joursDepuisContact, Math.round(seuil.vigilance / 3), seuil.risque);

  // Climat : ce que la directrice observe. Un compte jamais relevé (climat
  // non renseigné) tombe à 15 comme un climat rouge -- volontaire, porté du
  // prototype : ça pousse à faire le relevé plutôt que de masquer un compte
  // "neutre" derrière un score confortable.
  const climat = client.climat === 'vert' ? 100 : client.climat === 'orange' ? 55 : 15;

  // Problèmes : chaque problème ouvert coûte, et coûte plus en vieillissant.
  let problemesScore = 100;
  for (const p of problemesOuverts(client.problemes)) {
    const age = daysBetween(p.ouvertLe);
    const poids = p.gravite === 'bloquant' ? 1.7 : 1;
    problemesScore -= poids * (16 + Math.min(30, age * 0.55));
  }
  problemesScore = clamp(problemesScore);

  // Engagements : actions promises, COPIL dus, étapes de démarrage.
  let engagements = 100;
  if (client.action && !client.actionFait && client.actionEcheance) {
    const retard = daysBetween(client.actionEcheance);
    if (retard > 0) engagements -= Math.min(55, 18 + retard * 1.6);
  }
  if (client.vip && !memeMoisCalendaire(client.dernierCopil)) engagements -= 35;
  const demarrage = etatDemarrage(client, etapesConfig, faits);
  if (demarrage && demarrage.retard.length) engagements -= Math.min(45, demarrage.retard.length * 15);
  engagements = clamp(engagements);

  const global = Math.round((contact + climat + problemesScore + engagements) / 4);
  return { contact, climat, problemes: problemesScore, engagements, global };
}

export type Tone = 'success' | 'amber' | 'danger';

export function couleurScore(score: number): Tone {
  return score >= 70 ? 'success' : score >= 45 ? 'amber' : 'danger';
}

/* ---------- Semaine ISO (historique du relevé hebdo, cahier §3.1) ---------- */

function semaineIsoParts(d: Date): { n: number; a: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { n: Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7), a: t.getUTCFullYear() };
}

// Clé stable "AAAA-Www" -- sert de clé d'écrasement dans ReleveHebdo
// (@@unique([clientOperationsId, semaineIso])) : un second relevé validé la
// même semaine ISO écrase le premier plutôt que d'empiler une ligne.
export function semaineIsoKey(d: Date | string = new Date()): string {
  const { n, a } = semaineIsoParts(typeof d === 'string' ? new Date(d) : d);
  return `${a}-W${String(n).padStart(2, '0')}`;
}

export function memeSemaineIso(d: Date | string | null, from: Date = new Date()): boolean {
  if (!d) return false;
  const a = semaineIsoParts(new Date(d));
  const b = semaineIsoParts(from);
  return a.n === b.n && a.a === b.a;
}

/* ---------- Fenêtre saisonnière par secteur (cahier §5.1) ---------- */

export interface FenetreSaisonniereLike {
  mois: number;
  jour: number;
  label: string;
  anticipationJours: number;
}

export interface ProchaineFenetre {
  date: Date;
  joursRestants: number;
  label: string;
  anticipationJours: number;
}

// Prochaine occurrence annuelle de la fenêtre, jamais dans le passé.
export function prochaineFenetre(fenetre: FenetreSaisonniereLike, from: Date = new Date()): ProchaineFenetre {
  const today0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let date = new Date(today0.getFullYear(), fenetre.mois - 1, fenetre.jour);
  if (date < today0) date = new Date(today0.getFullYear() + 1, fenetre.mois - 1, fenetre.jour);
  const joursRestants = Math.round((date.getTime() - today0.getTime()) / 86400000);
  return { date, joursRestants, label: fenetre.label, anticipationJours: fenetre.anticipationJours };
}

/* ---------- Alertes (cahier §4.4) ---------- */

export type NiveauAlerte = 'vigilance' | 'risque';

export interface Alerte {
  niveau: NiveauAlerte;
  titre: string;
  detail: string;
}

export interface AlerteClient extends Alerte {
  clientId: string;
  clientNom: string;
  vip: boolean;
  criticite: 'A' | 'B' | 'C';
}

export interface AlerteClientInput extends ScoreClientLike {
  id: string;
  nom: string;
  criticite: 'A' | 'B' | 'C';
  finContrat: Date | string | null;
}

export function alertesClient(
  client: AlerteClientInput,
  etapesConfig: EtapeDemarrageConfigLike[],
  faits: EtapeDemarrageFaitLike[],
  fenetre: FenetreSaisonniereLike | null,
  config: ConfigOperationsLike = DEFAULT_CONFIG_OPERATIONS,
): AlerteClient[] {
  const out: Alerte[] = [];
  const push = (niveau: NiveauAlerte, titre: string, detail: string) => out.push({ niveau, titre, detail });

  const seuil = seuilContact(client.vip, config);
  const depuis = client.dernierContact ? daysBetween(client.dernierContact) : null;

  for (const p of problemesOuverts(client.problemes)) {
    const age = daysBetween(p.ouvertLe);
    if (p.gravite === 'bloquant' && age >= config.problemeBloquantRisqueJours) {
      push('risque', 'Problème bloquant non résolu', `Ouvert depuis ${age} jours`);
    } else if (age >= config.problemeRisqueJours) {
      push('risque', 'Problème qui traîne', `Ouvert depuis ${age} jours`);
    } else if (age >= config.problemeVigilanceJours) {
      push('vigilance', 'Problème à relancer', `Ouvert depuis ${age} jours`);
    } else if (p.gravite === 'bloquant') {
      push('vigilance', 'Problème bloquant en cours', `Ouvert il y a ${age} j`);
    }
  }

  if (depuis == null) {
    push('vigilance', 'Aucun contact enregistré', "Renseigner la date du dernier échange");
  } else if (depuis >= seuil.risque) {
    push(
      'risque',
      client.vip ? 'Grand compte sans contact ce mois' : 'Client sans contact depuis 2 mois',
      `Dernier échange il y a ${depuis} jours` + (client.vip ? ' — rythme attendu : mensuel' : ` — seuil : ${seuil.risque} j`),
    );
  } else if (depuis >= seuil.vigilance) {
    push('vigilance', 'Contact à programmer', `Dernier échange il y a ${depuis} j — à recontacter sous ${seuil.risque - depuis} j`);
  }

  if (client.vip && !memeMoisCalendaire(client.dernierCopil)) {
    push('risque', 'COPIL du mois non tenu', client.dernierCopil ? `Dernier COPIL : ${new Date(client.dernierCopil).toLocaleDateString('fr-FR')}` : 'Aucun COPIL enregistré');
  }

  if (client.action && client.actionEcheance && !client.actionFait) {
    const r = daysBetween(client.actionEcheance);
    if (r > 0) push('vigilance', 'Engagement non tenu', `« ${client.action} » — échéance dépassée de ${r} j`);
  }

  if (client.climat === 'rouge') push('risque', 'Client mécontent', 'Signalé au dernier relevé');

  const demarrage = etatDemarrage(client, etapesConfig, faits);
  if (demarrage) {
    for (const e of demarrage.retard) {
      const depasse = demarrage.age - e.delaiJours;
      push(
        depasse >= config.demarrageRisqueRetardJours ? 'risque' : 'vigilance',
        'Étape de démarrage en retard',
        `« ${e.libelle} » — attendue à J+${e.delaiJours}, on est à J+${demarrage.age}`,
      );
    }
    if (!demarrage.retard.length && demarrage.pct < 100) {
      push('vigilance', 'Démarrage en cours', `${demarrage.nbFaits}/${demarrage.total} étapes bouclées — J+${demarrage.age} sur 90`);
    }
  }

  if (fenetre) {
    const fen = prochaineFenetre(fenetre);
    if (fen.joursRestants <= fen.anticipationJours && (depuis == null || depuis > 30)) {
      push('vigilance', `${fen.label} à préparer`, `Échéance dans ${fen.joursRestants} jours — à contacter avant`);
    }
  }

  // Fin de contrat -- corrige un bug du prototype : celui-ci calcule
  // jours(today(), finContrat) sans vérifier que finContrat est renseigné,
  // ce qui donne 0 (donc "échu depuis 0 j") pour n'importe quel compte sans
  // date de fin saisie. Ici, silence tant que la date n'est pas connue.
  if (client.finContrat) {
    const jFin = daysUntil(client.finContrat);
    if (jFin <= config.finContratRisqueJours) {
      push('risque', 'Contrat à échéance', jFin < 0 ? `Échu depuis ${Math.abs(jFin)} j` : `Fin dans ${jFin} jours`);
    } else if (jFin <= config.finContratVigilanceJours) {
      push('vigilance', 'Renouvellement à préparer', `Fin de contrat dans ${jFin} jours`);
    }
  }

  return out.map((a) => ({ ...a, clientId: client.id, clientNom: client.nom, vip: client.vip, criticite: client.criticite }));
}

// Tri du cahier §4.4 : risque avant vigilance, puis VIP avant non-VIP, puis
// criticité A → B → C, puis ordre alphabétique.
export function trierAlertes(alertes: AlerteClient[]): AlerteClient[] {
  const rang: Record<'A' | 'B' | 'C', number> = { A: 0, B: 1, C: 2 };
  return [...alertes].sort(
    (a, b) =>
      (a.niveau === b.niveau ? 0 : a.niveau === 'risque' ? -1 : 1) ||
      (b.vip ? 1 : 0) - (a.vip ? 1 : 0) ||
      rang[a.criticite] - rang[b.criticite] ||
      a.clientNom.localeCompare(b.clientNom),
  );
}
