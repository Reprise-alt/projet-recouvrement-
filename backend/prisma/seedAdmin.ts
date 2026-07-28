import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Bootstrap du tout premier compte admin : toutes les routes de gestion des
// utilisateurs (/api/users) exigent déjà un admin authentifié, donc ce
// premier compte doit être créé hors API. À lancer une seule fois par
// environnement (idempotent — un email déjà provisionné n'est pas dupliqué).
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const nom = process.env.SEED_ADMIN_NOM;
  if (!email || !nom) {
    console.error('SEED_ADMIN_EMAIL et SEED_ADMIN_NOM sont requis.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const admin = await prisma.utilisateur.upsert({
    where: { email },
    update: {},
    create: { nom, email, role: 'admin', entite: null },
  });
  console.log('Admin provisionné :', admin.email);
  await prisma.$disconnect();
}

main();
