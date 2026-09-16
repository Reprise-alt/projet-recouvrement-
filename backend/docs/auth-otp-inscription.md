# Inscription & connexion self-service par email (OTP)

Authentification SaaS par **code à usage unique** envoyé par email (addendum §4),
qui **cohabite** avec l'auth du groupe (SSO socle / Supabase) : le middleware
accepte l'un ou l'autre.

## Flux

- `POST /api/auth/otp/request { email }` → génère un code à 6 chiffres, l'envoie
  par email, répond `{ ok: true }` (jamais d'indication sur l'existence du compte).
- `POST /api/auth/otp/verify { email, code, raisonSociale? }` :
  - code valide + **email inconnu** → **inscription** : création de l'`Organisation`
    (statut `essai`) + du compte **propriétaire** (`roleOrg = proprietaire`) ;
  - code valide + email connu → **connexion** ;
  - réponse `{ token, inscription, utilisateur }`. Le `token` (JWT HS256) est à
    renvoyer en `Authorization: Bearer <token>` sur les appels suivants.

Sécurité : le code n'est jamais stocké en clair (HMAC-SHA256 + secret serveur),
durée de vie 10 min, 5 tentatives max par code, 5 demandes max par email / 15 min.

## Rôles SaaS

Dimension `Utilisateur.roleOrg` (`proprietaire` / `administrateur` / `gestionnaire`
/ `lecture`), **orthogonale** aux rôles groupe (`RoleUtilisateur`). Les comptes
groupe historiques gardent `roleOrg = null`. `requireOrgRole` pourra être appliqué
progressivement sur les routes pour restreindre selon ce rôle.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `OTP_SECRET` | secret de hachage des codes OTP (repli : `SESSION_SECRET`) |
| `OTP_JWT_SECRET` | secret de signature des sessions SaaS (repli : `SESSION_SECRET`) |
| `EMAIL_PROVIDER` | `smtp` en production, sinon `stub` (dev/test : journalise, n'envoie rien) |
| `SMTP_HOST` / `SMTP_PORT` | serveur SMTP (port 587 par défaut) |
| `SMTP_SECURE` | `true` pour le port 465 (TLS implicite) |
| `SMTP_USER` / `SMTP_PASS` | identifiants SMTP |
| `EMAIL_FROM` | expéditeur (ex. `OLU 360 <no-reply@olu360.com>`) |

## Fournisseur d'email

Choix d'archi : l'envoi passe par un **SMTP standard** (`nodemailer`), donc
**n'importe quel fournisseur** se branche par la seule configuration, sans
changement de code (pas d'enfermement). Recommandés :

- **Resend** — meilleure délivrabilité + offre gratuite (~3 000 emails/mois), DX simple ;
- **Brevo** — alternative UE/francophone (aligné §11 protection des données).

Mise en route : vérifier le domaine d'envoi (SPF, DKIM, DMARC) chez le fournisseur,
créer des identifiants SMTP, renseigner les variables ci-dessus et `EMAIL_PROVIDER=smtp`.

## À brancher (au fil de l'eau)

- Enforcement fin des rôles (`requireOrgRole`) sur les routes du parcours SaaS.
- Domaine d'envoi propre au client (option formule PME/Grands comptes, §6).
