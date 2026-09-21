-- QR code marchand Wave par organisation (image stockée + URL publique).
ALTER TABLE "Organisation" ADD COLUMN "waveQrData" BYTEA;
ALTER TABLE "Organisation" ADD COLUMN "waveQrMime" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "waveQrUrl" TEXT;
