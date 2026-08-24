import { google } from 'googleapis';
import { randomBytes } from 'crypto';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/userinfo.email'];

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} n'est pas configuré côté serveur`);
  return v;
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    requiredEnv('GOOGLE_CLIENT_ID'),
    requiredEnv('GOOGLE_CLIENT_SECRET'),
    requiredEnv('GOOGLE_REDIRECT_URI'),
  );
}

export function buildAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force le renvoi d'un refresh_token même en cas de reconnexion
    scope: SCOPES,
    state,
  });
}

export interface ExchangedTokens {
  refreshToken: string;
  email: string;
}

// Échange le code d'autorisation renvoyé par Google contre un refresh token,
// et récupère l'adresse Gmail connectée (pour affichage côté admin — jamais
// le refresh token lui-même, qui n'est jamais renvoyé au frontend).
export async function exchangeCodeForTokens(code: string): Promise<ExchangedTokens> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google n'a pas renvoyé de refresh token — révoque l'accès existant sur https://myaccount.google.com/permissions et réessaie.",
    );
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) throw new Error("Impossible de déterminer l'adresse Gmail connectée");
  return { refreshToken: tokens.refresh_token, email: data.email };
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

function encodeSubject(subject: string): string {
  return `=?utf-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
}

function encodeBase64Url(raw: string): string {
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Sécurise le nom de fichier utilisé dans les en-têtes MIME : retire tout
// caractère qui permettrait d'injecter des lignes d'en-tête (CR/LF, guillemets).
function sanitizeFilename(filename: string): string {
  return filename.replace(/[\r\n"]/g, '').slice(0, 200) || 'piece-jointe';
}

function base64Wrap(base64: string): string {
  return base64.replace(/(.{76})/g, '$1\r\n');
}

function buildRawMessage(to: string, subject: string, body: string, attachments: EmailAttachment[] = []): string {
  const headerLines = [`To: ${to}`, `Subject: ${encodeSubject(subject)}`, 'MIME-Version: 1.0'];

  if (!attachments.length) {
    const lines = [...headerLines, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 7bit', '', body];
    return encodeBase64Url(lines.join('\r\n'));
  }

  const boundary = `----olu360-${randomBytes(12).toString('hex')}`;
  const parts = [
    ...headerLines,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    body,
  ];

  for (const att of attachments) {
    const filename = sanitizeFilename(att.filename);
    parts.push(
      '',
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      base64Wrap(att.content.toString('base64')),
    );
  }
  parts.push('', `--${boundary}--`);

  return encodeBase64Url(parts.join('\r\n'));
}

// Envoie un email via l'API Gmail avec le refresh token stocké pour le
// compte dédié (ex: recouvrement@soram-afrique.com). Lève une erreur
// explicite si le token a été révoqué côté Google (invalid_grant).
export async function sendViaGmail(
  refreshToken: string,
  to: string,
  subject: string,
  body: string,
  attachments: EmailAttachment[] = [],
): Promise<string> {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: client });
  try {
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: buildRawMessage(to, subject, body, attachments) } });
    if (!res.data.id) throw new Error("Réponse Gmail inattendue : pas d'identifiant de message");
    return res.data.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('invalid_grant')) {
      throw new Error("La connexion Gmail a été révoquée côté Google — reconnecte le compte dans Utilisateurs/Intégrations.");
    }
    // Jeton émis avant l'ajout du scope d'envoi (gmail.send) : Google fige les
    // permissions sur le refresh token au moment du consentement, donc le
    // rajouter dans le code ne suffit pas — il faut déconnecter puis reconnecter
    // le compte pour réémettre un jeton qui porte le bon scope.
    if (message.includes('insufficient authentication scopes') || message.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      throw new Error(
        "La connexion Gmail n'autorise pas l'envoi (scope manquant) — déconnecte puis reconnecte le compte dans Intégrations, et accepte bien la permission « Envoyer des e-mails en votre nom ».",
      );
    }
    throw err;
  }
}
