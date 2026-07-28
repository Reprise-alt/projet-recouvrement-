import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { clientsRouter } from './routes/clients';
import { facturesRouter } from './routes/factures';
import { contractsRouter } from './routes/contracts';
import { configRouter } from './routes/config';
import { importRouter } from './routes/importRoutes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/factures', facturesRouter);
  app.use('/api/contracts', contractsRouter);
  app.use('/api/config', configRouter);
  app.use('/api/import', importRouter);

  app.use(errorHandler);
  return app;
}
