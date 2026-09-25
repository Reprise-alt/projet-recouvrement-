-- Règle d'éligibilité au contentieux : deux drapeaux client.
-- resilie          : client dont la facturation est arrêtée mais qui reste débiteur.
-- contentieuxExclu : exclusion manuelle par un agent (jamais poussé en contentieux).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "resilie" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contentieuxExclu" BOOLEAN NOT NULL DEFAULT false;
