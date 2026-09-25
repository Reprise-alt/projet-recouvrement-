-- Index sur l'échéance : accélère les agrégats par plage de dates
-- (bilan annuel de Fey, détection des « mois bouclés », colonne échéance de la
-- console) sur les portefeuilles à fort volume. Idempotent.
CREATE INDEX IF NOT EXISTS "Facture_dateEcheance_idx" ON "Facture"("dateEcheance");
