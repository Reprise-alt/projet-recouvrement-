-- Fondation multi-tenant SaaS (addendum §2-3) : entité Organisation + rattachement
-- des racines métier (Client, Utilisateur). Additive et NON cassante : toutes les
-- données existantes sont rattachées à l'organisation « socle » du groupe.

-- 1) Enums du tenant.
CREATE TYPE "PaysOrg" AS ENUM ('SN', 'CI');
CREATE TYPE "StatutOrganisation" AS ENUM ('essai', 'actif', 'coupe', 'supprime');
CREATE TYPE "FormuleAbo" AS ENUM ('petite', 'pme', 'grands_comptes');

-- 2) Table Organisation.
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "raisonSociale" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pays" "PaysOrg" NOT NULL DEFAULT 'SN',
    "identifiantFiscal" TEXT,
    "rccm" TEXT,
    "adresse" TEXT,
    "logoUrl" TEXT,
    "instructionsPaiement" TEXT,
    "contactRecouvrement" TEXT,
    "formule" "FormuleAbo" NOT NULL DEFAULT 'pme',
    "statut" "StatutOrganisation" NOT NULL DEFAULT 'actif',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- 3) Organisation « socle » : le groupe OLU 360 porte tout l'existant (§1.9).
INSERT INTO "Organisation" ("id", "raisonSociale", "slug", "pays", "formule", "statut", "updatedAt")
VALUES ('org-groupe-olu360', 'Groupe OLU 360', 'groupe-olu360', 'SN', 'grands_comptes', 'actif', CURRENT_TIMESTAMP);

-- 4) Rattachement des racines métier. La colonne porte un DEFAULT statique sur
--    l'org socle : les insertions existantes (code applicatif inchangé) et le
--    backfill retombent sur le groupe. Ajouté avec DEFAULT -> déjà NOT NULL sur
--    les lignes existantes, on peut donc poser NOT NULL directement.
ALTER TABLE "Client" ADD COLUMN "organisationId" TEXT NOT NULL DEFAULT 'org-groupe-olu360';
ALTER TABLE "Utilisateur" ADD COLUMN "organisationId" TEXT NOT NULL DEFAULT 'org-groupe-olu360';

-- 5) Unicité désormais PAR TENANT (deux organisations peuvent avoir un client
--    homonyme). On remplace les index d'unicité globaux.
DROP INDEX "Client_nom_entite_key";
DROP INDEX "Client_codeClient_entite_key";
CREATE UNIQUE INDEX "Client_organisationId_nom_entite_key" ON "Client"("organisationId", "nom", "entite");
CREATE UNIQUE INDEX "Client_organisationId_codeClient_entite_key" ON "Client"("organisationId", "codeClient", "entite");

-- 6) Index de portée tenant.
CREATE INDEX "Client_organisationId_idx" ON "Client"("organisationId");
CREATE INDEX "Utilisateur_organisationId_idx" ON "Utilisateur"("organisationId");

-- 7) Clés étrangères vers Organisation.
ALTER TABLE "Client" ADD CONSTRAINT "Client_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
