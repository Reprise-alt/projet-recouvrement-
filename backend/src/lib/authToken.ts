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

// Session d'un cabinet partenaire (avocat/huissier plateforme, sans
// organisation). Le jeton porte `partenaire: true` et l'email en sujet ; il
// n'a PAS de champ `org`, donc verifierSession() ci-dessus le rejette
// naturellement — aucune collision avec les sessions d'organisation.
export function signerSessionPartenaire(email: string): string {
  return jwt.sign({ partenaire: true }, secret(), { subject: email.trim().toLowerCase(), expiresIn: EXPIRATION });
}

export function verifierSessionPartenaire(token: string): { email: string } | null {
  try {
    const p = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (p.partenaire === true && p.sub) return { email: String(p.sub) };
    return null;
  } catch {
    return null;
  }
}

// Session d'un exploitant de la plateforme (SANS organisation) : gère les
// nouvelles demandes et l'activation des comptes depuis un espace dédié. Le
// jeton porte `operateur: true` + l'email en sujet ; pas de champ `org`, donc
// verifierSession() le rejette — aucune collision avec les sessions org.
export function signerSessionOperateur(email: string): string {
  return jwt.sign({ operateur: true }, secret(), { subject: email.trim().toLowerCase(), expiresIn: EXPIRATION });
}

export function verifierSessionOperateur(token: string): { email: string } | null {
  try {
    const p = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (p.operateur === true && p.sub) return { email: String(p.sub) };
    return null;
  } catch {
    return null;
  }
}

// Jeton PUBLIC « chèque disponible » : encodé dans le bouton d'une relance pour
// que le débiteur signale un chèque prêt, sans authentification. Porte le client
// et l'organisation ; validité longue (le débiteur peut cliquer des jours après).
export function signerTokenCheque(clientId: string, organisationId: string): string {
  return jwt.sign({ chq: true, org: organisationId }, secret(), { subject: clientId, expiresIn: '120d' });
}

export function verifierTokenCheque(token: string): { clientId: string; org: string } | null {
  try {
    const p = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (p.chq === true && p.sub && typeof p.org === 'string') return { clientId: String(p.sub), org: p.org };
    return null;
  } catch {
    return null;
  }
}
