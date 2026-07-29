import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('googleapis', () => {
  const generateAuthUrl = vi.fn(() => 'https://accounts.google.com/mock-auth-url');
  const getToken = vi.fn();
  const setCredentials = vi.fn();
  const messagesSend = vi.fn();
  const userinfoGet = vi.fn();

  function OAuth2() {
    return { generateAuthUrl, getToken, setCredentials };
  }

  return {
    google: {
      auth: { OAuth2 },
      gmail: () => ({ users: { messages: { send: messagesSend } } }),
      oauth2: () => ({ userinfo: { get: userinfoGet } }),
    },
    _mocks: { generateAuthUrl, getToken, setCredentials, messagesSend, userinfoGet },
  };
});

async function mocks() {
  const mod = (await import('googleapis')) as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> };
  return mod._mocks;
}

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];

describe('gmail lib', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/integrations/gmail/callback';
    vi.clearAllMocks();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('buildAuthUrl throws a clear error when the OAuth client env vars are missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const { buildAuthUrl } = await import('../src/lib/gmail');
    expect(() => buildAuthUrl('state-123')).toThrow('GOOGLE_CLIENT_ID');
  });

  it('buildAuthUrl requests offline access and passes the state through', async () => {
    const { buildAuthUrl } = await import('../src/lib/gmail');
    const url = buildAuthUrl('state-123');
    expect(url).toBe('https://accounts.google.com/mock-auth-url');
    const { generateAuthUrl } = await mocks();
    expect(generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ access_type: 'offline', state: 'state-123', scope: expect.arrayContaining(['https://www.googleapis.com/auth/gmail.send']) }),
    );
  });

  it('exchangeCodeForTokens returns the refresh token and connected email', async () => {
    const { getToken, userinfoGet } = await mocks();
    getToken.mockResolvedValue({ tokens: { refresh_token: 'rt-abc', access_token: 'at-abc' } });
    userinfoGet.mockResolvedValue({ data: { email: 'recouvrement@soram-afrique.com' } });

    const { exchangeCodeForTokens } = await import('../src/lib/gmail');
    const result = await exchangeCodeForTokens('auth-code');
    expect(result).toEqual({ refreshToken: 'rt-abc', email: 'recouvrement@soram-afrique.com' });
  });

  it('exchangeCodeForTokens throws when Google does not return a refresh token', async () => {
    const { getToken } = await mocks();
    getToken.mockResolvedValue({ tokens: { access_token: 'at-abc' } });

    const { exchangeCodeForTokens } = await import('../src/lib/gmail');
    await expect(exchangeCodeForTokens('auth-code')).rejects.toThrow(/refresh token/);
  });

  it('sendViaGmail sends a base64url-encoded RFC 2822 message and returns the message id', async () => {
    const { messagesSend } = await mocks();
    messagesSend.mockResolvedValue({ data: { id: 'msg-123' } });

    const { sendViaGmail } = await import('../src/lib/gmail');
    const id = await sendViaGmail('refresh-token', 'client@example.sn', 'Rappel de règlement', 'Merci de régulariser.');
    expect(id).toBe('msg-123');

    const call = messagesSend.mock.calls[0][0];
    expect(call.userId).toBe('me');
    const decoded = Buffer.from(call.requestBody.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    expect(decoded).toContain('To: client@example.sn');
    expect(decoded).toContain('Merci de régulariser.');
  });

  it('sendViaGmail builds a multipart message with attachments when provided', async () => {
    const { messagesSend } = await mocks();
    messagesSend.mockResolvedValue({ data: { id: 'msg-456' } });

    const { sendViaGmail } = await import('../src/lib/gmail');
    const attachment = { filename: 'facture.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-fake-content') };
    await sendViaGmail('refresh-token', 'client@example.sn', 'Sujet', 'Corps du message', [attachment]);

    const call = messagesSend.mock.calls[0][0];
    const decoded = Buffer.from(call.requestBody.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    expect(decoded).toContain('Content-Type: multipart/mixed');
    expect(decoded).toContain('Content-Disposition: attachment; filename="facture.pdf"');
    expect(decoded).toContain('Corps du message');
    expect(decoded).toContain(Buffer.from('%PDF-fake-content').toString('base64'));
  });

  it('sendViaGmail rewraps invalid_grant errors with an actionable message', async () => {
    const { messagesSend } = await mocks();
    messagesSend.mockRejectedValue(new Error('invalid_grant: Token has been revoked'));

    const { sendViaGmail } = await import('../src/lib/gmail');
    await expect(sendViaGmail('refresh-token', 'a@b.sn', 'Sujet', 'Corps')).rejects.toThrow(/révoquée/);
  });
});
