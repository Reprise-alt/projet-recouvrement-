-- Modèle de configuration par secteur d'activité : snapshot des paliers + des
-- modèles d'e-mails d'une organisation, réutilisable pour configurer d'un coup
-- une nouvelle organisation du même secteur. Global (hors RLS).
CREATE TABLE IF NOT EXISTS "ModeleSecteur" (
  "id" TEXT NOT NULL,
  "secteur" TEXT NOT NULL,
  "paliers" JSONB NOT NULL,
  "modeles" JSONB NOT NULL,
  "majPar" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModeleSecteur_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ModeleSecteur_secteur_key" ON "ModeleSecteur"("secteur");
