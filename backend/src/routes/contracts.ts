import { Router } from 'express';
import { prisma } from '../db';
import { augmentationEtat, contractAlertLevel, contractDureeMois, contractEcheance, montantProjete, nextAnniversary } from '../lib/contracts';
import { generateContractDoc } from '../lib/letters';
import { DonneesLettreAugmentation, genererLettreAugmentationPdf } from '../lib/actes/actesContentieux';
import { logoEntite, mentionsLegales } from '../lib/actes/mentionsLegales';
import { Entite, resolveEntiteScope } from '../lib/entites';
import { assertEntiteInScope, requireAccesRecouvrement, requireAuth, requireRole } from '../middleware/auth';

export const contractsRouter = Router();
contractsRouter.use(requireAuth, requireAccesRecouvrement);

function entiteWhere(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

contractsRouter.get('/kpis', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const clients = await prisma.client.findMany({
      where: entiteWhere(entiteFilter),
      include: { contrats: { include: { envois: true } } },
    });
    const rows = clients.flatMap((c) => c.contrats.map((contrat) => ({ client: c, contrat })));

    const sous90 = rows.filter((r) => {
      const l = contractAlertLevel(r.contrat);
      return l >= 2 && l < 5;
    });
    const echus = rows.filter((r) => contractAlertLevel(r.contrat) === 5);
    const envoisEnvoyes = rows.reduce((s, r) => s + r.contrat.envois.length, 0);

    // Tuiles « augmentation » : à appliquer sous 30 j, en retard, réalisées.
    const aug = rows.map((r) => augmentationEtat(r.contrat).statut);
    const augImminentes = aug.filter((s) => s === 'imminent').length;
    const augDepassees = aug.filter((s) => s === 'depassee').length;
    const augRealisees = aug.filter((s) => s === 'realisee').length;
    const augParametrees = aug.filter((s) => s !== 'aucune').length;

    res.json({
      sous90: sous90.length, echus: echus.length, envoisEnvoyes, contratsSuivis: rows.length,
      augImminentes, augDepassees, augRealisees, augParametrees,
    });
  } catch (err) {
    next(err);
  }
});

contractsRouter.get('/', async (req, res, next) => {
  try {
    const entiteFilter = resolveEntiteScope(req.user!, req.query.entite);
    const clients = await prisma.client.findMany({ where: entiteWhere(entiteFilter), include: { contrats: true } });

    const rows = clients.flatMap((c) =>
      c.contrats.map((contrat) => {
        const e = contractEcheance(contrat);
        const aug = augmentationEtat(contrat);
        return {
          contratId: contrat.id,
          clientId: c.id,
          clientNom: c.nom,
          entite: c.entite,
          numero: contrat.numero,
          type: contrat.type,
          tacite: contrat.tacite,
          echeanceType: e.type,
          echeanceDate: e.date,
          joursRestants: e.jours,
          alertLevel: contractAlertLevel(contrat),
          // Suivi de l'augmentation (colonnes de l'onglet Leasing) :
          dateDebut: contrat.dateDebut,
          dateFin: contrat.dateFin,
          dureeMois: contractDureeMois(contrat),
          tauxAugmentation: contrat.tauxAugmentation,
          typeAugmentation: contrat.typeAugmentation,
          surNotification: !!e.surNotification,
          augStatut: aug.statut,
          augDate: aug.date,
          augJours: aug.jours,
        };
      }),
    );
    rows.sort((a, b) => a.joursRestants - b.joursRestants);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

contractsRouter.get('/:id', async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({
      where: { id: req.params.id },
      include: { client: true, envois: { orderBy: { date: 'desc' } } },
    });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const e = contractEcheance(contrat);
    const montantApresRevision =
      contrat.montantActuel != null && contrat.tauxAugmentation != null
        ? montantProjete(contrat.montantActuel, contrat.tauxAugmentation)
        : null;
    // Toujours calculée quand un taux est configuré, indépendamment de si
    // c'est l'échéance la plus proche (contrairement à `echeance`, qui ne
    // retient que celle des deux -- fin de contrat ou révision -- la plus
    // urgente) : sert d'affichage dédié pour la tarification, pas d'alerte.
    const prochaineRevision = contrat.tauxAugmentation != null ? nextAnniversary(contrat.dateDerniereRevision ?? contrat.dateDebut) : null;
    res.json({ ...contrat, echeance: e, alertLevel: contractAlertLevel(contrat), montantApresRevision, prochaineRevision, dureeMois: contractDureeMois(contrat) });
  } catch (err) {
    next(err);
  }
});

// Active ou met à jour l'augmentation tarifaire automatique d'un contrat.
// Au premier réglage (dateDerniereRevision pas encore fixée), on l'ancre sur
// dateDebut pour que la date anniversaire se calcule dès la prochaine
// occurrence de la date de signature -- pas sur "aujourd'hui".
contractsRouter.patch('/:id/tarification', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const { montantActuel, tauxAugmentation, typeAugmentation, commentaire } = req.body ?? {};
    // L'augmentation est un TAUX annuel, indépendant d'un montant : la
    // facturation applique ensuite la nouvelle tarification. Le montant reste
    // donc facultatif (pour projeter un montant révisé si on le souhaite).
    if (tauxAugmentation == null || isNaN(Number(tauxAugmentation))) {
      return res.status(400).json({ error: 'Taux invalide' });
    }
    const montantFourni = montantActuel != null && montantActuel !== '';
    if (montantFourni && (isNaN(Number(montantActuel)) || Number(montantActuel) < 0)) {
      return res.status(400).json({ error: 'Montant invalide' });
    }
    if (typeAugmentation != null && typeAugmentation !== 'sans_notification' && typeAugmentation !== 'sur_notification') {
      return res.status(400).json({ error: "Type d'augmentation invalide" });
    }

    const updated = await prisma.contrat.update({
      where: { id: req.params.id },
      data: {
        montantActuel: montantFourni ? Number(montantActuel) : undefined,
        tauxAugmentation: Number(tauxAugmentation),
        typeAugmentation: typeAugmentation ?? undefined,
        commentaire: commentaire !== undefined ? (commentaire || null) : undefined,
        dateDerniereRevision: contrat.dateDerniereRevision ?? contrat.dateDebut,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Marque l'augmentation de l'année comme appliquée : avance l'ancre sur la date
// anniversaire qui vient d'échoir (pas sur "aujourd'hui", pour rester calé sur
// la vraie date même si le geste est fait avec quelques jours de retard), ce qui
// réarme l'alerte pour l'année suivante. Le montant n'est PAS requis : si un
// montant de référence est renseigné, on le projette au passage, sinon on ne
// touche qu'à la date (la facturation applique la nouvelle tarification).
contractsRouter.post('/:id/appliquer-revision', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;
    if (contrat.tauxAugmentation == null) {
      return res.status(400).json({ error: "Aucune augmentation tarifaire configurée sur ce contrat" });
    }

    const echeanceEnCours = nextAnniversary(contrat.dateDerniereRevision ?? contrat.dateDebut);
    const updated = await prisma.contrat.update({
      where: { id: req.params.id },
      data: {
        montantActuel: contrat.montantActuel != null ? montantProjete(contrat.montantActuel, contrat.tauxAugmentation) : undefined,
        dateDerniereRevision: echeanceEnCours,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Lettre d'avis de revalorisation tarifaire annuelle (PDF, entête société).
// Générée à la volée à partir du taux + de la date d'augmentation ; la variante
// LR/AR est retenue si l'augmentation est « sur notification ».
contractsRouter.get('/:id/lettre-augmentation', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;
    if (contrat.tauxAugmentation == null || contrat.tauxAugmentation <= 0) {
      return res.status(400).json({ error: "Aucune augmentation configurée sur ce contrat" });
    }

    const etat = augmentationEtat(contrat);
    const dateEffet = etat.date ?? nextAnniversary(contrat.dateDerniereRevision ?? contrat.dateDebut);
    const base = mentionsLegales(contrat.client.entite);
    const donnees: DonneesLettreAugmentation = {
      societe: {
        nom: String(base?.nom || contrat.client.entite || 'La société'),
        formeJuridique: base?.formeJuridique,
        adresse: base?.adresse,
        rccm: base?.rccm,
        ninea: base?.ninea,
        tel: base?.tel,
        email: base?.email,
        logo: logoEntite(contrat.client.entite),
      },
      clientNom: contrat.client.nom,
      clientContact: contrat.client.contact ?? undefined,
      numeroContrat: contrat.numero,
      taux: contrat.tauxAugmentation,
      dateEffet: new Date(dateEffet),
      surNotification: contrat.typeAugmentation === 'sur_notification',
      signataireNom: base?.signataireNom,
      signataireQualite: base?.signataireQualite,
    };
    const pdf = await genererLettreAugmentationPdf(donnees);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="avis-augmentation-${contrat.numero}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    next(err);
  }
});

contractsRouter.get('/:id/document', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const doc = generateContractDoc(
      { nom: contrat.client.nom, entite: contrat.client.entite as any, contact: contrat.client.contact ?? '' },
      contrat,
    );
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

contractsRouter.post('/:id/envois', requireRole('admin', 'manager_entite'), async (req, res, next) => {
  try {
    const contrat = await prisma.contrat.findUnique({ where: { id: req.params.id }, include: { client: true } });
    if (!contrat) return res.status(404).json({ error: 'Contrat introuvable' });
    if (!assertEntiteInScope(req, res, contrat.client.entite as Entite)) return;

    const { label, destinataire, sujet, corps, statutEnvoi } = req.body ?? {};
    if (!label) return res.status(400).json({ error: 'Label requis' });

    const envoi = await prisma.envoiContrat.create({
      data: { contratId: req.params.id, label, destinataire, sujet, corps, statutEnvoi },
    });
    res.status(201).json(envoi);
  } catch (err) {
    next(err);
  }
});
