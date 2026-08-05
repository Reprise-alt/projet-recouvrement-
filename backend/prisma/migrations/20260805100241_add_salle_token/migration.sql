-- AlterTable
ALTER TABLE "Config" ADD COLUMN "salleToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Config_salleToken_key" ON "Config"("salleToken");
