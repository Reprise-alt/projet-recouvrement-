-- AlterTable : nouvelle porte d'accès à la console Planning des coursiers,
-- indépendante du recouvrement. Additive (ADD COLUMN avec défaut), jamais
-- destructive.
ALTER TABLE "Utilisateur" ADD COLUMN     "accesPlanningCoursiers" BOOLEAN NOT NULL DEFAULT false;

-- Backfill : avant le découpage, l'accès au Planning passait par
-- accesRecouvrement. On le conserve pour ne retirer l'accès à personne.
UPDATE "Utilisateur" SET "accesPlanningCoursiers" = true WHERE "accesRecouvrement" = true;
