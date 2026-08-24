-- AlterEnum
ALTER TYPE "TypeActe" ADD VALUE 'commandement_societe';

-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "accesContentieux" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DossierContentieux" ADD COLUMN     "avocatId" TEXT;

-- AlterTable
ALTER TABLE "ActeContentieux" ADD COLUMN     "contenuSigne" BYTEA,
ADD COLUMN     "mimeTypeSigne" TEXT,
ADD COLUMN     "valideLe" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DossierContentieux_avocatId_idx" ON "DossierContentieux"("avocatId");

-- AddForeignKey
ALTER TABLE "DossierContentieux" ADD CONSTRAINT "DossierContentieux_avocatId_fkey" FOREIGN KEY ("avocatId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

