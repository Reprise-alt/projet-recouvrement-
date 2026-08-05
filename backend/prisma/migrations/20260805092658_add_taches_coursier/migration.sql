-- CreateEnum
CREATE TYPE "TypeTacheCoursier" AS ENUM ('releve_compteur', 'depot_facture', 'depot_courrier', 'recuperation_reglement', 'depot_banque', 'livraison_toner', 'livraison_bac_recuperation', 'autre');

-- CreateEnum
CREATE TYPE "StatutTacheCoursier" AS ENUM ('a_faire', 'faite', 'annulee');

-- CreateEnum
CREATE TYPE "ModePaiementCollecte" AS ENUM ('cheque', 'espece', 'autre');

-- CreateTable
CREATE TABLE "Coursier" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coursier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TacheCoursierModele" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "TypeTacheCoursier" NOT NULL,
    "label" TEXT,
    "jourDuMois" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TacheCoursierModele_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TacheCoursier" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "type" "TypeTacheCoursier" NOT NULL,
    "label" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "dateInitiale" TIMESTAMP(3) NOT NULL,
    "statut" "StatutTacheCoursier" NOT NULL DEFAULT 'a_faire',
    "coursierId" TEXT,
    "modeleId" TEXT,
    "montant" DOUBLE PRECISION,
    "modePaiement" "ModePaiementCollecte",
    "note" TEXT,
    "dateExecution" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TacheCoursier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coursier_token_key" ON "Coursier"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TacheCoursier_modeleId_dateInitiale_key" ON "TacheCoursier"("modeleId", "dateInitiale");

-- AddForeignKey
ALTER TABLE "TacheCoursierModele" ADD CONSTRAINT "TacheCoursierModele_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TacheCoursier" ADD CONSTRAINT "TacheCoursier_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TacheCoursier" ADD CONSTRAINT "TacheCoursier_coursierId_fkey" FOREIGN KEY ("coursierId") REFERENCES "Coursier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TacheCoursier" ADD CONSTRAINT "TacheCoursier_modeleId_fkey" FOREIGN KEY ("modeleId") REFERENCES "TacheCoursierModele"("id") ON DELETE SET NULL ON UPDATE CASCADE;
