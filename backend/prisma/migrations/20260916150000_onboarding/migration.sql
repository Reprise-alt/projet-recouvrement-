-- Démarrage guidé SaaS (addendum §4.3) : indicateurs d'étapes non déductibles
-- des données, portés par l'organisation.
ALTER TABLE "Organisation" ADD COLUMN "scenarioVu" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organisation" ADD COLUMN "relanceTestEnvoyee" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organisation" ADD COLUMN "relancesActivees" BOOLEAN NOT NULL DEFAULT false;
