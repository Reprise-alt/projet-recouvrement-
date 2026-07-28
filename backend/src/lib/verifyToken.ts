import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import jwt from 'jsonwebtoken';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl: string | null = null;

function getJWKS() {
  const base = process.env.SUPABASE_URL;
  if (!base) return null;
  const url = `${base.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
  if (!jwks || jwksUrl !== url) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksUrl = url;
  }
  return jwks;
}

function emailFromPayload(payload: JWTPayload | Record<string, unknown>): string | null {
  const email = (payload as { email?: unknown }).email;
  return typeof email === 'string' ? email : null;
}

// Résout l'email porté par un token, en acceptant deux sources :
//  1. Un vrai JWT Supabase (signature asymétrique), vérifié contre le JWKS
//     public du projet — https://<projet>.supabase.co/auth/v1/.well-known/jwks.json.
//     Supabase a remplacé le secret JWT partagé unique par ce système de clés
//     rotatives ; on n'a donc besoin que de SUPABASE_URL, aucun secret à
//     configurer côté serveur pour ce chemin.
//  2. Hors production uniquement : un token de test signé en HS256 avec
//     SUPABASE_JWT_SECRET, émis par /api/auth/dev-token pour développer sans
//     projet Supabase connecté. Jamais utilisé comme repli en production.
export async function extractEmailFromToken(token: string): Promise<string | null> {
  const jwksSet = getJWKS();
  if (jwksSet) {
    try {
      const { payload } = await jwtVerify(token, jwksSet);
      const email = emailFromPayload(payload);
      if (email) return email;
    } catch {
      // Tombe sur le repli dev ci-dessous si applicable.
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const devSecret = process.env.SUPABASE_JWT_SECRET;
    if (devSecret) {
      try {
        const decoded = jwt.verify(token, devSecret);
        if (typeof decoded !== 'string') {
          const email = emailFromPayload(decoded);
          if (email) return email;
        }
      } catch {
        // ni JWKS ni secret dev n'ont pu vérifier ce token
      }
    }
  }

  return null;
}
