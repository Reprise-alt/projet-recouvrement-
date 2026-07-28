# Recouvrement — backend

API de recouvrement & suivi de contrats pour Olu Ecosystems (SORAM / SIS / IRIS Afrique).
Port de la logique métier du prototype `recouvrement.html` vers un backend Node/Express + PostgreSQL (Prisma).

Périmètre couvert (voir le cahier des charges, §5 étapes 1-4) : scaffolding, logique métier,
parseurs Excel/CSV, routes API, authentification & rôles. **Pas encore inclus** : frontend React,
envoi Gmail, connecteurs ARTIS/MAPON, déploiement — voir le cahier des charges pour la suite du plan.

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

## Tests

```bash
npm test
```

Les tests couvrent la logique pure (paliers, échéances de contrat, génération des courriers,
parseurs Excel, règles de fusion) sans dépendre d'une base de données.

## Structure

- `src/lib/` — logique métier pure (paliers, échéances, courriers, parseurs, règles de fusion, portée par entité)
- `src/services/` — logique appliquée à la base (import, config)
- `src/middleware/auth.ts` — vérification JWT, contrôle de rôle, contrôle de portée par entité
- `src/routes/` — routes Express
- `prisma/schema.prisma` — modèle de données (voir cahier des charges §3)
- `prisma/seedAdmin.ts` — provisionne le tout premier compte admin (bootstrap hors API)

## Points de vigilance repris du cahier des charges

- La fusion à l'import (`src/lib/merge.ts`, `src/services/importService.ts`) ne remplace jamais les
  factures/contrats en bloc : une facture déjà payée ne repasse jamais impayée, un contact saisi à la
  main n'est jamais écrasé, l'historique des envois de courriers est toujours conservé.
- `xlsx` a une vulnérabilité connue sans correctif publié sur npm (voir `npm audit`). Le risque est
  limité ici car l'import est réservé aux utilisateurs internes authentifiés (à verrouiller dès l'étape
  auth/rôles) sur des fichiers internes au groupe — à réévaluer si l'usage change.
