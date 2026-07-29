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
    `Bonjour,\n\nJ'espère que vous allez bien. Je suis le responsable du recouvrement de l'entreprise ${entiteNom(client.entite)}.\n\n`
  );
}

function letterFooter(): string {
  return `\n\nNous restons à votre disposition pour toute question relative à ce dossier.\n\nCordialement,\n\nFlorian Baudoin\nFondateur & Président, Olu Ecosystems (SORAM · SIS · IRIS Afrique)\nf.baudoin@soram-afrique.com · +221 33 824 30 06`;
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
  let body = '';

  if (palierId <= 3) {
    body =
      `Objet : Rappel de règlement — Facture ${numFacture}\n\n` +
      `Je me permets de revenir vers vous au sujet de la facture ${numFacture}, d'un montant de ${encours}, échue depuis le ${dateEch} (${jours} jours). Sauf erreur de notre part, elle reste à ce jour impayée.\n\n` +
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
      `Malgré mes relances précédentes, votre compte présente encore un encours impayé de ${encours}, la facture la plus ancienne (${numFacture}) étant échue depuis ${jours} jours.\n\n` +
      `Je suis désolé d'en arriver là, mais sans régularisation de votre situation sous 8 jours à compter de ce message, nous serons contraints de suspendre ${serviceLabel} prévu(e)s à votre contrat, jusqu'à l'apurement du solde.\n\n` +
      `Si votre situation le justifie, je reste ouvert à discuter d'un échéancier — n'hésitez pas à me contacter directement.`;
  } else if (palierId === 5) {
    body =
      `Objet : Application des pénalités de retard contractuelles\n\n` +
      `Votre compte reste impayé à hauteur de ${encours} (retard de ${jours} jours sur la facture ${numFacture}). Je me vois donc contraint de vous informer que les pénalités de retard prévues à l'article [Article X] de votre contrat s'appliquent à compter de ce jour et viendront s'ajouter au montant dû.\n\n` +
      `Je vous invite à régulariser votre situation dès que possible afin d'éviter toute majoration supplémentaire.`;
  } else if (palierId === 6) {
    body =
      `Objet : MISE EN DEMEURE de payer\n\n` +
      `Par la présente, nous vous mettons en demeure de régler, sous quinzaine à compter de la réception de ce courrier (envoyé en lettre recommandée avec accusé de réception), la somme de ${encours} correspondant à la facture ${numFacture} échue depuis le ${dateEch}, majorée des pénalités contractuelles applicables.\n\n` +
      `À défaut de règlement dans ce délai, nous nous verrons contraints d'engager toute voie de droit utile au recouvrement de notre créance, sans autre préavis, y compris par voie d'huissier.`;
  } else {
    const miseEnDemeureDate = lastActionDate(client, 6);
    const miseEnDemeurePhrase = miseEnDemeureDate
      ? `La mise en demeure du ${miseEnDemeureDate} étant restée sans effet, ce dossier`
      : `La mise en demeure envoyée précédemment étant restée sans effet, ce dossier`;
    body =
      `Objet : Note interne — Transmission au contentieux\n\n` +
      `Dossier : ${client.nom} (${client.entite})\nEncours : ${encours}\nFacture de référence : ${numFacture}, échue depuis ${jours} jours\n\n` +
      `${miseEnDemeurePhrase} est transmis à l'étude d'huissier pour engagement d'une procédure de recouvrement contentieux.\n\n` +
      `Pièces jointes suggérées : factures impayées, historique des relances, copie de la mise en demeure.`;
  }
  return letterHeader(client) + body + (palierId < 7 ? letterFooter() : '');
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
    `Bonjour,\n\nJ'espère que vous allez bien. Je suis le responsable du recouvrement de l'entreprise ${nomEntite}.\n\n`;

  if (e.type === 'revision_tarif') {
    const subject = `${nomEntite} — Révision tarifaire annuelle — Contrat ${c.numero}`;
    const body =
      preamble +
      `Objet : Révision tarifaire annuelle — Contrat ${c.numero}\n\n` +
      `Conformément à l'article 7.4 de votre contrat prévoyant une révision tarifaire annuelle, nous vous informons que les nouvelles conditions tarifaires entreront en vigueur à compter du ${fmtDate(c.dateRevisionTarif!)}.\n\n` +
      `Un avenant détaillant la grille tarifaire actualisée vous sera transmis séparément pour signature. Nous restons à votre disposition pour toute question.` +
      letterFooter();
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
    letterFooter();
  return { subject, body };
}
