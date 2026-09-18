import 'dotenv/config';
import { execFile } from 'node:child_process';
import { createApp } from './app';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// On ouvre le port IMMÉDIATEMENT, puis on applique les migrations.
//
// Pourquoi : l'hébergeur (Render) démarre un chronomètre de détection de port
// dès le lancement du process. Si `prisma migrate deploy` tourne AVANT d'ouvrir
// le port (ancien `startCommand: prisma migrate deploy && npm start`), la
// première application de migrations — lente — peut dépasser ce délai → « no
// open ports detected » → déploiement en échec, alors que tout est sain. En
// écoutant d'abord, le port s'ouvre en < 1 s et les migrations tournent juste
// après, sans compter contre le délai. (Le plan Render « free » n'offre pas de
// Pre-Deploy Command ; ce schéma en est l'équivalent côté code.)
const app = createApp();
app.listen(port, () => {
  console.log(`Recouvrement API listening on port ${port}`);
  appliquerMigrations();
});

function appliquerMigrations() {
  if (process.env.RUN_MIGRATIONS_ON_BOOT === 'false') {
    console.log('Migrations au démarrage désactivées (RUN_MIGRATIONS_ON_BOOT=false).');
    return;
  }
  console.log('Application des migrations (prisma migrate deploy)…');
  execFile('npx', ['prisma', 'migrate', 'deploy'], { env: process.env }, (err, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trim());
    if (err) {
      // On NE tue PAS le process : le service reste joignable (port ouvert) et
      // l'échec est visible dans les logs, à corriger avant le prochain boot.
      console.error('ÉCHEC des migrations au démarrage :', err.message);
    } else {
      console.log('Migrations appliquées.');
    }
  });
}
