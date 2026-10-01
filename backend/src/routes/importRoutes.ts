import { Router } from 'express';
import multer from 'multer';
import { prisma, rlsActive } from '../db';
import { buildTemplateCsv } from '../lib/csvTemplate';
import * as XLSX from 'xlsx';
import {
  parseImportBuffer,
  isOluFacturationWorkbook,
  isContractTrackingWorkbook,
  processImportRows,
} from '../lib/parsers';
import {
  extractSheet,
  buildPreview,
  rowsToGeneric,
  CanonicalField,
} from '../lib/parsers/flexibleImport';
import { applyImport } from '../services/importService';
import { getKnownEntitesForImport } from '../services/entrepriseService';
import { requireAuth, requireRole } from '../middleware/auth';
import { getCapacites } from '../middleware/capacite';

export const importRouter = Router();
// 100 Mo : un fichier de centaines de milliers de factures (CSV surtout) dépasse
// facilement 20 Mo. Le fichier est tenu en mémoire le temps du parse — pour les
// très gros imports, prévoir une instance backend plus dotée en RAM.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// L'import de fichiers touche potentiellement les 3 entités et crée des
// clients — traité comme une opération globale, réservée à l'admin (§4),
// au même titre que la configuration et les futurs connecteurs.
import { tenantScope } from '../middleware/tenant';
import { requireAbonnementActif } from '../middleware/abonnement';

importRouter.use(requireAuth, requireAbonnementActif, requireRole('admin'), tenantScope);

importRouter.get('/template', (_req, res) => {
  const csv = buildTemplateCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele_recouvrement.csv"');
  res.send('﻿' + csv);
});

importRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    const knownEntites = await getKnownEntitesForImport();
    const { clients, message } = parseImportBuffer(req.file.buffer, knownEntites);
    if (!clients.length) {
      return res.status(422).json({ error: 'Aucune donnée exploitable dans ce fichier.', message });
    }

    // Limite de débiteurs de la formule (SaaS uniquement). On bloque tant que le
    // seuil est déjà atteint — un import ne fait alors qu'augmenter le dépassement.
    if (rlsActive()) {
      const caps = await getCapacites(req.user!.organisationId);
      if (caps.maxDebiteurs != null) {
        const existant = await prisma.client.count();
        if (existant >= caps.maxDebiteurs) {
          return res.status(403).json({
            error: `Votre formule est limitée à ${caps.maxDebiteurs} débiteurs (vous en avez ${existant}). Passez à une formule supérieure pour en importer davantage.`,
            capacite: 'maxDebiteurs',
          });
        }
      }
    }

    const summary = await applyImport(clients, req.user!.organisationId);
    res.json({ message, summary, clientsCount: clients.length });
  } catch (err) {
    next(err);
  }
});

// Vérifie la limite de débiteurs de la formule (SaaS). Renvoie une réponse 403
// déjà envoyée (true) ou laisse continuer (false).
async function capaciteDepassee(req: import('express').Request, res: import('express').Response): Promise<boolean> {
  if (!rlsActive()) return false;
  const caps = await getCapacites(req.user!.organisationId);
  if (caps.maxDebiteurs == null) return false;
  const existant = await prisma.client.count();
  if (existant >= caps.maxDebiteurs) {
    res.status(403).json({
      error: `Votre formule est limitée à ${caps.maxDebiteurs} débiteurs (vous en avez ${existant}). Passez à une formule supérieure pour en importer davantage.`,
      capacite: 'maxDebiteurs',
    });
    return true;
  }
  return false;
}

// Aperçu d'import souple : accepte N'IMPORTE QUEL classeur, détecte s'il s'agit
// d'un format déjà reconnu (OLU/contrats), sinon renvoie les en-têtes, une
// correspondance devinée et quelques lignes d'exemple pour que l'utilisateur
// confirme le mapping avant d'importer.
importRouter.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const knownEntites = await getKnownEntitesForImport();

    if (isOluFacturationWorkbook(wb) || isContractTrackingWorkbook(wb)) {
      const { clients, message } = parseImportBuffer(req.file.buffer, knownEntites);
      return res.json({
        recognized: true,
        kind: isOluFacturationWorkbook(wb) ? 'olu' : 'contrats',
        message,
        clientsCount: clients.length,
      });
    }

    const extract = extractSheet(req.file.buffer);
    if (!extract.headers.length) {
      return res.status(422).json({ error: "Ce fichier ne contient aucune colonne lisible. Vérifiez qu'il a une ligne d'en-tête." });
    }
    return res.json(buildPreview(extract));
  } catch (err) {
    next(err);
  }
});

// Import souple avec correspondance confirmée : rejoue le fichier avec la
// correspondance de colonnes choisie (champ → en-tête), puis applique l'import.
importRouter.post('/mapped', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    let mapping: Partial<Record<CanonicalField, string | null>> = {};
    try {
      mapping = JSON.parse(String(req.body?.mapping ?? '{}'));
    } catch {
      return res.status(400).json({ error: 'Correspondance de colonnes invalide.' });
    }
    if (!mapping.client_nom) {
      return res.status(400).json({ error: 'La colonne « Nom du débiteur » est obligatoire.' });
    }

    const knownEntites = await getKnownEntitesForImport();
    const extract = extractSheet(req.file.buffer);
    const genericRows = rowsToGeneric(extract.headers, extract.rows, mapping);
    const { clients, skipped } = processImportRows(genericRows, knownEntites);
    if (!clients.length) {
      return res.status(422).json({
        error: 'Aucune ligne exploitable avec cette correspondance. Vérifiez la colonne « Nom du débiteur ».',
      });
    }

    if (await capaciteDepassee(req, res)) return;

    const summary = await applyImport(clients, req.user!.organisationId);
    const message = `${clients.length} débiteur(s) reconnu(s)${skipped ? `, ${skipped} ligne(s) sans nom ignorée(s)` : ''}.`;
    res.json({ message, summary, clientsCount: clients.length });
  } catch (err) {
    next(err);
  }
});
