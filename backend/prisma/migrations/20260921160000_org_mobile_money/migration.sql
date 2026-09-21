-- Coordonnées Mobile Money par organisation : bouton « Payer maintenant »
-- (Wave / Orange Money) dans les relances et le portail débiteur. Additif.
ALTER TABLE "Organisation" ADD COLUMN "waveLien" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "orangeMoneyNumero" TEXT;
