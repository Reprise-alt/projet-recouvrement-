import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { chatAssistant, ChatMessage } from '../lib/assistant';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

// Historique de conversation tenu côté client (bulle flottante), renvoyé en
// entier à chaque message -- pas de session serveur, cohérent avec le reste
// de l'API qui reste sans état entre deux requêtes.
assistantRouter.post('/chat', async (req, res, next) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'Assistant non configuré — clé API manquante côté serveur' });
    }

    const { messages } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages requis' });
    }
    // Jamais confiance dans la forme exacte envoyée par le client, même
    // authentifié -- et on plafonne l'historique transmis au modèle pour
    // ne pas laisser une conversation interminable gonfler indéfiniment le
    // coût d'un seul appel.
    const clean: ChatMessage[] = messages
      .filter((m: unknown): m is ChatMessage => {
        if (!m || typeof m !== 'object') return false;
        const mm = m as Record<string, unknown>;
        return (mm.role === 'user' || mm.role === 'assistant') && typeof mm.content === 'string' && mm.content.trim().length > 0;
      })
      .slice(-20);
    if (clean.length === 0) return res.status(400).json({ error: 'messages invalides' });

    const contenu = await chatAssistant(req.user!, clean);
    res.json({ message: { role: 'assistant', content: contenu } });
  } catch (err) {
    next(err);
  }
});
