import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('jose', () => {
  const jwtVerify = vi.fn();
  const createRemoteJWKSet = vi.fn(() => ({ __jwks: true }));
  return { jwtVerify, createRemoteJWKSet, _mocks: { jwtVerify, createRemoteJWKSet } };
});

async function mocks() {
  const mod = (await import('jose')) as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> };
  return mod._mocks;
}

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_JWT_SECRET', 'NODE_ENV'];

describe('extractEmailFromToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('returns null when neither SUPABASE_URL nor a dev secret is configured', async () => {
    const { extractEmailFromToken } = await import('../src/lib/verifyToken');
    expect(await extractEmailFromToken('whatever')).toBeNull();
  });

  it('verifies a real Supabase token against the JWKS and returns its email', async () => {
    process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
    const { jwtVerify } = await mocks();
    jwtVerify.mockResolvedValue({ payload: { email: 'admin@soram-afrique.com' } });

    const { extractEmailFromToken } = await import('../src/lib/verifyToken');
    expect(await extractEmailFromToken('real-supabase-jwt')).toBe('admin@soram-afrique.com');
  });

  it('falls back to the dev HS256 secret in development when JWKS verification fails', async () => {
    process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.SUPABASE_JWT_SECRET = 'dev-secret';
    process.env.NODE_ENV = 'development';
    const { jwtVerify } = await mocks();
    jwtVerify.mockRejectedValue(new Error('signature verification failed'));

    const devToken = jwt.sign({ email: 'dev@example.sn' }, 'dev-secret');
    const { extractEmailFromToken } = await import('../src/lib/verifyToken');
    expect(await extractEmailFromToken(devToken)).toBe('dev@example.sn');
  });

  it('never falls back to the dev secret in production, even if JWKS verification fails', async () => {
    process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.SUPABASE_JWT_SECRET = 'dev-secret';
    process.env.NODE_ENV = 'production';
    const { jwtVerify } = await mocks();
    jwtVerify.mockRejectedValue(new Error('signature verification failed'));

    const devToken = jwt.sign({ email: 'dev@example.sn' }, 'dev-secret');
    const { extractEmailFromToken } = await import('../src/lib/verifyToken');
    expect(await extractEmailFromToken(devToken)).toBeNull();
  });

  it('rejects a dev token signed with the wrong secret', async () => {
    process.env.SUPABASE_JWT_SECRET = 'dev-secret';
    process.env.NODE_ENV = 'development';

    const badToken = jwt.sign({ email: 'dev@example.sn' }, 'not-the-right-secret');
    const { extractEmailFromToken } = await import('../src/lib/verifyToken');
    expect(await extractEmailFromToken(badToken)).toBeNull();
  });

  it('returns null when the JWKS payload has no email claim', async () => {
    process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
    const { jwtVerify } = await mocks();
    jwtVerify.mockResolvedValue({ payload: { sub: 'user-id-without-email' } });

    const { extractEmailFromToken } = await import('../src/lib/verifyToken');
    expect(await extractEmailFromToken('real-supabase-jwt')).toBeNull();
  });
});
