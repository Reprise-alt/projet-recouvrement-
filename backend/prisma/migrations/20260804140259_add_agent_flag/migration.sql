-- AlterTable
ALTER TABLE "Utilisateur" ADD COLUMN     "estAgentRecouvrement" BOOLEAN NOT NULL DEFAULT true;

-- Un admin existant est par défaut un superviseur/configurateur, pas un
-- agent de terrain -- un admin qui fait aussi de la relance peut réactiver
-- le drapeau depuis le panneau Utilisateurs. Les comptables et managers
-- d'entité, dont le rôle est justement de relancer, gardent le défaut true
-- posé par la colonne elle-même.
UPDATE "Utilisateur" SET "estAgentRecouvrement" = false WHERE role = 'admin';
