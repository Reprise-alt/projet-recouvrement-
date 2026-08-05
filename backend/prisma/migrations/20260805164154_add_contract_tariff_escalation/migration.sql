-- AlterTable
ALTER TABLE "Contrat" ADD COLUMN     "dateDerniereRevision" TIMESTAMP(3),
ADD COLUMN     "montantActuel" DOUBLE PRECISION,
ADD COLUMN     "tauxAugmentation" DOUBLE PRECISION;
