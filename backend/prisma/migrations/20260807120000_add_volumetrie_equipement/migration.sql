-- CreateTable
CREATE TABLE "VolumetrieEquipement" (
    "id" TEXT NOT NULL,
    "equipementId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "copiesNB" INTEGER NOT NULL DEFAULT 0,
    "copiesCouleur" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumetrieEquipement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolumetrieEquipement_equipementId_periode_key" ON "VolumetrieEquipement"("equipementId", "periode");

-- AddForeignKey
ALTER TABLE "VolumetrieEquipement" ADD CONSTRAINT "VolumetrieEquipement_equipementId_fkey" FOREIGN KEY ("equipementId") REFERENCES "EquipementParc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

