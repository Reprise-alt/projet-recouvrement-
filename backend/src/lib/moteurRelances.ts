// Moteur de relances automatiques (addendum §5) — cœur déterministe du Lot 2
// « les relances partent seules ». Ce module NE DÉCIDE QUE : pour un lot de
// clients à un instant donné, quelles relances doivent partir maintenant, en
// appliquant les règles d'arrêt du §5.2. Il n'envoie rien et ne planifie rien
// (le canal d'envoi et l'ordonnanceur sont des couches séparées) — ce qui le
// rend pur et testable.
import {
  CLE_PAR_PALIER,
  ClientWithFactures,
  DEFAULT_CONFIG,
  PalierConfig,
  clientJoursRetard,
  clientPalier,
} from './paliers';

// Dernier palier dont le message part AUTOMATIQUEMENT (amiable : avis d'échéance
// → arrêt de service). Au-delà (pénalités, commandement, judiciaire), le passage
// en contentieux est une décision manuelle/comportementale — jamais un effet de
// l'âge d'une facture. Source unique de vérité, réutilisée par la couche d'envoi.
export const PALIER_AMIABLE_MAX = 5;

export interface ActionLike {
  palier: number;
  date: Date | string;
}

export interface TrancheLike {
  dateEcheance: Date | string;
  statut: 'impayee' | 'payee';
}

export interface EcheancierLike {
  tranches: TrancheLike[];
}

export interface ClientRelance extends ClientWithFactures {
  id: string;
  nom: string;
  // Historique des relances déjà effectuées (ActionRecouvrement).
  actions?: ActionLike[];
  // Promesses / échéanciers négociés (arrêt tant qu'une échéance promise court).
  echeanciers?: EcheancierLike[];
  // Signaux d'arrêt du §5.2 — sources câblées plus tard (portail débiteur, Lot 3).
  enLitige?: boolean;
  opposition?: boolean;
  // Un dossier contentieux ouvert est en cours : l'amiable automatique s'arrête
  // (la suite est une procédure pilotée à la main). Câblé par l'appelant qui
  // connaît les dossiers (route /dues, exécuteur).
  enContentieux?: boolean;
}

// Pourquoi une relance NE part pas (utile pour l'aperçu / le débogage).
export type MotifBlocage =
  | 'a_jour'
  | 'deja_relance'
  | 'promesse_en_cours'
  | 'litige'
  | 'opposition'
  | 'palier_desactive'
  | 'amiable_epuise'
  | 'espacement'
  | 'contentieux';

export interface RelanceDue {
  clientId: string;
  nom: string;
  palier: number;
  joursRetard: number;
}

export interface EvaluationRelance {
  due: RelanceDue | null;
  motifBlocage?: MotifBlocage;
}

// §5.2 : une promesse est « en cours » s'il reste au moins une tranche non payée
// dont l'échéance n'est pas encore dépassée. Quand toutes les tranches promises
// sont échues et impayées, la promesse n'est plus tenue → la séquence reprend
// (reprise automatique).
export function promesseEnCours(echeanciers: EcheancierLike[] | undefined, now: Date): boolean {
  if (!echeanciers?.length) return false;
  return echeanciers.some((e) =>
    e.tranches.some((t) => t.statut === 'impayee' && new Date(t.dateEcheance).getTime() >= now.getTime()),
  );
}

// §5.2 : une seule relance par palier — tant que le client n'a pas progressé
// d'un palier, on ne le relance pas une seconde fois. Vrai s'il existe déjà une
// action à ce palier ou au-delà.
export function dejaRelanceCePalier(actions: ActionLike[] | undefined, palier: number): boolean {
  if (!actions?.length) return false;
  return actions.some((a) => a.palier >= palier);
}

// Palier le plus haut déjà relancé (0 si jamais relancé). Détermine où en est le
// client dans sa séquence amiable.
export function dernierPalierRelance(actions: ActionLike[] | undefined): number {
  if (!actions?.length) return 0;
  return actions.reduce((max, a) => Math.max(max, a.palier), 0);
}

// Date de la dernière relance (null si aucune) — sert à cadencer la remontée.
function derniereDateRelance(actions: ActionLike[] | undefined): Date | null {
  if (!actions?.length) return null;
  return actions.reduce<Date | null>((latest, a) => {
    const d = new Date(a.date);
    return !latest || d.getTime() > latest.getTime() ? d : latest;
  }, null);
}

// Prochain palier ACTIF strictement au-dessus de `dernier`, borné à `max`. Un
// palier désactivé par l'organisation est sauté (on monte au suivant actif).
// 0 si aucun palier actif ne reste dans la plage. `undefined` = tous actifs.
function prochainPalierActif(dernier: number, max: number, paliersActifs?: Set<number>): number {
  for (let p = dernier + 1; p <= max; p++) {
    if (!paliersActifs || paliersActifs.has(p)) return p;
  }
  return 0;
}

// Seuil (jours depuis l'échéance) associé à un palier, d'après la config de l'org.
function seuilJoursPalier(palier: number, config: PalierConfig): number {
  const cle = CLE_PAR_PALIER[palier];
  return cle ? config[cle] : 0;
}

// Délai minimal entre l'envoi du palier `from` et celui du palier `to`, calqué
// sur l'écart des seuils configurés (au moins 1 jour pour ne jamais enchaîner
// deux envois le même jour). C'est CE délai — et non l'âge de la facture — qui
// cadence la remontée amiable : indispensable sur un stock de factures anciennes
// importées (échéances d'il y a 200–600 j), où l'âge ne cadence plus rien et où
// l'on veut pourtant démarrer une séquence courtoise, pas tout envoyer d'un coup.
function joursEntrePaliers(from: number, to: number, config: PalierConfig): number {
  return Math.max(1, seuilJoursPalier(to, config) - seuilJoursPalier(from, config));
}

// Décision pour un client : relance due (et à quel palier) ou motif de blocage.
//
// La séquence est MONTANTE et part toujours de l'amiable : un débiteur jamais
// relancé commence au palier 1 (avis courtois) puis gravit un palier à la fois,
// quel que soit l'âge de ses factures. L'âge ne sert plus qu'à savoir s'il est
// en retard ; il ne propulse plus un dossier directement en « contentieux ». Le
// contentieux est désormais une décision comportementale/manuelle (cf.
// eligibiliteContentieux et l'ouverture d'un DossierContentieux), pas un effet
// mécanique de l'ancienneté — sans quoi une vieille facture isolée (oubli,
// mauvais lettrage) gèlerait à tort toute relance.
export function evaluerRelance(
  client: ClientRelance,
  config: PalierConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
  paliersActifs?: Set<number>,
): EvaluationRelance {
  // L'âge ne décide que d'une chose : le client est-il en retard du tout ?
  if (clientPalier(client, config) <= 0) return { due: null, motifBlocage: 'a_jour' };
  // Ordre volontaire : opposition, litige et contentieux ouvert priment (§5.2).
  if (client.opposition) return { due: null, motifBlocage: 'opposition' };
  if (client.enLitige) return { due: null, motifBlocage: 'litige' };
  if (client.enContentieux) return { due: null, motifBlocage: 'contentieux' };
  if (promesseEnCours(client.echeanciers, now)) return { due: null, motifBlocage: 'promesse_en_cours' };

  const dernier = dernierPalierRelance(client.actions);
  // Amiable épuisé : au-delà du palier 5, aucune relance automatique — le dossier
  // relève d'une décision manuelle (bascule contentieux).
  if (dernier >= PALIER_AMIABLE_MAX) return { due: null, motifBlocage: 'amiable_epuise' };

  const palier = prochainPalierActif(dernier, PALIER_AMIABLE_MAX, paliersActifs);
  if (palier <= 0) return { due: null, motifBlocage: 'palier_desactive' };

  // Cadence : le tout premier palier part dès que le client est en retard ; les
  // suivants attendent le délai configuré depuis la dernière relance.
  if (dernier >= 1) {
    const derniereDate = derniereDateRelance(client.actions);
    if (derniereDate) {
      const joursEcoules = (now.getTime() - derniereDate.getTime()) / 86_400_000;
      if (joursEcoules < joursEntrePaliers(dernier, palier, config)) {
        return { due: null, motifBlocage: 'espacement' };
      }
    }
  }

  return { due: { clientId: client.id, nom: client.nom, palier, joursRetard: clientJoursRetard(client) } };
}

// Liste des relances dues pour un lot de clients, à un instant donné.
export function relancesDues(
  clients: ClientRelance[],
  config: PalierConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
  paliersActifs?: Set<number>,
): RelanceDue[] {
  return clients
    .map((c) => evaluerRelance(c, config, now, paliersActifs))
    .map((e) => e.due)
    .filter((d): d is RelanceDue => d !== null);
}

// §5.2 : fenêtre d'envoi — jours ouvrés, plage horaire locale (défaut 8h–19h,
// heure de Dakar, cf. §1.6). Un ordonnanceur ne déclenche d'envoi réel que si
// cette fenêtre est ouverte ; hors fenêtre, les relances dues attendent.
export interface FenetreEnvoi {
  heureDebut?: number;
  heureFin?: number;
  joursOuvresSeulement?: boolean;
}

// Heure et jour de la semaine à Dakar (UTC+0, sans heure d'été), quel que soit
// le fuseau du serveur.
function murDakar(now: Date): { heure: number; jour: number } {
  const dakar = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Dakar' }));
  return { heure: dakar.getHours(), jour: dakar.getDay() }; // jour : 0 = dimanche … 6 = samedi
}

export function dansFenetreEnvoi(now: Date, f: FenetreEnvoi = {}): boolean {
  const { heureDebut = 8, heureFin = 19, joursOuvresSeulement = true } = f;
  const { heure, jour } = murDakar(now);
  if (joursOuvresSeulement && (jour === 0 || jour === 6)) return false;
  return heure >= heureDebut && heure < heureFin;
}
