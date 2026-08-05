// Code d'entité géré dynamiquement via /api/entreprises (plus un type figé) —
// une chaîne quelconque, validée côté serveur contre la table Entreprise.
export type Entite = string;
export type RoleUtilisateur = 'admin' | 'manager_entite' | 'comptable';
export type FrequenceFacturation = 'mensuelle' | 'trimestrielle' | 'annuelle';

export interface Entreprise {
  id: string;
  code: string;
  nom: string;
  estCommun: boolean;
  actif: boolean;
}

export interface CurrentUser {
  id: string;
  nom: string;
  email: string;
  role: RoleUtilisateur;
  entite: Entite | null;
  estAgentRecouvrement: boolean;
  derniereConnexion?: string | null;
}

export interface DerniereAction {
  label: string;
  date: string;
  palier: number;
}

export interface ContactSummary {
  id: string;
  nom: string;
  fonction: string | null;
  email: string | null;
  tel: string | null;
}

export interface ClientListItem {
  id: string;
  nom: string;
  entite: Entite;
  contact: string | null;
  email: string | null;
  tel: string | null;
  note: string | null;
  prochaineRelance: string | null;
  frequenceFacturation: FrequenceFacturation;
  contacts: ContactSummary[];
  encours: number;
  joursRetard: number;
  palier: number;
  retardInhabituel: boolean;
  echeanceLaPlusAncienne: string | null;
  derniereAction: DerniereAction | null;
}

export interface Contact {
  id: string;
  clientId: string;
  nom: string;
  fonction: string | null;
  email: string | null;
  tel: string | null;
}

export interface Facture {
  id: string;
  clientId: string;
  numero: string;
  montant: number;
  montantHT: number | null;
  dateFacture: string | null;
  dateEcheance: string;
  statut: 'impayee' | 'payee';
  datePaiement: string | null;
  designation: string | null;
  commercial: string | null;
  modePaiement: string | null;
}

export interface EnvoiContrat {
  id: string;
  contratId: string;
  date: string;
  label: string;
  destinataire: string | null;
  sujet: string | null;
  corps: string | null;
}

export interface Contrat {
  id: string;
  clientId: string;
  numero: string;
  type: string | null;
  dateDebut: string;
  dateFin: string;
  tacite: boolean;
  dateRevisionTarif: string | null;
  statutSource: string | null;
  commentaire: string | null;
  envois: EnvoiContrat[];
}

export interface ActionRecouvrement {
  id: string;
  clientId: string;
  date: string;
  palier: number;
  label: string;
  note: string | null;
}

export interface TranchePaiement {
  id: string;
  echeancierId: string;
  ordre: number;
  dateEcheance: string;
  montant: number;
  statut: 'impayee' | 'payee';
  datePaiement: string | null;
}

export interface EcheancierPaiement {
  id: string;
  clientId: string;
  montantTotal: number;
  motif: string | null;
  createdAt: string;
  tranches: TranchePaiement[];
}

export interface ClientDetail {
  id: string;
  nom: string;
  entite: Entite;
  contact: string | null;
  email: string | null;
  tel: string | null;
  note: string | null;
  prochaineRelance: string | null;
  frequenceFacturation: FrequenceFacturation;
  factures: Facture[];
  contrats: Contrat[];
  actions: ActionRecouvrement[];
  contacts: Contact[];
  echeanciers: EcheancierPaiement[];
  encours: number;
  joursRetard: number;
  palier: number;
  retardInhabituel: boolean;
  delaiMoyenHistorique: number | null;
}

export interface Repartition {
  total: number;
  dansLesClous: number;
  arretService: number;
  litige: number;
}

export interface RecouvrementKpis {
  totalEncours: number;
  enRetard: number;
  contentieux: number;
  lettresAEnvoyer: number;
  retardsInhabituels: number;
  ladder: Record<number, number>;
  repartition: Repartition;
  config: PalierConfig;
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

export interface RelanceDetail {
  id: string;
  date: string;
  note: string | null;
  clientId: string;
  clientNom: string;
  entite: string;
}

export interface AgentStat {
  utilisateurId: string;
  nom: string;
  actions: number;
  delaiMoyenApresIntervention: number | null;
  nombreDelaisMesures: number;
  montantRecouvre: number;
  nombreFactures: number;
}

export interface ReportingSummary {
  from: string;
  to: string;
  facturesPayees: { nombre: number; montantTotal: number };
  relances: PalierCount[];
  delaiEncaissement: { global: number | null; parEntite: DelaiParEntite[] };
  evolutionMensuelle: EvolutionMoisEntry[];
}

export interface AnalyseResult {
  pointsForts: string[];
  actionsPositives: string[];
  pointsVigilance: string[];
  axesAmelioration: string[];
  recommandations: string[];
}

export interface Delta {
  absolu: number;
  pourcent: number | null;
}

export interface ComparaisonPeriode {
  label: string;
  summary: ReportingSummary;
  relancesTotal: number;
}

export interface ComparaisonResult {
  periodeA: ComparaisonPeriode;
  periodeB: ComparaisonPeriode;
  deltas: {
    montantEncaisse: Delta;
    facturesPayees: Delta;
    delaiMoyen: Delta | null;
    relancesTotal: Delta;
  };
}

export interface PalierConfig {
  j1: number;
  j2: number;
  j3: number;
  j4: number;
  j5: number;
  j6: number;
  j7: number;
}

export interface ContractRow {
  contratId: string;
  clientId: string;
  clientNom: string;
  entite: Entite;
  numero: string;
  type: string | null;
  tacite: boolean;
  echeanceType: 'revision_tarif' | 'renouvellement';
  echeanceDate: string;
  joursRestants: number;
  alertLevel: number;
}

export interface ContractDetail extends Contrat {
  client: { id: string; nom: string; entite: Entite; contact: string | null; email: string | null };
  echeance: { type: 'revision_tarif' | 'renouvellement'; date: string; jours: number };
  alertLevel: number;
}

export interface ContractsKpis {
  sous90: number;
  echus: number;
  envoisEnvoyes: number;
  contratsSuivis: number;
}

export interface ContractDoc {
  subject: string;
  body: string;
}

export interface GmailStatus {
  entite: string;
  connected: boolean;
  compteEmail: string | null;
  derniereSync: string | null;
}

export type SendEmailContext = { type: 'client_letter'; clientId: string; palier: number } | { type: 'contract_doc'; contratId: string };

export type TypeTacheCoursier =
  | 'releve_compteur'
  | 'depot_facture'
  | 'depot_courrier'
  | 'recuperation_reglement'
  | 'depot_banque'
  | 'livraison_toner'
  | 'livraison_bac_recuperation'
  | 'autre';

export type StatutTacheCoursier = 'a_faire' | 'faite' | 'annulee';
export type ModePaiementCollecte = 'cheque' | 'espece' | 'autre';

export interface Coursier {
  id: string;
  nom: string;
  token: string;
  actif: boolean;
  createdAt: string;
}

export interface TacheCoursierModele {
  id: string;
  clientId: string;
  type: TypeTacheCoursier;
  label: string | null;
  jourDuMois: number;
  actif: boolean;
  client: { id: string; nom: string; entite: Entite };
}

export interface TacheCoursier {
  id: string;
  entite: Entite;
  clientId: string | null;
  type: TypeTacheCoursier;
  label: string | null;
  date: string;
  dateInitiale: string;
  statut: StatutTacheCoursier;
  coursierId: string | null;
  modeleId: string | null;
  montant: number | null;
  modePaiement: ModePaiementCollecte | null;
  note: string | null;
  dateExecution: string | null;
  client: { id: string; nom: string; entite: Entite } | null;
  coursier: Coursier | null;
}

export interface ResumeJournee {
  total: number;
  faites: number;
  reportees: number;
  aFaire: number;
  annulees: number;
}

export interface TachesJourResponse {
  taches: TacheCoursier[];
  resume: ResumeJournee;
}

export interface DecompteStatuts {
  total: number;
  faites: number;
  reportees: number;
  aFaire: number;
  annulees: number;
}

export interface PlanningRapportResponse {
  parJour: (DecompteStatuts & { date: string })[];
  parCoursier: (DecompteStatuts & { coursierId: string | null; nom: string })[];
  reporteesParEntite: { entite: Entite; nombre: number }[];
  reporteesTotal: number;
  global: DecompteStatuts;
}

// Vue publique (lien personnel coursier, sans authentification) -- un
// sous-ensemble volontairement réduit du client complet.
export interface TacheCoursierPublic extends Omit<TacheCoursier, 'client' | 'coursier'> {
  client: { id: string; nom: string; tel: string | null; entite: Entite } | null;
}

export interface CoursierTachesPubliques {
  coursier: { nom: string };
  taches: TacheCoursierPublic[];
}

// Écran de salle : planning complet du jour (tous coursiers, y compris non
// assigné) + la liste des coursiers actifs pour le sélecteur d'assignation.
export interface SalleTachesResponse {
  taches: TacheCoursier[];
  coursiers: Coursier[];
}

export interface ImportSummary {
  message: string;
  summary: {
    clientsCreated: number;
    clientsUpdated: number;
    facturesCreated: number;
    facturesUpdated: number;
    contratsCreated: number;
    contratsUpdated: number;
  };
  clientsCount: number;
}
