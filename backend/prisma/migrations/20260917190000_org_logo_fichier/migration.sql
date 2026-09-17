-- Logo téléversé : stocké en base (octets + type MIME) et servi par un endpoint
-- public, pour un affichage fiable dans les emails de relance (les clients mail
-- bloquent les data: URI). logoUrl continue de pointer vers l'URL publique.
ALTER TABLE "Organisation" ADD COLUMN "logoData" BYTEA;
ALTER TABLE "Organisation" ADD COLUMN "logoMime" TEXT;
