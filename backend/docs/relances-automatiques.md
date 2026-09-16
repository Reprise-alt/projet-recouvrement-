# Relances automatiques (addendum §5)

« Les relances partent seules. » Trois couches, séparées pour rester sûres et testables.

## 1. Décision — `lib/moteurRelances.ts` (pur)

Décide, pour un lot de clients à un instant donné, quelles relances doivent
partir, en appliquant les règles d'arrêt du §5.2 :

- client à jour → rien ;
- **une seule relance par palier** (on attend qu'il progresse) ;
- **promesse en cours** → suspension, avec **reprise automatique** dès que
  l'échéance promise est dépassée ;
- **litige** ou **opposition** → arrêt (priment sur tout).

`dansFenetreEnvoi` borne les envois aux **jours ouvrés, 8h–19h heure de Dakar**.

## 2. Exécution — `lib/executerRelances.ts` (IO)

À partir des relances dues : construit le message (réutilise `letters.ts` — la
ligne « Objet : … » devient le sujet, les modalités de paiement de
l'organisation sont ajoutées), l'envoie via l'`EmailProvider` configuré, puis
enregistre une `ActionRecouvrement` (ce qui fait sortir le client de la liste au
tour suivant).

- **Dry-run par défaut** : `executerRelancesTenant({ dryRun: true })` calcule ce
  qui partirait sans rien envoyer ni écrire.
- **Plafond amiable** : les paliers ≥ 6 (pénalités, commandement, contentieux)
  ne sont **jamais** envoyés automatiquement (`palier_manuel`) — action
  formelle/juridique manuelle (§5.1).
- Un client sans email est ignoré (`email_manquant`).

## 3. Déclenchement

- **`POST /api/relances/executer`** — session **administrateur**, tenant courant.
  `{ dryRun }` (défaut `true`), `{ forcerHorsFenetre }` (défaut `false`). Sert à
  simuler puis, en connaissance de cause, déclencher l'envoi du tenant.
- **`POST /api/cron/relances`** — **pas de session**, authentifié par l'en-tête
  `X-Cron-Secret` (= `RELANCES_CRON_SECRET`). Parcourt les organisations qui ont
  activé les relances (`relancesActivees`, compte non coupé) et exécute l'envoi
  réel pour **chacune dans son contexte tenant**. Exige `RLS_ENABLED=true` (sans
  RLS, les requêtes ne sont pas isolées → risque de doublons ; l'endpoint renvoie
  alors 503). Respecte la fenêtre d'envoi : le cron peut tourner chaque heure
  sans envoi nocturne.

### Ordonnanceur (production)

Configurer un **Render Cron Job** (ou tout ordonnanceur) qui, chaque heure en
journée, fait :

```
curl -fsS -X POST "$BACKEND_URL/api/cron/relances" -H "X-Cron-Secret: $RELANCES_CRON_SECRET"
```

## Aperçu (front)

L'onglet **« Relances à venir »** (`GET /api/relances/dues`) montre, en lecture
seule, ce qui partirait maintenant — à consulter avant d'activer l'envoi.

## À suivre

Les gabarits de messages sont pour l'instant ceux du groupe (`letters.ts`). La
personnalisation par tenant (§5.3 : modèles et variables propres à chaque
organisation) est une étape ultérieure.
