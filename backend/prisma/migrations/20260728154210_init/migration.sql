-- CreateEnum
CREATE TYPE "Entite" AS ENUM ('SORAM', 'SIS', 'IRIS', 'COMMUN');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('impayee', 'payee');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('admin', 'manager_entite', 'comptable');

-- CreateEnum
CREATE TYPE "ServiceIntegration" AS ENUM ('artis', 'mapon', 'gmail');

-- CreateEnum
CREATE TYPE "StatutIntegration" AS ENUM ('actif', 'inactif');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "entite" "Entite" NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "tel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "montantHT" DOUBLE PRECISION,
    "dateFacture" TIMESTAMP(3),
    "dateEcheance" TIMESTAMP(3) NOT NULL,
    "statut" "StatutFacture" NOT NULL DEFAULT 'impayee',
    "datePaiement" TIMESTAMP(3),
    "modePaiement" TEXT,
    "numPiece" TEXT,
    "remisSur" TEXT,
    "designation" TEXT,
    "commercial" TEXT,
    "traitePar" TEXT,
    "etatFactures" TEXT,
    "dateDepot" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "type" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "tacite" BOOLEAN NOT NULL DEFAULT false,
    "dateRevisionTarif" TIMESTAMP(3),
    "statutSource" TEXT,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionRecouvrement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "palier" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "ActionRecouvrement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvoiContrat" (
    "id" TEXT NOT NULL,
    "contratId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT NOT NULL,
    "destinataire" TEXT,
    "sujet" TEXT,
    "corps" TEXT,
    "statutEnvoi" TEXT,

    CONSTRAINT "EnvoiContrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "entite" "Entite",

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "j1" INTEGER NOT NULL DEFAULT 7,
    "j2" INTEGER NOT NULL DEFAULT 15,
    "j3" INTEGER NOT NULL DEFAULT 30,
    "j4" INTEGER NOT NULL DEFAULT 45,
    "j5" INTEGER NOT NULL DEFAULT 60,
    "j6" INTEGER NOT NULL DEFAULT 75,
    "j7" INTEGER NOT NULL DEFAULT 90,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "service" "ServiceIntegration" NOT NULL,
    "entite" "Entite",
    "statut" "StatutIntegration" NOT NULL DEFAULT 'inactif',
    "derniereSync" TIMESTAMP(3),

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_nom_entite_key" ON "Client"("nom", "entite");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_clientId_numero_key" ON "Facture"("clientId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Contrat_clientId_numero_key" ON "Contrat"("clientId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "Utilisateur"("email");

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrat" ADD CONSTRAINT "Contrat_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionRecouvrement" ADD CONSTRAINT "ActionRecouvrement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvoiContrat" ADD CONSTRAINT "EnvoiContrat_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "Contrat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
