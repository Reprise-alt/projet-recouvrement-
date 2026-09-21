import { Router } from 'express';
import { prisma } from '../db';

// Service PUBLIC du logo d'une organisation (pas d'authentification) : un logo
// est un actif de marque destiné à être affiché largement — notamment dans les
// emails de relance, qui chargent l'image depuis une URL publique sans session.
// Sert les octets stockés (logoData) avec leur type MIME. L'id d'organisation
// est un cuid non énumérable ; aucune donnée sensible n'est exposée.
export const logoPublicRouter = Router();

logoPublicRouter.get('/:orgId', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({
      where: { id: req.params.orgId },
      select: { logoData: true, logoMime: true },
    });
    if (!org?.logoData || !org.logoMime) return res.status(404).end();
    res.setHeader('Content-Type', org.logoMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(org.logoData));
  } catch (e) {
    next(e);
  }
});

// Service PUBLIC du QR code Wave (même logique que le logo) : image scannable
// affichée dans les relances et le portail débiteur, chargée sans session.
export const waveQrPublicRouter = Router();

waveQrPublicRouter.get('/:orgId', async (req, res, next) => {
  try {
    const org = await prisma.organisation.findUnique({
      where: { id: req.params.orgId },
      select: { waveQrData: true, waveQrMime: true },
    });
    if (!org?.waveQrData || !org.waveQrMime) return res.status(404).end();
    res.setHeader('Content-Type', org.waveQrMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(org.waveQrData));
  } catch (e) {
    next(e);
  }
});
