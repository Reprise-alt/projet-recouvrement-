import { Router } from 'express';
import { prisma } from '../db';
import { getConfig } from '../services/configService';
import { clientEncours, clientJoursRetard, clientOldestEcheance, clientPalier, computePalier, PALIERS } from '../lib/paliers';
import { generateLetter } from '../lib/letters';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { assertEntiteInScope, requireAuth, requireRole } from '../middleware/auth';

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

    const ladder: Record<number, number> = {};
    PALIERS.forEach((p) => (ladder[p.id] = 0));
    clients.forEach((c) => {
      if (clientEncours(c) > 0) ladder[clientPalier(c, config)]++;
    });

    res.json({ totalEncours, enRetard, contentieux, lettresAEnvoyer, ladder, config });
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
      include: { factures: true, actions: { orderBy: { date: 'desc' }, take: 1 } },
    });

    let list = clients.map((c) => {
      const encours = clientEncours(c);
      const joursRetard = clientJoursRetard(c);
      const palier = computePalier(joursRetard, config);
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
        encours,
        joursRetard,
        palier,
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
      data: { clientId: req.params.id, palier, label: pal.label, note: note || undefined },
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
