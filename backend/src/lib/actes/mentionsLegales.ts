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
  nom: string;
  formeJuridique?: string;
  adresse?: string;
  rccm?: string;
  ninea?: string;
  tel?: string;
  email?: string;
}

export const MENTIONS_LEGALES: Record<string, MentionsLegales> = {
  SORAM: {
    nom: 'SORAM OUEST AFRICA',
    formeJuridique: 'Société par Actions Simplifiée Unipersonnelle (SASU) au capital de 3 500 000 FCFA',
    adresse: 'Cité Urbanisme, Ouakam, n° 35, Dakar (Sénégal)',
    rccm: 'SN-DKR-2015-B-14769',
    ninea: '005578804',
  },
  IRIS: {
    nom: 'IRIS AFRIQUE',
    formeJuridique: 'Société à Responsabilité Limitée (SARL) au capital de 500 000 FCFA',
    adresse: 'Almadies, Lot A1, Dakar (Sénégal)',
    rccm: 'SN-DKR-2020-B-13445',
    ninea: '007914931',
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
