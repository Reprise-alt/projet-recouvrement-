# Recouvrement — backend

API de recouvrement & suivi de contrats pour Olu Ecosystems (SORAM / SIS / IRIS Afrique).
Port de la logique métier du prototype `recouvrement.html` vers un backend Node/Express + PostgreSQL (Prisma).

Périmètre couvert (voir le cahier des charges, §5 étapes 1-6) : scaffolding, logique métier,
parseurs Excel/CSV, routes API, authentification & rôles, envoi Gmail (Phase 1 — validation
manuelle systématique). **Pas encore inclus** : connecteurs ARTIS/MAPON (accès pas encore obtenus),
déploiement effectif (configs prêtes, voir `../DEPLOYMENT.md`) — voir le cahier des charges pour la
suite du plan.

## Démarrage

```bash
cp .env.example .env   # renseigner DATABASE_URL, SUPABASE_JWT_SECRET
npm install
npx prisma migrate dev
SEED_ADMIN_EMAIL=toi@exemple.sn SEED_ADMIN_NOM="Ton nom" npm run seed:admin
npm run dev             # API sur http://localhost:3000
```

## Authentification & rôles

Toutes les routes `/api/*` (sauf `/api/auth/dev-token`) exigent un JWT Supabase valide en
`Authorization: Bearer <token>`. Le token identifie l'utilisateur par son email ; le rôle et
l'entité de rattachement viennent de la table `Utilisateur` de cette base (pas de Supabase), donc
un compte doit être provisionné via `/api/users` (admin uniquement) avant de pouvoir se connecter.

Rôles (cf. cahier des charges §4) :
- `admin` — accès complet aux 3 entités, config des paliers, import, gestion des utilisateurs.
- `manager_entite` — verrouillé à son `entite` (SORAM/SIS/IRIS + clients COMMUN) ; peut consulter,
  éditer les contacts, ajouter des factures, enregistrer des actions et générer les courriers/avenants
  de son entité. Aucun accès à la config globale, à l'import, ni aux autres entités — **y compris en
  appelant directement une route avec l'id d'un client d'une autre entité**, ce qui renvoie 403.
- `comptable` — lecture des 3 entités (ou d'une seule s'il y est rattaché), peut enregistrer des
  paiements/actions, mais ne génère pas de courriers et n'a pas accès à la config.

### Sans projet Supabase connecté (dev/tests)

`POST /api/auth/dev-token` (désactivée si `NODE_ENV=production`) émet un JWT signé avec
`SUPABASE_JWT_SECRET` pour un utilisateur déjà provisionné, afin de tester les routes protégées sans
dépendre d'un vrai projet Supabase. En production, l'émission des tokens est entièrement déléguée à
Supabase Auth (même secret partagé, configuré côté Supabase dans Project Settings > API).

## Envoi Gmail (Phase 1 — validation manuelle systématique)

L'envoi passe par l'API Gmail en OAuth2, avec un refresh token stocké côté serveur
(`IntegrationCredential`, jamais exposé au frontend). Validation manuelle systématique avant tout
envoi, quel que soit le palier — le frontend affiche toujours l'aperçu du texte avant de permettre
l'envoi (voir cahier des charges §4/§8, Phase 1).

Pour connecter un compte Gmail dédié (ex : `recouvrement@soram-afrique.com`) :

1. Google Cloud Console > un projet > APIs & Services > Écran de consentement OAuth (type Interne
   si Google Workspace, sinon Externe + ajouter le compte dédié comme testeur).
2. APIs & Services > Bibliothèque > activer **Gmail API**.
3. APIs & Services > Identifiants > Créer des identifiants > ID client OAuth (type Application web),
   avec comme URI de redirection autorisée exactement la valeur de `GOOGLE_REDIRECT_URI`
   (`http://localhost:3000/api/integrations/gmail/callback` en local).
4. Renseigner `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` dans `.env`.
5. Dans l'app (rôle admin) : bouton **Intégrations** > Connecter Gmail, se connecter avec le compte
   Gmail dédié et accepter le consentement.

Sans ces variables configurées, l'app fonctionne normalement (génération de courriers/avenants,
copie manuelle) mais l'envoi réel renvoie une erreur explicite plutôt que d'échouer silencieusement.

## Tests

```bash
npm test
```

Les tests couvrent la logique pure (paliers, échéances de contrat, génération des courriers,
parseurs Excel, règles de fusion, portée par entité, état OAuth) et la lib Gmail avec `googleapis`
mocké — sans dépendre d'une base de données ni de vrais identifiants Google.

## Structure

- `src/lib/` — logique métier pure (paliers, échéances, courriers, parseurs, règles de fusion,
  portée par entité, client Gmail OAuth2, état anti-CSRF du callback)
- `src/services/` — logique appliquée à la base (import, config, identifiants Gmail)
- `src/middleware/auth.ts` — vérification JWT, contrôle de rôle, contrôle de portée par entité
- `src/routes/` — routes Express (dont `integrations.ts` pour le flux OAuth Gmail et
  `sendEmail.ts` pour l'envoi réel, avec enregistrement automatique de l'action/envoi si succès)
- `prisma/schema.prisma` — modèle de données (voir cahier des charges §3)
- `prisma/seedAdmin.ts` — provisionne le tout premier compte admin (bootstrap hors API)

## Points de vigilance repris du cahier des charges

- La fusion à l'import (`src/lib/merge.ts`, `src/services/importService.ts`) ne remplace jamais les
  factures/contrats en bloc : une facture déjà payée ne repasse jamais impayée, un contact saisi à la
  main n'est jamais écrasé, l'historique des envois de courriers est toujours conservé.
- `xlsx` a une vulnérabilité connue sans correctif publié sur npm (voir `npm audit`). Le risque est
  limité ici car l'import est réservé aux utilisateurs internes authentifiés (à verrouiller dès l'étape
  auth/rôles) sur des fichiers internes au groupe — à réévaluer si l'usage change.
- `googleapis` (dépendance transitive `gaxios` > `rimraf` > `glob` > `minimatch` > `brace-expansion`)
  a une vulnérabilité connue sans correctif disponible même sur sa dernière version (voir
  `npm audit`) — utilitaires internes de fichiers non exposés à une entrée utilisateur dans notre
  usage, risque pratique faible.
- L'état anti-CSRF du callback OAuth Gmail (`src/lib/oauthState.ts`) est stocké en mémoire — suffisant
  pour un seul process, à remplacer par un store partagé si le backend est un jour scalé
  horizontalement sur plusieurs instances.
