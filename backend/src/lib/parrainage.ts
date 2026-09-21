import { prisma } from '../db';

// Parrainage (« Invitez une entreprise, 1 mois offert »). Sans table dédiée :
// tout tient sur Organisation (codeParrainage / parrainePar / moisOffertsGagnes /
// recompenseParrainAppliquee). Fonctions hors contexte tenant (l'inscription et
// l'activation opèrent transversalement) — les orgs sont ciblées par id/code.

const MOIS_MS = 30 * 24 * 60 * 60 * 1000;

// Code lisible et non ambigu (sans 0/O/1/I) — ex. « FEY-7K3Q ».
function genererCode(): string {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return `FEY-${s}`;
}

// Retourne le code de parrainage de l'org, en le créant à la volée si absent.
export async function obtenirOuCreerCode(orgId: string): Promise<string> {
  const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { codeParrainage: true } });
  if (org?.codeParrainage) return org.codeParrainage;
  for (let i = 0; i < 20; i++) {
    const code = genererCode();
    const existe = await prisma.organisation.findUnique({ where: { codeParrainage: code }, select: { id: true } });
    if (existe) continue;
    try {
      await prisma.organisation.update({ where: { id: orgId }, data: { codeParrainage: code } });
      return code;
    } catch {
      // Collision de course : on réessaie avec un autre code.
    }
  }
  throw new Error('Impossible de générer un code de parrainage');
}

// Normalise un code saisi (casse + espaces).
export function normaliserCode(code: unknown): string | null {
  const c = String(code ?? '').trim().toUpperCase();
  return c ? c : null;
}

// À l'inscription : si le filleul a saisi un code valide (≠ son futur compte),
// on lie le filleul au parrain. Retourne true si le code est reconnu — l'appelant
// prolonge alors l'essai du filleul (bonus immédiat). Ne crédite PAS encore le
// parrain (récompense à la conversion du filleul en compte actif).
export async function codeParrainValide(code: string): Promise<boolean> {
  const parrain = await prisma.organisation.findUnique({ where: { codeParrainage: code }, select: { id: true } });
  return !!parrain;
}

// À l'activation d'un filleul (statut → actif) : confirme le parrainage et
// crédite le parrain d'un mois. Idempotent (recompenseParrainAppliquee). Si le
// parrain est encore en essai, on prolonge son essai de 30 j ; sinon on incrémente
// seulement son compteur (à honorer sur la prochaine facture par l'exploitant).
export async function confirmerParrainageSiActif(filleulId: string): Promise<void> {
  const filleul = await prisma.organisation.findUnique({
    where: { id: filleulId },
    select: { statut: true, parrainePar: true, recompenseParrainAppliquee: true },
  });
  if (!filleul || filleul.statut !== 'actif' || !filleul.parrainePar || filleul.recompenseParrainAppliquee) return;

  const parrain = await prisma.organisation.findUnique({
    where: { codeParrainage: filleul.parrainePar },
    select: { id: true, statut: true, dateFinEssai: true },
  });
  if (!parrain) {
    // Code orphelin : on marque quand même pour ne pas re-tenter à chaque activation.
    await prisma.organisation.update({ where: { id: filleulId }, data: { recompenseParrainAppliquee: true } });
    return;
  }

  const data: { moisOffertsGagnes: { increment: number }; dateFinEssai?: Date } = {
    moisOffertsGagnes: { increment: 1 },
  };
  // Parrain encore en essai : le mois offert prolonge concrètement son essai.
  if (parrain.statut === 'essai') {
    const base = parrain.dateFinEssai && parrain.dateFinEssai.getTime() > Date.now() ? parrain.dateFinEssai.getTime() : Date.now();
    data.dateFinEssai = new Date(base + MOIS_MS);
  }
  await prisma.organisation.update({ where: { id: parrain.id }, data });
  await prisma.organisation.update({ where: { id: filleulId }, data: { recompenseParrainAppliquee: true } });
}
