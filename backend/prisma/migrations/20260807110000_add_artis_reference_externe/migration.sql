-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN     "referenceExterne" TEXT;

-- AlterTable
ALTER TABLE "LivraisonConsommable" ADD COLUMN     "referenceExterne" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Intervention_clientOperationsId_referenceExterne_key" ON "Intervention"("clientOperationsId", "referenceExterne");

-- CreateIndex
CREATE UNIQUE INDEX "LivraisonConsommable_clientOperationsId_referenceExterne_key" ON "LivraisonConsommable"("clientOperationsId", "referenceExterne");

