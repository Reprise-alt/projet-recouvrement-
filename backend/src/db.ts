// Client Prisma partagé de l'application.
//
// Il est ÉTENDU pour le multi-tenant (RLS Postgres, addendum §2.2) : voir
// lib/tenantDb.ts. Comportement clé — HORS d'un contexte tenant (c.-à-d. tant
// que RLS_ENABLED n'est pas activé, ou en dehors d'un appel withTenant), ce
// client se comporte EXACTEMENT comme un PrismaClient standard : l'extension est
// un simple passe-plat. L'isolation ne s'active que lorsqu'une requête est
// exécutée dans withTenant(organisationId, ...).
export { prisma, withTenant, currentOrganisationId, rlsActive } from './lib/tenantDb';
