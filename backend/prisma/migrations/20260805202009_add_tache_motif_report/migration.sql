-- CreateEnum
CREATE TYPE "MotifReport" AS ENUM ('client_absent', 'adresse_introuvable', 'document_non_pret', 'trafic_panne', 'bureau_ferme', 'autre');

-- AlterTable
ALTER TABLE "TacheCoursier" ADD COLUMN     "motifReport" "MotifReport";
