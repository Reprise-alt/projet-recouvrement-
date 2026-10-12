-- Logo du débiteur (ex. assureur) pour co-brander son Espace Assureur.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "logoData" BYTEA;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "logoMime" TEXT;
