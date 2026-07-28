import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { clientsRouter } from './routes/clients';
import { facturesRouter } from './routes/factures';
import { contractsRouter } from './routes/contracts';
import { configRouter } from './routes/config';
import { importRouter } from './routes/importRoutes';
import { integrationsRouter } from './routes/integrations';
import { sendEmailRouter } from './routes/sendEmail';
import { entreprisesRouter } from './routes/entreprises';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();
  // CORS_ORIGIN: comma-separated allowlist for production (e.g. the deployed
  // frontend's URL). Left permissive by default for local development.
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/factures', facturesRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/config', configRouter);
  app.use('/api/import', importRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/send-email', sendEmailRouter);
  app.use('/api/entreprises', entreprisesRouter);

  app.use(errorHandler);
  return app;
}
