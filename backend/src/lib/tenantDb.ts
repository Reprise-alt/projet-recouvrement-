import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';

// Couche multi-tenant (addendum §2.2). L'isolation réelle est posée par la RLS
// Postgres (migration `rls_multi_tenant`) ; ce module fournit le CONTEXTE : la
// variable de session `app.organisation_id` que les policies lisent.
//
// Mécanique (validée par test d'intégration, cf. tmp-test-rls) :
//  - withTenant(org, fn) ouvre UNE transaction interactive, y pose la variable
//    en transaction-local (`set_config(..., true)` — sûr avec un pool), et
//    range le client de transaction (tx) dans un AsyncLocalStorage pour la durée
//    de fn.
//  - L'extension `prisma` REDIRIGE chaque opération de modèle sur ce tx quand un
//    contexte est présent. C'est indispensable : rappeler `query(args)` (client
//    de base) repart sur une AUTRE connexion du pool où la variable n'est pas
//    posée → la RLS ne s'appliquerait pas (fuite). En redirigeant sur tx, la
//    requête tourne sur la connexion qui porte la variable.
//  - Sans contexte, la requête part telle quelle et l'échappatoire RLS
//    (« variable absente → legacy ») laisse l'accès complet : le fonctionnement
//    mono-tenant du groupe reste strictement inchangé tant que rien n'est câblé.
//
// Interrupteur : RLS_ENABLED. Tant qu'il n'est pas « true », withTenant est un
// simple passe-plat (aucune transaction, aucun contexte). On l'active en recette
// une fois la RLS déployée et vérifiée.

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const txStorage = new AsyncLocalStorage<{ tx: TxClient; organisationId: string }>();

export function rlsActive(): boolean {
  return process.env.RLS_ENABLED === 'true';
}

const base = new PrismaClient();

// Exécute `fn` sous le contexte d'une organisation. No-op (passe-plat) tant que
// RLS_ENABLED n'est pas activé. La transaction couvre toute la durée de fn, avec
// une fenêtre généreuse pour les traitements longs (imports).
export function withTenant<T>(organisationId: string, fn: () => Promise<T>): Promise<T> {
  if (!rlsActive()) return fn();
  return base.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.organisation_id', ${organisationId}, true)`;
      // IMPORTANT : on `await` fn À L'INTÉRIEUR du contexte ALS. Sans cet await,
      // une opération Prisma paresseuse (`() => prisma.x.findMany()`) ne
      // s'exécuterait qu'après la sortie du contexte → l'extension ne verrait
      // plus le tenant et la requête fuirait hors transaction (RLS non appliquée).
      return txStorage.run({ tx, organisationId }, async () => await fn());
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

export function currentOrganisationId(): string | undefined {
  return txStorage.getStore()?.organisationId;
}

export const prisma = base.$extends({
  query: {
    async $allOperations({ args, query, model, operation }) {
      const store = txStorage.getStore();
      if (!store || !model) return query(args);
      // Redirige l'opération sur le client de transaction (même connexion que
      // le set_config). Nom de modèle PascalCase -> accesseur camelCase.
      const accessor = model.charAt(0).toLowerCase() + model.slice(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (store.tx as any)[accessor][operation](args);
    },
  },
});

export type TenantPrisma = typeof prisma;
