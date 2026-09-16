import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db';

// Logique OTP par email (addendum §4.2). Le code n'est jamais stocké en clair :
// on ne garde qu'un HMAC-SHA256 calculé avec un secret serveur. Plafonds
// anti-abus (§4.4) : durée de vie courte, nombre de tentatives borné, et nombre
// de demandes borné par email sur une fenêtre glissante.

const CODE_TTL_MIN = 10; // durée de validité d'un code
const MAX_TENTATIVES = 5; // essais de vérification par code
const MAX_DEMANDES = 5; // demandes par email...
const FENETRE_MIN = 15; // ...sur cette fenêtre glissante (minutes)

function secret(): string {
  const s = process.env.OTP_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error('OTP_SECRET (ou SESSION_SECRET) manquant');
  return s;
}

export function normaliserEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase();
}

function hacher(code: string): string {
  return createHmac('sha256', secret()).update(code).digest('hex');
}

function egal(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Crée un code et renvoie sa valeur EN CLAIR (à envoyer par email). Refuse au-delà
// du plafond de demandes récentes pour un même email.
export async function creerCodeOtp(
  emailBrut: string,
): Promise<{ code: string } | { erreur: 'trop_de_demandes' }> {
  const email = normaliserEmail(emailBrut);
  const depuis = new Date(Date.now() - FENETRE_MIN * 60_000);
  const recents = await prisma.codeOtp.count({ where: { email, createdAt: { gte: depuis } } });
  if (recents >= MAX_DEMANDES) return { erreur: 'trop_de_demandes' };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.codeOtp.create({
    data: { email, codeHash: hacher(code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000) },
  });
  return { code };
}

// Vérifie un code : le consomme et renvoie true s'il est valide. Comptabilise les
// tentatives et refuse au-delà du plafond (sans supprimer, pour tracer l'abus).
export async function verifierCodeOtp(emailBrut: string, codeBrut: string): Promise<boolean> {
  const email = normaliserEmail(emailBrut);
  const code = String(codeBrut ?? '').trim();
  const otp = await prisma.codeOtp.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || otp.tentatives >= MAX_TENTATIVES) return false;

  if (!egal(otp.codeHash, hacher(code))) {
    await prisma.codeOtp.update({ where: { id: otp.id }, data: { tentatives: { increment: 1 } } });
    return false;
  }
  await prisma.codeOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return true;
}
