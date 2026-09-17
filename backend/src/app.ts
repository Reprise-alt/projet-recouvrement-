import express from 'express';
import cors from 'cors';
import { rlsActive } from './db';
import { emailMode } from './lib/email/provider';
import { authRouter } from './routes/auth';
import { authOtpRouter } from './routes/authOtp';
import { onboardingRouter } from './routes/onboarding';
import { organisationRouter } from './routes/organisation';
import { logoPublicRouter } from './routes/logoPublic';
import { usersRouter } from './routes/users';
import { clientsRouter } from './routes/clients';
import { facturesRouter } from './routes/factures';
import { contractsRouter } from './routes/contracts';
import { configRouter } from './routes/config';
import { importRouter } from './routes/importRoutes';
import { integrationsRouter } from './routes/integrations';
import { sendEmailRouter } from './routes/sendEmail';
import { entreprisesRouter } from './routes/entreprises';
import { reportingRouter } from './routes/reporting';
import { relancesRouter } from './routes/relances';
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

  // Auto-test email PUBLIC (sans authentification) — diagnostic de dépannage
  // quand l'exploitant est verrouillé dehors (l'OTP de connexion part par email,
  // donc une clé invalide bloque aussi la connexion). Interroge l'API Resend
  // avec la clé configurée et renvoie sa VALIDITÉ, sans jamais exposer la clé
  // (ni aperçu) : seulement mode, source, longueur, valide/invalide et le code.
  app.get('/email-selftest', async (_req, res) => {
    const mode = emailMode();
    const key = (process.env.RESEND_API_KEY || process.env.SMTP_PASS || '').trim();
    const keySource = process.env.RESEND_API_KEY ? 'RESEND_API_KEY' : process.env.SMTP_PASS ? 'SMTP_PASS' : 'aucune';
    let keyValid: boolean | null = null;
    let status: number | null = null;
    if (key) {
      try {
        const r = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10_000),
        });
        status = r.status;
        keyValid = r.ok;
      } catch {
        keyValid = null; // réseau/timeout
      }
    }
    res.json({ mode, keySource, keyLength: key.length, keyValid, status });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/auth/otp', authOtpRouter);
  app.use('/api/onboarding', onboardingRouter);
  app.use('/api/organisation', organisationRouter);
  // Service public du logo (sans auth) — chargé par les emails et le front.
  app.use('/api/logo', logoPublicRouter);
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
  app.use('/api/cron/relances', relancesCronRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/taches', tachesRouter);
  app.use('/api/operations', operationsRouter);
  app.use('/api/parc', parcImpressionRouter);
  app.use('/api/coursier-public', coursierPublicRouter);
  app.use('/api/salle-public', sallePublicRouter);
  app.use('/api/assistant', assistantRouter);
  app.use('/api/contentieux', contentieuxRouter);
  app.use('/api/contentieux-portail', contentieuxPortailRouter);

  app.use(errorHandler);
  return app;
}
