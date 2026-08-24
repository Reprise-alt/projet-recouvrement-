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
import {
  assertEntiteInScope,
  estCollaborateurJuridique,
  requireAccesContentieux,
  requireAuth,
} from '../middleware/auth';
import {
  construireDecompte,
  evaluerRecevabilite,
  extraireAvecIa,
  iaDisponible,
  totalDecompte,
  type ParamsDecompte,
} from '../lib/contentieux';
import {
  GABARIT_COMMANDEMENT_SOCIETE_VERSION,
  GABARIT_COMMANDEMENT_VERSION,
  GABARIT_ASSIGNATION_VERSION,
  genererCommandementSocietePdf,
  genererCommandementDePayerPdf,
  genererAssignationEnPaiementPdf,
  type DonneesCommandement,
  type DonneesCommandementSociete,
  type DonneesAssignation,
  type Huissier,
} from '../lib/actes/actesContentieux';
import { logoEntite, mentionsLegales } from '../lib/actes/mentionsLegales';
import { StatutActe, StatutDossierContentieux, TypePiece, TypeActe } from '@prisma/client';

export const contentieuxRouter = Router();
contentieuxRouter.use(requireAuth, requireAccesContentieux);

// Refuse une action d'écriture à un collaborateur juridique externe (avocat /
// huissier) : il consulte et valide/signe, mais ne crée ni ne modifie un
// dossier. Renvoie true (et a déjà répondu 403) s'il faut interrompre.
function bloquerSiCollaborateur(req: any, res: any): boolean {
  if (estCollaborateurJuridique(req.user)) {
    res.status(403).json({ error: 'Action réservée aux agents du recouvrement — un collaborateur juridique consulte et valide/signe.' });
    return true;
  }
  return false;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 30 } });

// Sélection publique d'une pièce : jamais le binaire (contenu) dans le JSON.
const pieceSelect = {
  id: true, type: true, nomFichier: true, mimeType: true, taille: true,
  ocrTexte: true, extraitJson: true, createdAt: true,
} as const;

// Sélection publique d'un acte : jamais les binaires (contenu / contenuSigne).
const acteSelect = {
  id: true, type: true, gabaritVersion: true, statut: true,
  valideParId: true, valideLe: true, signeLe: true, mimeTypeSigne: true, createdAt: true,
} as const;

// Charge un dossier + son client et vérifie la portée. Deux régimes :
//  - collaborateur juridique externe : ne voit QUE les dossiers où il est
//    l'avocat assigné (avocatId), indépendamment de l'entité ;
//  - interne du recouvrement : portée par entité, comme le reste du module.
// Renvoie le dossier, ou null (et a déjà répondu 404/403) si absent / hors portée.
async function chargerDossierScope(req: any, res: any) {
  const dossier = await prisma.dossierContentieux.findUnique({
    where: { id: req.params.id },
    include: { client: true },
  });
  if (!dossier) {
    res.status(404).json({ error: 'Dossier introuvable' });
    return null;
  }
  if (estCollaborateurJuridique(req.user)) {
    if (dossier.avocatId !== req.user.id) {
      res.status(403).json({ error: "Accès refusé — ce dossier ne vous est pas assigné" });
      return null;
    }
    return dossier;
  }
  if (!assertEntiteInScope(req, res, dossier.client.entite as Entite)) return null;
  return dossier;
}

// --- Créer un dossier à partir d'un client + de ses factures impayées ---
contentieuxRouter.post('/dossiers', async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
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
    // Un collaborateur juridique ne liste QUE ses dossiers assignés ; on filtre
    // dès la requête plutôt que côté mémoire.
    const where = estCollaborateurJuridique(req.user!) ? { avocatId: req.user!.id } : {};
    const dossiers = await prisma.dossierContentieux.findMany({
      where,
      include: {
        client: { select: { id: true, nom: true, entite: true } },
        avocat: { select: { id: true, nom: true } },
        _count: { select: { pieces: true, factures: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Interne : portée par entité (le collaborateur est déjà filtré ci-dessus,
    // et n'a pas forcément d'entité de rattachement).
    const entite = req.user!.entite;
    const visibles = !estCollaborateurJuridique(req.user!) && entite
      ? dossiers.filter((d) => d.client.entite === entite)
      : dossiers;
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
        avocat: { select: { id: true, nom: true } },
        factures: true,
        pieces: { select: pieceSelect, orderBy: { createdAt: 'asc' } },
        analyse: true,
        decompte: { orderBy: { montant: 'desc' } },
        actes: {
          select: {
            id: true, type: true, gabaritVersion: true, statut: true,
            valideParId: true, valideLe: true, signeLe: true, mimeTypeSigne: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Expose « a une version signée » sans sortir le binaire.
    const enrichi = dossier && {
      ...dossier,
      actes: dossier.actes.map((a) => ({ ...a, aVersionSignee: Boolean(a.mimeTypeSigne) })),
    };
    res.json(enrichi);
  } catch (err) {
    next(err);
  }
});

// --- Déposer des pièces (multipart, champ « fichiers ») ---
contentieuxRouter.post('/dossiers/:id/pieces', upload.array('fichiers'), async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
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
    if (bloquerSiCollaborateur(req, res)) return;
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
    if (bloquerSiCollaborateur(req, res)) return;
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

// --- Générer un PROJET : commandement de payer ÉMIS PAR LA SOCIÉTÉ (étape 1) ---
contentieuxRouter.post('/dossiers/:id/actes/commandement-societe', async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const { factures, decompte, client } = await preparerDonneesActe(dossier, req.body);
    if (!factures.length) return res.status(400).json({ error: 'Aucune facture rattachée : décompte impossible.' });
    const total = dossier.montantReclame ?? decompte.reduce((s, l) => s + l.montant, 0);

    // Pré-remplissage depuis les mentions légales officielles de l'entité ; une
    // valeur saisie dans le formulaire prime toujours. Logo de l'entité si connu.
    const base = mentionsLegales(client?.entite);
    const b = req.body?.societe || {};
    const donnees: DonneesCommandementSociete = {
      societe: {
        nom: String(b.nom || base?.nom || client?.entite || 'La société créancière'),
        formeJuridique: b.formeJuridique || base?.formeJuridique,
        adresse: b.adresse || base?.adresse,
        rccm: b.rccm || base?.rccm,
        ninea: b.ninea || base?.ninea,
        tel: b.tel || base?.tel,
        email: b.email || base?.email,
        representant: b.representant,
        logo: logoEntite(client?.entite),
      },
      lieu: req.body?.lieu,
      date: new Date(),
      reference: dossier.reference?.slice(-8).toUpperCase(),
      debiteurNom: client?.nom || 'Le débiteur',
      debiteurAdresse: req.body?.debiteurAdresse,
      debiteurRepresentant: req.body?.debiteurRepresentant,
      montantPrincipal: total,
      delaiJours: num(req.body?.delaiJours),
      signataireNom: req.body?.signataireNom || base?.signataireNom,
      signataireQualite: req.body?.signataireQualite || base?.signataireQualite,
      factures: factures.map((f) => ({ numero: f.numero, date: f.dateFacture, echeance: f.dateEcheance, montant: f.montant })),
      decompte: decompte.map((l) => ({ poste: l.poste, montant: l.montant })),
    };
    const pdf = await genererCommandementSocietePdf(donnees);
    const acte = await prisma.acteContentieux.create({
      data: { dossierId: dossier.id, type: TypeActe.commandement_societe, gabaritVersion: GABARIT_COMMANDEMENT_SOCIETE_VERSION, contenu: pdf, mimeType: 'application/pdf' },
      select: acteSelect,
    });
    res.status(201).json(acte);
  } catch (err) {
    next(err);
  }
});

// --- Générer un PROJET : commandement de payer (PDF) ---
contentieuxRouter.post('/dossiers/:id/actes/commandement', async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const { commun, factures } = await preparerDonneesActe(dossier, req.body);
    if (!factures.length) return res.status(400).json({ error: 'Aucune facture rattachée : décompte impossible.' });

    const pdf = await genererCommandementDePayerPdf(commun);
    const acte = await prisma.acteContentieux.create({
      data: { dossierId: dossier.id, type: TypeActe.commandement_de_payer, gabaritVersion: GABARIT_COMMANDEMENT_VERSION, contenu: pdf, mimeType: 'application/pdf' },
      select: acteSelect,
    });
    res.status(201).json(acte);
  } catch (err) {
    next(err);
  }
});

// --- Générer un PROJET : commandement valant assignation en paiement (PDF) ---
contentieuxRouter.post('/dossiers/:id/actes/assignation', async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
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
      select: acteSelect,
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

// --- Lister les collaborateurs juridiques assignables (interne uniquement) ---
contentieuxRouter.get('/avocats', async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
    const avocats = await prisma.utilisateur.findMany({
      where: { accesContentieux: true },
      select: { id: true, nom: true, email: true },
      orderBy: { nom: 'asc' },
    });
    res.json(avocats);
  } catch (err) {
    next(err);
  }
});

// --- Mentions légales pré-remplies d'une entité (pour l'entête, interne) ---
contentieuxRouter.get('/mentions/:entite', async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
    res.json(mentionsLegales(req.params.entite) ?? null);
  } catch (err) {
    next(err);
  }
});

// --- Assigner (ou retirer) l'avocat d'un dossier (interne uniquement) ---
contentieuxRouter.patch('/dossiers/:id/avocat', async (req, res, next) => {
  try {
    if (bloquerSiCollaborateur(req, res)) return;
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const avocatId = req.body?.avocatId ? String(req.body.avocatId) : null;
    if (avocatId) {
      const avocat = await prisma.utilisateur.findFirst({ where: { id: avocatId, accesContentieux: true } });
      if (!avocat) return res.status(400).json({ error: "Cet utilisateur n'est pas un collaborateur juridique (accès Contentieux requis)" });
    }
    await prisma.dossierContentieux.update({ where: { id: dossier.id }, data: { avocatId } });
    const avocat = avocatId ? await prisma.utilisateur.findUnique({ where: { id: avocatId }, select: { id: true, nom: true } }) : null;
    res.json({ ok: true, avocat });
  } catch (err) {
    next(err);
  }
});

// --- Valider un acte (le professionnel relit le PROJET) ---
// Ouvert au collaborateur assigné (chargerDossierScope le vérifie) et à l'interne.
contentieuxRouter.post('/dossiers/:id/actes/:acteId/valider', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte) return res.status(404).json({ error: 'Acte introuvable' });
    if (acte.statut === StatutActe.signe) return res.status(400).json({ error: 'Acte déjà signé' });
    const maj = await prisma.acteContentieux.update({
      where: { id: acte.id },
      data: { statut: StatutActe.valide, valideParId: req.user!.id, valideLe: new Date() },
      select: acteSelect,
    });
    res.json(maj);
  } catch (err) {
    next(err);
  }
});

// --- Déposer la version signée d'un acte (PDF/image scannée) ---
contentieuxRouter.post('/dossiers/:id/actes/:acteId/signe', upload.single('fichier'), async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte) return res.status(404).json({ error: 'Acte introuvable' });
    const fichier = req.file as Express.Multer.File | undefined;
    if (!fichier) return res.status(400).json({ error: 'Aucun fichier reçu (champ « fichier »)' });
    const maj = await prisma.acteContentieux.update({
      where: { id: acte.id },
      data: {
        statut: StatutActe.signe,
        signeLe: new Date(),
        contenuSigne: fichier.buffer,
        mimeTypeSigne: fichier.mimetype,
        // Consigne le validateur si l'acte n'avait pas encore été validé.
        valideParId: acte.valideParId ?? req.user!.id,
        valideLe: acte.valideLe ?? new Date(),
      },
      select: acteSelect,
    });
    res.json(maj);
  } catch (err) {
    next(err);
  }
});

// --- Télécharger la version signée d'un acte ---
contentieuxRouter.get('/dossiers/:id/actes/:acteId/signe/pdf', async (req, res, next) => {
  try {
    const dossier = await chargerDossierScope(req, res);
    if (!dossier) return;
    const acte = await prisma.acteContentieux.findFirst({ where: { id: req.params.acteId, dossierId: dossier.id } });
    if (!acte || !acte.contenuSigne) return res.status(404).json({ error: 'Aucune version signée' });
    res.setHeader('Content-Type', acte.mimeTypeSigne || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="signe-${acte.type}-${dossier.id}"`);
    res.send(Buffer.from(acte.contenuSigne));
  } catch (err) {
    next(err);
  }
});

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
