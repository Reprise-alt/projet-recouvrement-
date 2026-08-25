-- CreateEnum
CREATE TYPE "StatutProposition" AS ENUM ('en_attente', 'acceptee', 'refusee');

-- AlterTable
ALTER TABLE "DossierContentieux" ADD COLUMN     "portailToken" TEXT;

-- CreateTable
CREATE TABLE "PropositionPaiement" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "message" TEXT,
    "montantPropose" DOUBLE PRECISION,
    "nbEcheances" INTEGER,
    "premierPaiement" TIMESTAMP(3),
    "statut" "StatutProposition" NOT NULL DEFAULT 'en_attente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropositionPaiement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropositionPaiement_dossierId_idx" ON "PropositionPaiement"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "DossierContentieux_portailToken_key" ON "DossierContentieux"("portailToken");

-- AddForeignKey
ALTER TABLE "PropositionPaiement" ADD CONSTRAINT "PropositionPaiement_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "DossierContentieux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

