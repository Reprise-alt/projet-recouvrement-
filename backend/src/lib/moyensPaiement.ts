import { prisma } from '../db';

// Forme prête au rendu (email + portail) d'un moyen de paiement.
export interface MoyenPaiementRender {
  label: string;
  lien?: string | null;
  numero?: string | null;
  qrUrl?: string | null;
}

// Charge les moyens de paiement d'une organisation, ordonnés, prêts au rendu.
// Ne renvoie que les moyens ayant au moins un canal (lien, numéro ou QR).
export async function chargerMoyensPaiement(orgId: string): Promise<MoyenPaiementRender[]> {
  const moyens = await prisma.moyenPaiement.findMany({
    where: { organisationId: orgId, actif: true },
    orderBy: [{ ordre: 'asc' }, { createdAt: 'asc' }],
    select: { label: true, lien: true, numero: true, qrUrl: true },
  });
  return moyens.filter((m) => m.lien?.trim() || m.numero?.trim() || m.qrUrl?.trim());
}
