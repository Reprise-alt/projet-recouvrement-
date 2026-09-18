import { Router } from 'express';
import multer from 'multer';
import { StatutActe } from '@prisma/client';
import { prisma } from '../db';
import { requirePartenaire } from '../middleware/auth';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

// Charge un dossier UNIQUEMENT s'il est confié au partenaire (garde-fou commun
// à toutes les actions partenaire). Hors contexte tenant (cross-société).
async function chargerDossierConfie(req: import('express').Request, res: import('express').Response) {
  const dossier = await prisma.dossierContentieux.findFirst({ where: { id: req.params.id, confieAuPartenaire: true } });
  if (!dossier) {
    res.status(404).json({ error: 'Dossier introuvable ou non confié au partenaire' });
    return null;
  }
  return dossier;
}

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

// ── Phase 3 : le partenaire AGIT (relire, télécharger, valider, signer) ───────

// Télécharger une pièce du dossier (le fichier lui-même).
partenaireRouter.get('/dossiers/:id/pieces/:pieceId/fichier', async (req, res, next) => {
  try {
    const dossier = await chargerDossierConfie(req, res);
    if (!dossier) return;
    const piece = await prisma.pieceContentieux.findFirst({ where: { id: req.params.pieceId, dossierId: dossier.id } });
    if (!piece) return res.status(404).json({ error: 'Pièce introuvable' });
    res.setHeader('Content-Type', piece.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(piece.nomFichier)}"`);
    res.send(Buffer.from(piece.contenu));
  } catch (e) {
    next(e);
  }
});

// Télécharger le PROJET d'acte (PDF généré par le créancier, à relire).
partenaireRouter.get('/dossiers/:id/actes/:acteId/pdf', async (req, res, next) => {
  try {
    const dossier = await chargerDossierConfie(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte) return res.status(404).json({ error: 'Acte introuvable' });
    res.setHeader('Content-Type', acte.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="projet-${acte.type}-${dossier.id}.pdf"`);
    res.send(Buffer.from(acte.contenu));
  } catch (e) {
    next(e);
  }
});

// Télécharger la version SIGNÉE d'un acte (si déposée).
partenaireRouter.get('/dossiers/:id/actes/:acteId/signe/pdf', async (req, res, next) => {
  try {
    const dossier = await chargerDossierConfie(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte || !acte.contenuSigne) return res.status(404).json({ error: 'Aucune version signée' });
    res.setHeader('Content-Type', acte.mimeTypeSigne || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="signe-${acte.type}-${dossier.id}"`);
    res.send(Buffer.from(acte.contenuSigne));
  } catch (e) {
    next(e);
  }
});

// Valider un acte (le professionnel relit le PROJET et le valide). Le partenaire
// n'étant pas un Utilisateur, valideParId reste null (la trace est le statut +
// l'horodatage ; la signature déposée fait foi ensuite).
partenaireRouter.post('/dossiers/:id/actes/:acteId/valider', async (req, res, next) => {
  try {
    const dossier = await chargerDossierConfie(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte) return res.status(404).json({ error: 'Acte introuvable' });
    if (acte.statut === StatutActe.signe) return res.status(400).json({ error: 'Acte déjà signé' });
    await prisma.acteContentieux.update({
      where: { id: acte.id },
      data: { statut: StatutActe.valide, valideLe: new Date() },
    });
    res.json({ ok: true, statut: StatutActe.valide });
  } catch (e) {
    next(e);
  }
});

// Déposer la version SIGNÉE d'un acte (PDF/scan). Fait passer l'acte à « signé ».
partenaireRouter.post('/dossiers/:id/actes/:acteId/signe', upload.single('fichier'), async (req, res, next) => {
  try {
    const dossier = await chargerDossierConfie(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte) return res.status(404).json({ error: 'Acte introuvable' });
    const fichier = req.file as Express.Multer.File | undefined;
    if (!fichier) return res.status(400).json({ error: 'Aucun fichier reçu (champ « fichier »)' });
    await prisma.acteContentieux.update({
      where: { id: acte.id },
      data: {
        statut: StatutActe.signe,
        signeLe: new Date(),
        contenuSigne: fichier.buffer,
        mimeTypeSigne: fichier.mimetype,
        valideLe: acte.valideLe ?? new Date(),
      },
    });
    res.json({ ok: true, statut: StatutActe.signe });
  } catch (e) {
    next(e);
  }
});
