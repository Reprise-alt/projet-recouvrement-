-- Chèque scanné et rapproché (module Rapprochement).
CREATE TABLE "Cheque" (
  "id"              TEXT NOT NULL,
  "organisationId"  TEXT NOT NULL,
  "clientId"        TEXT,
  "montant"         INTEGER NOT NULL,
  "banque"          TEXT,
  "numeroCheque"    TEXT,
  "dateCheque"      TIMESTAMP(3),
  "tireur"          TEXT,
  "imageData"       BYTEA,
  "imageMime"       TEXT,
  "facturesReglees" TEXT,
  "statut"          TEXT NOT NULL DEFAULT 'enregistre',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Cheque_organisationId_idx" ON "Cheque"("organisationId");
