-- Identité d'expéditeur par organisation (addendum §5.3, §6). Adresse email de
-- réponse : les relances partent d'une infrastructure mutualisée mais au nom du
-- client (raisonSociale) ; une réponse du débiteur revient à cette adresse, chez
-- le client, jamais chez OLU. Colonne optionnelle → migration non cassante.
ALTER TABLE "Organisation" ADD COLUMN "emailReponse" TEXT;
