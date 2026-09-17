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
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // Identité d'expéditeur par organisation (§5.3, §6) : le nom affiché prend le
  // pas sur le nom par défaut (l'adresse d'envoi reste mutualisée), et replyTo
  // renvoie les réponses vers l'entreprise cliente.
  fromName?: string;
  replyTo?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
  sendOtp(to: string, code: string): Promise<void>;
}

// Mode d'envoi effectivement actif d'après la configuration :
//   'resend' = API HTTP Resend (recommandé : passe par https/443, jamais bloqué)
//   'smtp'   = SMTP standard (peut échouer si l'hébergeur bloque 465/587)
//   'stub'   = journalisé seulement (aucun email ne part)
// Sert au diagnostic (vérifier d'un coup d'œil qu'on n'est pas resté en stub).
export function emailMode(): 'resend' | 'smtp' | 'stub' {
  const p = process.env.EMAIL_PROVIDER;
  return p === 'resend' ? 'resend' : p === 'smtp' ? 'smtp' : 'stub';
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
  async send(msg: EmailMessage): Promise<void> {
    const ident = msg.fromName ? ` (de « ${msg.fromName} »${msg.replyTo ? `, réponse → ${msg.replyTo}` : ''})` : '';
    // eslint-disable-next-line no-console
    console.log(`[email:stub] à ${msg.to} — ${msg.subject}${ident}`);
  }

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
  // Adresse d'envoi mutualisée, extraite d'EMAIL_FROM (« Nom <adresse> » ou
  // « adresse ») : on garde cette adresse pour tous les tenants, seul le nom
  // affiché change par organisation (§6).
  private baseAddress: string;

  constructor(transporter?: Transporter) {
    this.from = process.env.EMAIL_FROM || 'OLU 360 <no-reply@olu360.com>';
    const m = this.from.match(/<([^>]+)>/);
    this.baseAddress = (m ? m[1] : this.from).trim();
    this.transporter =
      transporter ||
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS || '').trim() } : undefined,
        // Délais courts : si l'hébergeur bloque le port SMTP sortant, on échoue
        // vite avec une erreur claire au lieu de rester suspendu indéfiniment.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
  }

  async send(msg: EmailMessage): Promise<void> {
    const from = msg.fromName ? { name: msg.fromName, address: this.baseAddress } : this.from;
    await this.transporter.sendMail({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo || undefined,
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

// Envoi via l'API HTTP de Resend (https, port 443). À préférer sur les
// hébergeurs qui bloquent les ports SMTP sortants (cas fréquent : la connexion
// SMTP « pend » sans jamais aboutir). Clé lue depuis RESEND_API_KEY, ou à défaut
// SMTP_PASS (déjà renseignée pour le SMTP) — pas de config en double.
class ResendApiProvider implements EmailProvider {
  private apiKey: string;
  private from: string;
  private baseAddress: string;

  constructor() {
    // trim() : une clé collée dans un champ secret Render embarque souvent un
    // espace ou un retour à la ligne parasite → « API key is invalid ».
    this.apiKey = (process.env.RESEND_API_KEY || process.env.SMTP_PASS || '').trim();
    this.from = process.env.EMAIL_FROM || 'OLU 360 <no-reply@olu360.com>';
    const m = this.from.match(/<([^>]+)>/);
    this.baseAddress = (m ? m[1] : this.from).trim();
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend API ${res.status} — ${detail.slice(0, 300)}`);
    }
  }

  async send(msg: EmailMessage): Promise<void> {
    // Nom d'expéditeur par organisation, adresse mutualisée (comme le SMTP).
    const from = msg.fromName ? `${msg.fromName} <${this.baseAddress}>` : this.from;
    await this.post({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      reply_to: msg.replyTo || undefined,
    });
  }

  async sendOtp(to: string, code: string): Promise<void> {
    await this.post({
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
    case 'resend':
      instance = new ResendApiProvider();
      break;
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

export { ResendApiProvider, SmtpEmailProvider, StubEmailProvider };
