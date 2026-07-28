import { ParsedContrat, ParsedFacture } from './parsers/types';

// ---------------------------------------------------------------------------
// Règle de fusion critique (cahier des charges §8) : l'import (Excel manuel
// aujourd'hui, sync ARTIS/MAPON demain) doit fusionner facture par facture
// (clé = numéro de facture) et contrat par contrat (clé = numéro de contrat),
// JAMAIS remplacer en bloc les factures/contrats d'un client. Une facture déjà
// marquée payée ne doit jamais repasser impayée suite à un import, même si la
// source externe est restée figée sur une ancienne version. Les contacts
// renseignés à la main et l'historique des envois de courriers ne sont
// jamais écrasés par un import.
//
// Ces fonctions sont pures (aucun accès DB) pour rester testables sans base ;
// l'application des plans qu'elles produisent se fait au niveau service.
// ---------------------------------------------------------------------------

export interface ExistingFacture {
  id: string;
  numero: string;
  statut: 'impayee' | 'payee';
  datePaiement: string | Date | null;
}

export interface FactureUpdate {
  id: string;
  data: ParsedFacture;
}

export interface FactureMergePlan {
  toCreate: ParsedFacture[];
  toUpdate: FactureUpdate[];
}

export function planFactureMerge(existing: ExistingFacture[], imported: ParsedFacture[]): FactureMergePlan {
  const byNumero = new Map(existing.map((f) => [f.numero, f]));
  const toCreate: ParsedFacture[] = [];
  const toUpdate: FactureUpdate[] = [];

  imported.forEach((nf) => {
    const cur = byNumero.get(nf.numero);
    if (!cur) {
      toCreate.push(nf);
      return;
    }
    const data: ParsedFacture = { ...nf };
    if (cur.statut === 'payee') {
      data.statut = 'payee';
      data.datePaiement = (cur.datePaiement as string) || data.datePaiement;
    }
    toUpdate.push({ id: cur.id, data });
  });

  return { toCreate, toUpdate };
}

export interface ExistingContrat {
  id: string;
  numero: string;
}

export interface ContratUpdate {
  id: string;
  data: ParsedContrat;
}

export interface ContratMergePlan {
  toCreate: ParsedContrat[];
  toUpdate: ContratUpdate[];
}

export function planContratMerge(existing: ExistingContrat[], imported: ParsedContrat[]): ContratMergePlan {
  const byNumero = new Map(existing.map((c) => [c.numero, c]));
  const toCreate: ParsedContrat[] = [];
  const toUpdate: ContratUpdate[] = [];

  imported.forEach((nc) => {
    const cur = byNumero.get(nc.numero);
    if (!cur) {
      toCreate.push(nc);
      return;
    }
    // L'historique des envois (table EnvoiContrat) n'est jamais touché ici :
    // seuls les champs descriptifs du contrat sont mis à jour.
    toUpdate.push({ id: cur.id, data: nc });
  });

  return { toCreate, toUpdate };
}

export interface ExistingContact {
  contact?: string | null;
  email?: string | null;
  tel?: string | null;
}

export interface ContactPatch {
  contact?: string;
  email?: string;
  tel?: string;
}

// Ne renseigne que les champs de contact actuellement vides — un contact
// saisi à la main n'est jamais écrasé par une valeur importée.
export function planContactMerge(existing: ExistingContact, imported: ExistingContact): ContactPatch {
  const patch: ContactPatch = {};
  if (!existing.contact && imported.contact) patch.contact = imported.contact;
  if (!existing.email && imported.email) patch.email = imported.email;
  if (!existing.tel && imported.tel) patch.tel = imported.tel;
  return patch;
}
