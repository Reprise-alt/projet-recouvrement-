-- Parrainage (« Invitez une entreprise, 1 mois offert ») — champs sur Organisation.
ALTER TABLE "Organisation" ADD COLUMN "codeParrainage" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "parrainePar" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "moisOffertsGagnes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organisation" ADD COLUMN "recompenseParrainAppliquee" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Organisation_codeParrainage_key" ON "Organisation"("codeParrainage");
