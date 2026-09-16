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
| `EMAIL_PROVIDER` | choix du fournisseur d'email transactionnel (défaut : `stub`) |

## À brancher (décisions §17)

- **Fournisseur email réel** : implémenter un `EmailProvider` (SMTP / Resend /
  SendGrid…) dans `src/lib/email/provider.ts` et le sélectionner via `EMAIL_PROVIDER`.
  Seul l'émetteur `stub` (journalisation, aucun envoi) est fourni.
- Enforcement fin des rôles (`requireOrgRole`) sur les routes, au fil de l'eau.
