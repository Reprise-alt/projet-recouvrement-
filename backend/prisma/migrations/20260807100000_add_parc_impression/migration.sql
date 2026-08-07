-- CreateEnum
CREATE TYPE "StatutEquipement" AS ENUM ('actif', 'retire', 'introuvable');

-- CreateEnum
CREATE TYPE "TypeIntervention" AS ENUM ('preventive', 'curative');

-- CreateEnum
CREATE TYPE "UrgenceIntervention" AS ENUM ('urgente', 'standard');

-- CreateEnum
CREATE TYPE "PrioriteActionCopil" AS ENUM ('p1', 'p2', 'p3');

-- CreateEnum
CREATE TYPE "StatutActionCopil" AS ENUM ('planifie', 'en_cours', 'fait', 'bloque');

-- CreateTable
CREATE TABLE "EquipementParc" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "numeroSerie" TEXT NOT NULL,
    "statut" "StatutEquipement" NOT NULL DEFAULT 'actif',
    "dateInstallation" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipementParc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "equipementId" TEXT,
    "site" TEXT NOT NULL,
    "type" "TypeIntervention" NOT NULL DEFAULT 'curative',
    "urgence" "UrgenceIntervention" NOT NULL DEFAULT 'standard',
    "panne" TEXT,
    "dateDeclaration" TIMESTAMP(3) NOT NULL,
    "datePriseEnCharge" TIMESTAMP(3),
    "dateCloture" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleveVolumetrie" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "copiesNB" INTEGER NOT NULL DEFAULT 0,
    "copiesCouleur" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleveVolumetrie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LivraisonConsommable" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivraisonConsommable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCopil" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "priorite" "PrioriteActionCopil" NOT NULL DEFAULT 'p2',
    "action" TEXT NOT NULL,
    "responsable" TEXT,
    "echeance" TIMESTAMP(3),
    "statut" "StatutActionCopil" NOT NULL DEFAULT 'en_cours',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionCopil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipementParc_clientOperationsId_numeroSerie_key" ON "EquipementParc"("clientOperationsId", "numeroSerie");

-- CreateIndex
CREATE UNIQUE INDEX "ReleveVolumetrie_clientOperationsId_periode_key" ON "ReleveVolumetrie"("clientOperationsId", "periode");

-- AddForeignKey
ALTER TABLE "EquipementParc" ADD CONSTRAINT "EquipementParc_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_equipementId_fkey" FOREIGN KEY ("equipementId") REFERENCES "EquipementParc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleveVolumetrie" ADD CONSTRAINT "ReleveVolumetrie_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LivraisonConsommable" ADD CONSTRAINT "LivraisonConsommable_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCopil" ADD CONSTRAINT "ActionCopil_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

