-- Moyen déclaré par le débiteur dans une déclaration de règlement (chèque ou virement).
ALTER TABLE "AlerteCheque" ADD COLUMN IF NOT EXISTS "moyen" TEXT NOT NULL DEFAULT 'cheque';
