// Contexte multi-tenant (addendum SaaS §2-3).
//
// Organisation « socle » : en héritage mono-tenant, toutes les données du
// groupe (SORAM / SIS / IRIS) vivent dans une organisation unique. Son id est
// figé pour servir de DEFAULT au rattachement des racines métier (cf. la
// migration `fondation_multi_tenant` et `organisationId @default(...)` dans le
// schéma). Le groupe est le client n°1 (§1.9) et migrera comme les autres.
export const ORG_GROUPE_ID = 'org-groupe-olu360';
