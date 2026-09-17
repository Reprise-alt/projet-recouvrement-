-- Champs légaux supplémentaires de l'organisation (entête courriers + actes) :
-- forme juridique, capital social, et représentant légal (nom + CNI). Tous
-- optionnels — se remplissent au fil de l'eau depuis la fiche entreprise.
ALTER TABLE "Organisation" ADD COLUMN "formeJuridique" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "capitalSocial" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "nomDirigeant" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "cniDirigeant" TEXT;
