-- Réglages de paliers PAR organisation (addendum §5) : jours, activation,
-- libellé. Remplace la config unique du groupe (table Config, singleton) comme
-- source des seuils, désormais propre à chaque tenant. La table Config reste en
-- place (elle porte encore salleToken pour l'écran salle des coursiers) ; ses
-- colonnes j0..j7 ne sont plus lues, mais on préserve les seuils personnalisés
-- du groupe en les recopiant dans PalierOrg pour l'organisation socle.

CREATE TABLE "PalierOrg" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL DEFAULT coalesce(current_setting('app.organisation_id', true), 'org-groupe-olu360'),
    "palier" INTEGER NOT NULL,
    "jours" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "libelle" TEXT,
    CONSTRAINT "PalierOrg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PalierOrg_organisationId_palier_key" ON "PalierOrg"("organisationId", "palier");

ALTER TABLE "PalierOrg" ADD CONSTRAINT "PalierOrg_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Report des seuils personnalisés du groupe (Config singleton) vers PalierOrg
-- pour l'organisation socle, afin de ne pas perdre un réglage existant. Palier
-- N (1..8) ↔ clé j(N-1). Ne s'exécute que si une organisation socle et une
-- ligne Config existent (sinon : aucune ligne, donc valeurs par défaut).
INSERT INTO "PalierOrg" ("id", "organisationId", "palier", "jours", "actif")
SELECT gen_random_uuid()::text, 'org-groupe-olu360', v.palier,
       CASE v.palier
         WHEN 1 THEN c.j0 WHEN 2 THEN c.j1 WHEN 3 THEN c.j2 WHEN 4 THEN c.j3
         WHEN 5 THEN c.j4 WHEN 6 THEN c.j5 WHEN 7 THEN c.j6 WHEN 8 THEN c.j7
       END,
       true
FROM "Config" c
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7),(8)) AS v(palier)
WHERE c.id = 1
  AND EXISTS (SELECT 1 FROM "Organisation" WHERE id = 'org-groupe-olu360');

-- RLS : isolation par organisation (même échappatoire non-cassante).
ALTER TABLE "PalierOrg" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PalierOrg" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON "PalierOrg"
  USING      (app_current_org() IS NULL OR "organisationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organisationId" = app_current_org());
