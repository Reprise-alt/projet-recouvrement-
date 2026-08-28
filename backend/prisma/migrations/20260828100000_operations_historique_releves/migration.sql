-- DropIndex
DROP INDEX "ReleveHebdo_clientOperationsId_semaineIso_key";

-- AlterTable
ALTER TABLE "ReleveHebdo" ADD COLUMN     "actionEcheance" TIMESTAMP(3),
ADD COLUMN     "climat" "Climat",
ADD COLUMN     "dernierContact" TIMESTAMP(3),
ADD COLUMN     "engagementPrecedentTenu" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ReleveHebdo_clientOperationsId_date_idx" ON "ReleveHebdo"("clientOperationsId", "date");

