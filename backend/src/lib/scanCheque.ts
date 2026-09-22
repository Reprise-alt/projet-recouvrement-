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

const INSTRUCTION = `Ce document contient un ou plusieurs chèques bancaires (zone UEMOA, souvent Sénégal, montants en FCFA), généralement un chèque par page.
Extrais CHAQUE chèque trouvé et réponds UNIQUEMENT par un tableau JSON strict, sans texte autour, au format :
[{"montant": <entier en FCFA sans espaces ni symbole, ou null>, "banque": <nom de la banque ou null>, "numeroCheque": <numéro du chèque en chaîne, ou null>, "dateCheque": <"AAAA-MM-JJ" ou null>, "tireur": <nom du titulaire du compte / émetteur, ou null>}]
Un objet par chèque, dans l'ordre des pages. Le montant en chiffres prime ; s'il est illisible, déduis-le du montant en lettres. N'invente aucune valeur : mets null si tu n'es pas sûr.`;

// Extrait TOUS les chèques d'un fichier (image ou PDF). Renvoie un tableau
// (une entrée par chèque détecté), éventuellement vide.
export async function extraireCheques(base64: string, mime: string): Promise<ChampsCheque[]> {
  const bloc = estPdf(mime)
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: (IMAGE_OK.has(mime) ? mime : 'image/jpeg') as 'image/jpeg', data: base64 } };
  const res = await anthropic().messages.create({
    model: MODELE,
    max_tokens: 1500,
    messages: [{ role: 'user', content: [bloc, { type: 'text', text: INSTRUCTION }] }],
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
