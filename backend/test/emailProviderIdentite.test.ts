import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResendApiProvider, SmtpEmailProvider } from '../src/lib/email/provider';

// Transporteur nodemailer factice : capture les arguments de sendMail.
function fakeTransport() {
  const calls: any[] = [];
  return { calls, transporter: { sendMail: async (opts: any) => void calls.push(opts) } as any };
}

describe('SmtpEmailProvider — identité par organisation', () => {
  const OLD = process.env.EMAIL_FROM;
  beforeAll(() => {
    process.env.EMAIL_FROM = 'OLU 360 <relances@mail.olu360.com>';
  });
  afterAll(() => {
    if (OLD === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = OLD;
  });

  it('remplace le nom affiché par celui du tenant tout en gardant l’adresse mutualisée', async () => {
    const { calls, transporter } = fakeTransport();
    const p = new SmtpEmailProvider(transporter);
    await p.send({ to: 'debiteur@ex.sn', subject: 'Rappel', text: '…', fromName: 'Boulangerie Diarra', replyTo: 'compta@diarra.sn' });
    expect(calls[0].from).toEqual({ name: 'Boulangerie Diarra', address: 'relances@mail.olu360.com' });
    expect(calls[0].replyTo).toBe('compta@diarra.sn');
  });

  it('retombe sur l’expéditeur par défaut sans fromName', async () => {
    const { calls, transporter } = fakeTransport();
    const p = new SmtpEmailProvider(transporter);
    await p.send({ to: 'debiteur@ex.sn', subject: 'Rappel', text: '…' });
    expect(calls[0].from).toBe('OLU 360 <relances@mail.olu360.com>');
    expect(calls[0].replyTo).toBeUndefined();
  });
});

describe('ResendApiProvider — API HTTP', () => {
  const OLD_FROM = process.env.EMAIL_FROM;
  const OLD_KEY = process.env.RESEND_API_KEY;
  beforeAll(() => {
    process.env.EMAIL_FROM = 'OLU 360 <relances@mail.olu360.com>';
    process.env.RESEND_API_KEY = 're_test_key';
  });
  afterAll(() => {
    if (OLD_FROM === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = OLD_FROM;
    if (OLD_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = OLD_KEY;
  });
  afterEach(() => vi.restoreAllMocks());

  it('poste sur l’API Resend avec le bon expéditeur, reply_to et clé', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new ResendApiProvider();
    await p.send({ to: 'debiteur@ex.sn', subject: 'Rappel', text: '…', fromName: 'Boulangerie Diarra', replyTo: 'compta@diarra.sn' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
    const body = JSON.parse(opts.body as string);
    expect(body.from).toBe('Boulangerie Diarra <relances@mail.olu360.com>');
    expect(body.reply_to).toBe('compta@diarra.sn');
    expect(body.to).toBe('debiteur@ex.sn');
  });

  it('lève une erreur explicite si l’API répond en échec', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Invalid API key"}', { status: 401 })));
    const p = new ResendApiProvider();
    await expect(p.send({ to: 'x@ex.sn', subject: 's', text: 't' })).rejects.toThrow(/Resend API 401/);
  });
});
