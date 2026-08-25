// =====================================================================
// Portail débiteur — routes PUBLIQUES (aucune authentification)
// ---------------------------------------------------------------------
// Accès par un token imprévisible (comme les liens coursier/salle) que le
// créancier partage au débiteur. Le débiteur consulte sa dette, télécharge le
// commandement, et propose un règlement / échéancier. On ne renvoie JAMAIS de
// donnée interne (analyse, scoring, token, autres dossiers) sur ces routes.
// =====================================================================
import { Router } from 'express';
import { prisma } from '../db';
import { mentionsLegales } from '../lib/actes/mentionsLegales';

export const contentieuxPortailRouter = Router();

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function chargerParToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.dossierContentieux.findUnique({
    where: { portailToken: token },
    include: { client: true, factures: true, actes: { select: { id: true, type: true, createdAt: true } } },
  });
}

// --- Infos publiques du dossier ---
contentieuxPortailRouter.get('/:token', async (req, res, next) => {
  try {
    const d = await chargerParToken(req.params.token);
    if (!d) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    const montantDu = d.montantReclame ?? d.factures.reduce((s, f) => s + f.montant, 0);
    const commandement = d.actes.some((a) => a.type === 'commandement_societe');
    const derniere = await prisma.propositionPaiement.findFirst({
      where: { dossierId: d.id },
      orderBy: { createdAt: 'desc' },
      select: { statut: true, createdAt: true },
    });
    res.json({
      reference: d.reference,
      entite: d.client.entite,
      creancierNom: mentionsLegales(d.client.entite)?.nom || d.client.entite,
      debiteurNom: d.client.nom,
      montantDu,
      clos: d.statut === 'clos',
      commandementDisponible: commandement,
      factures: d.factures.map((f) => ({ numero: f.numero, montant: f.montant, dateEcheance: f.dateEcheance })),
      derniereProposition: derniere,
    });
  } catch (err) {
    next(err);
  }
});

// --- Télécharger le commandement de payer (société) ---
contentieuxPortailRouter.get('/:token/commandement', async (req, res, next) => {
  try {
    const d = await chargerParToken(req.params.token);
    if (!d) return res.status(404).json({ error: 'Lien invalide.' });
    const ref = d.actes
      .filter((a) => a.type === 'commandement_societe')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!ref) return res.status(404).json({ error: 'Aucun document disponible.' });
    const acte = await prisma.acteContentieux.findUnique({ where: { id: ref.id }, select: { contenu: true, mimeType: true } });
    if (!acte) return res.status(404).json({ error: 'Document introuvable.' });
    res.setHeader('Content-Type', acte.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="commandement-${d.reference}.pdf"`);
    res.send(Buffer.from(acte.contenu));
  } catch (err) {
    next(err);
  }
});

// --- Soumettre une proposition de règlement ---
contentieuxPortailRouter.post('/:token/proposition', async (req, res, next) => {
  try {
    const d = await prisma.dossierContentieux.findUnique({ where: { portailToken: req.params.token }, select: { id: true, statut: true } });
    if (!d) return res.status(404).json({ error: 'Lien invalide.' });
    if (d.statut === 'clos') return res.status(400).json({ error: 'Ce dossier est clôturé.' });
    const message = req.body?.message ? String(req.body.message).slice(0, 2000) : null;
    const montantPropose = num(req.body?.montantPropose) ?? null;
    const nRaw = Number(req.body?.nbEcheances);
    const nbEcheances = Number.isFinite(nRaw) && nRaw > 0 ? Math.min(60, Math.round(nRaw)) : null;
    const premierPaiement = req.body?.premierPaiement ? new Date(req.body.premierPaiement) : null;
    if (!message && montantPropose == null && nbEcheances == null) {
      return res.status(400).json({ error: 'Proposition vide.' });
    }
    await prisma.propositionPaiement.create({ data: { dossierId: d.id, message, montantPropose, nbEcheances, premierPaiement } });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});
