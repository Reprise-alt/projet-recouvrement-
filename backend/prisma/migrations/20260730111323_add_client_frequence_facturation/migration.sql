-- CreateEnum
CREATE TYPE "FrequenceFacturation" AS ENUM ('mensuelle', 'trimestrielle', 'annuelle');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "frequenceFacturation" "FrequenceFacturation" NOT NULL DEFAULT 'mensuelle';
