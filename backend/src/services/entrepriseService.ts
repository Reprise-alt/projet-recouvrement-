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
  const existing = await prisma.entreprise.findUnique({ where: { code } });
  if (existing) throw new EntrepriseValidationError('Ce code existe déjà');
  return prisma.entreprise.create({ data: { code, nom: nom.trim() || code } });
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
