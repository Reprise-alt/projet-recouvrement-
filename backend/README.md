# Recouvrement — backend

API de recouvrement & suivi de contrats pour Olu Ecosystems (SORAM / SIS / IRIS Afrique).
Port de la logique métier du prototype `recouvrement.html` vers un backend Node/Express + PostgreSQL (Prisma).

Périmètre de cette étape (voir le cahier des charges, §5 étapes 1-3) : scaffolding, logique métier,
parseurs Excel/CSV, routes API. **Pas encore inclus** : authentification/rôles, frontend React, envoi Gmail,
connecteurs ARTIS/MAPON, déploiement — voir le cahier des charges pour la suite du plan.

## Démarrage

```bash
cp .env.example .env   # renseigner DATABASE_URL
npm install
npx prisma migrate dev
npm run dev             # API sur http://localhost:3000
```

## Tests

```bash
npm test
```

Les tests couvrent la logique pure (paliers, échéances de contrat, génération des courriers,
parseurs Excel, règles de fusion) sans dépendre d'une base de données.

## Structure

- `src/lib/` — logique métier pure (paliers, échéances, courriers, parseurs, règles de fusion)
- `src/services/` — logique appliquée à la base (import, config)
- `src/routes/` — routes Express
- `prisma/schema.prisma` — modèle de données (voir cahier des charges §3)

## Points de vigilance repris du cahier des charges

- La fusion à l'import (`src/lib/merge.ts`, `src/services/importService.ts`) ne remplace jamais les
  factures/contrats en bloc : une facture déjà payée ne repasse jamais impayée, un contact saisi à la
  main n'est jamais écrasé, l'historique des envois de courriers est toujours conservé.
- `xlsx` a une vulnérabilité connue sans correctif publié sur npm (voir `npm audit`). Le risque est
  limité ici car l'import est réservé aux utilisateurs internes authentifiés (à verrouiller dès l'étape
  auth/rôles) sur des fichiers internes au groupe — à réévaluer si l'usage change.
