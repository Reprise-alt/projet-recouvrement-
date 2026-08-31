// Code d'entité géré par la table Entreprise (dynamique, plus un type figé) —
// voir src/lib/entites.ts.
export type EntiteImport = string;

export interface ParsedFacture {
  numero: string;
  montant: number;
  montantHT?: number;
  dateFacture?: string;
  dateEcheance: string;
  statut: 'impayee' | 'payee';
  datePaiement?: string;
  modePaiement?: string;
  numPiece?: string;
  remisSur?: string;
  designation?: string;
  commercial?: string;
  traitePar?: string;
  etatFactures?: string;
  dateDepot?: string;
}

export interface ParsedContrat {
  numero: string;
  type?: string;
  dateDebut: string;
  dateFin: string;
  tacite: boolean;
  dateRevisionTarif?: string | null;
  tauxAugmentation?: number | null;
  typeAugmentation?: 'sans_notification' | 'sur_notification' | null;
  statutSource?: string;
  commentaire?: string;
}

export interface ParsedClient {
  nom: string;
  entite: EntiteImport;
  contact?: string;
  email?: string;
  tel?: string;
  factures: ParsedFacture[];
  contrats: ParsedContrat[];
}
