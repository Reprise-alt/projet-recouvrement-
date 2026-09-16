// Contexte multi-tenant (addendum SaaS §2-3).
//
// Organisation « socle » : en héritage mono-tenant, toutes les données du
// groupe (SORAM / SIS / IRIS) vivent dans une organisation unique. Son id est
// figé pour servir de DEFAULT au rattachement des racines métier (cf. la
// migration `fondation_multi_tenant` et `organisationId @default(...)` dans le
// schéma). Le groupe est le client n°1 (§1.9) et migrera comme les autres.
export const ORG_GROUPE_ID = 'org-groupe-olu360';

// Slug d'URL lisible dérivé d'un nom (sous-domaine / portail débiteur). Sans
// accents, minuscules, tirets. Repli « org » si le nom ne donne rien d'exploitable.
export function slugify(nom: string): string {
  return (
    String(nom ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  );
}
