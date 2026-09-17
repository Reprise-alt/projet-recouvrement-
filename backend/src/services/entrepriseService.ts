import { prisma } from '../db';
import { COMMUN_CODE } from '../lib/entites';
import { KnownEntite } from '../lib/parsers';

export async function listEntreprises(includeInactive = false) {
  return prisma.entreprise.findMany({
    where: includeInactive ? undefined : { actif: true },
    orderBy: [{ estCommun: 'asc' }, { nom: 'asc' }],
  });
}

export async function getKnownEntitesForImport(): Promise<KnownEntite[]> {
  const entreprises = await listEntreprises(false);
  return entreprises.map((e) => ({ code: e.code, nom: e.nom }));
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '_');
}

export class EntrepriseValidationError extends Error {}

export async function createEntreprise(codeRaw: string, nom: string) {
  const code = normalizeCode(codeRaw);
  if (!code) throw new EntrepriseValidationError('Code requis');
  if (code === COMMUN_CODE) throw new EntrepriseValidationError('"COMMUN" est un code réservé');
  // Unicité PAR organisation (le code n'est plus unique globalement) : on
  // cherche dans le périmètre du tenant courant (RLS), pas dans toute la table.
  const existing = await prisma.entreprise.findFirst({ where: { code } });
  if (existing) throw new EntrepriseValidationError('Ce code existe déjà');
  return prisma.entreprise.create({ data: { code, nom: nom.trim() || code } });
}

// Garantit qu'une entité existe pour chaque code rencontré à l'import, DANS
// l'organisation cible. Les entités d'un client SaaS se découvrent ainsi depuis
// ses propres fichiers (elles n'existent jamais d'avance, contrairement au
// groupe). `organisationId` est fixé explicitement (comme applyImport) pour ne
// pas dépendre du contexte de session sur une longue transaction d'import.
export async function ensureEntreprises(codes: Iterable<string>, organisationId: string): Promise<void> {
  const uniques = new Set<string>();
  for (const raw of codes) {
    const code = normalizeCode(String(raw ?? ''));
    if (code && code !== COMMUN_CODE) uniques.add(code);
  }
  if (!uniques.size) return;
  const existing = await prisma.entreprise.findMany({
    where: { organisationId, code: { in: [...uniques] } },
    select: { code: true },
  });
  const present = new Set(existing.map((e) => e.code));
  const toCreate = [...uniques].filter((c) => !present.has(c));
  if (!toCreate.length) return;
  await prisma.entreprise.createMany({
    data: toCreate.map((code) => ({ organisationId, code, nom: code })),
    skipDuplicates: true,
  });
}

export async function updateEntreprise(id: string, patch: { nom?: string; actif?: boolean }) {
  const existing = await prisma.entreprise.findUnique({ where: { id } });
  if (!existing) throw new EntrepriseValidationError('Entreprise introuvable');
  if (existing.estCommun && patch.actif === false) {
    throw new EntrepriseValidationError("L'entité commune ne peut pas être désactivée");
  }
  return prisma.entreprise.update({
    where: { id },
    data: {
      nom: patch.nom?.trim() || undefined,
      actif: patch.actif,
    },
  });
}
