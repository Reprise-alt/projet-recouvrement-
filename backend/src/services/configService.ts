import { prisma, currentOrganisationId } from '../db';
import { CLE_PAR_PALIER, DEFAULT_CONFIG, PALIERS_MODIFIABLES, PALIER_PAR_CLE, PalierConfig } from '../lib/paliers';

// Organisation socle du groupe : utilisée comme repli hors contexte tenant
// (déploiement groupe RLS désactivée), cohérent avec le défaut de colonne.
const SOCLE = 'org-groupe-olu360';
function orgCourante(): string {
  return currentOrganisationId() ?? SOCLE;
}

// Seuils de paliers (jours) de l'organisation courante. Assemblés depuis les
// lignes PalierOrg (scopées par RLS) ; toute valeur absente retombe sur le
// défaut. Signature inchangée pour tous les consommateurs (moteur de relances,
// clients, reporting…) : la source est simplement devenue propre au tenant.
export async function getConfig(): Promise<PalierConfig> {
  const rows = await prisma.palierOrg.findMany({ select: { palier: true, jours: true } });
  const joursParPalier = new Map(rows.map((r) => [r.palier, r.jours]));
  const out: PalierConfig = { ...DEFAULT_CONFIG };
  for (const palier of PALIERS_MODIFIABLES) {
    const j = joursParPalier.get(palier);
    if (typeof j === 'number' && j > 0) out[CLE_PAR_PALIER[palier]] = j;
  }
  return out;
}

export async function updateConfig(patch: Partial<PalierConfig>): Promise<PalierConfig> {
  const organisationId = orgCourante();
  for (const [cle, val] of Object.entries(patch)) {
    if (typeof val !== 'number' || val <= 0) continue;
    const palier = PALIER_PAR_CLE[cle];
    if (!palier) continue;
    await prisma.palierOrg.upsert({
      where: { organisationId_palier: { organisationId, palier } },
      create: { organisationId, palier, jours: val },
      update: { jours: val },
    });
  }
  return getConfig();
}

// ── Réglages complets d'un palier (jours + activation + libellé) ────────────
export interface ReglagePalier {
  palier: number;
  actif: boolean;
  libelle: string | null;
  jours: number;
}

export interface PatchReglagePalier {
  palier: number;
  actif?: boolean;
  libelle?: string | null;
  jours?: number;
}

export async function getReglagesPaliers(): Promise<ReglagePalier[]> {
  const rows = await prisma.palierOrg.findMany();
  const parPalier = new Map(rows.map((r) => [r.palier, r]));
  return PALIERS_MODIFIABLES.map((palier) => {
    const row = parPalier.get(palier);
    const joursDefaut = DEFAULT_CONFIG[CLE_PAR_PALIER[palier]];
    return {
      palier,
      actif: row?.actif ?? true,
      libelle: row?.libelle ?? null,
      jours: typeof row?.jours === 'number' && row.jours > 0 ? row.jours : joursDefaut,
    };
  });
}

export async function updateReglagesPaliers(patchs: PatchReglagePalier[]): Promise<ReglagePalier[]> {
  const organisationId = orgCourante();
  for (const p of patchs) {
    if (!PALIERS_MODIFIABLES.includes(p.palier)) continue;
    const data: { actif?: boolean; libelle?: string | null; jours?: number } = {};
    if (typeof p.actif === 'boolean') data.actif = p.actif;
    if (p.libelle !== undefined) data.libelle = p.libelle === null ? null : String(p.libelle).trim() || null;
    if (typeof p.jours === 'number' && p.jours > 0) data.jours = Math.floor(p.jours);
    if (!Object.keys(data).length) continue;
    await prisma.palierOrg.upsert({
      where: { organisationId_palier: { organisationId, palier: p.palier } },
      create: { organisationId, palier: p.palier, ...data },
      update: data,
    });
  }
  return getReglagesPaliers();
}

// Ensemble des paliers actifs de l'organisation courante (pour le moteur de
// relances : un palier désactivé est sauté dans la séquence). Un palier sans
// ligne PalierOrg est actif par défaut.
export async function getPaliersActifs(): Promise<Set<number>> {
  const rows = await prisma.palierOrg.findMany({ select: { palier: true, actif: true } });
  const inactifs = new Set(rows.filter((r) => !r.actif).map((r) => r.palier));
  return new Set(PALIERS_MODIFIABLES.filter((p) => !inactifs.has(p)));
}
