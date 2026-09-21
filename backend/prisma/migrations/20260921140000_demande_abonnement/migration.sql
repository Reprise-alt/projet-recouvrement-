-- File des demandes d'abonnement (espace exploitant). Hors RLS : donnée
-- exploitant, pas tenant. Créée par l'org authentifiée, lue par l'exploitant.
CREATE TABLE "DemandeAbonnement" (
  "id"             TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "formule"        TEXT NOT NULL,
  "annuel"         BOOLEAN NOT NULL DEFAULT false,
  "demandeurEmail" TEXT NOT NULL,
  "demandeurNom"   TEXT,
  "statut"         TEXT NOT NULL DEFAULT 'nouvelle',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "traiteeLe"      TIMESTAMP(3),
  CONSTRAINT "DemandeAbonnement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DemandeAbonnement"
  ADD CONSTRAINT "DemandeAbonnement_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DemandeAbonnement_statut_idx" ON "DemandeAbonnement"("statut");
