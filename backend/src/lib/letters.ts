import { fmtDate, fmtDateLong, fmtFCFA } from './dates';
import { ClientWithFactures, clientEncours, clientJoursRetard, clientOldestEcheance } from './paliers';
import { ContractEcheance, ContractLike, contractEcheance } from './contracts';

export type Entite = 'SORAM' | 'SIS' | 'IRIS' | 'COMMUN';

export interface LetterAction {
  palier: number;
  date: Date | string;
}

export interface LetterClient extends ClientWithFactures {
  nom: string;
  entite: Entite;
  contact: string;
  actions?: LetterAction[];
}

// Toutes les factures impayées, triées de la plus ancienne à la plus
// récente — l'encours (montant total) couvre souvent plusieurs factures,
// pas seulement la plus ancienne qui sert à calculer le retard/palier.
function facturesImpayees(client: LetterClient) {
  return client.factures
    .filter((f) => f.statut === 'impayee')
    .slice()
    .sort((a, b) => new Date(a.dateEcheance).getTime() - new Date(b.dateEcheance).getTime());
}

function numerosImpayes(factures: { numero?: string }[]): string[] {
  return factures.map((f) => f.numero).filter((n): n is string => Boolean(n));
}

// Phrase naturelle listant la ou les factures concernées — évite d'attribuer
// à tort le montant total (somme de plusieurs factures) à une seule facture
// citée nommément dans le courrier. `prep` gère la contraction de l'article
// avec la préposition qui précède ("de les" → "des", "à les" → "aux") ;
// "bare" pour un usage sans préposition contractable (ex : après "sur").
function factureLabel(numeros: string[], prep: 'de' | 'a' | 'bare' = 'bare'): string {
  if (numeros.length === 0) {
    if (prep === 'de') return 'de votre facture';
    if (prep === 'a') return 'à votre facture';
    return 'votre facture';
  }
  if (numeros.length === 1) {
    const base = `la facture ${numeros[0]}`;
    if (prep === 'de') return `de ${base}`;
    if (prep === 'a') return `à ${base}`;
    return base;
  }
  const liste = `${numeros.slice(0, -1).join(', ')} et ${numeros[numeros.length - 1]}`;
  if (prep === 'de') return `des factures ${liste}`;
  if (prep === 'a') return `aux factures ${liste}`;
  return `les factures ${liste}`;
}

function lastActionDate(client: LetterClient, palier: number): string | null {
  const matches = (client.actions ?? [])
    .filter((a) => a.palier === palier)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return matches.length ? fmtDate(matches[0].date) : null;
}

function entiteNom(entite: Entite): string {
  if (entite === 'IRIS') return 'IRIS Afrique';
  if (entite === 'SIS') return 'SIS — SORAM Impression & Services';
  if (entite === 'SORAM') return 'SORAM Afrique';
  return 'SORAM Afrique · IRIS Afrique';
}

function letterHeader(client: LetterClient): string {
  const today = fmtDateLong(new Date());
  return (
    `Dakar, le ${today}\n\nÀ l'attention de : ${client.contact}\n${client.nom}\n\n` +
    `Bonjour,\n\nJ'espère que vous allez bien. Je vous contacte au nom du service recouvrement de l'entreprise ${entiteNom(client.entite)}.\n\n`
  );
}

function entiteSignoff(entite: Entite): string {
  if (entite === 'IRIS') return 'Service Facturation et Recouvrement\nGaëtan — +221 78 300 29 01';
  if (entite === 'COMMUN') {
    return (
      'Service Facturation et Recouvrement\n' +
      'SORAM · SIS — Téléphone : +221 33 824 30 06\n' +
      'IRIS Afrique — Gaëtan — +221 78 300 29 01'
    );
  }
  return 'Service Facturation et Recouvrement\nTéléphone : +221 33 824 30 06';
}

function letterFooter(entite: Entite): string {
  return `\n\nNous restons à votre disposition pour toute question relative à ce dossier.\n\nCordialement,\n\n${entiteSignoff(entite)}`;
}

interface PaiementInfo {
  titulaire: string;
  banque: string;
  iban: string;
  bic: string;
  wave?: string;
  orangeMoney?: string;
}

// Coordonnées bancaires par entité juridique (comptes distincts, même pour
// SORAM et SIS qui partagent une marque commune) — communiquées pour
// permettre un règlement immédiat depuis le mail de relance.
const PAIEMENT_INFO: Record<'SORAM' | 'SIS' | 'IRIS', PaiementInfo> = {
  IRIS: {
    titulaire: 'IRIS AFRIQUE SARL',
    banque: 'Société Générale Sénégal',
    iban: 'SN08 SN011 01005 006101184816 87',
    bic: 'SGSNSNDA',
    wave: '+221 78 300 29 01',
    orangeMoney: '+221 77 107 78 47',
  },
  SORAM: {
    titulaire: 'SORAM OUEST AFRICA',
    banque: 'Société Générale Sénégal',
    iban: 'SN08 SN011 01005 006100448816 76',
    bic: 'SGSNSNDAXXX',
    wave: '+221 76 637 35 06',
  },
  SIS: {
    titulaire: '99SORAM IMPRESSION ET SERVICES',
    banque: 'SUNU Bank',
    iban: 'SN08 SN01 0015 2801 1472 6000 0922',
    bic: 'BICISNDXXXX',
  },
};

function formatPaiementInfo(info: PaiementInfo): string {
  let bloc = `Virement bancaire (${info.titulaire})\n${info.banque}\nIBAN : ${info.iban}\nBIC : ${info.bic}`;
  if (info.wave) bloc += `\nWave : ${info.wave}`;
  if (info.orangeMoney) bloc += `\nOrange Money : ${info.orangeMoney}`;
  return bloc;
}

// N'apparaît que sur les courriers adressés au client lui-même (paliers 0-6) —
// pas sur la note interne de transmission au contentieux (palier 7), qui n'est
// pas envoyée au débiteur.
function paiementSection(entite: Entite): string {
  if (entite === 'COMMUN') {
    return (
      `\n\nMoyens de paiement\n\n` +
      `${entiteNom('SORAM')}\n${formatPaiementInfo(PAIEMENT_INFO.SORAM)}\n\n` +
      `${entiteNom('IRIS')}\n${formatPaiementInfo(PAIEMENT_INFO.IRIS)}`
    );
  }
  return `\n\nMoyens de paiement\n\n${formatPaiementInfo(PAIEMENT_INFO[entite])}`;
}

// Génère le texte du courrier de recouvrement correspondant au palier atteint.
// La mise en demeure (palier 6) reste un document juridique — ne pas modifier
// son contenu sans validation métier.
export function generateLetter(client: LetterClient, palierId: number): string {
  const encours = fmtFCFA(clientEncours(client));
  const jours = clientJoursRetard(client);
  const f = clientOldestEcheance(client);
  const numFacture = f?.numero ?? '';
  const dateEch = f ? fmtDate(f.dateEcheance) : '';
  const impayees = facturesImpayees(client);
  const numeros = numerosImpayes(impayees);
  const label = factureLabel(numeros);
  const labelDe = factureLabel(numeros, 'de');
  const labelA = factureLabel(numeros, 'a');
  const plusieurs = numeros.length > 1;
  let body = '';

  if (palierId <= 3) {
    const echeanceNote = plusieurs
      ? `dont la plus ancienne (${numFacture}) est échue depuis le ${dateEch} (${jours} jours de retard)`
      : `échue depuis le ${dateEch} (${jours} jours de retard)`;
    body =
      `Objet : Rappel de règlement — ${numeros.join(', ') || numFacture}\n\n` +
      `Je me permets de revenir vers vous au sujet ${labelDe}, pour un montant total impayé de ${encours}, ${echeanceNote}. Sauf erreur de notre part, ce montant reste dû à ce jour.\n\n` +
      `N'hésitez pas à me recontacter si un point particulier justifie ce retard — sinon, je vous serais reconnaissant de bien vouloir procéder au règlement dans les meilleurs délais.`;
  } else if (palierId === 4) {
    const serviceLabel =
      client.entite === 'IRIS'
        ? "l'accès à la plateforme de géolocalisation et le suivi de votre flotte"
        : client.entite === 'SIS'
          ? "les prestations d'impression et de production (marketing print & communication)"
          : 'les livraisons de consommables (toners) et interventions techniques';
    body =
      `Objet : Avis de suspension de service\n\n` +
      `Malgré mes relances précédentes, votre compte présente encore un encours impayé de ${encours} sur ${label}, la plus ancienne (${numFacture}) étant échue depuis ${jours} jours.\n\n` +
      `Je suis désolé d'en arriver là, mais sans régularisation de votre situation sous 8 jours à compter de ce message, nous serons contraints de suspendre ${serviceLabel} prévu(e)s à votre contrat, jusqu'à l'apurement du solde.\n\n` +
      `Si votre situation le justifie, je reste ouvert à discuter d'un échéancier — n'hésitez pas à me contacter directement.`;
  } else if (palierId === 5) {
    const detailRetard = plusieurs ? ` (la plus ancienne, ${numFacture}, en retard de ${jours} jours)` : ` (retard de ${jours} jours)`;
    body =
      `Objet : Application des pénalités de retard contractuelles\n\n` +
      `Votre compte reste impayé à hauteur de ${encours} sur ${label}${detailRetard}. Je me vois donc contraint de vous informer que les pénalités de retard prévues à l'article [Article X] de votre contrat s'appliquent à compter de ce jour et viendront s'ajouter au montant dû.\n\n` +
      `Je vous invite à régulariser votre situation dès que possible afin d'éviter toute majoration supplémentaire.`;
  } else if (palierId === 6) {
    const echeanceNote = plusieurs ? `, dont la plus ancienne (${numFacture}) est échue depuis le ${dateEch}` : ` échue depuis le ${dateEch}`;
    body =
      `Objet : MISE EN DEMEURE de payer\n\n` +
      `Par la présente, nous vous mettons en demeure de régler, sous quinzaine à compter de la réception de ce courrier (envoyé en lettre recommandée avec accusé de réception), la somme de ${encours} correspondant ${labelA}${echeanceNote}, majorée des pénalités contractuelles applicables.\n\n` +
      `À défaut de règlement dans ce délai, nous nous verrons contraints d'engager toute voie de droit utile au recouvrement de notre créance, sans autre préavis, y compris par voie d'huissier.`;
  } else {
    const miseEnDemeureDate = lastActionDate(client, 6);
    const miseEnDemeurePhrase = miseEnDemeureDate
      ? `La mise en demeure du ${miseEnDemeureDate} étant restée sans effet, ce dossier`
      : `La mise en demeure envoyée précédemment étant restée sans effet, ce dossier`;
    body =
      `Objet : Note interne — Transmission au contentieux\n\n` +
      `Dossier : ${client.nom} (${client.entite})\nEncours : ${encours}\nFactures concernées : ${numeros.join(', ') || numFacture}\nFacture la plus ancienne : ${numFacture}, échue depuis ${jours} jours\n\n` +
      `${miseEnDemeurePhrase} est transmis à l'étude d'huissier pour engagement d'une procédure de recouvrement contentieux.`;
  }
  if (palierId <= 6) body += paiementSection(client.entite);
  return letterHeader(client) + body + letterFooter(client.entite);
}

export interface ContractDocClient {
  nom: string;
  entite: Entite;
  contact: string;
}

export interface LetterContract extends ContractLike {
  numero: string;
  dateDebut: Date | string;
  tacite: boolean;
}

export interface ContractDoc {
  subject: string;
  body: string;
}

export function generateContractDoc(client: ContractDocClient, c: LetterContract): ContractDoc {
  const e: ContractEcheance = contractEcheance(c);
  const today = fmtDateLong(new Date());
  const nomEntite = entiteNom(client.entite);
  const preamble =
    `Dakar, le ${today}\n\nÀ l'attention de : ${client.contact}\n${client.nom}\n\n` +
    `Bonjour,\n\nJ'espère que vous allez bien. Je vous contacte au nom du service recouvrement de l'entreprise ${nomEntite}.\n\n`;

  if (e.type === 'revision_tarif') {
    const subject = `${nomEntite} — Révision tarifaire annuelle — Contrat ${c.numero}`;
    const body =
      preamble +
      `Objet : Révision tarifaire annuelle — Contrat ${c.numero}\n\n` +
      `Conformément à l'article 7.4 de votre contrat prévoyant une révision tarifaire annuelle, nous vous informons que les nouvelles conditions tarifaires entreront en vigueur à compter du ${fmtDate(c.dateRevisionTarif!)}.\n\n` +
      `Un avenant détaillant la grille tarifaire actualisée vous sera transmis séparément pour signature. Nous restons à votre disposition pour toute question.` +
      letterFooter(client.entite);
    return { subject, body };
  }

  const label = c.tacite ? 'tacite reconduction' : 'renouvellement';
  const subject = `${nomEntite} — Échéance de contrat (${label}) — Contrat ${c.numero}`;
  const body =
    preamble +
    `Objet : Échéance de votre contrat ${c.numero}\n\n` +
    `Nous vous informons que votre contrat ${c.numero}, en vigueur depuis le ${fmtDate(c.dateDebut)}, arrive à échéance le ${fmtDate(c.dateFin)}.\n\n` +
    (c.tacite
      ? `Sauf dénonciation de votre part par lettre recommandée dans les délais prévus au contrat, celui-ci se renouvellera par tacite reconduction. Nous vous transmettons ci-joint un avenant actualisant les conditions pour la période à venir, à votre disposition pour validation.`
      : `Nous vous proposons de formaliser dès à présent le renouvellement de ce contrat. Un projet de nouveau contrat, reprenant vos conditions actuelles et intégrant les éventuelles évolutions convenues, est joint à ce courrier pour relecture et signature.`) +
    letterFooter(client.entite);
  return { subject, body };
}
