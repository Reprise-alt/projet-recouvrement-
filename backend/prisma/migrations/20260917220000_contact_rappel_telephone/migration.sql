-- Nouveau type de demande de contact : rappel (grands comptes)
ALTER TYPE "TypeDemandeContact" ADD VALUE IF NOT EXISTS 'rappel';

-- Téléphone du contact (utile pour les demandes de rappel)
ALTER TABLE "DemandeContact" ADD COLUMN IF NOT EXISTS "telephone" TEXT;
