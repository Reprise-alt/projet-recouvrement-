import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { requireAuth, requireAccesRecouvrement, requireRole } from '../middleware/auth';
import { requireAbonnementActif } from '../middleware/abonnement';
import { tenantScope } from '../middleware/tenant';
import { verifierTokenCheque } from '../lib/authToken';
import { mentionsLegales } from '../lib/actes/mentionsLegales';
import { scanDisponible, extraireCheque, extraireCheques, estPdf, diagnostiquerModele, ChampsCheque } from '../lib/scanCheque';
import { ClientLite, matcherClient, proposerFactures, mapConcurrent } from '../lib/rapprochementCheque';

// ── Public : déclaration « chèque disponible » par le débiteur ──────────────
// Accès par un jeton signé, sans authentification. Le débiteur signale qu'un
// chèque est prêt ; on crée (ou met à jour) une alerte pour l'organisation.
export const chequePublicRouter = Router();

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

chequePublicRouter.get('/:token', async (req, res, next) => {
  try {
    const t = verifierTokenCheque(req.params.token);
    if (!t) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    const client = await prisma.client.findFirst({
      where: { id: t.clientId, organisationId: t.org },
      select: { nom: true, entite: true },
    });
    if (!client) return res.status(404).json({ error: 'Lien invalide.' });
    const org = await prisma.organisation.findUnique({ where: { id: t.org }, select: { raisonSociale: true } });
    res.json({
      clientNom: client.nom,
      creancierNom: org?.raisonSociale || mentionsLegales(client.entite)?.nom || client.entite,
    });
  } catch (err) {
    next(err);
  }
});

chequePublicRouter.post('/:token/declarer', async (req, res, next) => {
  try {
    const t = verifierTokenCheque(req.params.token);
    if (!t) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    const client = await prisma.client.findFirst({ where: { id: t.clientId, organisationId: t.org }, select: { id: true } });
    if (!client) return res.status(404).json({ error: 'Lien invalide.' });

    const montantEstime = num(req.body?.montantEstime);
    const message = String(req.body?.message ?? '').trim().slice(0, 500) || null;

    // Évite les doublons : on met à jour l'alerte « nouvelle » existante s'il y en a.
    const existante = await prisma.alerteCheque.findFirst({
      where: { organisationId: t.org, clientId: t.clientId, statut: 'nouvelle' },
      select: { id: true },
    });
    if (existante) {
      await prisma.alerteCheque.update({ where: { id: existante.id }, data: { montantEstime, message, createdAt: new Date() } });
    } else {
      await prisma.alerteCheque.create({ data: { organisationId: t.org, clientId: t.clientId, montantEstime, message } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Authentifié : alertes chèque pour l'agent ───────────────────────────────
export const chequesRouter = Router();
chequesRouter.use(requireAuth, requireAbonnementActif, requireAccesRecouvrement, tenantScope);

chequesRouter.get('/alertes', async (req, res, next) => {
  try {
    const statut = req.query.statut === 'toutes' ? undefined : 'nouvelle';
    const alertes = await prisma.alerteCheque.findMany({
      where: { organisationId: req.user!.organisationId, ...(statut ? { statut } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { client: { select: { id: true, nom: true, tel: true } } },
    });
    const nbNouvelles = await prisma.alerteCheque.count({ where: { organisationId: req.user!.organisationId, statut: 'nouvelle' } });
    res.json({
      nbNouvelles,
      alertes: alertes.map((a) => ({
        id: a.id,
        clientId: a.clientId,
        clientNom: a.client.nom,
        clientTel: a.client.tel,
        montantEstime: a.montantEstime,
        message: a.message,
        statut: a.statut,
        createdAt: a.createdAt,
        traiteeLe: a.traiteeLe,
      })),
    });
  } catch (err) {
    next(err);
  }
});

chequesRouter.post('/alertes/:id/traiter', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const traitee = req.body?.traitee !== false;
    const r = await prisma.alerteCheque.updateMany({
      where: { id: req.params.id, organisationId: req.user!.organisationId },
      data: { statut: traitee ? 'traitee' : 'nouvelle', traiteeLe: traitee ? new Date() : null },
    });
    if (!r.count) return res.status(404).json({ error: 'Alerte introuvable' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Scan de chèque (extraction assistée par photo) + enregistrement ─────────
// 25 Mo : un PDF scanné multi-pages (une pile de chèques) pèse plus qu'une photo.
const uploadCheque = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Indique si l'extraction auto par photo est disponible (clé API configurée).
chequesRouter.get('/scan/disponible', (_req, res) => res.json({ disponible: scanDisponible() }));

// Diagnostic du modèle d'extraction configuré (renvoie l'erreur exacte si KO).
chequesRouter.get('/scan/diagnostic', async (_req, res, next) => {
  try {
    res.json(await diagnostiquerModele());
  } catch (err) {
    next(err);
  }
});

// Extraction des champs depuis la photo (ne stocke rien) — l'agent relit/corrige.
chequesRouter.post('/scan', uploadCheque.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucune image reçue' });
    if (!scanDisponible()) return res.json({ disponible: false });
    const champs = await extraireCheque(req.file.buffer.toString('base64'), req.file.mimetype);
    res.json({ disponible: true, ...champs });
  } catch (err) {
    next(err);
  }
});

// Scan d'un LOT de chèques : extraction + rapprochement automatique. Pour
// chaque photo on lit montant + tireur, on identifie le client (par nom) et on
// propose la/les facture(s) correspondante(s). L'agent n'a plus qu'à valider.
// Ne stocke rien : renvoie des propositions, l'enregistrement passe par POST /.
chequesRouter.post('/scan-lot', uploadCheque.array('files', 40), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ error: 'Aucune image reçue' });
    const dispo = scanDisponible();

    // Clients du tenant + leurs factures impayées (une seule requête).
    const clientsRaw = await prisma.client.findMany({
      where: { organisationId: req.user!.organisationId },
      select: { id: true, nom: true, factures: { where: { statut: 'impayee' }, select: { id: true, numero: true, montant: true } } },
    });
    const clients: ClientLite[] = clientsRaw.map((c) => ({ id: c.id, nom: c.nom, factures: c.factures }));

    // Anti-doublon : numéros de chèques déjà enregistrés pour l'organisation.
    const dejaNums = new Set(
      (await prisma.cheque.findMany({ where: { organisationId: req.user!.organisationId, numeroCheque: { not: null } }, select: { numeroCheque: true } }))
        .map((c) => (c.numeroCheque || '').trim())
        .filter(Boolean),
    );

    // Bénéficiaire (créancier) = notre raison sociale : sert d'indice au modèle
    // pour ne pas confondre le bénéficiaire avec le tireur (débiteur).
    const org = await prisma.organisation.findUnique({ where: { id: req.user!.organisationId }, select: { raisonSociale: true } });
    const beneficiaire = org?.raisonSociale ?? null;

    // Extraction par fichier : une image = 1 chèque ; un PDF = 1 chèque par page
    // (une pile scannée). On aplatit ensuite en une proposition par chèque.
    const vide: ChampsCheque = { montant: null, banque: null, numeroCheque: null, dateCheque: null, tireur: null };
    const parFichier = await mapConcurrent(files, 3, async (f) => {
      if (!dispo) return [vide];
      try {
        const liste = await extraireCheques(f.buffer.toString('base64'), f.mimetype, beneficiaire);
        return liste.length ? liste : [vide];
      } catch {
        return [vide]; // extraction impossible : l'agent complétera à la main
      }
    });

    const propositions: unknown[] = [];
    parFichier.forEach((champsList, fileIndex) => {
      const pdf = estPdf(files[fileIndex].mimetype);
      champsList.forEach((champs, page) => {
        const match = matcherClient(champs.tireur, clients);
        const client = match?.client ?? null;
        const prop = client && champs.montant
          ? proposerFactures(champs.montant, client.factures)
          : { proposees: [], raison: client ? 'Montant illisible — à confirmer' : 'Client non identifié' };
        propositions.push({
          fileIndex,
          page,
          pages: champsList.length,
          pdf,
          montant: champs.montant,
          banque: champs.banque,
          numeroCheque: champs.numeroCheque,
          dateCheque: champs.dateCheque,
          tireur: champs.tireur,
          dejaEnregistre: champs.numeroCheque ? dejaNums.has(champs.numeroCheque.trim()) : false,
          client: client ? { id: client.id, nom: client.nom, score: Math.round((match!.score) * 100) } : null,
          facturesClient: client ? client.factures.map((x) => ({ id: x.id, numero: x.numero, montant: Math.round(x.montant) })) : [],
          facturesProposees: prop.proposees,
          raison: prop.raison,
        });
      });
    });

    res.json({ disponible: dispo, propositions });
  } catch (err) {
    next(err);
  }
});

// Enregistre un chèque (image + champs) et, si des factures sont cochées, les
// marque réglées. Rapprochement validé par l'agent (rôles de gestion).
chequesRouter.post('/', requireRole('admin', 'manager_entite', 'comptable'), uploadCheque.single('file'), async (req, res, next) => {
  try {
    const b = (req.body ?? {}) as Record<string, string>;
    const montant = Math.round(Number(b.montant));
    if (!Number.isFinite(montant) || montant <= 0) return res.status(400).json({ error: 'Montant invalide' });

    const clientId = b.clientId?.trim() || null;
    const factureIds = (b.factureIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    const dateCheque = b.dateCheque && !Number.isNaN(new Date(b.dateCheque).getTime()) ? new Date(b.dateCheque) : null;

    // Vérifie l'appartenance du client au tenant.
    if (clientId) {
      const c = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!c) return res.status(400).json({ error: 'Client introuvable' });
    }

    // Marque les factures réglées (scopées au client + tenant).
    let numerosRegles: string[] = [];
    if (clientId && factureIds.length) {
      const factures = await prisma.facture.findMany({
        where: { id: { in: factureIds }, clientId, statut: 'impayee' },
        select: { id: true, numero: true },
      });
      numerosRegles = factures.map((f) => f.numero);
      if (factures.length) {
        await prisma.facture.updateMany({
          where: { id: { in: factures.map((f) => f.id) }, clientId, statut: 'impayee' },
          data: { statut: 'payee', datePaiement: dateCheque ?? new Date() },
        });
        await prisma.actionRecouvrement.create({
          data: {
            clientId,
            palier: 0,
            label: 'Réglé par chèque',
            note: `Chèque ${b.numeroCheque || ''}${b.banque ? ' (' + b.banque + ')' : ''} — ${montant.toLocaleString('fr-FR')} FCFA — ${numerosRegles.join(', ')}`.trim(),
            utilisateurId: req.user!.id,
          },
        });
      }
    }

    const cheque = await prisma.cheque.create({
      data: {
        organisationId: req.user!.organisationId,
        clientId,
        montant,
        banque: b.banque?.trim() || null,
        numeroCheque: b.numeroCheque?.trim() || null,
        dateCheque,
        tireur: b.tireur?.trim() || null,
        imageData: req.file?.buffer ?? null,
        imageMime: req.file?.mimetype ?? null,
        facturesReglees: numerosRegles.join(', ') || null,
      },
      select: { id: true },
    });
    res.json({ id: cheque.id, facturesReglees: numerosRegles.length });
  } catch (err) {
    next(err);
  }
});

// Liste des chèques enregistrés (récents d'abord).
chequesRouter.get('/', async (req, res, next) => {
  try {
    const cheques = await prisma.cheque.findMany({
      where: { organisationId: req.user!.organisationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { client: { select: { nom: true } } },
    });
    res.json(
      cheques.map((c) => ({
        id: c.id,
        montant: c.montant,
        banque: c.banque,
        numeroCheque: c.numeroCheque,
        dateCheque: c.dateCheque,
        tireur: c.tireur,
        clientNom: c.client?.nom ?? null,
        facturesReglees: c.facturesReglees,
        createdAt: c.createdAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});
