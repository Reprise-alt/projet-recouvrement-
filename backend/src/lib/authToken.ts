import jwt from 'jsonwebtoken';

// Session applicative des comptes SaaS (inscrits par OTP). JWT signé HS256 avec
// un secret serveur, transmis par le client en `Authorization: Bearer <token>`.
// Distinct des sessions groupe (cookie SSO du socle) : les deux cohabitent, le
// middleware d'authentification accepte l'un ou l'autre.

const EXPIRATION = '30d';

function secret(): string {
  const s = process.env.OTP_JWT_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error('OTP_JWT_SECRET (ou SESSION_SECRET) manquant');
  return s;
}

export interface SessionOtp {
  sub: string; // id utilisateur
  org: string; // id organisation
}

export function signerSession(userId: string, organisationId: string): string {
  return jwt.sign({ org: organisationId }, secret(), { subject: userId, expiresIn: EXPIRATION });
}

export function verifierSession(token: string): SessionOtp | null {
  try {
    const p = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (!p.sub || typeof p.org !== 'string') return null;
    return { sub: String(p.sub), org: p.org };
  } catch {
    return null;
  }
}
