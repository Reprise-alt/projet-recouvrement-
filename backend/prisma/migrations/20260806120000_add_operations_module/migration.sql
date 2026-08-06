-- CreateEnum
CREATE TYPE "RoleOperations" AS ENUM ('directrice_operations', 'charge_compte', 'direction_generale');

-- CreateEnum
CREATE TYPE "Secteur" AS ENUM ('education', 'administration', 'sante', 'hotellerie', 'distribution', 'agro', 'btp', 'banque', 'telecom', 'industrie', 'logistique', 'maritime', 'utilities', 'mines', 'ong', 'it', 'services', 'autre');

-- CreateEnum
CREATE TYPE "Criticite" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "Climat" AS ENUM ('vert', 'orange', 'rouge');

-- CreateEnum
CREATE TYPE "GraviteProbleme" AS ENUM ('gene', 'bloquant');

-- CreateEnum
CREATE TYPE "MotifResiliation" AS ENUM ('prix', 'qualite', 'suivi', 'litige', 'ao', 'perimetre', 'internal', 'cessation', 'autre');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "codeClient" TEXT;

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "roleOperations" "RoleOperations";

-- CreateTable
CREATE TABLE "ClientOperations" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "secteur" "Secteur" NOT NULL,
    "criticite" "Criticite" NOT NULL DEFAULT 'C',
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "chargeDeCompteId" TEXT,
    "debutContrat" TIMESTAMP(3),
    "finContrat" TIMESTAMP(3),
    "dernierContact" TIMESTAMP(3),
    "climat" "Climat",
    "commentaire" TEXT,
    "action" TEXT,
    "actionEcheance" TIMESTAMP(3),
    "actionFait" BOOLEAN NOT NULL DEFAULT false,
    "demarreLe" TIMESTAMP(3),
    "demarrageCloture" BOOLEAN NOT NULL DEFAULT false,
    "dernierCopil" TIMESTAMP(3),
    "enjeux" TEXT,
    "dernierReleve" TIMESTAMP(3),
    "resilie" BOOLEAN NOT NULL DEFAULT false,
    "dateResiliation" TIMESTAMP(3),
    "motifResiliation" "MotifResiliation",
    "motifDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOperations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemeOperations" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "texte" TEXT NOT NULL,
    "gravite" "GraviteProbleme" NOT NULL,
    "ouvertLe" TIMESTAMP(3) NOT NULL,
    "resoluLe" TIMESTAMP(3),

    CONSTRAINT "ProblemeOperations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleveHebdo" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "semaineIso" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL,
    "commentaire" TEXT,
    "action" TEXT,

    CONSTRAINT "ReleveHebdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapeDemarrageFait" (
    "id" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EtapeDemarrageFait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EtapeDemarrageConfig" (
    "id" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "delaiJours" INTEGER NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "EtapeDemarrageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FenetreSaisonniere" (
    "secteur" "Secteur" NOT NULL,
    "label" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "jour" INTEGER NOT NULL,
    "anticipationJours" INTEGER NOT NULL,

    CONSTRAINT "FenetreSaisonniere_pkey" PRIMARY KEY ("secteur")
);

-- CreateTable
CREATE TABLE "Campagne" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "objectif" TEXT,
    "secteurs" "Secteur"[],
    "entite" TEXT NOT NULL,
    "echeance" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloturee" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Campagne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampagneFait" (
    "id" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "clientOperationsId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CampagneFait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigOperations" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "contactStdVigilance" INTEGER NOT NULL DEFAULT 45,
    "contactStdRisque" INTEGER NOT NULL DEFAULT 60,
    "contactVipVigilance" INTEGER NOT NULL DEFAULT 25,
    "contactVipRisque" INTEGER NOT NULL DEFAULT 35,
    "problemeVigilanceJours" INTEGER NOT NULL DEFAULT 14,
    "problemeRisqueJours" INTEGER NOT NULL DEFAULT 30,
    "problemeBloquantRisqueJours" INTEGER NOT NULL DEFAULT 7,
    "demarrageRisqueRetardJours" INTEGER NOT NULL DEFAULT 15,
    "finContratVigilanceJours" INTEGER NOT NULL DEFAULT 90,
    "finContratRisqueJours" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "ConfigOperations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientOperations_clientId_key" ON "ClientOperations"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ReleveHebdo_clientOperationsId_semaineIso_key" ON "ReleveHebdo"("clientOperationsId", "semaineIso");

-- CreateIndex
CREATE UNIQUE INDEX "EtapeDemarrageFait_clientOperationsId_cle_key" ON "EtapeDemarrageFait"("clientOperationsId", "cle");

-- CreateIndex
CREATE UNIQUE INDEX "EtapeDemarrageConfig_entite_cle_key" ON "EtapeDemarrageConfig"("entite", "cle");

-- CreateIndex
CREATE UNIQUE INDEX "CampagneFait_campagneId_clientOperationsId_key" ON "CampagneFait"("campagneId", "clientOperationsId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_codeClient_entite_key" ON "Client"("codeClient", "entite");

-- AddForeignKey
ALTER TABLE "ClientOperations" ADD CONSTRAINT "ClientOperations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOperations" ADD CONSTRAINT "ClientOperations_chargeDeCompteId_fkey" FOREIGN KEY ("chargeDeCompteId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemeOperations" ADD CONSTRAINT "ProblemeOperations_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleveHebdo" ADD CONSTRAINT "ReleveHebdo_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtapeDemarrageFait" ADD CONSTRAINT "EtapeDemarrageFait_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampagneFait" ADD CONSTRAINT "CampagneFait_campagneId_fkey" FOREIGN KEY ("campagneId") REFERENCES "Campagne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampagneFait" ADD CONSTRAINT "CampagneFait_clientOperationsId_fkey" FOREIGN KEY ("clientOperationsId") REFERENCES "ClientOperations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

