-- CreateTable
CREATE TABLE "EcheancierPaiement" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "montantTotal" DOUBLE PRECISION NOT NULL,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcheancierPaiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranchePaiement" (
    "id" TEXT NOT NULL,
    "echeancierId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "dateEcheance" TIMESTAMP(3) NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "statut" "StatutFacture" NOT NULL DEFAULT 'impayee',
    "datePaiement" TIMESTAMP(3),

    CONSTRAINT "TranchePaiement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EcheancierPaiement" ADD CONSTRAINT "EcheancierPaiement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranchePaiement" ADD CONSTRAINT "TranchePaiement_echeancierId_fkey" FOREIGN KEY ("echeancierId") REFERENCES "EcheancierPaiement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
