-- Envoi automatique du rapport mensuel : adresse destinataire (null = désactivé).
ALTER TABLE "Organisation" ADD COLUMN "reportingEmail" TEXT;
