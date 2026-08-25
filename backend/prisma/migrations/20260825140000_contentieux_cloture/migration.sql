-- CreateEnum
CREATE TYPE "IssueDossier" AS ENUM ('recouvre', 'transige', 'resilie', 'jugement_favorable', 'jugement_defavorable', 'irrecouvrable');

-- AlterEnum
ALTER TYPE "TypePiece" ADD VALUE 'jugement';

-- AlterTable
ALTER TABLE "DossierContentieux" ADD COLUMN     "clotureLe" TIMESTAMP(3),
ADD COLUMN     "clotureParId" TEXT,
ADD COLUMN     "issue" "IssueDossier",
ADD COLUMN     "montantRecouvre" DOUBLE PRECISION,
ADD COLUMN     "noteCloture" TEXT;

