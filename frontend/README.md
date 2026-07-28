# Recouvrement — frontend

Interface React (Vite + TypeScript) pour la plateforme de recouvrement & suivi de contrats
d'Olu Ecosystems, branchée sur l'API du dossier `../backend`. Port du prototype `recouvrement.html`
en composants, avec des vues adaptées au rôle connecté (cf. cahier des charges §4).

## Démarrage

```bash
cp .env.example .env   # VITE_API_URL vers le backend, config Supabase le cas échéant
npm install
npm run dev             # http://localhost:5173
```

Le backend (`../backend`) doit tourner et avoir au moins un compte admin provisionné
(`npm run seed:admin` côté backend) avant de pouvoir se connecter.

## Authentification

- Avec un projet Supabase connecté (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` renseignés) :
  écran de connexion email/mot de passe classique.
- Sans projet Supabase (`VITE_ALLOW_DEV_LOGIN=true`) : un second formulaire permet de se connecter
  avec l'email d'un compte déjà provisionné via `/api/auth/dev-token` côté backend — pratique pour
  développer/tester sans dépendre d'un vrai projet Supabase. À désactiver en production.

## Vues et permissions

- **Recouvrement** : KPIs, échelle des paliers (filtrable), tableau des clients, tiroir client
  (contact, factures, actions, génération de courrier).
- **Échéances de contrats** : KPIs, tableau des contrats, tiroir contrat (génération d'avenant,
  enregistrement d'envoi manuel).
- **Admin uniquement** : paramètres des paliers, import Excel/CSV, gestion des utilisateurs.

Les boutons d'envoi de courrier/avenant et l'accès à la configuration sont masqués selon le rôle
(cf. `src/components/ClientDrawer.tsx`, `App.tsx`), mais la protection réelle est côté serveur —
l'UI reflète simplement ce que l'API autorise déjà.

## Points de vigilance

- `vite`/`esbuild` ont une vulnérabilité connue limitée au serveur de développement (pas au build de
  production) sans correctif non-majeur disponible actuellement (voir `npm audit`) — sans impact sur
  le build déployé, à surveiller lors d'une future mise à jour majeure de Vite.
- L'envoi de courriers/avenants n'est pas encore connecté à Gmail (phase suivante du cahier des
  charges) : le tiroir contrat permet de générer le texte et d'enregistrer manuellement qu'un envoi a
  eu lieu, pas d'envoyer réellement l'email.
