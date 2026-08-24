// =====================================================================
// GABARITS D'ACTES — calqués sur les modèles réels des études d'huissiers
// du Sénégal fournis par le client :
//  1. COMMANDEMENT DE PAYER            (l'huissier somme de payer sous 8 jours)
//  2. COMMANDEMENT – ASSIGNATION EN PAIEMENT (vaut aussi assignation à
//     comparaître devant le Tribunal de commerce)
//
// PROJETS générés par assistance IA, à FAIRE VALIDER / SIGNER par un huissier
// de justice ou un avocat. Le contenu juridique reproduit la structure des
// actes transmis ; il doit être relu par le professionnel avant tout usage.
// Versions tracées pour l'audit (GABARIT_*_VERSION).
// =====================================================================
import PDFDocument from 'pdfkit';
import { fmtDate, fmtFCFA } from '../dates';

export const GABARIT_COMMANDEMENT_VERSION = 'commandement-de-payer/v0.1';
export const GABARIT_ASSIGNATION_VERSION = 'assignation-en-paiement/v0.1';

const MENTION_PROJET =
  "PROJET établi par assistance IA — à vérifier, compléter et signer par un huissier de justice ou un avocat avant tout usage. Ne constitue pas un acte juridique en l'état.";

export interface Huissier {
  nom: string; // « Maître Abdoulaye BA »
  etude?: string; // en-tête d'étude (titres, mentions)
  adresse?: string;
  tel?: string;
  email?: string;
}
export interface FactureActe {
  numero: string;
  date: Date | null;
  echeance: Date;
  montant: number;
}
export interface LigneActe {
  poste: string;
  montant: number;
}

export interface DonneesCommandement {
  huissier: Huissier;
  lieu?: string; // ville de rédaction (défaut Dakar)
  date?: Date; // date de l'acte
  demandeurNom: string; // le créancier
  demandeurRepresentant?: string; // « représenté par Monsieur … »
  demandeurAdresse?: string;
  debiteurNom: string; // la société débitrice
  debiteurAdresse?: string;
  debiteurRemisA?: string; // « où étant et parlant à … »
  montantPrincipal: number; // 1°) La somme de …
  coutActe?: number; // 2°) le coût du présent commandement
  factures?: FactureActe[];
}

export interface DonneesAssignation extends DonneesCommandement {
  electionDomicile?: string; // « élisant domicile à la SCP … »
  tribunal?: string; // « Tribunal de Commerce Hors Classe de Dakar »
  dateComparution?: Date;
  heureComparution?: string; // « 8 heures 30 minutes du matin »
  exposeFaits?: string; // paragraphe « POUR » (relation d'affaires…)
  miseEnDemeureDate?: Date | null;
  dommagesInterets?: number; // résistance abusive
  decompte?: LigneActe[];
  bordereau?: string[]; // liste des pièces
}

// ---------------------------------------------------------------------
// Montant en toutes lettres (français) — les actes réels écrivent la somme
// en lettres. Entiers positifs jusqu'au milliard (largement suffisant).
// ---------------------------------------------------------------------
export function enLettres(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'zéro';
  const u = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const d = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  const centaines = (x: number): string => {
    if (x === 0) return '';
    let s = '';
    const c = Math.floor(x / 100), r = x % 100;
    if (c > 0) s += (c > 1 ? u[c] + ' ' : '') + 'cent' + (c > 1 && r === 0 ? 's' : '');
    if (r > 0) {
      if (s) s += ' ';
      if (r < 20) s += u[r];
      else {
        const diz = Math.floor(r / 10), un = r % 10;
        if (diz === 7 || diz === 9) s += d[diz] + '-' + u[10 + un];
        else s += d[diz] + (un === 1 && diz !== 8 ? ' et un' : un > 0 ? '-' + u[un] : (diz === 8 ? 's' : ''));
      }
    }
    return s;
  };
  const mille = Math.floor(n / 1000), reste = n % 1000;
  const million = Math.floor(mille / 1000), milleR = mille % 1000;
  let out = '';
  if (million > 0) out += (million > 1 ? centaines(million) + ' millions' : 'un million');
  if (milleR > 0) out += (out ? ' ' : '') + (milleR > 1 ? centaines(milleR) + ' mille' : 'mille');
  if (reste > 0) out += (out ? ' ' : '') + centaines(reste);
  return out.trim();
}

// ---------------------------------------------------------------------
// Rappel de l'article 33 du Code de Procédure Civile (assignation).
// Repris à l'identique des actes transmis.
// ---------------------------------------------------------------------
const RAPPEL_ART33 = [
  'Il est rappelé au destinataire conformément aux dispositions de l\'article 33 nouveau du Code de Procédure Civile :',
  'Que nul ne plaide par procureur ;',
  'Qu\'en matière civile et commerciale, les parties peuvent, dans les conditions fixées par la loi 84-09 de 1984 portant création de l\'ordre des avocats, agir et se défendre elles-mêmes verbalement ou par ministère d\'avocat ;',
  'Que leur représentant, s\'il n\'est pas avocat, doit justifier d\'un pouvoir spécial ;',
  'Que faute de comparaître ou de se faire représenter, ils s\'exposent à ce qu\'un jugement soit rendu contre eux sur les seuls éléments fournis par leur adversaire ;',
  'Que les pièces sur lesquelles la demande est fondée sont énumérées au bordereau annexé au présent acte ;',
  'Que l\'assignation vaut conclusion.',
];

// ---------------------------------------------------------------------
// Helpers PDF
// ---------------------------------------------------------------------
function bandeauProjet(doc: PDFKit.PDFDocument) {
  const y = doc.y;
  doc.save();
  doc.rect(56, y, doc.page.width - 112, 30).fill('#FBEAE9');
  doc.fill('#B0322A').fontSize(7.5).font('Helvetica-Oblique').text(MENTION_PROJET, 62, y + 7, { width: doc.page.width - 124 });
  doc.restore();
  doc.fill('#000');
  doc.y = y + 40;
}
function enteteHuissier(doc: PDFKit.PDFDocument, h: Huissier) {
  doc.fontSize(12).font('Helvetica-Bold').text(h.nom);
  doc.fontSize(8.5).font('Helvetica');
  if (h.etude) doc.text(h.etude);
  const l = [h.adresse, h.tel ? 'Tél : ' + h.tel : '', h.email ? 'Email : ' + h.email : ''].filter((x): x is string => Boolean(x));
  for (const ligne of l) doc.text(ligne);
  doc.moveDown(0.8);
}
function bufferDePdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// ---------------------------------------------------------------------
// 1. COMMANDEMENT DE PAYER
// ---------------------------------------------------------------------
export function genererCommandementDePayerPdf(d: DonneesCommandement): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const date = d.date || new Date();
  const lieu = d.lieu || 'Dakar';
  const cout = d.coutActe ?? 0;
  const total = d.montantPrincipal + cout;

  bandeauProjet(doc);
  enteteHuissier(doc, d.huissier);
  doc.fontSize(14).font('Helvetica-Bold').text('COMMANDEMENT DE PAYER', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10.5).font('Helvetica');
  doc.text(`L'AN ${anneeEnLettres(date)} ET LE ${jourEnLettres(date)}`);
  doc.moveDown(0.5);
  doc.text(`À la requête de ${d.demandeurNom}${d.demandeurRepresentant ? ', représenté par ' + d.demandeurRepresentant : ''}${d.demandeurAdresse ? ', sise à ' + d.demandeurAdresse : ''}, y faisant élection de domicile ;`);
  doc.moveDown(0.5);
  doc.text(`J'ai, ${d.huissier.nom}, Huissier de justice près la Cour d'Appel et les Tribunaux de Dakar, ${d.huissier.adresse ? 'domicilié ' + d.huissier.adresse + ', ' : ''}soussigné ;`);
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').text('FAIT COMMANDEMENT À :');
  doc.font('Helvetica').text(`La Société ${d.debiteurNom}${d.debiteurAdresse ? ', sise à ' + d.debiteurAdresse : ''}, où étant et parlant à : ${d.debiteurRemisA || '________________'}`);
  doc.moveDown(0.5);
  doc.text("D'avoir immédiatement et sans délai, au plus tard dans les 08 jours, pour tout délai, à payer le requérant et pour lui à moi, Huissier de justice porteur des pièces, ayant charge de recevoir et pouvoir de donner bonne et valable quittance :");
  doc.moveDown(0.4);
  doc.text(`1°) La somme de : ${fmtFCFA(d.montantPrincipal)}`);
  doc.text(`2°) Le coût du présent commandement : ${fmtFCFA(cout)}`);
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').text(`TOTAL : ${fmtFCFA(total)}`);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').text('SANS PRÉJUDICE DE TOUTES SOMMES DUES, INTÉRÊTS ET ACTIONS');
  doc.moveDown(0.4);
  doc.font('Helvetica').text('Lui déclarant que faute par elle de satisfaire au présent commandement, elle sera contrainte par toutes voies de droit, notamment par une action en justice.');
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').text('À QUOI IL M\'A ÉTÉ RÉPONDU :');
  doc.font('Helvetica').text('________________________________________________________________');
  doc.moveDown(1);
  doc.text(`Et je lui ai, étant et parlant comme dessus, remis et laissé copie du présent dont le coût est de : ${fmtFCFA(cout)}.`);
  doc.moveDown(0.6);
  doc.text(`Fait à ${lieu}, le ${fmtDate(date)}.`);
  doc.moveDown(1.5);
  doc.text('L\'Huissier de justice');
  doc.text('______________________________');
  doc.moveDown(1);
  bandeauProjet(doc);
  return bufferDePdf(doc);
}

// ---------------------------------------------------------------------
// 2. COMMANDEMENT – ASSIGNATION EN PAIEMENT
// ---------------------------------------------------------------------
export function genererAssignationEnPaiementPdf(d: DonneesAssignation): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const date = d.date || new Date();
  const lieu = d.lieu || 'Dakar';
  const tribunal = d.tribunal || 'Tribunal de Commerce Hors Classe de Dakar';

  bandeauProjet(doc);
  enteteHuissier(doc, d.huissier);
  doc.fontSize(13.5).font('Helvetica-Bold').text('COMMANDEMENT – ASSIGNATION EN PAIEMENT', { align: 'center' });
  doc.moveDown(0.8);

  doc.fontSize(10.5).font('Helvetica');
  doc.text(`L'An ${anneeEnLettres(date)} Et Le ${jourEnLettres(date)}`);
  doc.moveDown(0.4);
  doc.text(`À la requête de ${d.demandeurNom}, poursuites et diligences de son représentant légal${d.demandeurAdresse ? ' en ses bureaux sis à ' + d.demandeurAdresse : ''}${d.electionDomicile ? ', mais élisant domicile à ' + d.electionDomicile : ''} ;`);
  doc.moveDown(0.4);
  doc.text(`J'ai, ${d.huissier.nom}, Huissier de Justice près la Cour d'Appel et les Tribunaux de la Région de Dakar${d.huissier.adresse ? ', demeurant et domicilié ' + d.huissier.adresse : ''}.`);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Fait Commandement au Nom de la loi à :');
  doc.font('Helvetica').text(`${d.debiteurNom}, prise en la personne de son représentant légal${d.debiteurAdresse ? ' en ses bureaux sis à ' + d.debiteurAdresse : ''}, où étant et parlant à : ${d.debiteurRemisA || '________________'}`);
  doc.moveDown(0.4);
  doc.text(`De immédiatement payer à ${d.demandeurNom} entre les mains de moi Huissier de Justice, ayant charge de recevoir paiement et pouvoir de délivrer bonne et valable quittance, la somme de ${fmtFCFA(d.montantPrincipal)} (${enLettres(d.montantPrincipal)} francs CFA) représentant le montant de la créance sans préjudice des intérêts et frais ;`);
  doc.moveDown(0.5);

  doc.text(`En prévoyant d'ores et déjà le cas où le présent commandement serait infructueux, j'ai huissier susdit soussigné, étant et parlant comme ci-dessus, donné assignation à la requise à comparaître et se trouver par devant le ${tribunal} en son prétoire habituel`);
  doc.font('Helvetica-Bold').text(
    `LE ${d.dateComparution ? fmtDate(d.dateComparution).toUpperCase() : '________________'} À ${d.heureComparution || '________________'}`,
    { align: 'center' },
  );
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('RAPPEL DES DISPOSITIONS LÉGALES');
  doc.font('Helvetica').fontSize(9.5);
  for (const r of RAPPEL_ART33) doc.text('« ' + r + ' »', { indent: 8 });
  doc.moveDown(0.6);
  doc.fontSize(10.5);

  doc.font('Helvetica-Bold').text('POUR', { align: 'center' });
  doc.font('Helvetica');
  if (d.exposeFaits) doc.text(d.exposeFaits);
  else doc.text('Attendu que les parties étaient liées par une relation d\'affaires ; Que la requise n\'a effectué aucun versement ; Qu\'il ressort du rapprochement comptable que la requise doit la somme réclamée ; [Exposé des faits à compléter par le conseil.]');
  doc.moveDown(0.3);
  if (d.miseEnDemeureDate) doc.text(`Que la mise en demeure du ${fmtDate(d.miseEnDemeureDate)} est restée infructueuse ;`);
  doc.text('Qu\'elle refuse catégoriquement de payer la créance certaine, liquide et exigible ;');
  doc.text('Que le comportement de la requise s\'analyse en une résistance abusive et cause un préjudice à la requérante ;');
  const di = d.dommagesInterets && d.dommagesInterets > 0 ? ` outre les intérêts de droit à compter de la mise en demeure et celle de ${fmtFCFA(d.dommagesInterets)} à titre de dommages et intérêts pour résistance abusive` : ' outre les intérêts de droit à compter de la mise en demeure';
  doc.text(`Dès lors, il convient de la condamner à payer à ${d.demandeurNom} la somme principale de ${fmtFCFA(d.montantPrincipal)}${di} ;`);
  doc.text('Qu\'enfin la requise supportera les dépens ;');
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('PAR CES MOTIFS', { align: 'center' });
  doc.font('Helvetica-Bold').text('EN LA FORME');
  doc.font('Helvetica').text('– Déclarer l\'action recevable ;');
  doc.font('Helvetica-Bold').text('AU FOND');
  doc.font('Helvetica').text(`– Condamner ${d.debiteurNom} à payer à ${d.demandeurNom} la somme principale de ${fmtFCFA(d.montantPrincipal)}${di} ;`);
  doc.text('– S\'entendre la requise condamner aux dépens.');
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').text('SOUS TOUTES RÉSERVES', { align: 'center' });
  doc.font('Helvetica').text(`Et à ce qu'elle n'en ignore, je lui ai étant et parlant comme ci-dessus, remis et laissé copie du présent dont le coût est de : ${d.coutActe ? fmtFCFA(d.coutActe) : '________________'}.`);
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').text('Bordereau de pièces');
  doc.font('Helvetica').fontSize(9.5);
  const pieces = d.bordereau && d.bordereau.length ? d.bordereau : ['Factures', 'Extrait de compte', 'Bons de commande', 'Mise en demeure'];
  pieces.forEach((p, i) => doc.text(`${i + 1}. ${p}`));
  doc.moveDown(0.6);
  doc.fontSize(10.5).text(`Fait à ${lieu}, le ${fmtDate(date)}.`);
  doc.moveDown(1.2);
  doc.text('L\'Huissier de justice');
  doc.text('______________________________');
  doc.moveDown(0.8);
  bandeauProjet(doc);
  return bufferDePdf(doc);
}

// Dates en toutes lettres (les actes écrivent « L'An Deux Mille Vingt Et Le Vingt Octobre »).
function anneeEnLettres(d: Date): string {
  return enLettres(d.getFullYear()).replace(/^un mille/, 'mille'); // « deux mille vingt »
}
function jourEnLettres(d: Date): string {
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const j = d.getDate();
  return `${j === 1 ? 'premier' : enLettres(j)} ${mois[d.getMonth()]}`;
}
