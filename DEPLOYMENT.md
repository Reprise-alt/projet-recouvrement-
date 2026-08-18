# Déploiement — Olu 360 (Recouvrement · Opérations · Coursier)

Depuis le découpage en consoles séparées, l'ensemble se compose de **cinq ressources** : une base
Postgres, **un seul back-end** (API Node/Express, partagé) et **trois sites statiques** Vite/React —
un par console. Les trois fronts sont buildés depuis le **même dossier `frontend/`**, chacun avec une
variable `VITE_CONSOLE` différente (`recouvrement` / `operations` / `coursier`) qui détermine la
console servie. Configs prêtes pour Railway et Render.

Domaines cibles : `recouvrement.olu360.com`, `operations.olu360.com`, `coursier.olu360.com`.

## Render (Blueprint)

Le fichier `render.yaml` à la racine décrit toutes les ressources (base Postgres, back-end, les trois
fronts, et un groupe de variables communes aux fronts). Sur [render.com](https://render.com) :
New > Blueprint, pointe sur ce dépôt, Render lit `render.yaml` automatiquement.

Après la première création, renseigne dans le dashboard Render les variables marquées
`sync: false` (jamais commitées) :

- **Back-end** (`recouvrement-backend`) : `SUPABASE_URL` (Project Settings > General sur Supabase —
  sert à vérifier les tokens via les clés publiques du projet, pas de secret à copier),
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (doit pointer vers
  `https://<ton-backend>.onrender.com/api/integrations/gmail/callback`), `FRONTEND_URL` (l'URL d'une
  des consoles, pour les liens des e-mails), et surtout `CORS_ORIGIN` = **liste des 3 origines
  séparées par des virgules** :
  `https://recouvrement.olu360.com,https://operations.olu360.com,https://coursier.olu360.com`
- **Groupe `olu360-frontend-shared`** (hérité par les 3 fronts, à renseigner **une seule fois**) :
  `VITE_API_URL` (l'URL du back-end), et si Supabase est prêt `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY`. `VITE_ALLOW_DEV_LOGIN=false` est déjà fixé.
- **Chaque front** porte en plus son `VITE_CONSOLE` (déjà fixé dans le blueprint :
  `recouvrement-frontend`→`recouvrement`, `operations-frontend`→`operations`,
  `coursier-frontend`→`coursier`). Attache ensuite le domaine correspondant à chaque service
  (Settings > Custom Domains).

> Note : `VITE_CONSOLE` est lu au **build** par Vite. Un changement de valeur nécessite un
> redéploiement du site concerné pour être pris en compte.

### Migration additive (accès Planning coursiers)

La migration `add_acces_planning_coursiers` est **additive** (ajout d'une colonne avec valeur par
défaut, aucune donnée touchée) et s'applique automatiquement au démarrage du back-end via
`prisma migrate deploy`. Elle met `accesPlanningCoursiers = true` pour tous les comptes qui avaient
déjà l'accès recouvrement — personne ne perd l'accès au planning lors de la bascule.

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
