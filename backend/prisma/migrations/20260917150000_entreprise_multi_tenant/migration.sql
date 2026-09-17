-- Isolation multi-tenant de la table Entreprise (entités / business units).
--
-- Jusqu'ici Entreprise était une table GLOBALE, partagée par toutes les
-- organisations et pré-remplie avec les sociétés du groupe (SORAM, IRIS, SIS,
-- COMMUN). Conséquence : un client SaaS voyait les entités du groupe dans son
-- sélecteur d'entité — une fuite de données inter-clients. On la bascule dans
-- le périmètre tenant, comme les autres tables produit (même échappatoire RLS
-- via app_current_org(), même défaut de colonne GUC-aware).

-- 1) Colonne de rattachement, avec défaut GUC-aware (l'org courante à l'insert,
--    l'org socle du groupe hors contexte).
ALTER TABLE "Entreprise"
  ADD COLUMN "organisationId" TEXT NOT NULL
  DEFAULT coalesce(current_setting('app.organisation_id', true), 'org-groupe-olu360');

-- 2) Les entités existantes sont celles du groupe : on les rattache à l'org
--    socle (org-groupe-olu360), qui porte tout l'historique mono-tenant.
UPDATE "Entreprise" SET "organisationId" = 'org-groupe-olu360';

-- 3) Le code n'est plus unique globalement mais PAR organisation (deux clients
--    peuvent chacun avoir une entité « IRIS » sans collision).
DROP INDEX IF EXISTS "Entreprise_code_key";
CREATE UNIQUE INDEX "Entreprise_organisationId_code_key" ON "Entreprise"("organisationId", "code");

-- 4) Clé étrangère vers l'organisation (cascade : purge d'un tenant = purge de
--    ses entités).
ALTER TABLE "Entreprise" ADD CONSTRAINT "Entreprise_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) RLS : chaque organisation ne voit et n'écrit que ses propres entités.
--    Même échappatoire non-cassante que les autres tables (accès complet quand
--    aucun contexte tenant n'est posé — jobs, scripts, legacy groupe).
ALTER TABLE "Entreprise" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entreprise" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "Entreprise"
  USING      (app_current_org() IS NULL OR "organisationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organisationId" = app_current_org());
