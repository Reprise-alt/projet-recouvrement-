# Déploiement — Olu 360 (recouvrement)

Deux services à déployer : `backend/` (API Node/Express + PostgreSQL) et `frontend/` (site statique
Vite/React). Configs prêtes pour Railway et Render — choisis l'un ou l'autre, pas besoin des deux.

## Render (Blueprint)

Le fichier `render.yaml` à la racine décrit les 3 ressources (base Postgres, backend, frontend
statique). Sur [render.com](https://render.com) : New > Blueprint, pointe sur ce dépôt, Render lit
`render.yaml` automatiquement.

Après la première création, renseigne dans le dashboard Render les variables marquées
`sync: false` (jamais commitées) :

- Backend (`recouvrement-backend`) : `SUPABASE_URL` (Project Settings > General sur Supabase — sert
  à vérifier les tokens via les clés publiques du projet, pas de secret à copier), `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (doit pointer vers
  `https://<ton-backend>.onrender.com/api/integrations/gmail/callback`), `FRONTEND_URL` (l'URL du
  site statique), `CORS_ORIGIN` (même URL, pour restreindre les appels API à ce frontend).
- Frontend (`recouvrement-frontend`) : `VITE_API_URL` (l'URL du backend), et si Supabase est prêt
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Laisse `VITE_ALLOW_DEV_LOGIN=false` en production.

## Railway

`backend/railway.json` configure le build/démarrage du backend (migration Prisma appliquée
automatiquement avant le démarrage, healthcheck sur `/health`). Crée un service Postgres Railway à
part, branche sa `DATABASE_URL` sur le service backend, puis renseigne les mêmes variables
d'environnement que ci-dessus (`SUPABASE_URL`, `GOOGLE_CLIENT_*`, `FRONTEND_URL`,
`CORS_ORIGIN`). Railway n'a pas d'équivalent direct pour un site statique Vite — déployer le
frontend sur Render (static site) ou un service séparé reste le plus simple si tu pars sur Railway
pour le backend.

## Après le premier déploiement (les deux plateformes)

1. Provisionner le premier compte admin — la table `Utilisateur` est vide au départ, et `/api/users`
   exige déjà un admin :
   ```
   SEED_ADMIN_EMAIL=toi@exemple.sn SEED_ADMIN_NOM="Ton nom" npm run seed:admin
   ```
   (à lancer avec `DATABASE_URL` pointée sur la base de production — depuis un shell Render/Railway,
   ou en local avec la bonne variable d'environnement.)
2. Se connecter avec ce compte, aller dans **Utilisateurs** pour provisionner les managers/comptables.
3. Aller dans **Intégrations** pour connecter le compte Gmail dédié (nécessite d'avoir créé le client
   OAuth2 Google Cloud au préalable — voir `backend/README.md`).

## Points de vigilance

- `NODE_ENV=production` doit être positionné sur le backend déployé — sans quoi
  `/api/auth/dev-token` resterait accessible publiquement.
- `GOOGLE_REDIRECT_URI` doit être exactement l'URL enregistrée sur le client OAuth2 dans Google
  Cloud Console (Authorized redirect URIs), schéma HTTPS inclus.
- `NODE_ENV=production` étant déjà actif pendant le build lui-même (pas seulement à l'exécution),
  `npm install` seul ignore les devDependencies (TypeScript, `@types/*`) et le build plante. C'est
  pour ça que `buildCommand` utilise `npm install --include=dev` plutôt qu'un simple `npm install` —
  à garder si jamais la commande de build est modifiée.
