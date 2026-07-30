import { prisma } from '../db';

// Un compte Gmail dédié par entité (SORAM, SIS, IRIS...) plutôt qu'un seul
// compte partagé par le groupe — chaque société doit envoyer ses relances
// depuis sa propre adresse, pas depuis celle de l'admin qui a connecté
// l'intégration. `entite` est la même chaîne libre que Client.entite (pas de
// contrainte d'unicité stricte pour la même raison que le reste du modèle :
// Postgres autorise plusieurs lignes avec la même valeur nullable/non-unique
// ici, donc on retrouve la ligne via findFirst plutôt qu'un upsert).
export async function getGmailCredential(entite: string) {
  return prisma.integrationCredential.findFirst({ where: { service: 'gmail', entite } });
}

export async function listGmailCredentials() {
  return prisma.integrationCredential.findMany({ where: { service: 'gmail' } });
}

export async function saveGmailCredential(entite: string, refreshToken: string, compteEmail: string) {
  const existing = await getGmailCredential(entite);
  const data = { statut: 'actif' as const, refreshToken, compteEmail, derniereSync: new Date() };
  if (existing) {
    return prisma.integrationCredential.update({ where: { id: existing.id }, data });
  }
  return prisma.integrationCredential.create({ data: { service: 'gmail', entite, ...data } });
}

export async function clearGmailCredential(entite: string) {
  const existing = await getGmailCredential(entite);
  if (!existing) return;
  await prisma.integrationCredential.update({
    where: { id: existing.id },
    data: { statut: 'inactif', refreshToken: null },
  });
}

export async function touchGmailCredential(entite: string) {
  const existing = await getGmailCredential(entite);
  if (!existing) return;
  await prisma.integrationCredential.update({ where: { id: existing.id }, data: { derniereSync: new Date() } });
}
