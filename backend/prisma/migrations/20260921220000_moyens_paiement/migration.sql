-- Liste de moyens de paiement par organisation (Wave, Julaya, Orange Money…).
CREATE TABLE "MoyenPaiement" (
  "id"             TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "lien"           TEXT,
  "numero"         TEXT,
  "qrData"         BYTEA,
  "qrMime"         TEXT,
  "qrUrl"          TEXT,
  "actif"          BOOLEAN NOT NULL DEFAULT true,
  "ordre"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoyenPaiement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MoyenPaiement"
  ADD CONSTRAINT "MoyenPaiement_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "MoyenPaiement_organisationId_idx" ON "MoyenPaiement"("organisationId");

-- Reprise des anciens champs uniques : lien/QR → un moyen, numéro OM → un moyen.
INSERT INTO "MoyenPaiement" ("id", "organisationId", "label", "lien", "qrData", "qrMime", "qrUrl", "ordre", "createdAt")
SELECT gen_random_uuid()::text, "id", 'Paiement en ligne', "waveLien", "waveQrData", "waveQrMime", "waveQrUrl", 0, CURRENT_TIMESTAMP
FROM "Organisation"
WHERE "waveLien" IS NOT NULL OR "waveQrData" IS NOT NULL;

INSERT INTO "MoyenPaiement" ("id", "organisationId", "label", "numero", "ordre", "createdAt")
SELECT gen_random_uuid()::text, "id", 'Orange Money', "orangeMoneyNumero", 1, CURRENT_TIMESTAMP
FROM "Organisation"
WHERE "orangeMoneyNumero" IS NOT NULL AND btrim("orangeMoneyNumero") <> '';
