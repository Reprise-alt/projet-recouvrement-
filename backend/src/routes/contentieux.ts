// =====================================================================
// Module Contentieux — API « Copilote Contentieux »
// ---------------------------------------------------------------------
// Dépôt d'un dossier de recouvrement judiciaire, upload des pièces,
// analyse IA (extraction) + moteur déterministe (décompte + recevabilité
// OHADA), et génération d'un PROJET d'acte (injonction de payer).
// Réservé aux profils recouvrement, scopé par entité comme le reste du
// module. Voir lib/contentieux.ts et lib/actes/injonctionDePayer.ts.
// =====================================================================
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { Entite } from '../lib/entites';
import { assertEntiteInScope, requireAccesRecouvrement, requireAuth } from '../middleware/auth';
import {
  construireDecompte,
  evaluerRecevabilite,
  extraireAvecIa,
  iaDisponible,
  totalDecompte,
  type ParamsDecompte,
} from '../lib/contentieux';
import {
  GABARIT_COMMANDEMENT_VERSION,
  GABARIT_ASSIGNATION_VERSION,
  genererCommandementDePayerPdf,
  genererAssignationEnPaiementPdf,
  type DonneesCommandement,
  type DonneesAssignation,
  type Huissier,
} from '../lib/actes/actesContentieux';
import { StatutDossierContentieux, TypePiece, TypeActe } from '@prisma/client';

export const contentieuxRouter = Router();
contentieuxRouter.use(requireAuth, requireAccesRecouvrement);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 30 } });

// Sélection publique d'une pièce : jamais le binaire (contenu) dans le JSON.
const pieceSelect = {
  id: true, type: true, nomFichier: true, mimeType: true, taille: true,
  ocrTexte: true, extraitJson: true, createdAt: true,
} as const;

// Charge un dossier + son client et vérifie la portée par entité. Renvoie le
// dossier, ou null (et a déjà répondu 404/403) si absent / hors périmètre.
async function chargerDossierScope(req: any, res: any) {
  const dossier = await prisma.dossierContentieux.findUnique({
    where: { id: req.params.id },
    include: { client: true },
  });
  if (!dossier) {
    res.status(404).json({ error: 'Dossier introuvable' });
    return null;
  }
  if (!assertEntiteInScope(req, res, dossier.client.entite as Entite)) return null;
  return dossier;
}

// --- Créer un dossier à partir d'un client + de ses factures impayées ---
contentieuxRouter.post('/dossiers', async (req, res, next) => {
  try {
    const { clientId, factureIds } = req.body as { clientId?: string; factureIds?: string[] };
    if (!clientId) return res.status(400).json({ error: 'clientId requis' });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, client.entite as Entite)) return;

    const dossier = await prisma.dossierContentieux.create({
      data: { clientId, createurId: req.user!.id },
    });

    // Rattache les factures demandées (uniquement celles du client).
    if (Array.isArray(factureIds) && factureIds.length) {
      await prisma.facture.updateMany({
        where: { id: { in: factureIds }, clientId },
        data: { dossierContentieuxId: dossier.id },
      });
    }

    const complet = await prisma.dossierContentieux.findUnique({
      where: { id: dossier.id },
      include: { client: true, factures: true, pieces: { select: pieceSelect } },
    });
    res.status(201).json(complet);
  } catch (err) {
    next(err);
  }
});

// --- Lister les dossiers (scopés par entité) ---
contentieuxRouter.get('/dossiers', async (req, res, next) => {
  try {
    const dossiers = await prisma.dossierContentieux.findMany({
      include: { client: { select: { id: true, nom: true, entite: true } }, _count: { select: { pieces: true, factures: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const entite = req.user!.entite;
    const visibles = entite ? dossiers.filter((d) => d.client.entite === entite) : dossiers;
    res.json(visibles);
  } catch (err) {
    next(err);
  }
});

// --- Détail d'un dossier ---
contentieuxRouter.get('/dossiers/:id', async (req, res, next) => {
  try {
    const base = await chargerDossierScope(req, res);
    if (!base) return;
    const dossier = await prisma.dossierContentieux.findUnique({
      where: { id: base.id },
      include: {
        client: true,
        factures: true,
        pieces: { select: pieceSelect, orderBy: { createdAt: 'asc' } },
        analyse: true,
        decompte: { orderBy: { montant: 'desc' } },
        actes: { select: { id: true, type: true, gabaritVersion: true, statut: true, createdAt: true } },
      },
    });
    res.json(dossier);
  } catch (err) {
    next(err);
  }
});

// --- Déposer des pièces (multipart, champ « fichiers ») ---
contentieuxRouter.post('/dossiers/:id/pieces', upload.array('fichiers'), async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const fichiers = (req.files as Express.Multer.File[]) || [];
    if (!fichiers.length) return res.status(400).json({ error: 'Aucun fichier reçu (champ « fichiers »)' });

    // Type éventuellement fourni pour tous les fichiers ; l'analyse IA le
    // reclassera ensuite au cas par cas.
    const typeDemande = String(req.body?.type || '');
    const type = (Object.values(TypePiece) as string[]).includes(typeDemande) ? (typeDemande as TypePiece) : TypePiece.autre;

    const crees = await prisma.$transaction(
      fichiers.map((f) =>
        prisma.pieceContentieux.create({
          data: {
            dossierId: dossier.id,
            type,
            nomFichier: f.originalname,
            mimeType: f.mimetype,
            contenu: f.buffer,
            taille: f.size,
          },
          select: pieceSelect,
        }),
      ),
    );
    res.status(201).json(crees);
  } catch (err) {
    next(err);
  }
});

// --- Télécharger une pièce ---
contentieuxRouter.get('/dossiers/:id/pieces/:pieceId/fichier', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const piece = await prisma.pieceContentieux.findFirst({ where: { id: req.params.pieceId, dossierId: dossier.id } });
    if (!piece) return res.status(404).json({ error: 'Pièce introuvable' });
    res.setHeader('Content-Type', piece.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(piece.nomFichier)}"`);
    res.send(Buffer.from(piece.contenu));
  } catch (err) {
    next(err);
  }
});

// --- Supprimer une pièce ---
contentieuxRouter.delete('/dossiers/:id/pieces/:pieceId', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    await prisma.pieceContentieux.deleteMany({ where: { id: req.params.pieceId, dossierId: dossier.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Analyser le dossier : extraction IA + décompte + recevabilité ---
contentieuxRouter.post('/dossiers/:id/analyser', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;

    const [pieces, factures, client] = await Promise.all([
      prisma.pieceContentieux.findMany({ where: { dossierId: dossier.id } }),
      prisma.facture.findMany({ where: { dossierContentieuxId: dossier.id } }),
      prisma.client.findUnique({ where: { id: dossier.clientId } }),
    ]);

    // 1) Extraction IA (best-effort — ne bloque pas si l'IA est absente/échoue).
    let extraction = null;
    try {
      extraction = await extraireAvecIa(pieces);
    } catch (e) {
      extraction = null; // panne IA → on continue en déterministe
    }

    // Applique les types/faits reclassés par l'IA aux pièces.
    if (extraction) {
      await prisma.$transaction(
        extraction.pieces
          .filter((p) => p.pieceId)
          .map((p) =>
            prisma.pieceContentieux.updateMany({
              where: { id: p.pieceId, dossierId: dossier.id },
              data: { type: p.type, ocrTexte: p.resume, extraitJson: { montant: p.montant, date: p.date, reference: p.reference } },
            }),
          ),
      );
    }

    // 2) Décompte déterministe (principal sourcé + intérêts/pénalités/frais optionnels).
    const params: ParamsDecompte = {
      tauxInteretAnnuel: num(req.body?.tauxInteretAnnuel),
      penalite: num(req.body?.penalite),
      frais: num(req.body?.frais),
    };
    const lignes = construireDecompte(factures, params);
    const total = totalDecompte(lignes);

    // 3) Recevabilité OHADA.
    const piecesApres = await prisma.pieceContentieux.findMany({ where: { dossierId: dossier.id }, select: { type: true } });
    const recevabilite = evaluerRecevabilite(factures, piecesApres, extraction, client?.nom || 'le débiteur');

    // 4) Persistance : remplace analyse + décompte, met à jour le dossier.
    await prisma.$transaction([
      prisma.ligneDecompte.deleteMany({ where: { dossierId: dossier.id } }),
      prisma.ligneDecompte.createMany({ data: lignes.map((l) => ({ dossierId: dossier.id, poste: l.poste, montant: l.montant })) }),
      prisma.analyseContentieux.upsert({
        where: { dossierId: dossier.id },
        create: {
          dossierId: dossier.id,
          certaine: recevabilite.certaine, liquide: recevabilite.liquide, exigible: recevabilite.exigible,
          prescriptionOk: recevabilite.prescriptionOk, manquants: recevabilite.manquants,
          competence: recevabilite.competence, syntheseIa: extraction?.synthese || null, modeleIa: extraction?.modele || null,
        },
        update: {
          certaine: recevabilite.certaine, liquide: recevabilite.liquide, exigible: recevabilite.exigible,
          prescriptionOk: recevabilite.prescriptionOk, manquants: recevabilite.manquants,
          competence: recevabilite.competence, syntheseIa: extraction?.synthese || null, modeleIa: extraction?.modele || null,
        },
      }),
      prisma.dossierContentieux.update({
        where: { id: dossier.id },
        data: {
          verdict: recevabilite.verdict,
          montantReclame: total,
          statut: dossier.statut === StatutDossierContentieux.ouvert ? StatutDossierContentieux.analyse : dossier.statut,
        },
      }),
    ]);

    const complet = await prisma.dossierContentieux.findUnique({
      where: { id: dossier.id },
      include: { analyse: true, decompte: true },
    });
    res.json({ ...complet, iaUtilisee: Boolean(extraction), iaDisponible: iaDisponible() });
  } catch (err) {
    next(err);
  }
});

// Données communes aux deux actes, tirées du dossier + du corps de requête.
async function preparerDonneesActe(dossier: { id: string; clientId: string; montantReclame: number | null }, body: any) {
  const [factures, decompte, client] = await Promise.all([
    prisma.facture.findMany({ where: { dossierContentieuxId: dossier.id } }),
    prisma.ligneDecompte.findMany({ where: { dossierId: dossier.id } }),
    prisma.client.findUnique({ where: { id: dossier.clientId } }),
  ]);
  const total = dossier.montantReclame ?? decompte.reduce((s, l) => s + l.montant, 0);
  const huissier: Huissier = {
    nom: String(body?.huissier?.nom || body?.huissierNom || "Maître ________________"),
    etude: body?.huissier?.etude,
    adresse: body?.huissier?.adresse,
    tel: body?.huissier?.tel,
    email: body?.huissier?.email,
  };
  const commun: DonneesCommandement = {
    huissier,
    lieu: body?.lieu,
    date: new Date(),
    demandeurNom: client?.entite || 'Le créancier',
    demandeurRepresentant: body?.demandeurRepresentant,
    demandeurAdresse: body?.demandeurAdresse,
    debiteurNom: client?.nom || 'Le débiteur',
    debiteurAdresse: body?.debiteurAdresse,
    debiteurRemisA: body?.debiteurRemisA,
    montantPrincipal: total,
    coutActe: num(body?.coutActe),
    factures: factures.map((f) => ({ numero: f.numero, date: f.dateFacture, echeance: f.dateEcheance, montant: f.montant })),
  };
  return { commun, decompte, factures, client };
}

// --- Générer un PROJET : commandement de payer (PDF) ---
contentieuxRouter.post('/dossiers/:id/actes/commandement', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const { commun, factures } = await preparerDonneesActe(dossier, req.body);
    if (!factures.length) return res.status(400).json({ error: 'Aucune facture rattachée : décompte impossible.' });

    const pdf = await genererCommandementDePayerPdf(commun);
    const acte = await prisma.acteContentieux.create({
      data: { dossierId: dossier.id, type: TypeActe.commandement_de_payer, gabaritVersion: GABARIT_COMMANDEMENT_VERSION, contenu: pdf, mimeType: 'application/pdf' },
      select: { id: true, type: true, gabaritVersion: true, statut: true, createdAt: true },
    });
    res.status(201).json(acte);
  } catch (err) {
    next(err);
  }
});

// --- Générer un PROJET : commandement valant assignation en paiement (PDF) ---
contentieuxRouter.post('/dossiers/:id/actes/assignation', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const { commun, decompte, factures } = await preparerDonneesActe(dossier, req.body);
    if (!factures.length) return res.status(400).json({ error: 'Aucune facture rattachée : décompte impossible.' });

    const donnees: DonneesAssignation = {
      ...commun,
      electionDomicile: req.body?.electionDomicile,
      tribunal: req.body?.tribunal,
      dateComparution: req.body?.dateComparution ? new Date(req.body.dateComparution) : undefined,
      heureComparution: req.body?.heureComparution,
      exposeFaits: req.body?.exposeFaits,
      miseEnDemeureDate: req.body?.miseEnDemeureDate ? new Date(req.body.miseEnDemeureDate) : undefined,
      dommagesInterets: num(req.body?.dommagesInterets),
      decompte: decompte.map((l) => ({ poste: l.poste, montant: l.montant })),
      bordereau: Array.isArray(req.body?.bordereau) ? req.body.bordereau : undefined,
    };
    const pdf = await genererAssignationEnPaiementPdf(donnees);
    const acte = await prisma.acteContentieux.create({
      data: { dossierId: dossier.id, type: TypeActe.assignation_en_paiement, gabaritVersion: GABARIT_ASSIGNATION_VERSION, contenu: pdf, mimeType: 'application/pdf' },
      select: { id: true, type: true, gabaritVersion: true, statut: true, createdAt: true },
    });
    res.status(201).json(acte);
  } catch (err) {
    next(err);
  }
});

// --- Télécharger un acte (PDF) ---
contentieuxRouter.get('/dossiers/:id/actes/:acteId/pdf', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte) return res.status(404).json({ error: 'Acte introuvable' });
    res.setHeader('Content-Type', acte.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="projet-${acte.type}-${dossier.id}.pdf"`);
    res.send(Buffer.from(acte.contenu));
  } catch (err) {
    next(err);
  }
});

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
