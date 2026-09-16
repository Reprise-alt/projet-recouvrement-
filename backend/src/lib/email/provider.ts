import nodemailer, { Transporter } from 'nodemailer';

// Abstraction d'envoi d'email transactionnel (addendum §2.3). Choix d'archi :
// l'implémentation concrète est un **SMTP standard** (nodemailer), configuré par
// variables d'environnement — ce qui permet de pointer n'importe quel
// fournisseur (Resend, Brevo, Amazon SES, SendGrid, Mailgun, ou un SMTP maison)
// SANS changer une ligne de code, juste la configuration. Aucun enfermement.
//
// Sélection via EMAIL_PROVIDER :
//   - 'smtp'            -> SmtpEmailProvider (production ; requiert SMTP_HOST…)
//   - absent / autre    -> StubEmailProvider (dev/test : journalise, n'envoie rien)
export interface EmailProvider {
  sendOtp(to: string, code: string): Promise<void>;
}

function corpsTexte(code: string): string {
  return [
    `Votre code de connexion OLU 360 est : ${code}`,
    '',
    'Il est valable 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.',
    '',
    'OLU 360',
  ].join('\n');
}

function corpsHtml(code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#22262a">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:700;font-size:18px;letter-spacing:.02em;color:#177f5e;margin-bottom:20px">OLU 360</div>
    <div style="background:#fff;border:1px solid #e4e7e3;border-radius:14px;padding:28px 26px">
      <p style="margin:0 0 14px;font-size:15px">Voici votre code de connexion :</p>
      <div style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:.18em;color:#0b6e77;margin:6px 0 18px">${code}</div>
      <p style="margin:0;font-size:13px;color:#5b6469">Il est valable <b>10 minutes</b>. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>
    </div>
    <p style="margin:18px 0 0;font-size:11px;color:#8a9298">Email automatique — merci de ne pas répondre.</p>
  </div></body></html>`;
}

class StubEmailProvider implements EmailProvider {
  async sendOtp(to: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[email:stub] Code de connexion OLU 360 pour ${to} : ${code}`);
  }
}

// Envoi via SMTP. Compatible avec tout fournisseur exposant un endpoint SMTP :
//   SMTP_HOST, SMTP_PORT (587 par défaut), SMTP_SECURE ('true' pour 465),
//   SMTP_USER, SMTP_PASS, EMAIL_FROM.
// Recommandé : Resend (délivrabilité + offre gratuite) ou Brevo (UE/FR).
class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private from: string;

  constructor(transporter?: Transporter) {
    this.from = process.env.EMAIL_FROM || 'OLU 360 <no-reply@olu360.com>';
    this.transporter =
      transporter ||
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
  }

  async sendOtp(to: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Votre code de connexion OLU 360 : ${code}`,
      text: corpsTexte(code),
      html: corpsHtml(code),
    });
  }
}

let instance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  switch (process.env.EMAIL_PROVIDER) {
    case 'smtp':
      instance = new SmtpEmailProvider();
      break;
    default:
      instance = new StubEmailProvider();
  }
  return instance;
}

// Pour les tests : injecter un émetteur (ou un transporteur nodemailer de test).
export function setEmailProvider(p: EmailProvider | null): void {
  instance = p;
}

export { SmtpEmailProvider, StubEmailProvider };
