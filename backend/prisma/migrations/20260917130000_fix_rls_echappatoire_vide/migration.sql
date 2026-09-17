-- Correctif RLS (addendum §2.2). Après qu'une transaction a posé puis relâché
-- « app.organisation_id » (set_config(..., true)), current_setting renvoie une
-- CHAÎNE VIDE, pas NULL, sur la connexion réutilisée du pool. L'échappatoire
-- « app_current_org() IS NULL » ne s'appliquait donc plus (('' IS NULL) = false)
-- dès qu'une connexion avait déjà servi une requête tenant → toute opération
-- HORS contexte tenant (inscription self-service, jobs, scripts) échouait sous
-- RLS avec « new row violates row-level security policy ». On traite désormais la
-- chaîne vide comme l'absence de contexte. Un seul point à corriger : toutes les
-- policies passent par app_current_org().
CREATE OR REPLACE FUNCTION app_current_org() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.organisation_id', true), '') $$;
