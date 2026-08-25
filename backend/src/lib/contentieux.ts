// =====================================================================
// Copilote Contentieux — moteur d'analyse d'un dossier de recouvrement
// judiciaire (cadre OHADA / injonction de payer).
//
// Deux moitiés, volontairement séparées :
//  1. EXTRACTION IA (extraireAvecIa) — lit les pièces (PDF / images) et en
//     tire des faits structurés + une synthèse. Aucune donnée inventée :
//     l'IA ne renvoie que ce qui figure dans une pièce, et signale ce qui
//     manque plutôt que de le combler.
//  2. MOTEUR DÉTERMINISTE (construireDecompte / evaluerRecevabilite) — le
//     décompte chiffré et le verdict de recevabilité (certaine, liquide,
//     exigible, prescription) sont calculés en TypeScript, pas laissés au
//     LLM. Le droit ne se devine pas.
// =====================================================================
import Anthropic from '@anthropic-ai/sdk';
import type { Facture, PieceContentieux } from '@prisma/client';
import { TypePiece, VerdictRecevabilite } from '@prisma/client';

// Modèle Claude — par défaut le plus capable ; surchargeable pour arbitrer
// coût / latence via l'environnement (ANTHROPIC_MODEL).
const MODELE = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

// Délai de prescription (années) appliqué à la créance la plus ancienne.
// PARAMÉTRABLE — la valeur exacte doit être confirmée par un juriste OHADA
// selon la nature de la créance (par défaut 5 ans, à valider).
const PRESCRIPTION_ANNEES = Number(process.env.CONTENTIEUX_PRESCRIPTION_ANNEES || 5);

// Nombre maximum de pièces envoyées au modèle en une passe (garde-fou coût).
const MAX_PIECES_IA = Number(process.env.CONTENTIEUX_MAX_PIECES_IA || 20);

let clientIa: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!clientIa) clientIa = new Anthropic();
  return clientIa;
}

/** L'IA est-elle configurée ? Sinon on dégrade proprement (analyse déterministe seule). */
export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// ---------- Extraction IA ----------

export interface ExtractionPiece {
  pieceId: string;
  type: TypePiece;
  montant: number | null;
  date: string | null;
  reference: string | null;
  resume: string;
}
export interface ExtractionResultat {
  pieces: ExtractionPiece[];
  synthese: string;
  miseEnDemeurePresente: boolean;
  preuveLivraisonPresente: boolean;
  modele: string;
}

type PieceLegere = Pick<PieceContentieux, 'id' | 'type' | 'nomFichier' | 'mimeType' | 'contenu'>;

// Construit le bloc de contenu Anthropic adapté au type de fichier.
function blocPourPiece(p: PieceLegere): Anthropic.ContentBlockParam | null {
  const data = Buffer.from(p.contenu).toString('base64');
  if (p.mimeType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  if (p.mimeType === 'image/png' || p.mimeType === 'image/jpeg' || p.mimeType === 'image/webp' || p.mimeType === 'image/gif') {
    return { type: 'image', source: { type: 'base64', media_type: p.mimeType, data } };
  }
  return null; // types non lisibles directement (docx/xlsx…) — signalés en texte
}

const SYSTEME_EXTRACTION = `Tu assistes un service de recouvrement au Sénégal (cadre OHADA) dans la préparation d'un dossier contentieux.
Tu analyses des pièces justificatives et tu en extrais UNIQUEMENT les faits qui y figurent réellement.
Règles absolues :
- N'invente jamais un montant, une date, une référence ou un fait. Si une information n'est pas dans la pièce, mets null.
- Ne porte aucune appréciation juridique définitive : tu extrais et tu résumes, tu ne juges pas la recevabilité.
- Réponds STRICTEMENT en JSON valide, sans texte autour, au format demandé.`;

/**
 * Envoie les pièces au modèle et renvoie les faits extraits + une synthèse.
 * Renvoie null si l'IA n'est pas configurée (le dossier reste analysable en
 * mode déterministe). Ne lève pas : une panne IA ne doit pas bloquer l'analyse.
 */
export async function extraireAvecIa(pieces: PieceLegere[]): Promise<ExtractionResultat | null> {
  if (!iaDisponible() || pieces.length === 0) return null;

  const retenues = pieces.slice(0, MAX_PIECES_IA);
  const contenu: Anthropic.ContentBlockParam[] = [];
  const nonLisibles: string[] = [];
  for (const p of retenues) {
    const bloc = blocPourPiece(p);
    if (bloc) {
      contenu.push({ type: 'text', text: `--- Pièce id=${p.id} · ${p.nomFichier} ---` });
      contenu.push(bloc);
    } else {
      nonLisibles.push(`${p.id} (${p.nomFichier})`);
    }
  }

  const inventaire = retenues.map((p) => ({ id: p.id, fichier: p.nomFichier, type: p.type }));
  const consigne = `Voici ${retenues.length} pièce(s) d'un dossier de recouvrement. Inventaire : ${JSON.stringify(inventaire)}.
${nonLisibles.length ? `Pièces non lisibles directement (à classer d'après leur nom seulement) : ${nonLisibles.join(', ')}.` : ''}

Pour CHAQUE pièce, renvoie un objet { "pieceId", "type", "montant", "date", "reference", "resume" } où :
- "type" ∈ ["facture","bon_commande","contrat","mise_en_demeure","preuve_livraison","echange","releve_de_compte","autre"]
- "montant" = montant principal lisible sur la pièce en FCFA (nombre) ou null
- "date" = date de la pièce au format AAAA-MM-JJ ou null
- "reference" = numéro/référence de la pièce ou null
- "resume" = une phrase factuelle décrivant la pièce

Puis renvoie une "synthese" (2-3 phrases sur ce que le dossier prouve), et deux booléens :
"miseEnDemeurePresente" (une mise en demeure figure-t-elle au dossier ?) et "preuveLivraisonPresente" (une preuve de livraison/exécution figure-t-elle ?).

Réponds STRICTEMENT avec ce JSON : { "pieces": [...], "synthese": "...", "miseEnDemeurePresente": bool, "preuveLivraisonPresente": bool }`;

  contenu.push({ type: 'text', text: consigne });

  const reponse = await anthropic().messages.create({
    model: MODELE,
    max_tokens: 8000,
    system: SYSTEME_EXTRACTION,
    messages: [{ role: 'user', content: contenu }],
  });

  const texte = reponse.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlock).text).join('\n');
  const brut = extraireJson(texte);
  if (!brut) return null;

  const pieceType = (v: unknown): TypePiece =>
    (Object.values(TypePiece) as string[]).includes(String(v)) ? (v as TypePiece) : TypePiece.autre;

  return {
    pieces: Array.isArray(brut.pieces)
      ? brut.pieces.map((p: any) => ({
          pieceId: String(p.pieceId ?? ''),
          type: pieceType(p.type),
          montant: typeof p.montant === 'number' ? p.montant : null,
          date: p.date ? String(p.date) : null,
          reference: p.reference ? String(p.reference) : null,
          resume: String(p.resume ?? ''),
        }))
      : [],
    synthese: String(brut.synthese ?? ''),
    miseEnDemeurePresente: Boolean(brut.miseEnDemeurePresente),
    preuveLivraisonPresente: Boolean(brut.preuveLivraisonPresente),
    modele: MODELE,
  };
}

// Récupère le premier objet JSON d'une réponse (robuste à un éventuel texte autour).
function extraireJson(texte: string): any | null {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin === -1 || fin <= debut) return null;
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

// ---------- Moteur déterministe : décompte ----------

export interface ParamsDecompte {
  // Taux d'intérêt de retard ANNUEL (%), appliqué au principal depuis
  // l'échéance. 0 = pas d'intérêts (défaut prudent, à activer selon contrat).
  tauxInteretAnnuel?: number;
  // Pénalité forfaitaire (FCFA) ajoutée au décompte, si prévue au contrat.
  penalite?: number;
  // Frais (mise en demeure, huissier…) déjà engagés, en FCFA.
  frais?: number;
}

export interface LigneDecompteCalc {
  poste: string;
  montant: number;
  sourcePieceId: string | null;
}

/**
 * Construit le décompte de créance. Le PRINCIPAL vient des factures impayées
 * (chaque ligne sourcée sur sa facture) ; intérêts / pénalités / frais sont
 * ajoutés seulement si paramétrés. Rien n'est inventé.
 */
export function construireDecompte(
  factures: Facture[],
  params: ParamsDecompte = {},
  now: Date = new Date(),
): LigneDecompteCalc[] {
  const lignes: LigneDecompteCalc[] = [];
  let principal = 0;

  for (const f of factures) {
    principal += f.montant;
    lignes.push({ poste: `Principal — facture ${f.numero}`, montant: arrondi(f.montant), sourcePieceId: null });
  }

  const taux = params.tauxInteretAnnuel ?? 0;
  if (taux > 0) {
    let interets = 0;
    for (const f of factures) {
      const jours = Math.max(0, (now.getTime() - new Date(f.dateEcheance).getTime()) / 86_400_000);
      interets += (f.montant * (taux / 100) * jours) / 365;
    }
    if (interets > 0) lignes.push({ poste: `Intérêts de retard (${taux}%/an)`, montant: arrondi(interets), sourcePieceId: null });
  }
  if (params.penalite && params.penalite > 0) lignes.push({ poste: 'Pénalité contractuelle', montant: arrondi(params.penalite), sourcePieceId: null });
  if (params.frais && params.frais > 0) lignes.push({ poste: 'Frais engagés (mise en demeure, huissier…)', montant: arrondi(params.frais), sourcePieceId: null });

  return lignes;
}

export function totalDecompte(lignes: LigneDecompteCalc[]): number {
  return arrondi(lignes.reduce((s, l) => s + l.montant, 0));
}

// FCFA : pas de décimales.
const arrondi = (n: number) => Math.round(n);

// ---------- Moteur déterministe : recevabilité OHADA ----------

export interface Recevabilite {
  certaine: boolean;
  liquide: boolean;
  exigible: boolean;
  prescriptionOk: boolean;
  manquants: string[];
  competence: string | null;
  verdict: VerdictRecevabilite;
}

/**
 * Évalue les conditions de l'injonction de payer (OHADA) : créance certaine,
 * liquide, exigible, non prescrite ; puis dresse la checklist des manquants.
 * S'appuie sur les pièces déposées + l'extraction IA (si disponible).
 */
export function evaluerRecevabilite(
  factures: Facture[],
  pieces: Pick<PieceContentieux, 'type'>[],
  extraction: ExtractionResultat | null,
  clientNom: string,
  now: Date = new Date(),
): Recevabilite {
  const typesPresents = new Set(pieces.map((p) => p.type));
  const aType = (t: TypePiece) => typesPresents.has(t);

  // Certaine : une pièce prouve la dette (facture, contrat, ou bon de commande).
  const certaine = aType(TypePiece.facture) || aType(TypePiece.contrat) || aType(TypePiece.bon_commande);

  // Liquide : au moins une facture chiffrée > 0.
  const liquide = factures.length > 0 && factures.every((f) => f.montant > 0);

  // Exigible : au moins une échéance dépassée.
  const exigible = factures.some((f) => new Date(f.dateEcheance).getTime() < now.getTime());

  // Prescription : la facture la plus ANCIENNE est-elle encore dans le délai ?
  const plusAncienne = factures
    .map((f) => new Date(f.dateEcheance).getTime())
    .sort((a, b) => a - b)[0];
  let prescriptionOk = true;
  if (plusAncienne !== undefined) {
    const limite = new Date(plusAncienne);
    limite.setFullYear(limite.getFullYear() + PRESCRIPTION_ANNEES);
    prescriptionOk = limite.getTime() >= now.getTime();
  }

  // Checklist des manquants.
  const manquants: string[] = [];
  if (!certaine) manquants.push('Pièce prouvant la créance (facture, contrat ou bon de commande)');
  const mepPresente = aType(TypePiece.mise_en_demeure) || Boolean(extraction?.miseEnDemeurePresente);
  if (!mepPresente) manquants.push('Mise en demeure préalable');
  const preuveLivraison = aType(TypePiece.preuve_livraison) || Boolean(extraction?.preuveLivraisonPresente);
  if (!preuveLivraison) manquants.push('Preuve de livraison / d\'exécution');
  if (!factures.length) manquants.push('Au moins une facture impayée rattachée au dossier');

  // Compétence : juridiction du domicile du débiteur (à confirmer par le pro).
  const competence = `Juridiction du domicile du débiteur (${clientNom}) — à confirmer`;

  // Verdict de synthèse.
  let verdict: VerdictRecevabilite;
  if (!prescriptionOk || !certaine) verdict = VerdictRecevabilite.risque;
  else if (manquants.length > 0 || !exigible) verdict = VerdictRecevabilite.a_completer;
  else verdict = VerdictRecevabilite.pret;

  return { certaine, liquide, exigible, prescriptionOk, manquants, competence, verdict };
}

export const CONTENTIEUX_PRESCRIPTION_ANNEES = PRESCRIPTION_ANNEES;

// Date limite de prescription (créance la plus ancienne + délai) et jours
// restants — négatif si déjà prescrit. null si aucune facture datée.
export function infoPrescription(
  factures: { dateEcheance: Date | string | null }[],
): { dateLimite: string; joursRestants: number } | null {
  const times = factures
    .map((f) => (f.dateEcheance ? new Date(f.dateEcheance).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  if (!times.length) return null;
  const limite = new Date(Math.min(...times));
  limite.setFullYear(limite.getFullYear() + PRESCRIPTION_ANNEES);
  const joursRestants = Math.ceil((limite.getTime() - Date.now()) / 86_400_000);
  return { dateLimite: limite.toISOString(), joursRestants };
}
