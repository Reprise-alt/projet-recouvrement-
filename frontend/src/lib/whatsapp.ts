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

// Mot BIENVEILLANT hors-palier : pour un bon payeur en retard inhabituel. Ton
// chaleureux qui valorise sa régularité et invite en douceur à régulariser —
// tout l'inverse d'une relance ferme. Pré-rempli, éditable avant envoi.
export function messageMotBienveillant(params: {
  contact?: string | null;
  factureNumero?: string | null;
  montant?: number | null;
  joursRetard: number;
  dateLimite?: string | null; // jj/mm/aaaa
  entreprise?: string | null; // signature (nom de la société qui envoie)
  coordonnees?: string | null; // contact recouvrement (email/tél) sous la signature
  lienPaiement?: string | null; // lien de règlement en un clic (WhatsApp + email)
}): string {
  const bonjour = params.contact && params.contact.trim() ? `Bonjour ${params.contact.trim()},` : 'Bonjour,';
  const facture = params.factureNumero
    ? `la facture ${params.factureNumero}${params.montant != null ? ` (${fmtFCFA(params.montant)})` : ''}`
    : `votre règlement en cours${params.montant != null ? ` (${fmtFCFA(params.montant)})` : ''}`;
  const cloture = params.dateLimite
    ? `Si tout est déjà en route de votre côté, n’en tenez pas compte 🙂. Sinon, un règlement d’ici le ${params.dateLimite} nous arrangerait.`
    : 'Si tout est déjà en route de votre côté, n’en tenez pas compte 🙂. Sinon, un règlement dans les prochains jours nous arrangerait.';
  const lien = params.lienPaiement?.trim() || null;
  const ent = params.entreprise?.trim() || null;
  const coord = params.coordonnees?.trim() || null;
  return [
    bonjour,
    '',
    'Un petit mot, simplement pour vous remercier 🙏 Depuis le temps que nous travaillons ensemble, vos règlements sont d’une régularité qu’on aimerait à tous nos partenaires — on le remarque, et on l’apprécie sincèrement.',
    '',
    `C’est justement pour ça qu’on se permet ce message : ${facture} accuse ce mois-ci un retard un peu inhabituel de ${params.joursRetard} jours par rapport à vos habitudes. Rien d’alarmant — un simple oubli est vite arrivé, et on a préféré un rappel amical plutôt qu’une relance formelle.`,
    '',
    cloture,
    ...(lien ? ['', `💳 Pour régler en un clic : ${lien}`] : []),
    '',
    'Merci encore pour votre confiance et votre sérieux. Au plaisir de continuer longtemps ensemble !',
    '',
    'Cordialement,',
    ...(ent ? [ent] : []),
    ...(coord ? [coord] : []),
  ].join('\n');
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
