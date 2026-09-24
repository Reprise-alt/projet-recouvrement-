-- Avis bancaires (remises chèque / virement / espèce) lus automatiquement dans
-- la boîte mail de l'organisation, avec pré-rapprochement par montant.

-- Cheque : origine bancaire + idempotence par identifiant de message Gmail.
ALTER TABLE "Cheque" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'scan';
ALTER TABLE "Cheque" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'cheque';
ALTER TABLE "Cheque" ADD COLUMN IF NOT EXISTS "agence" TEXT;
ALTER TABLE "Cheque" ADD COLUMN IF NOT EXISTS "echeance" TIMESTAMP(3);
ALTER TABLE "Cheque" ADD COLUMN IF NOT EXISTS "emailMessageId" TEXT;
ALTER TABLE "Cheque" ADD COLUMN IF NOT EXISTS "facturesProposees" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Cheque_emailMessageId_key" ON "Cheque"("emailMessageId");
CREATE INDEX IF NOT EXISTS "Cheque_organisationId_source_statut_idx" ON "Cheque"("organisationId", "source", "statut");

-- Connexion Gmail scopée à l'organisation (isolation tenant) + portée de la connexion.
ALTER TABLE "IntegrationCredential" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;
ALTER TABLE "IntegrationCredential" ADD COLUMN IF NOT EXISTS "usage" TEXT NOT NULL DEFAULT 'envoi';
CREATE INDEX IF NOT EXISTS "IntegrationCredential_organisationId_service_usage_idx" ON "IntegrationCredential"("organisationId", "service", "usage");
