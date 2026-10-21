-- Chef d'équipe ADV (direction) : exclu des listes d'affectation côté coursier.
ALTER TABLE "Coursier" ADD COLUMN IF NOT EXISTS "chefEquipe" BOOLEAN NOT NULL DEFAULT false;
