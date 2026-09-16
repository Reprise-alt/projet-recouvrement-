-- Profilage à l'inscription (addendum §4.2) : secteur d'activité, tranche de
-- débiteurs en retard et outil de facturation déclaré. Sert à recommander la
-- formule et à préremplir scénario/modèles. Colonnes optionnelles → migration
-- non cassante (les organisations existantes restent valides).
CREATE TYPE "TrancheDebiteurs" AS ENUM ('moins_50', 'entre_50_500', 'plus_500');

ALTER TABLE "Organisation" ADD COLUMN "secteur" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "trancheDebiteurs" "TrancheDebiteurs";
ALTER TABLE "Organisation" ADD COLUMN "outilFacturation" TEXT;
