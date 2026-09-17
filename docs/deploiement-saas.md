# Déploiement du SaaS self-service (production)

Le SaaS tourne comme un **stack isolé** (base + back-end + front dédiés), séparé
de la prod du groupe. Défini dans `render.yaml` : `olu360-saas-db`,
`olu360-saas-backend`, `olu360-saas-frontend`, `olu360-saas-relances-cron`.

## 1. Provisionner (Render)

1. Dans Render, **synchroniser le blueprint** du dépôt (Blueprints → le dépôt →
   *Apply*). Render crée la base, le back-end, le front et le cron SaaS. Les
   services du groupe existants ne sont **pas** modifiés.
2. Render **génère automatiquement** `OTP_SECRET`, `OTP_JWT_SECRET`,
   `SESSION_SECRET`, `RELANCES_CRON_SECRET` (rien à saisir).
3. Le back-end applique les migrations au démarrage (`prisma migrate deploy`) —
   la base SaaS est prête, isolation RLS incluse.

## 2. Email (Resend)

1. Créer un compte **Resend**.
2. Ajouter le domaine d'envoi **`mail.olu360.com`** et publier les
   enregistrements DNS fournis (SPF + DKIM) chez le registrar d'`olu360.com`.
   Attendre la vérification (délivrabilité).
3. Créer une **clé API** Resend et la renseigner dans Render :
   `olu360-saas-backend` → env `SMTP_PASS` = la clé API.

> Tant que le domaine n'est pas vérifié, mettre temporairement
> `EMAIL_PROVIDER=stub` sur le back-end : le **code de connexion s'affiche dans
> les logs Render** (permet de tester l'inscription sans email). Repasser à
> `smtp` une fois `mail.olu360.com` vérifié.

## 3. Domaines et URLs

1. **Front** : mapper **`essai.olu360.com`** sur `olu360-saas-frontend` (Render
   fournit le CNAME à créer).
2. Renseigner les deux URLs croisées :
   - `olu360-saas-backend` → env `CORS_ORIGIN` = `https://essai.olu360.com`
   - `olu360-saas-frontend` → env `VITE_API_URL` = URL du back-end
     (`https://olu360-saas-backend.onrender.com`, ou un domaine mappé), puis
     **redéployer le front** (variable de build).

## 4. Vérifier

- Ouvrir **`https://essai.olu360.com`** → écran d'inscription par code email.
- S'inscrire (email → code → profilage) : le code arrive par email (Resend), ou
  dans les logs Render en mode `stub`.
- Compléter la **fiche entreprise** (logo, coordonnées, email de réponse,
  instructions de paiement), personnaliser les **modèles de relance**, importer
  des créances, activer les relances.
- Le **cron** tourne chaque heure ; les relances partent dans la fenêtre
  8h–19h (Dakar), au nom du client.

## Notes

- Le back-end SaaS est en plan **`free`** (il s'endort après inactivité,
  démarrage à froid ~30 s). Passer à **`starter`** pour un service toujours
  actif en production.
- Le paiement des abonnements (Wave / Orange Money, §8.4) n'est pas requis pour
  l'inscription et les relances ; il sera ajouté au Lot 4.
- Le groupe (SORAM/IRIS/SIS) reste sur son stack actuel et migrera vers le SaaS
  plus tard (addendum §1.9), sans impact sur ce déploiement.
