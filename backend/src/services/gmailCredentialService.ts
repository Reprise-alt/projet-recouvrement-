import { prisma } from '../db';

// Compte Gmail dédié partagé par le groupe (ex: recouvrement@soram-afrique.com)
// — une seule ligne, pas de portée par entité. Traité comme un singleton via
// findFirst plutôt qu'une contrainte d'unicité (Postgres n'empêche pas
// plusieurs lignes NULL sur une colonne nullable dans une contrainte unique).
export async function getGmailCredential() {
  return prisma.integrationCredential.findFirst({ where: { service: 'gmail' } });
}

export async function saveGmailCredential(refreshToken: string, compteEmail: string) {
  const existing = await getGmailCredential();
  const data = { statut: 'actif' as const, refreshToken, compteEmail, derniereSync: new Date() };
  if (existing) {
    return prisma.integrationCredential.update({ where: { id: existing.id }, data });
  }
  return prisma.integrationCredential.create({ data: { service: 'gmail', ...data } });
}

export async function clearGmailCredential() {
  const existing = await getGmailCredential();
  if (!existing) return;
  await prisma.integrationCredential.update({
    where: { id: existing.id },
    data: { statut: 'inactif', refreshToken: null },
  });
}

export async function touchGmailCredential() {
  const existing = await getGmailCredential();
  if (!existing) return;
  await prisma.integrationCredential.update({ where: { id: existing.id }, data: { derniereSync: new Date() } });
}
