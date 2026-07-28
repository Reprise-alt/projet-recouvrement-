import { Router } from 'express';
import multer from 'multer';
import { buildTemplateCsv } from '../lib/csvTemplate';
import { parseImportBuffer } from '../lib/parsers';
import { applyImport } from '../services/importService';

export const importRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

importRouter.get('/template', (_req, res) => {
  const csv = buildTemplateCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modele_recouvrement.csv"');
  res.send('﻿' + csv);
});

importRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    const { clients, message } = parseImportBuffer(req.file.buffer);
    if (!clients.length) {
      return res.status(422).json({ error: 'Aucune donnée exploitable dans ce fichier.', message });
    }

    const summary = await applyImport(clients);
    res.json({ message, summary, clientsCount: clients.length });
  } catch (err) {
    next(err);
  }
});
