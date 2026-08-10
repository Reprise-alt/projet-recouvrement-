-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MotifReport" ADD VALUE 'manque_de_temps';
ALTER TYPE "MotifReport" ADD VALUE 'hors_periode';
ALTER TYPE "MotifReport" ADD VALUE 'condition_climatique';
ALTER TYPE "MotifReport" ADD VALUE 'conges_collaborateur';
ALTER TYPE "MotifReport" ADD VALUE 'panne_vehicule';
ALTER TYPE "MotifReport" ADD VALUE 'greve';
ALTER TYPE "MotifReport" ADD VALUE 'rdv_annule';
ALTER TYPE "MotifReport" ADD VALUE 'surcharge_activite';

