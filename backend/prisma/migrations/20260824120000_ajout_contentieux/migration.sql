-- CreateEnum
CREATE TYPE "StatutDossierContentieux" AS ENUM ('ouvert', 'analyse', 'pret', 'transmis', 'depose', 'clos');

-- CreateEnum
CREATE TYPE "VerdictRecevabilite" AS ENUM ('non_evalue', 'pret', 'a_completer', 'risque');

-- CreateEnum
CREATE TYPE "TypePiece" AS ENUM ('facture', 'bon_commande', 'contrat', 'mise_en_demeure', 'preuve_livraison', 'echange', 'releve_de_compte', 'autre');

-- CreateEnum
CREATE TYPE "TypeActe" AS ENUM ('mise_en_demeure', 'commandement_de_payer', 'assignation_en_paiement', 'decompte_de_creance', 'bordereau_de_pieces');

-- CreateEnum
CREATE TYPE "StatutActe" AS ENUM ('brouillon', 'valide', 'signe');

-- AlterTable
ALTER TABLE "Facture" ADD COLUMN     "dossierContentieuxId" TEXT;

-- CreateTable
CREATE TABLE "DossierContentieux" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "statut" "StatutDossierContentieux" NOT NULL DEFAULT 'ouvert',
    "verdict" "VerdictRecevabilite" NOT NULL DEFAULT 'non_evalue',
    "montantReclame" DOUBLE PRECISION,
    "createurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DossierContentieux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PieceContentieux" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "type" "TypePiece" NOT NULL DEFAULT 'autre',
    "nomFichier" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "contenu" BYTEA NOT NULL,
    "taille" INTEGER NOT NULL,
    "ocrTexte" TEXT,
    "extraitJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceContentieux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyseContentieux" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "certaine" BOOLEAN NOT NULL,
    "liquide" BOOLEAN NOT NULL,
    "exigible" BOOLEAN NOT NULL,
    "prescriptionOk" BOOLEAN NOT NULL,
    "manquants" TEXT[],
    "competence" TEXT,
    "syntheseIa" TEXT,
    "modeleIa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyseContentieux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneDecompte" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "poste" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "sourcePieceId" TEXT,

    CONSTRAINT "LigneDecompte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActeContentieux" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "type" "TypeActe" NOT NULL,
    "gabaritVersion" TEXT NOT NULL,
    "contenu" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "statut" "StatutActe" NOT NULL DEFAULT 'brouillon',
    "valideParId" TEXT,
    "signeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActeContentieux_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DossierContentieux_reference_key" ON "DossierContentieux"("reference");

-- CreateIndex
CREATE INDEX "DossierContentieux_clientId_idx" ON "DossierContentieux"("clientId");

-- CreateIndex
CREATE INDEX "PieceContentieux_dossierId_idx" ON "PieceContentieux"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyseContentieux_dossierId_key" ON "AnalyseContentieux"("dossierId");

-- CreateIndex
CREATE INDEX "LigneDecompte_dossierId_idx" ON "LigneDecompte"("dossierId");

-- CreateIndex
CREATE INDEX "ActeContentieux_dossierId_idx" ON "ActeContentieux"("dossierId");

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_dossierContentieuxId_fkey" FOREIGN KEY ("dossierContentieuxId") REFERENCES "DossierContentieux"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierContentieux" ADD CONSTRAINT "DossierContentieux_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierContentieux" ADD CONSTRAINT "DossierContentieux_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceContentieux" ADD CONSTRAINT "PieceContentieux_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "DossierContentieux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyseContentieux" ADD CONSTRAINT "AnalyseContentieux_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "DossierContentieux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDecompte" ADD CONSTRAINT "LigneDecompte_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "DossierContentieux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneDecompte" ADD CONSTRAINT "LigneDecompte_sourcePieceId_fkey" FOREIGN KEY ("sourcePieceId") REFERENCES "PieceContentieux"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActeContentieux" ADD CONSTRAINT "ActeContentieux_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "DossierContentieux"("id") ON DELETE CASCADE ON UPDATE CASCADE;

