import { Router } from 'express';
import { prisma } from '../db';
import { getConfig } from '../services/configService';
import {
  clientDelaiMoyenHistorique,
  clientEncours,
  clientJoursRetard,
  clientOldestEcheance,
  clientPalier,
  clientRetardInhabituel,
  PALIERS,
} from '../lib/paliers';
import { generateLetter } from '../lib/letters';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { assertEntiteInScope, requireAuth, requireRole } from '../middleware/auth';
import { fmtDate, fmtFCFA } from '../lib/dates';

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

clientsRouter.get('/kpis', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const config = await getConfig();
    const clients = await prisma.client.findMany({ where: entiteWhere(entiteFilter), include: { factures: true } });

    const totalEncours = clients.reduce((s, c) => s + clientEncours(c), 0);
    const enRetard = clients.filter((c) => clientPalier(c, config) >= 1).length;
    const contentieux = clients.filter((c) => clientPalier(c, config) >= 6).reduce((s, c) => s + clientEncours(c), 0);
    const lettresAEnvoyer = clients.filter((c) => clientPalier(c, config) >= 4).length;
    const retardsInhabituels = clients.filter((c) => clientRetardInhabituel(c)).length;

    const ladder: Record<number, number> = {};
    PALIERS.forEach((p) => (ladder[p.id] = 0));
    let dansLesClous = 0;
    let arretService = 0;
    let litige = 0;
    let totalActifs = 0;
    clients.forEach((c) => {
      if (clientEncours(c) > 0) {
        totalActifs++;
        const p = clientPalier(c, config);
        ladder[p]++;
        if (p <= 3) dansLesClous++;
        else if (p === 4) arretService++;
        else litige++;
      }
    });
    const repartition = { total: totalActifs, dansLesClous, arretService, litige };

    res.json({ totalEncours, enRetard, contentieux, lettresAEnvoyer, retardsInhabituels, ladder, repartition, config });
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const palierFilter = req.query.palier !== undefined ? parseInt(req.query.palier as string, 10) : null;
    const sortKey = (req.query.sort as string) || 'joursRetard';
    const sortDir = req.query.dir === 'asc' ? 1 : -1;

    const config = await getConfig();
    const clients = await prisma.client.findMany({
      where: entiteWhere(entiteFilter),
      include: { factures: true, actions: { orderBy: { date: 'desc' }, take: 1 }, contacts: { orderBy: { createdAt: 'asc' } } },
    });

    let list = clients.map((c) => {
      const encours = clientEncours(c);
      const joursRetard = clientJoursRetard(c);
      const palier = clientPalier(c, config);
      const oldest = clientOldestEcheance(c);
      const derniere = c.actions[0];
      return {
        id: c.id,
        nom: c.nom,
        entite: c.entite,
        contact: c.contact,
        email: c.email,
        tel: c.tel,
        note: c.note,
        prochaineRelance: c.prochaineRelance,
        frequenceFacturation: c.frequenceFacturation,
        contacts: c.contacts.map((ct) => ({ id: ct.id, nom: ct.nom, fonction: ct.fonction, email: ct.email, tel: ct.tel })),
        encours,
        joursRetard,
        palier,
        retardInhabituel: clientRetardInhabituel(c),
        echeanceLaPlusAncienne: oldest?.dateEcheance ?? null,
        derniereAction: derniere ? { label: derniere.label, date: derniere.date, palier: derniere.palier } : null,
      };
    });

    list = list.filter((c) => c.encours > 0 || palierFilter === 0);
    if (palierFilter !== null && !Number.isNaN(palierFilter)) {
      list = list.filter((c) => c.palier === palierFilter);
    }
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === 'encours') {
        va = a.encours;
        vb = b.encours;
      } else if (sortKey === 'nom') {
        va = a.nom;
        vb = b.nom;
      } else {
        va = a.joursRetard;
        vb = b.joursRetard;
      }
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });

    res.json(list);
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/:id', async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        factures: true,
        contrats: { include: { envois: { orderBy: { date: 'desc' } } } },
        actions: { orderBy: { date: 'desc' } },
        contacts: { orderBy: { createdAt: 'asc' } },
        echeanciers: { orderBy: { createdAt: 'desc' }, include: { tranches: { orderBy: { ordre: 'asc' } } } },
      },
    });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, client.entite as Entite)) return;

    const config = await getConfig();
    res.json({
      ...client,
      encours: clientEncours(client),
      joursRetard: clientJoursRetard(client),
      palier: clientPalier(client, config),
      retardInhabituel: clientRetardInhabituel(client),
      delaiMoyenHistorique: clientDelaiMoyenHistorique(client),
    });
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/contact', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { contact, email, tel } = req.body ?? {};
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: {
        contact: typeof contact === 'string' ? contact.trim() : undefined,
        email: typeof email === 'string' ? email.trim() : undefined,
        tel: typeof tel === 'string' ? tel.trim() : undefined,
      },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/note', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { note: note || null },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/prochaine-relance', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const raw = req.body?.date;
    let prochaineRelance: Date | null = null;
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'Date invalide' });
      prochaineRelance = parsed;
    }
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { prochaineRelance },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/contacts', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { nom, fonction, email, tel } = req.body ?? {};
    if (!nom || typeof nom !== 'string' || !nom.trim()) {
      return res.status(400).json({ error: 'Le nom du contact est requis' });
    }
    const contact = await prisma.contact.create({
      data: {
        clientId: req.params.id,
        nom: nom.trim(),
        fonction: typeof fonction === 'string' && fonction.trim() ? fonction.trim() : undefined,
        email: typeof email === 'string' && email.trim() ? email.trim() : undefined,
        tel: typeof tel === 'string' && tel.trim() ? tel.trim() : undefined,
      },
    });
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

const FREQUENCES_VALIDES = ['mensuelle', 'trimestrielle', 'annuelle'];

clientsRouter.patch('/:id/frequence-facturation', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const frequence = req.body?.frequenceFacturation;
    if (typeof frequence !== 'string' || !FREQUENCES_VALIDES.includes(frequence)) {
      return res.status(400).json({ error: `Fréquence invalide — attendu : ${FREQUENCES_VALIDES.join(', ')}` });
    }
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { frequenceFacturation: frequence as any },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch('/:id/contacts/:contactId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
    if (!contact || contact.clientId !== req.params.id) return res.status(404).json({ error: 'Contact introuvable' });

    const { nom, fonction, email, tel } = req.body ?? {};
    const updated = await prisma.contact.update({
      where: { id: req.params.contactId },
      data: {
        nom: typeof nom === 'string' && nom.trim() ? nom.trim() : undefined,
        fonction: typeof fonction === 'string' ? fonction.trim() || null : undefined,
        email: typeof email === 'string' ? email.trim() || null : undefined,
        tel: typeof tel === 'string' ? tel.trim() || null : undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

clientsRouter.delete('/:id/contacts/:contactId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const contact = await prisma.contact.findUnique({ where: { id: req.params.contactId } });
    if (!contact || contact.clientId !== req.params.id) return res.status(404).json({ error: 'Contact introuvable' });

    await prisma.contact.delete({ where: { id: req.params.contactId } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/factures', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { numero, montant, dateFacture, dateEcheance, designation } = req.body ?? {};
    if (!numero || !montant || !dateEcheance) {
      return res.status(400).json({ error: 'Numéro, montant et échéance sont requis' });
    }
    const facture = await prisma.facture.create({
      data: {
        clientId: req.params.id,
        numero: String(numero).trim(),
        montant: Number(montant),
        dateFacture: dateFacture ? new Date(dateFacture) : undefined,
        dateEcheance: new Date(dateEcheance),
        designation: designation ? String(designation).trim() : undefined,
        statut: 'impayee',
      },
    });
    res.status(201).json(facture);
  } catch (err) {
    next(err);
  }
});

clientsRouter.post('/:id/actions', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const palier = Number(req.body?.palier);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const pal = PALIERS[palier];
    if (!pal) return res.status(400).json({ error: 'Palier invalide' });

    const action = await prisma.actionRecouvrement.create({
      data: { clientId: req.params.id, palier, label: pal.label, note: note || undefined, utilisateurId: req.user!.id },
    });
    res.status(201).json(action);
  } catch (err) {
    next(err);
  }
});

clientsRouter.get('/:id/letters/:palierId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { factures: true, actions: { orderBy: { date: 'desc' } } },
    });
    if (!client) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, client.entite as Entite)) return;

    const palierId = parseInt(req.params.palierId, 10);
    if (!PALIERS[palierId]) return res.status(400).json({ error: 'Palier invalide' });

    const text = generateLetter(
      {
        nom: client.nom,
        entite: client.entite as any,
        contact: client.contact ?? '',
        factures: client.factures,
        actions: client.actions,
      },
      palierId,
    );
    res.json({ text });
  } catch (err) {
    next(err);
  }
});

interface TrancheInput {
  dateEcheance?: unknown;
  montant?: unknown;
}

// Négocié avec un client en difficulté (souvent au palier 4-6) : un accord de
// règlement en plusieurs tranches, suivi indépendamment des factures qui
// restent, elles, à leur propre statut jusqu'au règlement effectif.
clientsRouter.post('/:id/echeanciers', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const { motif, tranches } = (req.body ?? {}) as { motif?: unknown; tranches?: TrancheInput[] };
    if (!Array.isArray(tranches) || tranches.length === 0) {
      return res.status(400).json({ error: 'Au moins une tranche est requise' });
    }
    const parsedTranches = tranches.map((t) => ({
      dateEcheance: new Date(String(t.dateEcheance)),
      montant: Number(t.montant),
    }));
    if (parsedTranches.some((t) => Number.isNaN(t.dateEcheance.getTime()) || !Number.isFinite(t.montant) || t.montant <= 0)) {
      return res.status(400).json({ error: 'Chaque tranche doit avoir une date valide et un montant positif' });
    }
    const montantTotal = parsedTranches.reduce((s, t) => s + t.montant, 0);

    const echeancier = await prisma.echeancierPaiement.create({
      data: {
        clientId: req.params.id,
        montantTotal,
        motif: typeof motif === 'string' && motif.trim() ? motif.trim() : undefined,
        tranches: {
          create: parsedTranches.map((t, i) => ({ ordre: i + 1, dateEcheance: t.dateEcheance, montant: t.montant })),
        },
      },
      include: { tranches: { orderBy: { ordre: 'asc' } } },
    });

    await prisma.actionRecouvrement.create({
      data: {
        clientId: req.params.id,
        palier: 0,
        label: 'Échéancier de paiement créé',
        note: `${fmtFCFA(montantTotal)} en ${parsedTranches.length} tranche(s) (par ${req.user!.nom})`,
        utilisateurId: req.user!.id,
      },
    });

    res.status(201).json(echeancier);
  } catch (err) {
    next(err);
  }
});

clientsRouter.patch(
  '/:id/echeanciers/:echeancierId/tranches/:trancheId/toggle-paid',
  requireRole('admin', 'manager_entite', 'comptable'),
  async (req, res, next) => {
    try {
      const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Client introuvable' });
      if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

      const tranche = await prisma.tranchePaiement.findUnique({ where: { id: req.params.trancheId } });
      if (!tranche || tranche.echeancierId !== req.params.echeancierId) {
        return res.status(404).json({ error: 'Tranche introuvable' });
      }
      const echeancier = await prisma.echeancierPaiement.findUnique({ where: { id: req.params.echeancierId } });
      if (!echeancier || echeancier.clientId !== req.params.id) return res.status(404).json({ error: 'Échéancier introuvable' });

      const wasUnpaid = tranche.statut === 'impayee';
      const updated = await prisma.tranchePaiement.update({
        where: { id: tranche.id },
        data: { statut: wasUnpaid ? 'payee' : 'impayee', datePaiement: wasUnpaid ? new Date() : null },
      });

      if (wasUnpaid) {
        await prisma.actionRecouvrement.create({
          data: {
            clientId: req.params.id,
            palier: 0,
            label: 'Tranche réglée',
            note: `${fmtFCFA(tranche.montant)} — échéance du ${fmtDate(tranche.dateEcheance)}`,
            utilisateurId: req.user!.id,
          },
        });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

clientsRouter.delete('/:id/echeanciers/:echeancierId', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Client introuvable' });
    if (!assertEntiteInScope(req, res, existing.entite as Entite)) return;

    const echeancier = await prisma.echeancierPaiement.findUnique({ where: { id: req.params.echeancierId } });
    if (!echeancier || echeancier.clientId !== req.params.id) return res.status(404).json({ error: 'Échéancier introuvable' });

    await prisma.echeancierPaiement.delete({ where: { id: echeancier.id } });
    await prisma.actionRecouvrement.create({
      data: {
        clientId: req.params.id,
        palier: 0,
        label: 'Échéancier de paiement supprimé',
        note: `${fmtFCFA(echeancier.montantTotal)} (par ${req.user!.nom})`,
        utilisateurId: req.user!.id,
      },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
