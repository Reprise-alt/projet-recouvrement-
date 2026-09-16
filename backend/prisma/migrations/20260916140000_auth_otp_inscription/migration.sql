-- Inscription / connexion SaaS par email à usage unique (OTP) + rôles SaaS
-- (addendum §3, §4.2). Additive et non cassante.

-- 1) Rôle SaaS dans l'organisation (dimension orthogonale aux rôles groupe).
CREATE TYPE "RoleOrg" AS ENUM ('proprietaire', 'administrateur', 'gestionnaire', 'lecture');
ALTER TABLE "Utilisateur" ADD COLUMN "roleOrg" "RoleOrg";

-- 2) Codes OTP (pré-auth, hors périmètre RLS). Code jamais stocké en clair.
CREATE TABLE "CodeOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodeOtp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CodeOtp_email_idx" ON "CodeOtp"("email");
