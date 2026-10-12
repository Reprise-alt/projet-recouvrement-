import { Router } from 'express';
import { prisma } from '../db';
import { verifierTokenAssureur } from '../lib/authToken';
import { chargerMoyensPaiement } from '../lib/moyensPaiement';

// Espace Assureur (public, sans authentification) : un assureur (débiteur)
// consulte via un lien tokenisé son relevé avec le créancier (opticien…) et
// signale ses règlements. Accès par jeton imprévisible (cf. signerTokenAssureur) ;
// aucune donnée interne (scoring, autres clients…) n'est exposée.
export const assureurPortailRouter = Router();

const TYPES_REGLEMENT = ['virement', 'cheque', 'espece', 'mobile'];

function anciennete(dateEcheance: Date | null): number {
  if (!dateEcheance) return 0;
  const j = Math.floor((Date.now() - new Date(dateEcheance).getTime()) / 86400000);
  return j > 0 ? j : 0;
}

async function chargerParToken(token: string) {
  const info = verifierTokenAssureur(token);
  if (!info) return null;
  const client = await prisma.client.findFirst({
    where: { id: info.clientId, organisationId: info.org },
    include: { factures: { where: { statut: 'impayee' }, orderBy: { dateEcheance: 'asc' } } },
  });
  if (!client) return null;
  const org = await prisma.organisation.findUnique({ where: { id: info.org } });
  if (!org) return null;
  return { info, client, org };
}

// GET /:token — relevé de compte de l'assureur (factures impayées + ancienneté),
// identité du créancier + logos (co-branding) + coordonnées de paiement.
assureurPortailRouter.get('/:token', async (req, res, next) => {
  try {
    const data = await chargerParToken(req.params.token);
    if (!data) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    const { client, org } = data;
    const factures = client.factures.map((f) => ({
      numero: f.numero,
      montant: f.montant,
      dateEcheance: f.dateEcheance,
      joursRetard: anciennete(f.dateEcheance),
    }));
    const encours = factures.reduce((s, f) => s + f.montant, 0);
    const assureurLogo =
      client.logoData && client.logoMime
        ? `data:${client.logoMime};base64,${Buffer.from(client.logoData).toString('base64')}`
        : null;
    res.json({
      assureurNom: client.nom,
      assureurLogo,
      creancierNom: org.raisonSociale,
      creancierLogoUrl: org.logoUrl ?? null,
      encours,
      nbFactures: factures.length,
      factures,
      paiement: {
        moyens: await chargerMoyensPaiement(org.id),
        instructions: org.instructionsPaiement ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /:token/reglement — l'assureur signale un règlement (virement/chèque…).
// On crée un encaissement « à rapprocher » (Cheque source:'assureur') SANS
// solder les factures : la validation reste manuelle côté créancier.
assureurPortailRouter.post('/:token/reglement', async (req, res, next) => {
  try {
    const data = await chargerParToken(req.params.token);
    if (!data) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    const { client, org } = data;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const type = TYPES_REGLEMENT.includes(String(body.type)) ? String(body.type) : 'virement';
    const reference = String(body.reference ?? '').trim();
    const montant = Math.round(Number(body.montant));
    if (!Number.isFinite(montant) || montant <= 0) {
      return res.status(400).json({ error: 'Montant invalide.' });
    }
    const dateStr = String(body.date ?? '').trim();
    const dateReglement = dateStr && !isNaN(Date.parse(dateStr)) ? new Date(dateStr) : new Date();
    const factureIds = Array.isArray(body.factureIds) ? (body.factureIds as unknown[]).map(String) : [];
    // On ne garde que des factures impayées de CET assureur (pas d'injection).
    const facturesValides = client.factures.filter((f) => factureIds.includes(f.id)).map((f) => f.id);

    await prisma.cheque.create({
      data: {
        organisationId: org.id,
        clientId: client.id,
        montant,
        type,
        source: 'assureur',
        statut: 'enregistre',
        numeroCheque: reference || null,
        dateCheque: dateReglement,
        tireur: client.nom,
        facturesProposees: facturesValides.length ? facturesValides.join(',') : null,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
