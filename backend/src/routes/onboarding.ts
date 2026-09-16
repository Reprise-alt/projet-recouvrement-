import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireAccesRecouvrement } from '../middleware/auth';
import { getEmailProvider } from '../lib/email/provider';
import { DEMO_DEBITEURS, demoSynthese, apercuRelanceTest } from '../lib/demoData';

// Démarrage guidé self-service (addendum §4.3) : checklist d'activation calculée
// (données + indicateurs), actions de démarrage, et espace de démonstration
// (données fictives, jamais mêlées aux vraies). Opère toujours sur l'organisation
// de l'utilisateur authentifié.
export const onboardingRouter = Router();
onboardingRouter.use(requireAuth, requireAccesRecouvrement);

async function construireChecklist(organisationId: string) {
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  const nbClients = await prisma.client.count({ where: { organisationId } });
  if (!org) throw new Error('Organisation introuvable');

  const ficheOk = !!(org.raisonSociale && org.identifiantFiscal && org.logoUrl);
  const instructionsOk = !!(org.instructionsPaiement && org.instructionsPaiement.trim());

  const etapes = [
    { id: 'fiche_entreprise', titre: "Compléter la fiche entreprise", description: 'Raison sociale, identifiants, logo, signature.', fait: ficheOk },
    { id: 'instructions_paiement', titre: 'Renseigner les instructions de paiement', description: 'Ce que verront vos débiteurs pour vous régler.', fait: instructionsOk },
    { id: 'import_creances', titre: 'Importer vos créances', description: 'Dépôt Excel ou CSV, avec aperçu avant validation.', fait: nbClients > 0 },
    { id: 'verifier_scenario', titre: 'Vérifier le scénario de relance', description: "L'échelle des paliers proposée par défaut.", fait: org.scenarioVu },
    { id: 'relance_test', titre: 'Recevoir une relance test', description: 'Voir exactement ce que recevront vos débiteurs.', fait: org.relanceTestEnvoyee },
    { id: 'activer_relances', titre: 'Activer les relances', description: 'Les relances partent alors automatiquement.', fait: org.relancesActivees },
  ];
  const faits = etapes.filter((e) => e.fait).length;
  return {
    etapes,
    progression: { faites: faits, total: etapes.length, pourcentage: Math.round((faits / etapes.length) * 100) },
    // La checklist reste visible jusqu'à l'activation des relances (§4.3).
    afficherChecklist: !org.relancesActivees,
    demoDisponible: true,
  };
}

onboardingRouter.get('/', async (req, res, next) => {
  try {
    res.json(await construireChecklist(req.user!.organisationId));
  } catch (e) {
    next(e);
  }
});

onboardingRouter.post('/scenario-vu', async (req, res, next) => {
  try {
    await prisma.organisation.update({ where: { id: req.user!.organisationId }, data: { scenarioVu: true } });
    res.json(await construireChecklist(req.user!.organisationId));
  } catch (e) {
    next(e);
  }
});

// Relance test : envoie sur l'email de l'utilisateur un aperçu de ce que
// recevront ses débiteurs, au nom de son entreprise et avec ses instructions.
onboardingRouter.post('/relance-test', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({ where: { id: req.user!.organisationId } });
    if (!org) return res.status(404).json({ error: 'Organisation introuvable' });
    const apercu = apercuRelanceTest(org.raisonSociale, org.instructionsPaiement);
    await getEmailProvider().send({ to: req.user!.email, subject: `[Test] ${apercu.subject}`, text: apercu.text });
    await prisma.organisation.update({ where: { id: org.id }, data: { relanceTestEnvoyee: true } });
    res.json({ apercu, checklist: await construireChecklist(org.id) });
  } catch (e) {
    next(e);
  }
});

onboardingRouter.post('/activer-relances', async (req, res, next) => {
  try {
    await prisma.organisation.update({ where: { id: req.user!.organisationId }, data: { relancesActivees: true } });
    res.json(await construireChecklist(req.user!.organisationId));
  } catch (e) {
    next(e);
  }
});

// Espace de démonstration : données fictives, jamais persistées.
onboardingRouter.get('/demo', (_req, res) => {
  res.json({ synthese: demoSynthese(), debiteurs: DEMO_DEBITEURS });
});
