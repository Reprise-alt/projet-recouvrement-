-- Archive du contenu réel des emails de relance (auto + manuel) sur
-- ActionRecouvrement. Permet de relire le message EXACT envoyé et sert de
-- pièce (preuve de la tentative amiable) pour le contentieux. Colonnes
-- nullables : les actions antérieures et les actions non-email restent vides.
ALTER TABLE "ActionRecouvrement" ADD COLUMN "emailSujet" TEXT;
ALTER TABLE "ActionRecouvrement" ADD COLUMN "emailTo"    TEXT;
ALTER TABLE "ActionRecouvrement" ADD COLUMN "emailCc"    TEXT;
ALTER TABLE "ActionRecouvrement" ADD COLUMN "emailHtml"  TEXT;
ALTER TABLE "ActionRecouvrement" ADD COLUMN "emailTexte" TEXT;
