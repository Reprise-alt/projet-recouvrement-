import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { buildAuthUrl, exchangeCodeForTokens } from '../lib/gmail';
import { createState, consumeState } from '../lib/oauthState';
import { clearGmailCredential, getGmailCredential, saveGmailCredential } from '../services/gmailCredentialService';

export const integrationsRouter = Router();

integrationsRouter.get('/gmail/status', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    const cred = await getGmailCredential();
    res.json({
      connected: cred?.statut === 'actif' && !!cred.refreshToken,
      compteEmail: cred?.compteEmail ?? null,
      derniereSync: cred?.derniereSync ?? null,
    });
  } catch (err) {
    next(err);
  }
});

integrationsRouter.get('/gmail/auth-url', requireAuth, requireRole('admin'), (_req, res, next) => {
  try {
    const state = createState();
    res.json({ url: buildAuthUrl(state) });
  } catch (err) {
    next(err);
  }
});

// Pas de requireAuth ici : Google redirige le navigateur directement sur
// cette route après consentement, sans le Bearer token de la session admin
// qui a initié le flux. La protection anti-CSRF vient du `state` vérifié
// ci-dessous (voir lib/oauthState.ts).
integrationsRouter.get('/gmail/callback', async (req, res) => {
  const redirectBase = process.env.FRONTEND_URL;
  function finish(status: 'connected' | 'error', message?: string) {
    if (redirectBase) {
      const url = new URL(redirectBase);
      url.searchParams.set('gmail', status);
      if (message) url.searchParams.set('message', message);
      return res.redirect(url.toString());
    }
    res.status(status === 'connected' ? 200 : 400).send(
      `<html><body><p>${status === 'connected' ? 'Gmail connecté avec succès.' : `Échec : ${message}`}</p><p>Vous pouvez fermer cet onglet.</p></body></html>`,
    );
  }

  try {
    if (!consumeState(req.query.state as string | undefined)) {
      return finish('error', 'État invalide ou expiré — relance la connexion depuis Utilisateurs.');
    }
    const code = req.query.code as string | undefined;
    if (!code) return finish('error', "Code d'autorisation manquant");

    const { refreshToken, email } = await exchangeCodeForTokens(code);
    await saveGmailCredential(refreshToken, email);
    finish('connected');
  } catch (err) {
    finish('error', err instanceof Error ? err.message : 'Erreur inconnue');
  }
});

integrationsRouter.post('/gmail/disconnect', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    await clearGmailCredential();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
