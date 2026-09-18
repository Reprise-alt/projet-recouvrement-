import { Router } from 'express';
import { prisma } from '../db';
import { requirePartenaire } from '../middleware/auth';

// Console du cabinet partenaire (avocat/huissier plateforme). Phase 2 : LECTURE.
// Le partenaire n'appartient à aucune organisation ; ces routes opèrent donc
// HORS contexte tenant. Sous RLS, l'absence de contexte (app_current_org() IS
// NULL) laisse voir toutes les sociétés — on filtre EXPLICITEMENT sur
// `confieAuPartenaire` pour ne montrer que les dossiers confiés.
export const partenaireRouter = Router();
partenaireRouter.use(requirePartenaire);

// Sélections sûres : jamais le binaire d'une pièce ni celui d'un acte signé.
const pieceSelect = { id: true, type: true, nomFichier: true, mimeType: true, taille: true, ocrTexte: true, createdAt: true } as const;
const acteSelect = {
  id: true, type: true, gabaritVersion: true, statut: true,
  valideLe: true, signeLe: true, mimeTypeSigne: true, createdAt: true,
} as const;

// Liste des dossiers confiés au cabinet, TOUTES sociétés confondues.
partenaireRouter.get('/dossiers', async (_req, res, next) => {
  try {
    const dossiers = await prisma.dossierContentieux.findMany({
      where: { confieAuPartenaire: true },
      orderBy: { confieLe: 'desc' },
      select: {
        id: true, reference: true, statut: true, verdict: true, montantReclame: true,
        confieLe: true, createdAt: true,
        client: {
          select: {
            nom: true, entite: true,
            organisation: { select: { raisonSociale: true, logoUrl: true } },
          },
        },
      },
    });
    const items = dossiers.map((d) => ({
      id: d.id,
      reference: d.reference,
      statut: d.statut,
      verdict: d.verdict,
      montantReclame: d.montantReclame,
      confieLe: d.confieLe,
      createdAt: d.createdAt,
      client: { nom: d.client.nom, entite: d.client.entite },
      societe: {
        raisonSociale: d.client.organisation?.raisonSociale ?? '—',
        logoUrl: d.client.organisation?.logoUrl ?? null,
      },
    }));
    res.json({ total: items.length, dossiers: items });
  } catch (e) {
    next(e);
  }
});

// Détail d'un dossier confié (lecture seule en Phase 2). Le filtre
// `confieAuPartenaire` empêche un partenaire de lire un dossier par simple id.
partenaireRouter.get('/dossiers/:id', async (req, res, next) => {
  try {
    const dossier = await prisma.dossierContentieux.findFirst({
      where: { id: req.params.id, confieAuPartenaire: true },
      include: {
        client: { include: { organisation: { select: { raisonSociale: true, logoUrl: true } } } },
        factures: true,
        pieces: { select: pieceSelect, orderBy: { createdAt: 'asc' } },
        analyse: true,
        decompte: { orderBy: { montant: 'desc' } },
        actes: { select: acteSelect, orderBy: { createdAt: 'asc' } },
        propositions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable ou non confié au partenaire' });
    res.json(dossier);
  } catch (e) {
    next(e);
  }
});
