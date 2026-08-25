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
import { fmtDate } from '../dates';

// Montant FCFA PDF-safe : toLocaleString('fr-FR') insère une espace fine
// insécable (U+202F) que les polices standard de pdfkit (Helvetica AFM) ne
// possèdent pas et rendent en « / ». On la remplace (ainsi que l'espace
// insécable U+00A0) par une espace normale.
function fmtFCFA(n: number): string {
  return Math.round(n).toLocaleString("fr-FR").replace(/[\u202F\u00A0\u2009]/g, ' ') + ' FCFA';
}

export const GABARIT_COMMANDEMENT_SOCIETE_VERSION = 'commandement-societe/v0.1';
export const GABARIT_INJONCTION_VERSION = 'requete-injonction-de-payer/v0.1';
export const GABARIT_COMMANDEMENT_VERSION = 'commandement-de-payer/v0.1';
export const GABARIT_ASSIGNATION_VERSION = 'assignation-en-paiement/v0.1';

const MENTION_PROJET =
  "PROJET établi par assistance IA — à vérifier, compléter et signer par un huissier de justice ou un avocat avant tout usage. Ne constitue pas un acte juridique en l'état.";

const MENTION_PROJET_SOCIETE =
  "PROJET — à vérifier et à signer par un représentant habilité de la société avant envoi au débiteur. Étape amiable préalable à la voie d'huissier.";

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

// Entête de la société créancière (SORAM / IRIS / SIS) pour le commandement
// « étape 1 ». Toutes les mentions sont éditables côté formulaire faute d'être
// stockées en base ; seul le nom est obligatoire.
export interface Societe {
  nom: string;
  formeJuridique?: string; // « SARL au capital de … »
  adresse?: string;
  rccm?: string; // Registre du commerce
  ninea?: string; // Identifiant fiscal (Sénégal)
  tel?: string;
  email?: string;
  representant?: string; // « représentée par M. … , Gérant »
  logo?: Buffer; // logo PNG de l'entité, dessiné dans l'entête si présent
}

export interface DonneesCommandementSociete {
  societe: Societe;
  lieu?: string;
  date?: Date;
  reference?: string; // référence lisible du dossier
  debiteurNom: string;
  debiteurAdresse?: string;
  debiteurRepresentant?: string;
  montantPrincipal: number;
  delaiJours?: number; // délai de paiement laissé (défaut 8 j)
  signataireNom?: string; // qui signe (nom)
  signataireQualite?: string; // « Directeur du recouvrement »
  factures?: FactureActe[];
  decompte?: LigneActe[];
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

// Requête aux fins d'injonction de payer (AUPSRVE) — émane du créancier
// (éventuellement via son avocat), adressée au président du tribunal.
export interface DonneesInjonction {
  societe: Societe; // le requérant (créancier)
  lieu?: string;
  date?: Date;
  reference?: string;
  tribunal?: string; // « Tribunal de Commerce Hors Classe de Dakar »
  debiteurNom: string;
  debiteurAdresse?: string;
  debiteurFormeJuridique?: string;
  montantPrincipal: number;
  interets?: number; // intérêts de droit demandés (optionnel)
  fraisRecouvrement?: number;
  fondement?: string; // origine de la créance (bon de commande, contrat, factures…)
  factures?: FactureActe[];
  decompte?: LigneActe[];
  bordereau?: string[];
  signataireNom?: string;
  signataireQualite?: string;
  avocatNom?: string; // si déposée par un avocat (nom + barreau)
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

// Entête de la société créancière (papier à en-tête : logo à gauche + nom en
// gras et mentions légales à droite, filet de séparation). L'acte « étape 1 »
// émane de la société elle-même, pas d'une étude d'huissier.
function enteteSociete(doc: PDFKit.PDFDocument, s: Societe) {
  const left = 56;
  const logoSize = 54;
  const textX = s.logo ? left + logoSize + 14 : left;
  const top = doc.y;

  if (s.logo) {
    try {
      doc.image(s.logo, left, top, { width: logoSize, height: logoSize });
    } catch {
      /* logo illisible : on continue sans, l'entête reste valable */
    }
  }

  doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(s.nom.toUpperCase(), textX, top + 2, { width: doc.page.width - 56 - textX });
  doc.fontSize(8.5).font('Helvetica').fillColor('#444');
  if (s.formeJuridique) doc.text(s.formeJuridique, textX, doc.y, { width: doc.page.width - 56 - textX });
  const contact = [s.adresse, s.tel ? 'Tél : ' + s.tel : '', s.email ? 'Email : ' + s.email : '']
    .filter((x): x is string => Boolean(x))
    .join('  ·  ');
  if (contact) doc.text(contact, textX, doc.y, { width: doc.page.width - 56 - textX });
  const legal = [s.rccm ? 'RCCM : ' + s.rccm : '', s.ninea ? 'NINEA : ' + s.ninea : '']
    .filter((x): x is string => Boolean(x))
    .join('  ·  ');
  if (legal) doc.text(legal, textX, doc.y, { width: doc.page.width - 56 - textX });
  doc.fillColor('#000');
  // Le filet passe sous l'élément le plus bas (logo ou bloc texte).
  const y = Math.max(doc.y, top + (s.logo ? logoSize : 0)) + 6;
  doc.save().moveTo(56, y).lineTo(doc.page.width - 56, y).lineWidth(1).strokeColor('#222').stroke().restore();
  doc.x = left;
  doc.y = y + 10;
}

// ---------------------------------------------------------------------
// 0. COMMANDEMENT DE PAYER — ÉMIS PAR LA SOCIÉTÉ (étape 1, ~90 j)
// Lettre comminatoire sur entête du créancier, sommant le débiteur de payer
// sous un délai, préalable amiable avant la voie d'huissier. Juridiquement,
// c'est une mise en demeure renforcée : elle fait courir les intérêts et
// constitue la preuve d'une tentative de recouvrement amiable.
// ---------------------------------------------------------------------
export function genererCommandementSocietePdf(d: DonneesCommandementSociete): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const date = d.date || new Date();
  const lieu = d.lieu || 'Dakar';
  const delai = d.delaiJours && d.delaiJours > 0 ? Math.round(d.delaiJours) : 8;

  enteteSociete(doc, d.societe);

  // Coordonnées destinataire + lieu/date (aligné à droite comme un courrier).
  doc.fontSize(10).font('Helvetica');
  const yRef = doc.y;
  doc.font('Helvetica-Bold').text(d.debiteurNom, 320, yRef, { width: doc.page.width - 56 - 320, align: 'left' });
  doc.font('Helvetica');
  if (d.debiteurAdresse) doc.text(d.debiteurAdresse, { width: doc.page.width - 56 - 320 });
  if (d.debiteurRepresentant) doc.text('À l\'attention de ' + d.debiteurRepresentant, { width: doc.page.width - 56 - 320 });
  doc.moveDown(0.5);
  doc.text(`${lieu}, le ${fmtDate(date)}`, 320, doc.y, { width: doc.page.width - 56 - 320 });
  doc.moveDown(1.2);
  doc.x = 56;

  // Objet + LR/AR.
  doc.font('Helvetica-Bold').fontSize(10.5).text(
    `Objet : COMMANDEMENT DE PAYER${d.reference ? ' — dossier ' + d.reference : ''}`,
  );
  doc.font('Helvetica').fontSize(9).fillColor('#555').text('Lettre recommandée avec accusé de réception');
  doc.fillColor('#000').fontSize(10.5);
  doc.moveDown(0.9);

  doc.text('Madame, Monsieur,');
  doc.moveDown(0.5);
  doc.text(
    `Sauf erreur ou omission de notre part, nos écritures font apparaître à ce jour, à votre charge, une créance impayée d'un montant de ${fmtFCFA(d.montantPrincipal)} (${enLettres(d.montantPrincipal)} francs CFA) au titre des factures échues et non réglées ci-après détaillées.`,
    { align: 'justify' },
  );
  doc.moveDown(0.6);

  // Tableau des factures / décompte.
  const lignes: LigneActe[] = d.decompte && d.decompte.length
    ? d.decompte
    : (d.factures || []).map((f) => ({ poste: `Facture ${f.numero}${f.echeance ? ' — éch. ' + fmtDate(f.echeance) : ''}`, montant: f.montant }));
  if (lignes.length) {
    for (const l of lignes) {
      const y = doc.y;
      doc.text('•  ' + l.poste, 62, y, { width: 360 });
      doc.text(fmtFCFA(l.montant), 422, y, { width: doc.page.width - 56 - 422, align: 'right' });
    }
    doc.moveDown(0.3);
    const yt = doc.y;
    doc.font('Helvetica-Bold').text('TOTAL DÛ', 62, yt, { width: 360 });
    doc.text(fmtFCFA(d.montantPrincipal), 422, yt, { width: doc.page.width - 56 - 422, align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(0.8);
  }
  doc.x = 56; // les colonnes du tableau ont déplacé le curseur : on le remet à la marge

  doc.font('Helvetica-Bold').text(
    `Par la présente, nous vous mettons en demeure et vous faisons COMMANDEMENT de régler la somme de ${fmtFCFA(d.montantPrincipal)} dans un délai de ${delai} (${enLettres(delai)}) jours à compter de la réception de ce courrier.`,
    { align: 'justify' },
  );
  doc.font('Helvetica');
  doc.moveDown(0.6);
  doc.text(
    `À défaut de paiement dans ce délai, et sans autre avis de notre part, nous nous verrons contraints de confier le dossier à un huissier de justice aux fins de signification d'un commandement de payer puis, le cas échéant, d'une assignation en paiement devant la juridiction compétente, l'ensemble des frais et intérêts de retard restant à votre charge.`,
    { align: 'justify' },
  );
  doc.moveDown(0.6);
  doc.text(
    "Si le règlement de cette somme s'est croisé avec le présent courrier, nous vous prions de ne pas tenir compte de cette demande.",
    { align: 'justify' },
  );
  doc.moveDown(0.6);
  doc.text('Dans l\'attente de votre règlement, nous vous prions d\'agréer, Madame, Monsieur, l\'expression de nos salutations distinguées.');
  doc.moveDown(1.4);

  // Signature (société).
  const sig = doc.y;
  doc.text(d.signataireNom || d.societe.representant || d.societe.nom, 320, sig, { width: doc.page.width - 56 - 320 });
  if (d.signataireQualite) doc.font('Helvetica').fontSize(9).fillColor('#555').text(d.signataireQualite, { width: doc.page.width - 56 - 320 });
  doc.fillColor('#000').fontSize(10.5);
  doc.moveDown(2.2);
  doc.x = 56;

  // Bandeau projet (léger, spécifique société).
  const yb = doc.y;
  doc.save();
  doc.rect(56, yb, doc.page.width - 112, 24).fill('#FFF6E5');
  doc.fill('#8A5A00').fontSize(7.5).font('Helvetica-Oblique').text(MENTION_PROJET_SOCIETE, 62, yb + 6, { width: doc.page.width - 124 });
  doc.restore();
  doc.fill('#000');
  return bufferDePdf(doc);
}

// ---------------------------------------------------------------------
// 0-bis. REQUÊTE AUX FINS D'INJONCTION DE PAYER (voie rapide OHADA)
// Procédure simplifiée de l'AUPSRVE (art. 1 et s.) : le créancier saisit par
// requête le président de la juridiction compétente, qui rend une ordonnance
// d'injonction de payer. Signifiée au débiteur, elle lui ouvre 15 jours pour
// former opposition ; à défaut, elle devient exécutoire.
// ---------------------------------------------------------------------
export function genererRequeteInjonctionPdf(d: DonneesInjonction): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const date = d.date || new Date();
  const lieu = d.lieu || 'Dakar';
  const tribunal = d.tribunal || 'Tribunal de Commerce Hors Classe de Dakar';
  const interets = d.interets && d.interets > 0 ? d.interets : 0;
  const frais = d.fraisRecouvrement && d.fraisRecouvrement > 0 ? d.fraisRecouvrement : 0;
  const total = d.montantPrincipal + interets + frais;

  enteteSociete(doc, d.societe);
  doc.fontSize(13.5).font('Helvetica-Bold').text('REQUÊTE AUX FINS D\'INJONCTION DE PAYER', { align: 'center' });
  doc.fontSize(9).font('Helvetica-Oblique').fillColor('#555').text('(Articles 1 et suivants de l\'Acte uniforme OHADA portant organisation des procédures simplifiées de recouvrement et des voies d\'exécution)', { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1);

  doc.fontSize(10.5).font('Helvetica-Bold').text(`À Monsieur le Président du ${tribunal},`);
  doc.font('Helvetica');
  doc.moveDown(0.6);

  // Le requérant.
  const s = d.societe;
  const identiteReq = [s.nom, s.formeJuridique, s.adresse && 'sise à ' + s.adresse, s.rccm && 'RCCM ' + s.rccm, s.ninea && 'NINEA ' + s.ninea]
    .filter(Boolean)
    .join(', ');
  doc.text(`A l'honneur de vous exposer que la société ${identiteReq}, ${d.signataireNom ? 'représentée par ' + d.signataireNom + (d.signataireQualite ? ', ' + d.signataireQualite : '') + ', ' : ''}ci-après « la requérante » ;`, { align: 'justify' });
  doc.moveDown(0.5);

  // Le débiteur.
  doc.text(`Est créancière de ${d.debiteurNom}${d.debiteurFormeJuridique ? ', ' + d.debiteurFormeJuridique : ''}${d.debiteurAdresse ? ', sise à ' + d.debiteurAdresse : ''}, ci-après « la débitrice » ;`, { align: 'justify' });
  doc.moveDown(0.5);

  // La créance.
  doc.text(
    `D'une créance certaine, liquide et exigible d'un montant en principal de ${fmtFCFA(d.montantPrincipal)} (${enLettres(d.montantPrincipal)} francs CFA)${d.fondement ? ', ' + d.fondement : ', résultant des factures impayées ci-après'} ;`,
    { align: 'justify' },
  );
  doc.moveDown(0.5);

  // Tableau factures / décompte.
  const lignes: LigneActe[] = d.decompte && d.decompte.length
    ? d.decompte
    : (d.factures || []).map((f) => ({ poste: `Facture ${f.numero}${f.echeance ? ' — éch. ' + fmtDate(f.echeance) : ''}`, montant: f.montant }));
  if (lignes.length) {
    for (const l of lignes) {
      const y = doc.y;
      doc.text('•  ' + l.poste, 62, y, { width: 360 });
      doc.text(fmtFCFA(l.montant), 422, y, { width: doc.page.width - 56 - 422, align: 'right' });
    }
    doc.moveDown(0.2);
  }
  if (interets > 0) doc.text(`Intérêts de droit : ${fmtFCFA(interets)}`, 62);
  if (frais > 0) doc.text(`Frais de recouvrement : ${fmtFCFA(frais)}`, 62);
  const yt = doc.y + 2;
  doc.font('Helvetica-Bold').text('TOTAL RÉCLAMÉ', 62, yt, { width: 360 });
  doc.text(fmtFCFA(total), 422, yt, { width: doc.page.width - 56 - 422, align: 'right' });
  doc.font('Helvetica').text('', 56, doc.y);
  doc.moveDown(0.6);

  doc.text('Attendu que la débitrice, malgré les relances et mises en demeure, s\'est abstenue de régler sa dette ; Que la créance réunit les caractères requis pour la mise en œuvre de la procédure d\'injonction de payer ;', { align: 'justify' });
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').text('PAR CES MOTIFS', { align: 'center' });
  doc.font('Helvetica');
  doc.text('Vous plaise, Monsieur le Président :', { align: 'justify' });
  doc.text(`— Rendre une ordonnance d'injonction de payer enjoignant à ${d.debiteurNom} de payer à la requérante la somme de ${fmtFCFA(total)} (${enLettres(total)} francs CFA) ;`, { indent: 8, align: 'justify' });
  doc.text('— Condamner la débitrice aux entiers dépens ;', { indent: 8 });
  doc.text('— Dire que la présente ordonnance sera signifiée à la débitrice, laquelle disposera d\'un délai de quinze (15) jours pour former opposition.', { indent: 8, align: 'justify' });
  doc.moveDown(0.6);

  // Bordereau.
  doc.font('Helvetica-Bold').text('Bordereau des pièces jointes');
  doc.font('Helvetica').fontSize(9.5);
  const pieces = d.bordereau && d.bordereau.length ? d.bordereau : ['Factures impayées', 'Bons de commande / contrat', 'Relevé de compte', 'Mise en demeure / commandement de payer'];
  pieces.forEach((p, i) => doc.text(`${i + 1}. ${p}`));
  doc.fontSize(10.5);
  doc.moveDown(0.8);

  doc.text(`Fait à ${lieu}, le ${fmtDate(date)}.`);
  doc.moveDown(0.4);
  doc.text(d.avocatNom ? `Pour la requérante, son conseil : ${d.avocatNom}` : `Pour la requérante : ${d.signataireNom || s.representant || s.nom}${d.signataireQualite ? ', ' + d.signataireQualite : ''}`);
  doc.moveDown(2);
  doc.text('______________________________');
  doc.moveDown(1);

  // Bandeau projet.
  const yb = doc.y;
  doc.save();
  doc.rect(56, yb, doc.page.width - 112, 30).fill('#FBEAE9');
  doc.fill('#B0322A').fontSize(7.5).font('Helvetica-Oblique').text(MENTION_PROJET, 62, yb + 7, { width: doc.page.width - 124 });
  doc.restore();
  doc.fill('#000');
  return bufferDePdf(doc);
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
