import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db';
import { requireAuth, requireAccesRecouvrement, requireRole } from '../middleware/auth';
import { requireAbonnementActif } from '../middleware/abonnement';
import { tenantScope } from '../middleware/tenant';
import { parseReleveJulaya, normaliserTel, PaiementReleve } from '../lib/releveJulaya';

// Import d'un relevé de transactions Julaya → rapprochement des encaissements
// avec les factures impayées. L'agent VALIDE toujours avant application (aucun
// marquage automatique). Deux temps : /analyser (propose) puis /appliquer (agit).
export const paiementsImportRouter = Router();
paiementsImportRouter.use(requireAuth, requireAbonnementActif, requireAccesRecouvrement, tenantScope);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const MARQUE_JULAYA = 'Encaissement Julaya';
const tagTx = (id: string) => `[julaya:${id}]`;

interface Proposition {
  transactionId: string;
  montant: number;
  date: string | null;
  telPayeur: string | null;
  reference: string | null;
  dejaImporte: boolean;
  client: { id: string; nom: string } | null;
  facturesProposees: { id: string; numero: string; montant: number; dateEcheance: string | null }[];
}

// Sélectionne, parmi les factures impayées (plus anciennes d'abord), le sous-
// ensemble qui couvre au mieux le montant reçu (glouton, sans dépasser tant que
// possible ; on s'arrête dès qu'on atteint ou dépasse le montant).
function choisirFactures(
  factures: { id: string; numero: string; montant: number; dateEcheance: Date }[],
  montant: number,
) {
  const choisies: typeof factures = [];
  let cumul = 0;
  for (const f of factures) {
    if (cumul >= montant) break;
    choisies.push(f);
    cumul += f.montant;
  }
  return choisies;
}

paiementsImportRouter.post('/analyser', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
    let paiements: PaiementReleve[];
    try {
      paiements = await parseReleveJulaya(req.file.buffer);
    } catch {
      return res.status(400).json({ error: 'Fichier illisible — attendez-vous un export Excel Julaya.' });
    }
    if (!paiements.length) return res.json({ paiements: [], total: 0, message: 'Aucun encaissement détecté dans ce relevé.' });

    // Index téléphone → client (tel du client + tel des contacts).
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        nom: true,
        tel: true,
        contacts: { select: { tel: true } },
        factures: {
          where: { statut: 'impayee' },
          select: { id: true, numero: true, montant: true, dateEcheance: true },
          orderBy: { dateEcheance: 'asc' },
        },
      },
    });
    const parTel = new Map<string, (typeof clients)[number]>();
    for (const c of clients) {
      for (const t of [c.tel, ...c.contacts.map((k) => k.tel)]) {
        const n = normaliserTel(t);
        if (n && !parTel.has(n)) parTel.set(n, c);
      }
    }

    // Transactions déjà importées (idempotence) — on lit les actions marquées.
    const dejaActions = await prisma.actionRecouvrement.findMany({
      where: { label: MARQUE_JULAYA },
      select: { note: true },
    });
    const dejaIds = new Set<string>();
    for (const a of dejaActions) {
      const m = a.note?.match(/\[julaya:([^\]]+)\]/);
      if (m) dejaIds.add(m[1]);
    }

    const propositions: Proposition[] = paiements.map((p) => {
      const client = p.telPayeur ? parTel.get(p.telPayeur) ?? null : null;
      const facturesProposees = client
        ? choisirFactures(client.factures, p.montant).map((f) => ({
            id: f.id,
            numero: f.numero,
            montant: f.montant,
            dateEcheance: f.dateEcheance ? f.dateEcheance.toISOString() : null,
          }))
        : [];
      return {
        transactionId: p.transactionId,
        montant: p.montant,
        date: p.date,
        telPayeur: p.telPayeur,
        reference: p.reference,
        dejaImporte: dejaIds.has(p.transactionId),
        client: client ? { id: client.id, nom: client.nom } : null,
        facturesProposees,
      };
    });

    res.json({
      total: propositions.length,
      nbRapproches: propositions.filter((p) => p.client && !p.dejaImporte).length,
      nbDejaImportes: propositions.filter((p) => p.dejaImporte).length,
      paiements: propositions,
    });
  } catch (err) {
    next(err);
  }
});

paiementsImportRouter.post('/appliquer', requireRole('admin', 'manager_entite', 'comptable'), async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.paiements) ? req.body.paiements : [];
    let facturesReglees = 0;
    let encaissements = 0;
    let montantTotal = 0;

    for (const it of items) {
      const transactionId = String(it?.transactionId ?? '').trim();
      const clientId = String(it?.clientId ?? '').trim();
      const factureIds: string[] = Array.isArray(it?.factureIds) ? it.factureIds.map(String) : [];
      const montant = Number(it?.montant) || 0;
      if (!transactionId || !clientId || !factureIds.length) continue;

      // Idempotence : on ne ré-applique jamais une transaction déjà enregistrée.
      const deja = await prisma.actionRecouvrement.findFirst({
        where: { label: MARQUE_JULAYA, note: { contains: tagTx(transactionId) } },
        select: { id: true },
      });
      if (deja) continue;

      // Le client doit appartenir au tenant (RLS) — findUnique scopé.
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
      if (!client) continue;

      const r = await prisma.facture.updateMany({
        where: { id: { in: factureIds }, clientId, statut: 'impayee' },
        data: { statut: 'payee', datePaiement: it?.date ? new Date(it.date) : new Date() },
      });
      facturesReglees += r.count;

      const ref = it?.reference ? ` réf ${String(it.reference)}` : '';
      await prisma.actionRecouvrement.create({
        data: {
          clientId,
          palier: 0,
          label: MARQUE_JULAYA,
          note: `${Math.round(montant).toLocaleString('fr-FR')} FCFA reçu via Julaya${ref} — ${r.count} facture(s) réglée(s) ${tagTx(transactionId)}`,
          utilisateurId: req.user!.id,
        },
      });
      encaissements += 1;
      montantTotal += montant;
    }

    res.json({ encaissements, facturesReglees, montantTotal });
  } catch (err) {
    next(err);
  }
});
