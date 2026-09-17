import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmtpEmailProvider } from '../src/lib/email/provider';

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
