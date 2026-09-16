# Multi-tenant & Row Level Security (RLS)

Isolation des données par organisation, imposée **au niveau base** (addendum SaaS §2.2).
Cette note décrit la conception livrée et les étapes restantes avant d'activer en prod.

## Ce qui est en place

- **Tenant** : modèle `Organisation`. `Client` et `Utilisateur` portent `organisationId`.
  Les données historiques du groupe vivent dans l'org socle `org-groupe-olu360`.
- **RLS Postgres** (migration `rls_multi_tenant`) sur les tables du produit
  (recouvrement + contentieux) :
  - `ENABLE` **+ `FORCE ROW LEVEL SECURITY`** (l'app se connecte comme propriétaire
    des tables ; sans `FORCE`, un propriétaire bypasse la RLS) ;
  - policy `tenant` : une ligne est visible/modifiable **ssi** elle appartient à
    l'organisation du contexte courant. Les tables filles sont filtrées par
    **jointure à leur `Client`** (pas de colonne dupliquée, pas de backfill) ;
  - **échappatoire non-cassante** : quand la variable de session
    `app.organisation_id` est **absente**, l'accès reste complet (comportement
    mono-tenant historique). L'isolation ne s'active que lorsqu'un contexte est posé ;
  - insertion : `organisationId` prend par défaut
    `coalesce(current_setting('app.organisation_id', true), 'org-groupe-olu360')`
    → rattachement automatique au tenant courant (ou au groupe hors contexte).
- **Contexte applicatif** (`src/lib/tenantDb.ts`) :
  - `withTenant(organisationId, fn)` ouvre une transaction, y pose la variable en
    **transaction-local** (`set_config(..., true)`, sûr avec un pool) et exécute `fn`
    sous ce contexte (AsyncLocalStorage) ;
  - le client `prisma` exporté est **étendu** : sous contexte, il redirige chaque
    opération sur la transaction porteuse de la variable ; hors contexte, c'est un
    **passe-plat** strictement équivalent à un `PrismaClient` standard ;
  - **interrupteur `RLS_ENABLED`** : tant qu'il n'est pas `true`, `withTenant` est un
    passe-plat (aucune transaction, aucun contexte) → comportement inchangé.

Validé par test d'intégration contre une vraie base Postgres 16 : isolation stricte
entre deux organisations, insertion auto-rattachée, insertion cross-tenant **bloquée**
par la base, accès legacy complet hors contexte. Les 287 tests existants passent.

## Activer en recette (étapes restantes)

1. **Câbler le contexte** : après authentification, envelopper le traitement des
   requêtes dans `withTenant(req.user.organisationId, ...)` (middleware à monter sur
   les routeurs du produit). Attention à la durée de transaction (éviter d'englober
   les appels externes longs — email, IA — dans la transaction tenant).
2. **Auditer les requêtes brutes** : `$queryRaw` / `$executeRaw` ne passent pas par la
   redirection d'opération et s'exécutent hors contexte tenant (donc en accès legacy).
   Les recenser et, pour celles qui touchent des tables du produit, les passer par le
   client de transaction ou y ajouter le filtre d'organisation.
3. **Activer** `RLS_ENABLED=true` sur une base de recette, rejouer les scénarios
   multi-organisations, vérifier les performances (policies par sous-requête).
4. **Resserrer l'échappatoire** : une fois tous les chemins câblés et validés,
   remplacer `app_current_org() IS NULL OR ...` par la seule condition d'égalité
   (fail-closed) dans une migration dédiée, pour supprimer tout accès legacy.

## Périmètre

Sous RLS : `Client`, `Utilisateur`, `Facture`, `Contrat`, `ActionRecouvrement`,
`Contact`, `EcheancierPaiement`, `TranchePaiement`, `EnvoiContrat`,
`DossierContentieux` et ses enfants (`PieceContentieux`, `AnalyseContentieux`,
`LigneDecompte`, `ActeContentieux`, `PropositionPaiement`).

Hors RLS pour l'instant (modules internes du groupe, hors produit SaaS) : Opérations,
Coursiers, Intégrations, vitrine (`DemandeContact`), `Config`, `Entreprise`.
