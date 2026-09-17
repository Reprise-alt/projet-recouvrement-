-- Option payante « module contentieux » (§8) pour les formules Petite/PME
-- (incluse pour Grands comptes). Défaut false.
ALTER TABLE "Organisation" ADD COLUMN "optionContentieux" BOOLEAN NOT NULL DEFAULT false;
