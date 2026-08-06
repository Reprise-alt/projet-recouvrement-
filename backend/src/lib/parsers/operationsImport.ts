import * as XLSX from 'xlsx';
import { parseContractTrackingWorkbook } from './contractTracking';
import { DEFAULT_KNOWN_ENTITES, KnownEntite } from './entiteMatch';

export interface OperationsImportRow {
  nom: string;
  entite: string;
  debutContrat: string | null;
  finContrat: string | null;
}

// Réutilise le parseur "suivi de contrats" existant (mêmes fichiers SORAM/IRIS
// "Suivi Contrats" que le recouvrement) plutôt que d'en écrire un nouveau --
// il sait déjà regrouper plusieurs lignes de contrat (Leasing, Logiciel...)
// sous un même client. Pour Opérations, on ne garde que l'identité et
// l'étendue de la relation contractuelle (début le plus ancien, fin la plus
// tardive) -- secteur et criticité n'existent pas dans ce type de fichier et
// restent à classer ensuite depuis le Portefeuille.
export function parseOperationsImportWorkbook(wb: XLSX.WorkBook, knownEntites: KnownEntite[] = DEFAULT_KNOWN_ENTITES): OperationsImportRow[] {
  const { clients } = parseContractTrackingWorkbook(wb, knownEntites);
  return clients.map((c) => {
    const debuts = c.contrats.map((k) => k.dateDebut).filter(Boolean).sort();
    const fins = c.contrats.map((k) => k.dateFin).filter(Boolean).sort();
    return {
      nom: c.nom,
      entite: c.entite,
      debutContrat: debuts[0] ?? null,
      finContrat: fins.length ? fins[fins.length - 1] : null,
    };
  });
}
