import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { getEmailProvider } from '../lib/email/provider';
import { superAdminEmails } from '../lib/superAdmin';

// Demande d'abonnement depuis la console (clic sur une formule). Authentifié
// mais SANS requireAbonnementActif : un compte en essai (ou expiré) doit pouvoir
// demander l'activation. Envoie un email à l'exploitant, qui recontacte.
export const abonnementRouter = Router();
abonnementRouter.use(requireAuth);

const FORMULE_LABEL: Record<string, string> = {
  petite: 'Petite structure',
  pme: 'PME',
  grands_comptes: 'Grands comptes',
};

abonnementRouter.post('/demande', async (req, res, next) => {
  try {
    const formule = String(req.body?.formule ?? '').trim();
    const annuel = req.body?.annuel === true;
    if (!FORMULE_LABEL[formule]) return res.status(400).json({ error: 'Formule invalide' });

    const org = await prisma.organisation.findUnique({
      where: { id: req.user!.organisationId },
      select: { raisonSociale: true, statut: true },
    });
    const dest = superAdminEmails();
    if (!dest.length) return res.status(503).json({ error: 'Aucun destinataire exploitant configuré (SUPERADMIN_EMAILS).' });

    const corps = [
      'Demande d’abonnement depuis la console Feyma :',
      '',
      `Entreprise : ${org?.raisonSociale ?? '—'}`,
      `Demandeur : ${req.user!.nom} <${req.user!.email}>`,
      `Formule souhaitée : ${FORMULE_LABEL[formule]}`,
      `Engagement : ${annuel ? 'annuel (2 mois offerts)' : 'mensuel'}`,
      `Statut actuel du compte : ${org?.statut ?? '—'}`,
      '',
      'À recontacter pour activer l’abonnement.',
    ].join('\n');

    // Persiste la demande pour la file de l'espace exploitant (en plus de l'email).
    await prisma.demandeAbonnement.create({
      data: {
        organisationId: req.user!.organisationId,
        formule,
        annuel,
        demandeurEmail: req.user!.email,
        demandeurNom: req.user!.nom ?? null,
      },
    });

    await getEmailProvider().send({
      to: dest.join(', '),
      subject: `Demande d’abonnement Feyma — ${org?.raisonSociale ?? ''} (${FORMULE_LABEL[formule]}, ${annuel ? 'annuel' : 'mensuel'})`,
      text: corps,
      replyTo: req.user!.email,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
