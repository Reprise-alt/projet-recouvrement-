-- Row Level Security multi-tenant (addendum §2.2). Isolation imposée AU NIVEAU
-- BASE : chaque organisation ne voit et n'écrit que ses propres lignes.
--
-- Conception validée :
--  * FORCE ROW LEVEL SECURITY : l'app se connecte comme propriétaire des tables,
--    or un propriétaire bypasse la RLS sans FORCE. Indispensable.
--  * Variable de session « app.organisation_id » posée par requête (transaction-
--    local, sûre avec un pool). Voir lib/tenantDb.ts.
--  * ÉCHAPPATOIRE non-cassante : quand la variable est absente (aucun contexte
--    tenant — jobs, scripts, code pas encore câblé), l'accès reste complet
--    (comportement mono-tenant historique du groupe). L'isolation ne s'active
--    QUE lorsqu'un contexte est posé. Cette échappatoire sera resserrée dans une
--    migration ultérieure, une fois tous les chemins câblés et validés en recette.
--  * Tables filles isolées par JOINTURE à leur Client (pas de colonne dupliquée,
--    pas de backfill) : une ligne est visible ssi son Client l'est.

-- 1) Rattachement automatique au tenant de la session à l'insertion.
--    coalesce(...) retombe sur l'org socle du groupe quand aucun contexte n'est
--    posé (legacy), et vaut l'org courante sinon. Prisma omet la colonne à
--    l'insert (default dbgenerated) → c'est ce défaut qui décide.
ALTER TABLE "Client"      ALTER COLUMN "organisationId" SET DEFAULT coalesce(current_setting('app.organisation_id', true), 'org-groupe-olu360');
ALTER TABLE "Utilisateur" ALTER COLUMN "organisationId" SET DEFAULT coalesce(current_setting('app.organisation_id', true), 'org-groupe-olu360');

-- 2) Fonction d'aide : id des clients visibles sous le contexte courant.
--    STABLE + rattachée au schéma. Utilisée par les policies des tables filles.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.organisation_id', true) $$;

-- 3) Activation RLS + FORCE + policy « tenant » sur chaque table du périmètre
--    produit (recouvrement + contentieux). Les modules internes du groupe
--    (Opérations, Coursier, Intégrations, vitrine) restent hors périmètre.

-- Racines (colonne organisationId locale).
ALTER TABLE "Client"      ENABLE ROW LEVEL SECURITY; ALTER TABLE "Client"      FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "Client"
  USING      (app_current_org() IS NULL OR "organisationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organisationId" = app_current_org());

ALTER TABLE "Utilisateur" ENABLE ROW LEVEL SECURITY; ALTER TABLE "Utilisateur" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "Utilisateur"
  USING      (app_current_org() IS NULL OR "organisationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organisationId" = app_current_org());

-- Enfants directs de Client : visibles ssi leur Client l'est.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Facture','Contrat','ActionRecouvrement','Contact','EcheancierPaiement','DossierContentieux']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY; ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t, t);
    EXECUTE format($f$
      CREATE POLICY tenant ON %I
        USING      (app_current_org() IS NULL OR "clientId" IN (SELECT id FROM "Client" WHERE "organisationId" = app_current_org()))
        WITH CHECK (app_current_org() IS NULL OR "clientId" IN (SELECT id FROM "Client" WHERE "organisationId" = app_current_org()));
    $f$, t);
  END LOOP;
END $$;

-- Petits-enfants : chemin explicite jusqu'à Client.
ALTER TABLE "TranchePaiement" ENABLE ROW LEVEL SECURITY; ALTER TABLE "TranchePaiement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "TranchePaiement"
  USING      (app_current_org() IS NULL OR "echeancierId" IN (SELECT e.id FROM "EcheancierPaiement" e JOIN "Client" c ON c.id = e."clientId" WHERE c."organisationId" = app_current_org()))
  WITH CHECK (app_current_org() IS NULL OR "echeancierId" IN (SELECT e.id FROM "EcheancierPaiement" e JOIN "Client" c ON c.id = e."clientId" WHERE c."organisationId" = app_current_org()));

ALTER TABLE "EnvoiContrat" ENABLE ROW LEVEL SECURITY; ALTER TABLE "EnvoiContrat" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "EnvoiContrat"
  USING      (app_current_org() IS NULL OR "contratId" IN (SELECT ct.id FROM "Contrat" ct JOIN "Client" c ON c.id = ct."clientId" WHERE c."organisationId" = app_current_org()))
  WITH CHECK (app_current_org() IS NULL OR "contratId" IN (SELECT ct.id FROM "Contrat" ct JOIN "Client" c ON c.id = ct."clientId" WHERE c."organisationId" = app_current_org()));

-- Enfants du dossier contentieux : via DossierContentieux -> Client.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['PieceContentieux','AnalyseContentieux','LigneDecompte','ActeContentieux','PropositionPaiement']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY; ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t, t);
    EXECUTE format($f$
      CREATE POLICY tenant ON %I
        USING      (app_current_org() IS NULL OR "dossierId" IN (SELECT d.id FROM "DossierContentieux" d JOIN "Client" c ON c.id = d."clientId" WHERE c."organisationId" = app_current_org()))
        WITH CHECK (app_current_org() IS NULL OR "dossierId" IN (SELECT d.id FROM "DossierContentieux" d JOIN "Client" c ON c.id = d."clientId" WHERE c."organisationId" = app_current_org()));
    $f$, t);
  END LOOP;
END $$;
