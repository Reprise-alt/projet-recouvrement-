// Moteur de relances automatiques (addendum §5) — cœur déterministe du Lot 2
// « les relances partent seules ». Ce module NE DÉCIDE QUE : pour un lot de
// clients à un instant donné, quelles relances doivent partir maintenant, en
// appliquant les règles d'arrêt du §5.2. Il n'envoie rien et ne planifie rien
// (le canal d'envoi et l'ordonnanceur sont des couches séparées) — ce qui le
// rend pur et testable.
import {
  ClientWithFactures,
  DEFAULT_CONFIG,
  PalierConfig,
  clientJoursRetard,
  clientPalier,
} from './paliers';

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
}

// Pourquoi une relance NE part pas (utile pour l'aperçu / le débogage).
export type MotifBlocage = 'a_jour' | 'deja_relance' | 'promesse_en_cours' | 'litige' | 'opposition';

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

// Décision pour un client : relance due (et à quel palier) ou motif de blocage.
export function evaluerRelance(
  client: ClientRelance,
  config: PalierConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): EvaluationRelance {
  const palier = clientPalier(client, config);
  if (palier <= 0) return { due: null, motifBlocage: 'a_jour' };
  // Ordre volontaire : opposition et litige priment sur tout (§5.2).
  if (client.opposition) return { due: null, motifBlocage: 'opposition' };
  if (client.enLitige) return { due: null, motifBlocage: 'litige' };
  if (promesseEnCours(client.echeanciers, now)) return { due: null, motifBlocage: 'promesse_en_cours' };
  if (dejaRelanceCePalier(client.actions, palier)) return { due: null, motifBlocage: 'deja_relance' };
  return { due: { clientId: client.id, nom: client.nom, palier, joursRetard: clientJoursRetard(client) } };
}

// Liste des relances dues pour un lot de clients, à un instant donné.
export function relancesDues(
  clients: ClientRelance[],
  config: PalierConfig = DEFAULT_CONFIG,
  now: Date = new Date(),
): RelanceDue[] {
  return clients
    .map((c) => evaluerRelance(c, config, now))
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
