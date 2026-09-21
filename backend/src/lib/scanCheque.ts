import Anthropic from '@anthropic-ai/sdk';

// Extraction assistée des champs d'un chèque à partir de sa photo (vision Claude).
// Optionnelle : si aucune clé API n'est configurée, l'agent saisit à la main.

// Modèle vision économique par défaut (OCR simple) ; surchargeable par env.
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

const MEDIA_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const INSTRUCTION = `Cette image est la photo d'un chèque bancaire (zone UEMOA, souvent Sénégal, montants en FCFA).
Extrais les informations et réponds UNIQUEMENT par un objet JSON strict, sans texte autour, au format :
{"montant": <entier en FCFA sans espaces ni symbole, ou null>, "banque": <nom de la banque ou null>, "numeroCheque": <numéro du chèque en chaîne, ou null>, "dateCheque": <"AAAA-MM-JJ" ou null>, "tireur": <nom du titulaire du compte / émetteur ou null>}.
Le montant en chiffres prime ; s'il est illisible, déduis-le du montant en lettres. N'invente aucune valeur : mets null si tu n'es pas sûr.`;

export async function extraireCheque(base64: string, mime: string): Promise<ChampsCheque> {
  const media = MEDIA_OK.has(mime) ? mime : 'image/jpeg';
  const res = await anthropic().messages.create({
    model: MODELE,
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media as 'image/jpeg', data: base64 } },
          { type: 'text', text: INSTRUCTION },
        ],
      },
    ],
  });
  const texte = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return parseChamps(texte);
}

function parseChamps(texte: string): ChampsCheque {
  const vide: ChampsCheque = { montant: null, banque: null, numeroCheque: null, dateCheque: null, tireur: null };
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return vide;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const montant = Number(String(o.montant ?? '').toString().replace(/[^\d]/g, ''));
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      montant: Number.isFinite(montant) && montant > 0 ? montant : null,
      banque: str(o.banque),
      numeroCheque: str(o.numeroCheque),
      dateCheque: str(o.dateCheque),
      tireur: str(o.tireur),
    };
  } catch {
    return vide;
  }
}
