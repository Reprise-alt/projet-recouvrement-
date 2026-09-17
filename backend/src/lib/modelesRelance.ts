// Modèles de relance personnalisables par organisation (addendum §5.3).
// Pour l'envoi automatique SaaS, on n'utilise pas les courriers du groupe
// (letters.ts, spécifiques SORAM/IRIS/SIS) : chaque relance est un message
// NEUTRE, au nom du client, rendu à partir d'un modèle par palier + variables,
// puis habillé d'un email de marque (logo et coordonnées de l'organisation).
//
// Ce module est PUR (aucune IO). L'éditeur console (tranche suivante) stockera
// des surcharges par tenant ; ici on fournit les modèles par défaut, le moteur
// de variables et le rendu HTML.
import { fmtDate, fmtFCFA } from './dates';
import { ClientWithFactures, clientEncours, clientJoursRetard, clientOldestEcheance } from './paliers';

// Variables disponibles dans les modèles (documentées pour l'éditeur §5.3).
export const VARIABLES_RELANCE = [
  { cle: 'entreprise', desc: 'Nom de votre entreprise' },
  { cle: 'debiteur', desc: 'Nom du client débiteur' },
  { cle: 'montant_du', desc: 'Montant total restant dû' },
  { cle: 'facture', desc: 'Numéro de la facture la plus ancienne' },
  { cle: 'echeance', desc: 'Date d’échéance de la facture la plus ancienne' },
  { cle: 'jours_retard', desc: 'Nombre de jours de retard' },
  { cle: 'instructions_paiement', desc: 'Vos instructions de paiement' },
  { cle: 'contact', desc: 'Votre contact recouvrement' },
] as const;

export interface ModeleRelance {
  sujet: string;
  corps: string;
}

// Modèles par défaut, paliers 1 à 5 (l'envoi automatique s'arrête à l'amiable,
// cf. PALIER_MAX_AUTO). Ton progressif : courtois → ferme. Signés {entreprise}.
export const MODELES_DEFAUT: Record<number, ModeleRelance> = {
  1: {
    sujet: 'Avis d’échéance — facture {facture}',
    corps:
      'Bonjour {debiteur},\n\n' +
      'Nous vous signalons que votre facture {facture}, d’un montant de {montant_du}, est arrivée à échéance le {echeance}.\n\n' +
      'S’il s’agit d’un oubli, merci de bien vouloir procéder au règlement. Si votre paiement est déjà en cours, n’en tenez pas compte.\n\n' +
      'Cordialement,\n{entreprise}',
  },
  2: {
    sujet: 'Rappel de règlement — facture {facture}',
    corps:
      'Bonjour {debiteur},\n\n' +
      'Sauf erreur de notre part, votre facture {facture} de {montant_du}, échue depuis le {echeance} ({jours_retard} jours), reste impayée.\n\n' +
      'Nous vous remercions de régulariser dans les meilleurs délais. Pour toute question, contactez-nous : {contact}.\n\n' +
      'Cordialement,\n{entreprise}',
  },
  3: {
    sujet: 'Deuxième rappel — facture {facture} en retard',
    corps:
      'Bonjour {debiteur},\n\n' +
      'Malgré notre précédent rappel, votre facture {facture} de {montant_du} demeure impayée ({jours_retard} jours de retard).\n\n' +
      'Nous vous invitons à procéder au règlement sans délai afin d’éviter toute mesure supplémentaire.\n\n' +
      'Cordialement,\n{entreprise}',
  },
  4: {
    sujet: 'Dernier rappel avant mesures — facture {facture}',
    corps:
      'Bonjour {debiteur},\n\n' +
      'Votre facture {facture} de {montant_du} est en retard de {jours_retard} jours et reste à ce jour impayée.\n\n' +
      'Sans règlement de votre part sous huitaine, nous serons contraints de prendre les mesures nécessaires au recouvrement de cette créance.\n\n' +
      'Cordialement,\n{entreprise}',
  },
  5: {
    sujet: 'Avis de suspension — facture {facture}',
    corps:
      'Bonjour {debiteur},\n\n' +
      'À défaut de règlement de votre facture {facture} de {montant_du} (en retard de {jours_retard} jours), nous vous informons que nos prestations pourront être suspendues jusqu’à régularisation.\n\n' +
      'Si votre situation le justifie, contactez-nous pour convenir d’un échéancier : {contact}.\n\n' +
      'Cordialement,\n{entreprise}',
  },
};

export interface OrgIdentite {
  raisonSociale: string;
  logoUrl?: string | null;
  adresse?: string | null;
  identifiantFiscal?: string | null;
  rccm?: string | null;
  formeJuridique?: string | null;
  capitalSocial?: string | null;
  contactRecouvrement?: string | null;
  instructionsPaiement?: string | null;
  pays?: 'SN' | 'CI' | null;
}

// Valeurs des variables pour un client + une organisation à un palier donné.
export function variablesRelance(
  client: ClientWithFactures & { nom: string },
  org: OrgIdentite,
): Record<string, string> {
  const oldest = clientOldestEcheance(client);
  return {
    entreprise: org.raisonSociale,
    debiteur: client.nom,
    montant_du: fmtFCFA(clientEncours(client)),
    facture: oldest?.numero ?? '—',
    echeance: oldest ? fmtDate(oldest.dateEcheance) : '—',
    jours_retard: String(clientJoursRetard(client)),
    instructions_paiement: org.instructionsPaiement ?? '',
    contact: org.contactRecouvrement ?? '',
  };
}

// Remplace les {variables} d'un texte. Les variables inconnues sont laissées
// telles quelles (elles restent visibles, jamais un « undefined »).
export function rendreVariables(texte: string, vars: Record<string, string>): string {
  return texte.replace(/\{([a-z_]+)\}/g, (m, cle) => (cle in vars ? vars[cle] : m));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Email de marque : logo et coordonnées de l'organisation autour du message.
// Styles INLINE (les clients mail ignorent les <style>). Neutre, lisible, sobre.
export function emailRelanceHtml(org: OrgIdentite, corpsRendu: string, instructionsPaiement?: string | null): string {
  const nom = escapeHtml(org.raisonSociale);
  const logo = org.logoUrl
    ? `<img src="${escapeHtml(org.logoUrl)}" alt="${nom}" style="max-height:48px;max-width:200px;display:block" />`
    : `<div style="font-size:18px;font-weight:700;color:#177f5e">${nom}</div>`;
  const corpsHtml = escapeHtml(corpsRendu)
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#22262a">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const paiement = instructionsPaiement && instructionsPaiement.trim()
    ? `<div style="margin-top:18px;padding:14px 16px;background:#f4f6f5;border-radius:10px">
         <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#5b6469;margin-bottom:6px">Modalités de paiement</div>
         <div style="font-size:14px;line-height:1.5;color:#22262a">${escapeHtml(instructionsPaiement.trim()).replace(/\n/g, '<br/>')}</div>
       </div>`
    : '';
  // Mention légale « <forme> au capital de <montant> » (OHADA) — assemblée des
  // deux champs, ou l'un des deux s'il manque l'autre.
  const mentionLegale =
    org.formeJuridique && org.capitalSocial
      ? `${escapeHtml(org.formeJuridique)} au capital de ${escapeHtml(org.capitalSocial)}`
      : org.formeJuridique
        ? escapeHtml(org.formeJuridique)
        : org.capitalSocial
          ? `Capital : ${escapeHtml(org.capitalSocial)}`
          : '';
  const piedInfos = [
    mentionLegale,
    org.adresse ? escapeHtml(org.adresse) : '',
    org.identifiantFiscal ? `${org.pays === 'CI' ? 'IFU' : 'NINEA'} : ${escapeHtml(org.identifiantFiscal)}` : '',
    org.rccm ? `RCCM : ${escapeHtml(org.rccm)}` : '',
    org.contactRecouvrement ? escapeHtml(org.contactRecouvrement) : '',
  ].filter(Boolean).join(' · ');

  return `<!doctype html><html><body style="margin:0;background:#eceee9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #e4e7e3;border-radius:14px;overflow:hidden">
      <div style="padding:22px 26px;border-bottom:1px solid #eef0eb">${logo}</div>
      <div style="padding:24px 26px">${corpsHtml}${paiement}</div>
    </div>
    <div style="padding:16px 26px;font-size:11.5px;line-height:1.5;color:#8a9298;text-align:center">
      ${piedInfos ? `<div>${piedInfos}</div>` : ''}
      <div style="margin-top:6px">Message envoyé par ${nom}.</div>
    </div>
  </div></body></html>`;
}

// Construit une relance complète (sujet, texte, html) pour un client, à partir
// du modèle du palier (défaut ici ; surcharge par tenant à venir §5.3-éditeur).
export function construireRelanceMarque(
  client: ClientWithFactures & { nom: string },
  org: OrgIdentite,
  palier: number,
  modele?: ModeleRelance,
): { sujet: string; texte: string; html: string } {
  const tpl = modele ?? MODELES_DEFAUT[palier] ?? MODELES_DEFAUT[2];
  const vars = variablesRelance(client, org);
  const sujet = rendreVariables(tpl.sujet, vars);
  const texte = rendreVariables(tpl.corps, vars);
  const html = emailRelanceHtml(org, texte, org.instructionsPaiement);
  return { sujet, texte, html };
}
