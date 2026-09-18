import { getEmailProvider } from './provider';

// URL du front SaaS (page de connexion). Réutilise CORS_ORIGIN, qui vaut déjà
// l'origine autorisée = l'URL du site client (ex. https://essai.olu360.com).
// Repli neutre si non configuré, pour ne jamais produire un lien vide.
function appUrl(): string {
  const raw = (process.env.CORS_ORIGIN || '').split(',')[0].trim();
  return (raw || 'https://app.olu360.com').replace(/\/+$/, '');
}

// Email d'invitation envoyé à un utilisateur qu'un administrateur vient de créer
// (SaaS). La connexion étant sans mot de passe (code à usage unique par email),
// l'invitation explique simplement où se connecter avec SON adresse. Best-effort :
// l'appelant ne doit pas faire échouer la création si l'envoi échoue.
export async function envoyerInvitation(params: {
  email: string;
  nom: string;
  organisation: string;
  invitePar?: string | null;
}): Promise<void> {
  const url = appUrl();
  const { email, nom, organisation, invitePar } = params;
  const parQui = invitePar ? ` par ${invitePar}` : '';

  const texte = [
    `Bonjour ${nom},`,
    '',
    `Vous avez été ajouté(e)${parQui} à l'espace « ${organisation} » sur Feyma.`,
    '',
    `Pour vous connecter, rendez-vous sur ${url} et saisissez cette adresse email (${email}).`,
    `Vous recevrez un code à usage unique par email : aucun mot de passe à retenir.`,
    '',
    'À bientôt,',
    "L'équipe Feyma",
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0c120f;line-height:1.55;font-size:15px">
      <p style="margin:0 0 14px">Bonjour ${nom},</p>
      <p style="margin:0 0 14px">Vous avez été ajouté(e)${parQui} à l'espace <b>« ${organisation} »</b> sur Feyma.</p>
      <p style="margin:0 0 20px">La connexion est <b>sans mot de passe</b> : vous saisissez votre email, et vous recevez un code à usage unique.</p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">
          Se connecter à Feyma
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#5b6469">Connectez-vous avec l'adresse <b>${email}</b>. Si vous n'êtes pas concerné(e), ignorez cet email.</p>
    </div>`;

  await getEmailProvider().send({
    to: email,
    subject: `Votre accès à « ${organisation} » sur Feyma`,
    text: texte,
    html,
  });
}
