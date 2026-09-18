-- Cabinet partenaire (avocat/huissier au niveau plateforme, transverse aux
-- sociétés). Un dossier contentieux peut être « confié » explicitement au
-- partenaire : il ne voit QUE les dossiers portant ce marqueur, toutes sociétés
-- confondues. Distinct de `avocatId` (collaborateur juridique interne à l'org).
ALTER TABLE "DossierContentieux" ADD COLUMN "confieAuPartenaire" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DossierContentieux" ADD COLUMN "confieLe" TIMESTAMP(3);
