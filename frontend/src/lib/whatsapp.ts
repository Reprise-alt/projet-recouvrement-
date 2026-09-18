import { fmtFCFA } from './constants';

// Construit un lien wa.me (WhatsApp) à partir d'un numéro éventuellement local
// et d'un texte pré-rempli. wa.me exige l'indicatif pays, sans « + » ni espaces.
// On ne « corrige » que le cas local Sénégal courant (mobile à 9 chiffres, 7X…) ;
// tout numéro déjà international est laissé tel quel (l'agent voit la cible à
// l'ouverture de WhatsApp et peut rectifier). Renvoie null si pas de numéro.
export function lienWhatsApp(tel: string | null | undefined, texte: string, indicatifDefaut = '221'): string | null {
  if (!tel) return null;
  let d = tel.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('7')) d = indicatifDefaut + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texte)}`;
}

// Message de relance court et courtois, pré-rempli pour un envoi manuel rapide
// par WhatsApp (l'agent peut l'ajuster dans WhatsApp avant d'envoyer). Sans le
// détail des factures : c'est un rappel amiable, pas la lettre formelle.
export function messageRelanceWhatsApp(params: { entreprise?: string | null; encours: number }): string {
  const ent = (params.entreprise ?? '').trim();
  return [
    'Bonjour,',
    '',
    `Sauf erreur de notre part, votre compte présente un solde impayé de ${fmtFCFA(params.encours)}.`,
    'Nous vous remercions de bien vouloir procéder à sa régularisation dans les meilleurs délais.',
    '',
    ent ? `Cordialement,\n${ent}` : 'Cordialement',
  ].join('\n');
}
