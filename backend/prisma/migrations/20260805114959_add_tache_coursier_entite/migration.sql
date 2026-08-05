-- AlterTable: ajout nullable d'abord, backfill depuis le client rattaché
-- (quand il y en a un), puis contrainte NOT NULL -- une tâche générique
-- créée avant cette migration (aucun client, donc aucune source pour
-- déduire son entité) tombe sur la première entité active du groupe :
-- un choix arbitraire mais sans conséquence, ce cas ne devrait concerner
-- aucune ligne en production vu la fraîcheur de la fonctionnalité.
ALTER TABLE "TacheCoursier" ADD COLUMN "entite" TEXT;

UPDATE "TacheCoursier" t
SET "entite" = c."entite"
FROM "Client" c
WHERE t."clientId" = c.id;

UPDATE "TacheCoursier"
SET "entite" = (SELECT "code" FROM "Entreprise" WHERE "estCommun" = false ORDER BY "createdAt" ASC LIMIT 1)
WHERE "entite" IS NULL;

ALTER TABLE "TacheCoursier" ALTER COLUMN "entite" SET NOT NULL;
