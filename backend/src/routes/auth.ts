import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

// Renvoie l'identité applicative résolue par requireAuth (rôle, entité) —
// utilisé par le frontend juste après la connexion pour savoir quelles vues
// et actions afficher, le JWT lui-même ne portant que l'email. Comme cet
// appel n'est fait qu'une fois par ouverture/rechargement de l'app (jamais en
// polling), c'est l'endroit naturel pour horodater la dernière connexion —
// pas besoin d'écrire en base à chaque requête protégée.
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    await prisma.utilisateur.update({ where: { id: req.user!.id }, data: { derniereConnexion: new Date() } });
    res.json(req.user);
  } catch (err) {
    next(err);
  }
});

// Outil de développement UNIQUEMENT : mint un JWT au format Supabase (même
// secret partagé, claim `email`) pour tester les routes protégées sans avoir
// un vrai projet Supabase connecté. À ne jamais exposer en production — en
// production, l'émission des tokens est entièrement déléguée à Supabase Auth.
authRouter.post('/dev-token', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).end();
    }
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "SUPABASE_JWT_SECRET n'est pas configuré côté serveur" });
    }
    const email = (req.body?.email || '').toString().trim();
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const utilisateur = await prisma.utilisateur.findUnique({ where: { email } });
    if (!utilisateur) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const token = jwt.sign({ email: utilisateur.email }, secret, { expiresIn: '12h' });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});
