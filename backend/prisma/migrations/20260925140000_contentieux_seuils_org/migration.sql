-- Seuils de la règle contentieux réglables PAR ORGANISATION (null = valeur par
-- défaut côté code : 90 j d'âge minimum / 50 000 FCFA de montant plancher).
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "contentieuxAgeMinJours" INTEGER;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "contentieuxMontantPlancher" INTEGER;
