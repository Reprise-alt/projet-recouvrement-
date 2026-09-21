import express from 'express';
import cors from 'cors';
import { rlsActive } from './db';
import { emailMode } from './lib/email/provider';
import { authRouter } from './routes/auth';
import { authOtpRouter } from './routes/authOtp';
import { onboardingRouter } from './routes/onboarding';
import { organisationRouter } from './routes/organisation';
import { logoPublicRouter, waveQrPublicRouter } from './routes/logoPublic';
import { adminOrganisationsRouter } from './routes/adminOrganisations';
import { usersRouter } from './routes/users';
import { clientsRouter } from './routes/clients';
import { facturesRouter } from './routes/factures';
import { contractsRouter } from './routes/contracts';
import { configRouter } from './routes/config';
import { importRouter } from './routes/importRoutes';
import { integrationsRouter } from './routes/integrations';
import { sendEmailRouter } from './routes/sendEmail';
import { entreprisesRouter } from './routes/entreprises';
import { reportingRouter, reportingCronRouter } from './routes/reporting';
import { relancesRouter } from './routes/relances';
import { abonnementRouter } from './routes/abonnement';
import { parrainageRouter } from './routes/parrainage';
import { exploitantRouter } from './routes/exploitant';
import { relancesCronRouter } from './routes/relancesCron';
import { contactRouter } from './routes/contact';
import { tachesRouter } from './routes/taches';
import { operationsRouter } from './routes/operations';
import { parcImpressionRouter } from './routes/parcImpression';
import { coursierPublicRouter } from './routes/coursierPublic';
import { sallePublicRouter } from './routes/sallePublic';
import { assistantRouter } from './routes/assistant';
import { contentieuxRouter } from './routes/contentieux';
import { contentieuxPortailRouter } from './routes/contentieuxPortail';
import { partenaireRouter } from './routes/partenaire';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();
  // Derrière le proxy TLS de Render : faire confiance à l'en-tête
  // x-forwarded-proto pour que req.protocol reflète le vrai schéma (https),
  // sinon les URL absolues construites côté serveur (ex. logo) sortent en
  // http et sont bloquées comme « contenu mixte » sur une page https.
  app.set('trust proxy', true);
  // CORS_ORIGIN: comma-separated allowlist for production (e.g. the deployed
  // frontend's URL). Left permissive by default for local development.
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  // En mode SSO, le front envoie le cookie de session partagée → CORS doit
  // autoriser les credentials (et renvoyer l'origine précise, jamais '*').
  const ssoMode = process.env.AUTH_MODE === 'sso';
  app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : true, credentials: ssoMode }));
  app.use(express.json());

  // `rls` expose l'état effectif de l'isolation multi-tenant (RLS_ENABLED) sur
  // l'instance en cours — diagnostic ops : sur un back-end SaaS il DOIT valoir
  // true, sinon les données de tous les tenants retombent dans l'org par défaut.
  app.get('/health', (_req, res) => res.json({ ok: true, rls: rlsActive(), email: emailMode() }));

  app.use('/api/auth', authRouter);
  app.use('/api/auth/otp', authOtpRouter);
  app.use('/api/onboarding', onboardingRouter);
  app.use('/api/organisation', organisationRouter);
  // Service public du logo (sans auth) — chargé par les emails et le front.
  app.use('/api/logo', logoPublicRouter);
  // Service public du QR code Wave (sans auth) — affiché dans relances et portail.
  app.use('/api/wave-qr', waveQrPublicRouter);
  // Back-office exploitant (super-admin) — activation des comptes.
  app.use('/api/admin', adminOrganisationsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/factures', facturesRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/config', configRouter);
  app.use('/api/import', importRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/send-email', sendEmailRouter);
  app.use('/api/entreprises', entreprisesRouter);
  app.use('/api/reporting', reportingRouter);
  app.use('/api/relances', relancesRouter);
  app.use('/api/abonnement', abonnementRouter);
  app.use('/api/parrainage', parrainageRouter);
  app.use('/api/exploitant', exploitantRouter);
  app.use('/api/cron/relances', relancesCronRouter);
  app.use('/api/cron/reporting', reportingCronRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/taches', tachesRouter);
  app.use('/api/operations', operationsRouter);
  app.use('/api/parc', parcImpressionRouter);
  app.use('/api/coursier-public', coursierPublicRouter);
  app.use('/api/salle-public', sallePublicRouter);
  app.use('/api/assistant', assistantRouter);
  app.use('/api/contentieux', contentieuxRouter);
  app.use('/api/contentieux-portail', contentieuxPortailRouter);
  app.use('/api/partenaire', partenaireRouter);

  app.use(errorHandler);
  return app;
}
