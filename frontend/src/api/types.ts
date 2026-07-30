// Code d'entité géré dynamiquement via /api/entreprises (plus un type figé) —
// une chaîne quelconque, validée côté serveur contre la table Entreprise.
export type Entite = string;
export type RoleUtilisateur = 'admin' | 'manager_entite' | 'comptable';

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
}

export interface DerniereAction {
  label: string;
  date: string;
  palier: number;
}

export interface ClientListItem {
  id: string;
  nom: string;
  entite: Entite;
  contact: string | null;
  email: string | null;
  tel: string | null;
  note: string | null;
  encours: number;
  joursRetard: number;
  palier: number;
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

export interface ClientDetail {
  id: string;
  nom: string;
  entite: Entite;
  contact: string | null;
  email: string | null;
  tel: string | null;
  note: string | null;
  factures: Facture[];
  contrats: Contrat[];
  actions: ActionRecouvrement[];
  contacts: Contact[];
  encours: number;
  joursRetard: number;
  palier: number;
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
  ladder: Record<number, number>;
  repartition: Repartition;
  config: PalierConfig;
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
  connected: boolean;
  compteEmail: string | null;
  derniereSync: string | null;
}

export type SendEmailContext = { type: 'client_letter'; clientId: string; palier: number } | { type: 'contract_doc'; contratId: string };

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
