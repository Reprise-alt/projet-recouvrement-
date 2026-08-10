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

export type RoleOperations = 'directrice_operations' | 'charge_compte' | 'direction_generale';

export interface CurrentUser {
  id: string;
  nom: string;
  email: string;
  role: RoleUtilisateur;
  entite: Entite | null;
  estAgentRecouvrement: boolean;
  accesRecouvrement: boolean;
  roleOperations: RoleOperations | null;
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
  montantActuel: number | null;
  tauxAugmentation: number | null;
  dateDerniereRevision: string | null;
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
  montantApresRevision: number | null;
  prochaineRevision: string | null;
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
export type MotifReport =
  | 'client_absent'
  | 'adresse_introuvable'
  | 'document_non_pret'
  | 'trafic_panne'
  | 'bureau_ferme'
  | 'manque_de_temps'
  | 'hors_periode'
  | 'condition_climatique'
  | 'conges_collaborateur'
  | 'panne_vehicule'
  | 'greve'
  | 'rdv_annule'
  | 'surcharge_activite'
  | 'autre';

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
  intervalleMois: number;
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
  motifReport: MotifReport | null;
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
  autresCoursiers: { id: string; nom: string }[];
}

// Écran de salle : accès public par lien partagé (cf. sallePublic.ts) --
// jamais le token personnel d'un coursier, seulement id+nom, sans quoi ce
// lien partagé donnerait accès au lien de chaque coursier individuel.
export interface CoursierPublicInfo {
  id: string;
  nom: string;
}

export interface TacheCoursierSalle extends Omit<TacheCoursier, 'coursier'> {
  coursier: CoursierPublicInfo | null;
}

// Écran de salle : planning complet du jour (tous coursiers, y compris non
// assigné) + la liste des coursiers actifs pour le sélecteur d'assignation.
export interface SalleTachesResponse {
  taches: TacheCoursierSalle[];
  coursiers: CoursierPublicInfo[];
}

// ============================================================================
// Module Opérations -- suivi relationnel du portefeuille (SORAM/IRIS),
// volontairement sans aucun champ financier (cf. cahier des charges §1/§7).
// ============================================================================

export type Secteur =
  | 'education'
  | 'administration'
  | 'sante'
  | 'hotellerie'
  | 'distribution'
  | 'agro'
  | 'btp'
  | 'banque'
  | 'telecom'
  | 'industrie'
  | 'logistique'
  | 'maritime'
  | 'utilities'
  | 'mines'
  | 'ong'
  | 'it'
  | 'services'
  | 'autre';

export type Criticite = 'A' | 'B' | 'C';
export type Climat = 'vert' | 'orange' | 'rouge';
export type GraviteProbleme = 'gene' | 'bloquant';
export type MotifResiliation = 'prix' | 'qualite' | 'suivi' | 'litige' | 'ao' | 'perimetre' | 'internal' | 'cessation' | 'autre';
export type Tone = 'success' | 'amber' | 'danger';

export interface ClientOperationsIdentite {
  id: string;
  nom: string;
  entite: Entite;
  codeClient: string | null;
  contact: string | null;
  email: string | null;
  tel: string | null;
}

export interface ScoresAxes {
  contact: number;
  climat: number;
  problemes: number;
  engagements: number;
  global: number;
}

export interface ProblemeOperations {
  id: string;
  clientOperationsId: string;
  texte: string;
  gravite: GraviteProbleme;
  ouvertLe: string;
  resoluLe: string | null;
}

export interface ReleveHebdo {
  id: string;
  clientOperationsId: string;
  semaineIso: string;
  date: string;
  score: number;
  commentaire: string | null;
  action: string | null;
}

export interface EtapeDemarrageConfig {
  id: string;
  entite: Entite;
  cle: string;
  libelle: string;
  description: string | null;
  delaiJours: number;
  ordre: number;
}

export interface EtapeDemarrageFait {
  id: string;
  clientOperationsId: string;
  cle: string;
  date: string;
}

export interface DemarrageEtat {
  age: number;
  nbFaits: number;
  total: number;
  pct: number;
  restantes: EtapeDemarrageConfig[];
  retard: EtapeDemarrageConfig[];
}

export interface ClientOperationsRow {
  id: string;
  client: ClientOperationsIdentite;
  secteur: Secteur;
  criticite: Criticite;
  vip: boolean;
  chargeDeCompte: { id: string; nom: string } | null;
  dernierContact: string | null;
  climat: Climat | null;
  dernierReleve: string | null;
  releveFait: boolean;
  resilie: boolean;
  problemesOuverts: number;
  problemesBloquants: number;
  problemePlusAncienJours: number | null;
  action: string | null;
  actionEcheance: string | null;
  actionFait: boolean;
  finContrat: string | null;
  enDemarrage: boolean;
  tendance: number[];
  scores: ScoresAxes;
  tone: Tone;
}

export interface ClientOperationsDetail {
  id: string;
  clientId: string;
  secteur: Secteur;
  criticite: Criticite;
  vip: boolean;
  chargeDeCompteId: string | null;
  chargeDeCompte: { id: string; nom: string } | null;
  debutContrat: string | null;
  finContrat: string | null;
  dernierContact: string | null;
  climat: Climat | null;
  commentaire: string | null;
  action: string | null;
  actionEcheance: string | null;
  actionFait: boolean;
  demarreLe: string | null;
  demarrageCloture: boolean;
  dernierCopil: string | null;
  enjeux: string | null;
  dernierReleve: string | null;
  resilie: boolean;
  dateResiliation: string | null;
  motifResiliation: MotifResiliation | null;
  motifDetail: string | null;
  client: ClientOperationsIdentite;
  problemes: ProblemeOperations[];
  releves: ReleveHebdo[];
  etapesDemarrage: EtapeDemarrageFait[];
  etapesConfig: EtapeDemarrageConfig[];
  scores: ScoresAxes;
  tone: Tone;
  demarrage: DemarrageEtat | null;
}

export interface AlerteClient {
  niveau: 'vigilance' | 'risque';
  titre: string;
  detail: string;
  clientId: string;
  clientNom: string;
  vip: boolean;
  criticite: Criticite;
}

export interface CockpitCompteurs {
  problemesOuverts: number;
  horsRegleContact: number;
  copilDuMois: number;
  engagementsEnRetard: number;
  releveDeLaSemaine: number;
  totalPortefeuille: number;
}

export interface CockpitResponse {
  compteurs: CockpitCompteurs;
  alertes: AlerteClient[];
  demarragesEnCours: {
    id: string;
    client: ClientOperationsIdentite;
    demarreLe: string | null;
    chargeDeCompte: { id: string; nom: string } | null;
    etat: DemarrageEtat;
  }[];
}

export interface ReleveFileEntry {
  id: string;
  client: ClientOperationsIdentite;
  vip: boolean;
  criticite: Criticite;
  releveFait: boolean;
  scores: ScoresAxes;
}

export interface RevueTrimestreEntry {
  id: string;
  client: ClientOperationsIdentite;
  criticite: Criticite;
  dernierContact: string | null;
  semaineAffectee: number;
  scores: ScoresAxes;
}

export interface RevueTrimestreResponse {
  trimestre: string;
  semaine: number;
  totalSemaines: number;
  totalEligibles: number;
  totalFaits: number;
  aTraiter: RevueTrimestreEntry[];
}

export interface ConfigOperations {
  id: number;
  contactStdVigilance: number;
  contactStdRisque: number;
  contactVipVigilance: number;
  contactVipRisque: number;
  problemeVigilanceJours: number;
  problemeRisqueJours: number;
  problemeBloquantRisqueJours: number;
  demarrageRisqueRetardJours: number;
}

// Signal opérations -> recouvrement (cahier §8) -- rien de plus que ce que
// le cahier autorise à franchir la frontière entre les deux modules.
export type SignalOperations = { hasOperations: false } | { hasOperations: true; problemesOuverts: number; problemesBloquants: number; climat: Climat | null };

export interface Campagne {
  id: string;
  nom: string;
  objectif: string | null;
  secteurs: Secteur[];
  entite: string;
  echeance: string;
  creeLe: string;
  cloturee: boolean;
  ciblesCount: number;
  traitesCount: number;
}

export interface CampagneCible {
  clientOperationsId: string;
  client: ClientOperationsIdentite;
  traite: boolean;
  fait: { date: string; note: string | null } | null;
}

export interface CampagneDetail extends Campagne {
  cibles: CampagneCible[];
}

export interface CopilEntry {
  id: string;
  client: ClientOperationsIdentite;
  enjeux: string | null;
  dernierCopil: string | null;
  copilFaitCeMois: boolean;
  problemesOuverts: number;
  scores: ScoresAxes;
  tone: Tone;
}

export interface ResiliationsReport {
  compteurs: { total: number; moisCourant: number };
  histogramme12Mois: { mois: string; nombre: number }[];
  parMotif: { motif: MotifResiliation; nombre: number }[];
  liste: ClientOperationsDetail[];
}

export interface FenetreSaisonniere {
  secteur: Secteur;
  label: string;
  mois: number;
  jour: number;
  anticipationJours: number;
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

/* ---------- Parc d'impression (suivi COPIL) ---------- */

export type StatutEquipement = 'actif' | 'retire' | 'introuvable';
export type TypeIntervention = 'preventive' | 'curative';
export type UrgenceIntervention = 'urgente' | 'standard';
export type PrioriteActionCopil = 'p1' | 'p2' | 'p3';
export type StatutActionCopil = 'planifie' | 'en_cours' | 'fait' | 'bloque';

export interface EquipementParc {
  id: string;
  clientOperationsId: string;
  site: string;
  modele: string;
  numeroSerie: string;
  statut: StatutEquipement;
  dateInstallation: string | null;
}

export interface InterventionParc {
  id: string;
  clientOperationsId: string;
  equipementId: string | null;
  site: string;
  type: TypeIntervention;
  urgence: UrgenceIntervention;
  panne: string | null;
  dateDeclaration: string;
  datePriseEnCharge: string | null;
  dateCloture: string | null;
}

export interface ReleveVolumetrie {
  id: string;
  clientOperationsId: string;
  periode: string;
  copiesNB: number;
  copiesCouleur: number;
}

export interface LivraisonConsommable {
  id: string;
  clientOperationsId: string;
  date: string;
  reference: string;
  quantite: number;
}

export interface ActionCopil {
  id: string;
  clientOperationsId: string;
  priorite: PrioriteActionCopil;
  action: string;
  responsable: string | null;
  echeance: string | null;
  statut: StatutActionCopil;
}

export interface SlaStats {
  total: number;
  clotures: number;
  ouverts: number;
  tauxCloture: number;
  delaiMoyenUrgenteHeures: number | null;
  delaiMoyenStandardHeures: number | null;
  delaiMedianUrgenteHeures: number | null;
  delaiMedianStandardHeures: number | null;
  priseEnChargeMesuree: number;
}

export interface ParcSynthese {
  equipementsActifs: number;
  equipementsIntrouvables: number;
  interventionsTotal: number;
  interventionsPreventives: number;
  sla: SlaStats;
  consommablesLivres: number;
  copiesNBTotal: number;
  copiesCouleurTotal: number;
}

export interface InterventionsResponse {
  interventions: InterventionParc[];
  sla: SlaStats;
}

export interface ArtisImportResult {
  type: 'biens' | 'interventions' | 'etatvente';
  traites?: number;
  consommablesTraites?: number;
  periodesVolumetrie?: number;
  machinesTraitees?: number;
}

export interface AlerteVolumetrieMachine {
  numeroSerie: string;
  modele: string;
  site: string;
  periodeLabel: string;
  total: number;
}

export interface AlerteMachine {
  numeroSerie: string;
  modele: string;
  site: string;
  total: number;
}

export interface AlertesParcResponse {
  volumetrieMensuelle: AlerteVolumetrieMachine[];
  compteurTotal: AlerteMachine[];
  interventionsFrequentes: AlerteMachine[];
  sitesTop: { site: string; total: number }[];
}
