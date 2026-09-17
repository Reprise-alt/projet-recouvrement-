-- Période d'essai (addendum §8) : date de fin d'essai par organisation.
ALTER TABLE "Organisation" ADD COLUMN "dateFinEssai" TIMESTAMP(3);

-- Backfill : les comptes déjà en essai reçoivent 14 jours à partir de leur
-- création (pas de rupture pour les inscriptions existantes). Les comptes
-- « actif » (dont le groupe socle) restent sans date d'essai (accès complet).
UPDATE "Organisation"
  SET "dateFinEssai" = "createdAt" + INTERVAL '14 days'
  WHERE "statut" = 'essai';
