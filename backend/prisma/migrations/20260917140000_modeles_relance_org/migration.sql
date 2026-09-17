-- Modèles de relance personnalisés par organisation (addendum §5.3). Table
-- tenant : rattachée à l'organisation (défaut GUC-aware, comme Client), isolée
-- par RLS via la même échappatoire que les autres tables du périmètre produit.
CREATE TABLE "ModeleRelanceOrg" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL DEFAULT coalesce(current_setting('app.organisation_id', true), 'org-groupe-olu360'),
    "palier" INTEGER NOT NULL,
    "sujet" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModeleRelanceOrg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModeleRelanceOrg_organisationId_palier_key" ON "ModeleRelanceOrg"("organisationId", "palier");

ALTER TABLE "ModeleRelanceOrg" ADD CONSTRAINT "ModeleRelanceOrg_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS : isolation par organisation (échappatoire chaîne-vide/NULL, cf. correctif
-- app_current_org()).
ALTER TABLE "ModeleRelanceOrg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModeleRelanceOrg" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "ModeleRelanceOrg"
  USING      (app_current_org() IS NULL OR "organisationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organisationId" = app_current_org());
