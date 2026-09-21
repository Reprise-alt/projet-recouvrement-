-- Alerte « chèque disponible » déclarée par le débiteur depuis une relance.
CREATE TABLE "AlerteCheque" (
  "id"             TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "montantEstime"  INTEGER,
  "message"        TEXT,
  "statut"         TEXT NOT NULL DEFAULT 'nouvelle',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "traiteeLe"      TIMESTAMP(3),
  CONSTRAINT "AlerteCheque_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AlerteCheque" ADD CONSTRAINT "AlerteCheque_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlerteCheque" ADD CONSTRAINT "AlerteCheque_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AlerteCheque_organisationId_statut_idx" ON "AlerteCheque"("organisationId", "statut");
