-- Type de débiteur : 'assureur' (tiers-payant) ou 'patient' (particulier/cash).
-- NULL = non classé. Segmente la vue recouvrement (filtre Assureurs / Patients).
ALTER TABLE "Client" ADD COLUMN "typeDebiteur" TEXT;
