-- CreateEnum
CREATE TYPE "TypeDemandeContact" AS ENUM ('investir', 'poc', 'autre');

-- CreateTable
CREATE TABLE "DemandeContact" (
    "id" TEXT NOT NULL,
    "type" "TypeDemandeContact" NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "societe" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandeContact_pkey" PRIMARY KEY ("id")
);
