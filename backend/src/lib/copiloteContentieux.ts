// =====================================================================
// Copilote juridique conversationnel — répond à des questions sur UN dossier
// contentieux précis, ancré sur ses données réelles (client, factures,
// recevabilité, actes, prescription). Cadre OHADA. L'IA informe et propose ;
// elle ne remplace jamais un huissier / avocat (garde-fou déontologique).
// =====================================================================
import Anthropic from '@anthropic-ai/sdk';

const MODELE = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const MAX_TOURS = Number(process.env.CONTENTIEUX_COPILOTE_MAX_TOURS || 12);

let clientIa: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!clientIa) clientIa = new Anthropic();
  return clientIa;
}

export function copiloteDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface MessageCopilote {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEME = `Tu es un copilote juridique spécialisé dans le recouvrement de créances en zone OHADA (Sénégal), au service d'une équipe de recouvrement.

Ton rôle : répondre de façon claire et pratique aux questions portant sur LE DOSSIER décrit ci-dessous, en t'appuyant UNIQUEMENT sur ses données réelles. Tu peux : expliquer les options (amiable, injonction de payer, commandement d'huissier, assignation), estimer la recevabilité (créance certaine/liquide/exigible, prescription), rédiger des courriers ou paragraphes sur demande, et recommander une stratégie.

Règles :
- Réponds en français, de manière concise et concrète.
- Ne cite que des faits présents dans le contexte du dossier ; si une information manque, dis-le et indique la pièce à obtenir.
- Rappelle, quand c'est utile, que tes réponses ne constituent pas un conseil juridique définitif : un huissier de justice ou un avocat doit valider et signer les actes. Ne prétends jamais déposer ou signifier un acte.
- N'invente pas de jurisprudence ni de numéro d'article dont tu n'es pas sûr.`;

// Construit un résumé texte du dossier à injecter dans le prompt système.
export interface ContexteDossier {
  reference: string;
  statut: string;
  clientNom: string;
  entite: string;
  montantReclame: number | null;
  verdict: string;
  analyse: {
    certaine: boolean;
    liquide: boolean;
    exigible: boolean;
    prescriptionOk: boolean;
    manquants: string[];
    competence: string | null;
    syntheseIa: string | null;
  } | null;
  prescription: { dateLimite: string; joursRestants: number } | null;
  factures: { numero: string; montant: number; dateEcheance: string | null; statut: string }[];
  decompte: { poste: string; montant: number }[];
  actes: { type: string; statut: string }[];
  issue: string | null;
}

export function construireContexte(d: ContexteDossier): string {
  const l: string[] = [];
  l.push(`Référence : ${d.reference} — statut : ${d.statut}${d.issue ? ' (dénouement : ' + d.issue + ')' : ''}`);
  l.push(`Débiteur : ${d.clientNom} — créancier (entité) : ${d.entite}`);
  if (d.montantReclame != null) l.push(`Montant réclamé : ${Math.round(d.montantReclame)} FCFA`);
  l.push(`Verdict de recevabilité : ${d.verdict}`);
  if (d.analyse) {
    l.push(
      `Critères : certaine=${oui(d.analyse.certaine)}, liquide=${oui(d.analyse.liquide)}, exigible=${oui(d.analyse.exigible)}, non prescrite=${oui(d.analyse.prescriptionOk)}`,
    );
    if (d.analyse.manquants.length) l.push(`Éléments manquants : ${d.analyse.manquants.join(' ; ')}`);
    if (d.analyse.competence) l.push(`Compétence : ${d.analyse.competence}`);
    if (d.analyse.syntheseIa) l.push(`Synthèse précédente : ${d.analyse.syntheseIa}`);
  } else {
    l.push('Dossier non encore analysé.');
  }
  if (d.prescription) l.push(`Prescription : au plus tard le ${d.prescription.dateLimite.slice(0, 10)} (dans ${d.prescription.joursRestants} j).`);
  if (d.factures.length) {
    l.push('Factures :');
    for (const f of d.factures.slice(0, 30)) l.push(`  - ${f.numero} : ${Math.round(f.montant)} FCFA, échéance ${f.dateEcheance?.slice(0, 10) || 'n.c.'}, ${f.statut}`);
  }
  if (d.decompte.length) {
    l.push('Décompte :');
    for (const x of d.decompte) l.push(`  - ${x.poste} : ${Math.round(x.montant)} FCFA`);
  }
  if (d.actes.length) l.push(`Actes déjà générés : ${d.actes.map((x) => x.type + ' (' + x.statut + ')').join(', ')}`);
  return l.join('\n');
}

function oui(b: boolean): string {
  return b ? 'oui' : 'non';
}

export async function repondreCopilote(contexte: string, historique: MessageCopilote[], question: string): Promise<{ reponse: string; modele: string }> {
  const messages: MessageCopilote[] = [...historique.slice(-MAX_TOURS), { role: 'user', content: question }];
  const res = await anthropic().messages.create({
    model: MODELE,
    max_tokens: 1024,
    system: `${SYSTEME}\n\n=== CONTEXTE DU DOSSIER ===\n${contexte}`,
    messages,
  });
  const reponse = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { reponse: reponse || "Je n'ai pas pu produire de réponse.", modele: MODELE };
}
