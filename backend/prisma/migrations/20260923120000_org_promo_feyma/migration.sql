-- Recommandation Feyma en pied des relances amiables (levier parrainage).
-- Colonne sur Organisation, activée par défaut pour toutes les organisations.
-- IF NOT EXISTS : idempotent (sûr si la colonne a déjà été ajoutée à la main
-- pour débloquer la prod avant que le déploiement n'applique cette migration).
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "promoFeymaRelances" BOOLEAN NOT NULL DEFAULT true;
