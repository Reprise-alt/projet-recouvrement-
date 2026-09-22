import Anthropic from '@anthropic-ai/sdk';

// Extraction assistée des champs d'un ou plusieurs chèques à partir d'une photo
// OU d'un PDF scanné (vision Claude). Un PDF de bureau contient souvent un
// chèque par page : on extrait alors TOUS les chèques du fichier d'un coup.
// Optionnelle : si aucune clé API n'est configurée, l'agent saisit à la main.

const MODELE = process.env.ANTHROPIC_MODEL_SCAN || 'claude-haiku-4-5-20251001';

let clientIa: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!clientIa) clientIa = new Anthropic();
  return clientIa;
}

export function scanDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface ChampsCheque {
  montant: number | null;
  banque: string | null;
  numeroCheque: string | null;
  dateCheque: string | null; // AAAA-MM-JJ
  tireur: string | null;
}

const IMAGE_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export function estPdf(mime: string): boolean {
  return mime === 'application/pdf';
}
export function mediaSupporte(mime: string): boolean {
  return IMAGE_OK.has(mime) || estPdf(mime);
}

function instruction(beneficiaire?: string | null): string {
  const exclusion = beneficiaire
    ? `IMPORTANT : « ${beneficiaire} » (ou un nom très proche) est le BÉNÉFICIAIRE / créancier — ne l'utilise JAMAIS comme "tireur".`
    : `IMPORTANT : n'utilise JAMAIS comme "tireur" le nom écrit après « à l'ordre de » ou « Payez contre ce chèque à » : c'est le bénéficiaire (créancier), pas l'émetteur.`;
  return `Ce document contient un ou plusieurs chèques bancaires (zone UEMOA, Sénégal, montants en FCFA), généralement un chèque par page (parfois accompagné d'un bordereau de remise à ignorer).
Pour CHAQUE chèque, extrais :
- "montant" : le montant en FCFA (entier, sans espaces ni symbole). Lis d'abord le montant EN CHIFFRES dans la case à droite ; s'il est illisible, convertis le montant écrit EN TOUTES LETTRES. Fournis toujours un montant au mieux si un chèque est présent.
- "tireur" : le TITULAIRE DU COMPTE qui ÉMET le chèque (le débiteur qui paie), dont le nom est généralement PRÉ-IMPRIMÉ près du numéro de compte (« Compte N° »). ${exclusion}
- "banque" : nom de la banque. "numeroCheque" : numéro du chèque. "dateCheque" : "AAAA-MM-JJ".
Réponds UNIQUEMENT par un tableau JSON strict, sans texte autour :
[{"montant": <entier ou null>, "banque": <string ou null>, "numeroCheque": <string ou null>, "dateCheque": <"AAAA-MM-JJ" ou null>, "tireur": <string ou null>}]
Un objet par chèque, dans l'ordre des pages. N'invente rien : mets null si tu n'es pas sûr (sauf le montant, à estimer au mieux).`;
}

// Extrait TOUS les chèques d'un fichier (image ou PDF). Renvoie un tableau
// (une entrée par chèque détecté), éventuellement vide. `beneficiaire` (raison
// sociale du créancier) aide à ne pas confondre bénéficiaire et tireur.
export async function extraireCheques(base64: string, mime: string, beneficiaire?: string | null): Promise<ChampsCheque[]> {
  const bloc = estPdf(mime)
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: (IMAGE_OK.has(mime) ? mime : 'image/jpeg') as 'image/jpeg', data: base64 } };
  const res = await anthropic().messages.create({
    model: MODELE,
    max_tokens: 1500,
    messages: [{ role: 'user', content: [bloc, { type: 'text', text: instruction(beneficiaire) }] }],
  });
  const texte = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return parseChamps(texte);
}

// Compat : extraction d'un chèque unique (première entrée) — pour le scan simple.
export async function extraireCheque(base64: string, mime: string): Promise<ChampsCheque> {
  const liste = await extraireCheques(base64, mime);
  return liste[0] ?? { montant: null, banque: null, numeroCheque: null, dateCheque: null, tireur: null };
}

function unChamp(o: Record<string, unknown>): ChampsCheque {
  const montant = Number(String(o.montant ?? '').toString().replace(/[^\d]/g, ''));
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    montant: Number.isFinite(montant) && montant > 0 ? montant : null,
    banque: str(o.banque),
    numeroCheque: str(o.numeroCheque),
    dateCheque: str(o.dateCheque),
    tireur: str(o.tireur),
  };
}

function parseChamps(texte: string): ChampsCheque[] {
  // Priorité au tableau ; repli sur un objet unique (ancienne réponse) ; sinon vide.
  const arr = texte.match(/\[[\s\S]*\]/);
  if (arr) {
    try {
      const parsed = JSON.parse(arr[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((o) => o && typeof o === 'object').map((o) => unChamp(o as Record<string, unknown>));
      }
    } catch {
      /* tombe sur l'objet unique */
    }
  }
  const obj = texte.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return [unChamp(JSON.parse(obj[0]) as Record<string, unknown>)];
    } catch {
      /* rien d'exploitable */
    }
  }
  return [];
}
