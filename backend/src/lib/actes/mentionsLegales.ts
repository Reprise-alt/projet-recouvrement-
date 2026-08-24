// =====================================================================
// Mentions légales des sociétés créancières (entête du commandement société)
// ---------------------------------------------------------------------
// Valeurs officielles tirées des RCCM / NINEA fournis par le client. Servent
// à PRÉ-REMPLIR l'entête du commandement « étape 1 » : le formulaire reste
// éditable (une valeur saisie prime toujours). SIS n'a pas encore de mentions
// — laissé vide volontairement, l'utilisateur saisira à la main.
// Clé = code d'entité (Client.entite / Entreprise.code).
// =====================================================================
import { LOGOS_PNG_BASE64 } from './logosData';

export interface MentionsLegales {
  nom?: string; // optionnel : SIS n'a pas encore ses mentions -> repli sur le code d'entité
  formeJuridique?: string;
  adresse?: string;
  rccm?: string;
  ninea?: string;
  tel?: string;
  email?: string;
  signataireNom?: string; // signataire par défaut du commandement société
  signataireQualite?: string;
}

// Signataire par défaut commun aux trois sociétés (le représentant qui signe le
// commandement « étape 1 »).
const SIGNATAIRE = { signataireNom: 'Florian BAUDOIN', signataireQualite: 'Co-actionnaire, Président', tel: '+221 77 099 89 52' };

export const MENTIONS_LEGALES: Record<string, MentionsLegales> = {
  SORAM: {
    nom: 'SORAM OUEST AFRICA',
    formeJuridique: 'Société par Actions Simplifiée Unipersonnelle (SASU) au capital de 3 500 000 FCFA',
    adresse: 'Cité Urbanisme, Ouakam, n° 35, Dakar (Sénégal)',
    rccm: 'SN-DKR-2015-B-14769',
    ninea: '005578804',
    email: 'f.baudoin@soram-afrique.com',
    ...SIGNATAIRE,
  },
  IRIS: {
    nom: 'IRIS AFRIQUE',
    formeJuridique: 'Société à Responsabilité Limitée (SARL) au capital de 500 000 FCFA',
    adresse: 'Almadies, Lot A1, Dakar (Sénégal)',
    rccm: 'SN-DKR-2020-B-13445',
    ninea: '007914931',
    email: 'f.baudoin@iris-afrique.com',
    ...SIGNATAIRE,
  },
  // SIS : mentions société non encore fournies (RCCM/NINEA/adresse vides) —
  // seul le signataire par défaut est connu.
  SIS: {
    ...SIGNATAIRE,
  },
};

// Mentions connues pour une entité (undefined si non renseignée, ex. SIS).
export function mentionsLegales(code?: string | null): MentionsLegales | undefined {
  if (!code) return undefined;
  return MENTIONS_LEGALES[code.toUpperCase()];
}

// Logo PNG (Buffer) de l'entité pour l'entête, ou undefined si absent.
export function logoEntite(code?: string | null): Buffer | undefined {
  if (!code) return undefined;
  const b64 = LOGOS_PNG_BASE64[code.toUpperCase()];
  return b64 ? Buffer.from(b64, 'base64') : undefined;
}
