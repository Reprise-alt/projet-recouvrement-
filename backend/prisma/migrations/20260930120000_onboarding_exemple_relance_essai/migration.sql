-- Données d'exemple injectables depuis l'onboarding (explorer une console
-- peuplée avant d'importer son vrai fichier). Jamais comptées comme de vraies
-- créances ; supprimables d'un clic.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "estExemple" BOOLEAN NOT NULL DEFAULT false;

-- Garde-fou anti-doublon pour la relance d'essai « pensez à importer » (J+2).
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "relanceEssaiImportEnvoyee" BOOLEAN NOT NULL DEFAULT false;
