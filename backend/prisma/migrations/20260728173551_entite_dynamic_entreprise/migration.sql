-- CreateTable
CREATE TABLE "Entreprise" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "estCommun" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entreprise_code_key" ON "Entreprise"("code");

-- Seed des entités existantes, gérées en dur jusqu'ici — préserve la
-- compatibilité avec les données déjà en base (le code reste identique à
-- l'ancienne valeur d'enum) et permet d'en ajouter d'autres depuis l'interface.
INSERT INTO "Entreprise" ("id", "code", "nom", "estCommun") VALUES
  (gen_random_uuid()::text, 'SORAM', 'SORAM Afrique', false),
  (gen_random_uuid()::text, 'SIS', 'SIS — SORAM Impression & Services', false),
  (gen_random_uuid()::text, 'IRIS', 'IRIS Afrique', false),
  (gen_random_uuid()::text, 'COMMUN', 'Commun (partagé entre entités)', true);

-- AlterTable — conversion enum -> texte SANS perte de données (le cast
-- ::TEXT préserve la valeur telle quelle, contrairement à un drop+recreate).
ALTER TABLE "Client" ALTER COLUMN "entite" TYPE TEXT USING "entite"::TEXT;
ALTER TABLE "Utilisateur" ALTER COLUMN "entite" TYPE TEXT USING "entite"::TEXT;
ALTER TABLE "IntegrationCredential" ALTER COLUMN "entite" TYPE TEXT USING "entite"::TEXT;

-- DropEnum
DROP TYPE "Entite";

-- Note : l'index unique "Client_nom_entite_key" existe déjà depuis la
-- migration initiale et est automatiquement reconstruit par le ALTER COLUMN
-- TYPE ci-dessus — pas besoin de le recréer.
