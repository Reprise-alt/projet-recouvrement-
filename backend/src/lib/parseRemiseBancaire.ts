// Analyse d'un avis bancaire (email) : remise de chèque, avis de virement,
// remise d'espèce. Fonctions PURES (aucun accès réseau/DB) → testables seules.
//
// La banque ne fournit pas toujours l'émetteur (cas SGSN pour les chèques) : on
// extrait alors au moins le montant et les dates, ce qui suffit au
// pré-rapprochement par montant. Quand l'émetteur/donneur d'ordre est présent
// (souvent pour les virements), on le remonte pour un rapprochement plus précis.

export type TypeAvis = 'cheque' | 'virement' | 'espece';

export interface AvisBancaire {
  type: TypeAvis;
  montant: number; // FCFA, entier
  banque: string | null;
  dateOperation: Date | null;
  echeance: Date | null;
  agence: string | null;
  emetteur: string | null; // tireur / donneur d'ordre, si la banque le donne
}

// Banque déduite du domaine de l'expéditeur (liste extensible).
const BANQUES: { motif: RegExp; nom: string }[] = [
  { motif: /socgen|sgsn|societegenerale/i, nom: 'Société Générale' },
  { motif: /cbao|attijari/i, nom: 'CBAO' },
  { motif: /boa|bankofafrica/i, nom: 'Bank of Africa' },
  { motif: /ecobank/i, nom: 'Ecobank' },
  { motif: /uba/i, nom: 'UBA' },
  { motif: /bicis/i, nom: 'BICIS' },
];
export function banqueDepuisExpediteur(from: string): string | null {
  return BANQUES.find((b) => b.motif.test(from))?.nom ?? null;
}

// Détecte la nature de l'avis à partir du sujet et du corps.
//
// Formats réels SGSN (vérifiés sur la boîte IRIS) :
//  • Chèque   → sujet « [SGSN - Confirmation Remise cheque] », corps « Montant : … ».
//  • Virement → sujet « … réception de votre virement … », corps « … crédité sur votre compte … ».
//  • Espèces  → sujet « BORDEREAU DE Versement … », corps générique « une opération a été
//               effectuée … pour un montant de … XOF » (PJ « VersementEspeces »).
//
// PRUDENCE : on ne compte QUE les entrées d'argent. Le versement d'espèces a un
// corps générique (ne dit pas crédit/débit) → on ne le reconnaît que par le sujet
// « versement / bordereau ». Le virement n'est reconnu que s'il porte un signal de
// crédit/réception, pour ne jamais prendre un virement ÉMIS (sortie) pour un
// encaissement. On évite le mot « caisse » seul (présent dans « en-caisse-ment »
// des avis de chèque).
export function detecterType(sujet: string, texte: string): TypeAvis | null {
  const s = `${sujet}\n${texte}`.toLowerCase();
  if (/esp[eè]ce|bordereau|versement/.test(s)) return 'espece';
  const signalCredit = /cr[eé]dit[eé]?|re[çc]u|r[eé]ception|en votre faveur|avis de cr[eé]dit/.test(s);
  if (/virement/.test(s) && signalCredit) return 'virement';
  if (/avis de cr[eé]dit/.test(s)) return 'virement';
  if (/ch[eè]que/.test(s)) return 'cheque';
  return null;
}

// Normalise un montant textuel (« 466 100 », « 1.250.000 », « 466 100,00 »)
// en entier FCFA. Renvoie NaN si rien d'exploitable.
export function normaliserMontant(brut: string): number {
  const sansEspaces = brut.replace(/[\s ]/g, '');
  const sansDecimales = sansEspaces.replace(/[.,]\d{1,2}$/, ''); // retire ,00 / .00
  const chiffres = sansDecimales.replace(/[.,]/g, ''); // retire séparateurs de milliers
  return chiffres ? parseInt(chiffres, 10) : NaN;
}

// Extrait le montant qui suit un libellé « Montant … : 466 100 ».
export function extraireMontant(texte: string): number | null {
  const m = texte.match(/montant[^:\d]*:?\s*([0-9][0-9\s., ]*[0-9]|[0-9])/i);
  if (!m) return null;
  const val = normaliserMontant(m[1]);
  return Number.isFinite(val) && val > 0 ? val : null;
}

// Parse une date « 9/23/2026 » ou « 23/09/2026 » : le composant > 12 est le
// jour (SGSN utilise le format US M/D/YYYY). Date figée à midi UTC (Dakar=UTC).
export function parseDate(brut: string): Date | null {
  const m = brut.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return null;
  let a = parseInt(m[1], 10);
  let b = parseInt(m[2], 10);
  let annee = parseInt(m[3], 10);
  if (annee < 100) annee += 2000;
  let jour: number;
  let mois: number;
  if (a > 12) { jour = a; mois = b; } // 23/09 → jour 23
  else if (b > 12) { mois = a; jour = b; } // 9/23 → mois 9, jour 23
  else { mois = a; jour = b; } // ambigu : on suppose M/D (format de l'avis SGSN)
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  return new Date(Date.UTC(annee, mois - 1, jour, 12, 0, 0));
}

// Extrait la première date qui suit l'un des libellés donnés.
function extraireDate(texte: string, libelles: string[]): Date | null {
  for (const lib of libelles) {
    const re = new RegExp(`${lib}[^\\d]*(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4})`, 'i');
    const m = texte.match(re);
    if (m) {
      const d = parseDate(m[1]);
      if (d) return d;
    }
  }
  return null;
}

function extraireTexteApres(texte: string, libelles: string[]): string | null {
  for (const lib of libelles) {
    const re = new RegExp(`${lib}\\s*:?\\s*([^\\n\\r]{2,80})`, 'i');
    const m = texte.match(re);
    if (m) {
      const v = m[1].trim().replace(/\s+/g, ' ');
      if (v) return v;
    }
  }
  return null;
}

// Point d'entrée : parse un email bancaire. Renvoie null si ce n'est pas un avis
// exploitable (pas de type reconnu, ou pas de montant).
export function parseAvisBancaire(from: string, sujet: string, texte: string): AvisBancaire | null {
  const type = detecterType(sujet, texte);
  if (!type) return null;
  const montant = extraireMontant(texte);
  if (!montant) return null;
  return {
    type,
    montant,
    banque: banqueDepuisExpediteur(from),
    dateOperation: extraireDate(texte, ['date de la remise', 'date de remise', "date de l'op[eé]ration", 'date de valeur', 'date']),
    echeance: extraireDate(texte, ['[eé]ch[eé]ance']),
    agence: extraireTexteApres(texte, ["agence de d[eé]p[oô]t", 'agence']),
    // Donneur d'ordre / émetteur (souvent présent pour un virement, absent pour un chèque).
    emetteur: extraireTexteApres(texte, ["donneur d'ordre", '[eé]metteur', 'ordonnateur', 'de la part de']),
  };
}
