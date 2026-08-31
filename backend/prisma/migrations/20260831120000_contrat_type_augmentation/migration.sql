-- CreateEnum
CREATE TYPE "TypeAugmentation" AS ENUM ('sans_notification', 'sur_notification');

-- AlterTable
ALTER TABLE "Contrat" ADD COLUMN     "typeAugmentation" "TypeAugmentation";

