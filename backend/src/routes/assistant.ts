import { Router } from 'express';
import { requireAuth } from '../middleware/auth';

// Assistant retiré du périmètre des 3 consoles séparées : il sera reconstruit
// plus tard dans la future console générale (assistant IA centralisé). La
// route est laissée INERTE — plus d'appel modèle, plus de dépendance à
// lib/assistant ni à ANTHROPIC_API_KEY — mais répond proprement pour ne rien
// casser côté client tant que l'ancienne bulle n'est pas retirée.
export const assistantRouter = Router();
assistantRouter.use(requireAuth);

assistantRouter.post('/chat', (_req, res) => {
  res.status(503).json({
    error: 'Assistant indisponible',
    message: "L'assistant est en cours de refonte et reviendra dans la console générale.",
  });
});
