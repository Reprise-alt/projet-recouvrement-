# Addendum SaaS — Plateforme de recouvrement OLU 360

**Document :** addendum au fichier `cahier-des-charges-recouvrement.md`
**Porteur :** OLU 360 (Olu Ecosystems)
**Version :** 1.5 — septembre 2026
**Destinataire :** développement (Claude Code)

> **Changements v1.5 :** ajout de la spécification du calcul de la TVA et de la facturation (nouveau §8.6), champ `taux_tva` sur `organisations` (§3), mise à jour du tarif indicatif « Petite structure » (§8.2 : ~35 000 FCFA HT / mois).

---

## 0. Objet

La plateforme de recouvrement fonctionne aujourd'hui en interne pour le groupe (SORAM Afrique, IRIS Afrique, SIS). Cet addendum décrit les ajouts nécessaires pour la transformer en **SaaS self-service** destiné aux PME d'Afrique de l'Ouest (Sénégal en premier, Côte d'Ivoire ensuite).

**Positionnement : OLU 360 est éditeur du logiciel, pas prestataire de recouvrement.** L'entreprise qui souscrit recouvre elle-même ses propres créances avec l'outil. OLU 360 n'intervient jamais auprès des débiteurs, ne mandate personne et ne touche aucun fonds.

Tout ce qui est déjà spécifié dans le cahier des charges initial reste valable, notamment :

- l'échelle d'escalade à 8 niveaux ;
- l'import et la fusion de fichiers Excel ;
- la génération de courriers par entité.

Cet addendum **ajoute** des fonctions. En cas de contradiction, il prévaut sur le document initial pour la version SaaS.

---

## 1. Principes directeurs

1. **Démarrage 100 % automatique** : un prospect découvre l'offre, s'inscrit, importe ses créances, lance ses relances, choisit sa formule et paie en ligne sans aucune intervention d'OLU 360.
2. **Le client recouvre lui-même** : tous les messages et documents partent au nom et sous la responsabilité de l'entreprise cliente.
3. **Multi-entreprises** : chaque client dispose d'un espace strictement isolé.
4. **Pas de paiement en ligne des débiteurs en V1** : les débiteurs paient le client par ses moyens habituels. Les messages affichent les instructions de paiement du client ; les encaissements sont saisis ou importés dans la plateforme.
5. **Mobile d'abord** : l'interface client et le portail débiteur doivent être pleinement utilisables sur smartphone.
6. **Local par défaut** : français, devise XOF, fuseau `Africa/Dakar`, numéros au format international (+221, +225).
7. **Extensible par pays** : les modèles juridiques, les taxes et les fournisseurs sont paramétrés par pays.
8. **Prépayé, zéro crédit client** : sans paiement à l'échéance, la solution est coupée automatiquement (voir §8.5).
9. **Le groupe est le client n°1** : les entités du groupe migrent sur la version SaaS comme n'importe quel client.

---

## 2. Architecture

### 2.1 Stack proposée (à confirmer)

| Couche | Proposition |
|---|---|
| Front + API | Next.js (TypeScript) |
| Base de données | PostgreSQL avec Row Level Security |
| Authentification | Email ou téléphone + code à usage unique (OTP) |
| Tâches planifiées | File de tâches avec worker dédié (envois, facturation) |
| Stockage fichiers | Stockage objet compatible S3 (courriers PDF, pièces justificatives) |
| Génération PDF | Rendu HTML vers PDF côté serveur |

Si le prototype existant impose d'autres choix, les conserver et adapter cette section.

### 2.2 Isolation multi-entreprises

- Chaque table métier porte une colonne `organisation_id`.
- L'isolation est imposée **au niveau base de données** (Row Level Security), pas seulement dans le code applicatif.
- Aucun endpoint ne doit permettre de lire ou modifier les données d'une autre organisation. Des tests automatisés le vérifient.

### 2.3 Abstraction des fournisseurs

Les services externes passent par des interfaces communes, pour pouvoir changer de fournisseur sans toucher au métier :

- `ChannelProvider` : email, SMS, WhatsApp ;
- `BillingProvider` : paiement de l'abonnement OLU 360 (Wave, Orange Money, carte) ;
- `AssistantProvider` : assistant IA du support.

Le code doit rester ouvert à l'ajout ultérieur d'un `PaymentProvider` pour le paiement des débiteurs (V2), sans l'implémenter en V1.

---

## 3. Modèle de données (ajouts)

| Entité | Champs principaux |
|---|---|
| `organisations` | raison sociale, NINEA / identifiant fiscal, RCCM, pays, **taux de TVA applicable** (`taux_tva`, déterminé par le pays, paramétrable — voir §8.6 et §13), adresse, logo, signature, instructions de paiement, contact recouvrement, formule, secteur, outil de facturation déclaré, statut |
| `utilisateurs` | nom, email, téléphone, rôle, organisation, dernière connexion |
| `debiteurs` | nom ou raison sociale, contact, email, téléphone, WhatsApp, adresse, statut d'opposition |
| `creances` | débiteur, n° facture, date, échéance, montant TTC, montant restant, statut, étape en cours, pièces jointes |
| `scenarios` | nom, étapes ordonnées, actif/inactif, par défaut |
| `etapes` | niveau (1 à 8), délai (J+X après échéance), canal(aux), modèle de message, action spéciale |
| `envois` | créance, canal, contenu, statut (en attente, envoyé, délivré, lu, échec), coût |
| `encaissements` | créance, montant, moyen (virement, chèque, espèces, mobile money, autre), référence, date, source (saisie, import) |
| `promesses` | créance, montant promis, date promise, respectée oui/non |
| `litiges` | créance, motif, commentaire débiteur, statut |
| `abonnements` | organisation, formule, périodicité (mensuelle / annuelle), statut, date de renouvellement |
| `factures_olu` | organisation, période, abonnement, packs de crédits, dossiers contentieux facturés, TVA, statut |
| `credits` | organisation, solde SMS/WhatsApp, mouvements |
| `paiements_abonnement` | organisation, objet (abonnement, crédits, contentieux), montant, moyen (Wave, Orange Money, carte, virement), référence fournisseur, statut, date |
| `activation` | organisation, étape atteinte, date de chaque étape, source d'acquisition, messages de nurturing envoyés |
| `journal_audit` | utilisateur, action, objet, date, adresse IP |

### Rôles utilisateurs

| Rôle | Droits |
|---|---|
| Propriétaire | Tout, y compris abonnement et suppression du compte |
| Administrateur | Paramétrage, utilisateurs, scénarios |
| Gestionnaire | Import, suivi des créances, saisie des encaissements, relances manuelles |
| Lecture | Consultation et exports uniquement |

---

## 4. Inscription et activation automatique

**Objectif : aucun humain d'OLU 360 n'intervient entre la découverte du site et le premier abonnement payé.** Le prospect doit obtenir seul un premier résultat concret en moins de 10 minutes.

### 4.1 Page d'arrivée

- Proposition de valeur claire, vidéo de démonstration de 90 secondes.
- **Simulateur** : le visiteur saisit son encours et son nombre de factures impayées ; la page estime le temps gagné et la formule adaptée.
- **Tarifs publics** et comparatif des formules (voir §8).
- Bouton principal unique : « Essai gratuit 14 jours ». Aucun « contactez-nous » dans le parcours principal (réservé aux Grands comptes).
- Témoignages clients et chiffres issus de l'usage par le groupe.

### 4.2 Inscription (moins de 1 minute)

1. Téléphone ou email + code à usage unique (OTP). Aucun moyen de paiement demandé.
2. Trois questions : secteur d'activité, nombre approximatif de débiteurs en retard, outil de facturation utilisé.
3. Création immédiate de l'espace et entrée dans l'outil.

Les réponses servent à préremplir le scénario, les modèles et la formule recommandée.

### 4.3 Premier résultat dans l'outil

- **Espace de démonstration** pré-rempli (débiteurs et factures fictifs) consultable à tout moment, séparé des vraies données.
- **Checklist de démarrage** visible jusqu'à la première relance réelle :
  1. compléter la fiche entreprise (raison sociale, identifiants, logo, signature) ;
  2. renseigner les **instructions de paiement** affichées aux débiteurs ;
  3. importer ses créances ;
  4. vérifier le scénario proposé ;
  5. recevoir une relance test ;
  6. activer les relances.
- **Import assisté** : dépôt Excel ou CSV, modèle téléchargeable, correspondance automatique des colonnes, détection des doublons et lignes invalides, aperçu avant validation.
- **Relance test envoyée sur le téléphone et l'email de l'utilisateur**, pour qu'il voie exactement ce que recevront ses débiteurs.
- **Écrans vides pédagogiques** : chaque écran sans donnée explique l'action à faire et propose le bouton correspondant.
- Bulles d'aide et vidéos courtes (moins de 2 minutes) intégrées aux écrans clés.

### 4.4 Essai gratuit

- 14 jours, sans moyen de paiement.
- Fonctions de la formule PME débloquées pendant l'essai.
- Crédits SMS / WhatsApp offerts plafonnés (valeur à paramétrer) ; relances email illimitées.
- Pendant l'essai, les messages envoyés aux vrais débiteurs sont limités à un volume paramétrable pour éviter les abus.

### 4.5 Relances automatiques du prospect (nurturing)

Déclenchées selon le comportement réel, par email, SMS et WhatsApp :

| Moment | Condition | Message |
|---|---|---|
| J0 | Inscription | Bienvenue, vidéo de démarrage, lien vers la checklist |
| J1 | Aucun import | Tutoriel d'import + modèle Excel |
| J2 | Import fait, fiche entreprise incomplète | Rappel des champs manquants |
| J3 | Import fait, relances non activées | « Votre scénario est prêt, activez-le » |
| J7 | Tous | Bilan personnalisé : factures suivies, relances envoyées, encaissements saisis |
| J10 | Inactif depuis 5 jours | Proposition d'aide (assistant, vidéo) |
| J12 | Tous | Fin d'essai proche, formule recommandée selon son volume, lien de paiement |
| J14 | Non payé | Accès coupé, lien de paiement |
| J21 et J30 | Non payé | Rappels avec offre annuelle |

- Chaque message comporte un lien direct vers l'action attendue.
- Tout le séquençage est paramétrable en back-office.
- Les prospects peuvent se désabonner de ces messages.

### 4.6 Passage à l'abonnement

- Choix de la formule en ligne, avec recommandation automatique selon le volume importé.
- Paiement en ligne (voir §8.4) ; activation immédiate à la confirmation du paiement, sans validation humaine.
- Facture émise et envoyée automatiquement.
- À J14 sans paiement : accès coupé, relances arrêtées, export des données possible. Données conservées 90 jours puis supprimées après avertissement (même règle qu'au §8.5).

### 4.7 Support sans intervention humaine par défaut

- **Centre d'aide** : articles et vidéos courtes, recherche intégrée.
- **Assistant IA intégré** à l'outil, alimenté par la documentation, capable de guider dans les écrans et de répondre aux questions d'usage.
- Escalade vers un humain uniquement si l'assistant ne peut pas répondre ou si le client le demande (ticket créé automatiquement avec le contexte).
- L'assistant ne donne jamais de conseil juridique.

### 4.8 Pilotage de l'activation

Suivi des taux de passage à chaque étape : visite → inscription → import → relance test → relances activées → abonnement payé. Le tableau de bord du back-office met en évidence l'étape où les prospects décrochent.

---

## 5. Moteur de relances

### 5.1 Scénario par défaut

Basé sur l'échelle à 8 niveaux du cahier des charges initial. Chaque niveau définit :

- le délai de déclenchement (J+X après échéance) ;
- le ou les canaux ;
- le ton (courtois, ferme, formel) ;
- une action spéciale éventuelle (génération de mise en demeure PDF, suggestion de passage en contentieux).

### 5.2 Règles d'exécution

- Envois uniquement en jours ouvrés, dans une fenêtre horaire paramétrable (par défaut 8 h – 19 h, heure locale).
- Jours fériés paramétrables par pays.
- **Arrêt automatique** de la séquence si :
  - la créance est soldée (encaissement saisi ou importé) ;
  - une promesse de paiement est en cours (reprise automatique si la date est dépassée) ;
  - un litige est ouvert ;
  - le débiteur a fait opposition aux messages.
- Paiement partiel : la séquence continue sur le montant restant, avec un message adapté.
- Regroupement : un débiteur avec plusieurs factures reçoit un seul message récapitulatif par envoi.
- Relance manuelle et mise en pause possibles à tout moment depuis la fiche créance.

### 5.3 Modèles de messages

- Variables : `{debiteur}`, `{entreprise}`, `{numero_facture}`, `{montant_restant}`, `{echeance}`, `{jours_retard}`, `{instructions_paiement}`, `{lien_portail}`, `{contact_entreprise}`.
- Chaque message est émis **au nom de l'entreprise cliente**, comporte ses coordonnées et un moyen de s'opposer aux messages.
- Bibliothèque de modèles fournis par OLU 360, personnalisables par le client.
- Aperçu du rendu par canal avant enregistrement.

---

## 6. Canaux d'envoi

| Canal | Exigences |
|---|---|
| Email | Fournisseur transactionnel ; envoi depuis un sous-domaine dédié par défaut, domaine propre du client en option (SPF, DKIM, DMARC guidés) ; réponse renvoyée vers l'adresse du client ; suivi délivré / ouvert / rebond |
| SMS | Agrégateur local ; nom d'expéditeur au nom du client si possible ; accusés de réception |
| WhatsApp | WhatsApp Business API via un fournisseur agréé ; modèles de messages soumis à validation ; réponses entrantes visibles dans la fiche créance |

- Les SMS et WhatsApp consomment des **crédits** achetés par le client ou inclus dans sa formule.
- Les statuts sont mis à jour par webhooks.
- Un échec répété sur un canal bascule automatiquement vers le canal suivant du scénario.

---

## 7. Portail débiteur et encaissements

### 7.1 Portail débiteur

Page publique aux couleurs du client, accessible par un lien unique et sécurisé (sans création de compte) :

- détail de la ou des factures dues ;
- téléchargement de la facture si elle a été importée ;
- instructions de paiement du client ;
- **signaler un paiement effectué** (montant, date, moyen, justificatif) — à confirmer par le client ;
- **promettre une date de paiement** ou **proposer un échéancier** (soumis à validation du client) ;
- **contester** avec motif et pièce jointe ;
- s'opposer aux messages.

Le lien expire à la clôture de la créance.

### 7.2 Enregistrement des encaissements

- Saisie manuelle depuis la fiche créance.
- **Import Excel** d'une liste d'encaissements (export comptable ou relevé), avec lettrage automatique par n° de facture, puis par débiteur et montant ; les cas ambigus sont présentés pour validation.
- Validation en un clic des paiements signalés par les débiteurs.
- Tout encaissement met à jour le montant restant et arrête ou adapte la séquence immédiatement.

---

## 8. Abonnements et facturation OLU 360

### 8.1 Principe tarifaire

Le client choisit sa formule **en ligne**, seul. Le critère doit donc être simple, visible et mesurable par l'outil : le **volume de débiteurs actifs**.

- **Débiteur actif** : débiteur ayant au moins une créance ouverte (montant restant supérieur à zéro) à un moment du mois. Les débiteurs soldés ou archivés ne comptent pas ; ceux en contentieux comptent.
- **Mesure** : pic du mois, pour éviter les archivages/réimports destinés à rester sous le plafond.
- **Factures illimitées** et relances email illimitées dans toutes les formules.
- Les **SMS et WhatsApp** sont soumis à un volume inclus, car ils génèrent un coût réel à chaque envoi.
- Critère à valider : débiteurs actifs (recommandé) ou factures ouvertes.

### 8.2 Formules (montants et plafonds à valider)

| | Petite structure | PME | Grands comptes |
|---|---|---|---|
| Débiteurs actifs | Jusqu'à 50 | Jusqu'à 500 | Au-delà de 500 |
| Prix indicatif HT | ~35 000 FCFA / mois | ~65 000 FCFA / mois | Sur devis, à partir de ~250 000 FCFA / mois |
| Souscription | En ligne | En ligne | En ligne ou sur devis |
| Factures | Illimitées | Illimitées | Illimitées |
| Utilisateurs | 2 | Illimités | Illimités |
| Canaux | Email, SMS | Email, SMS, WhatsApp | Email, SMS, WhatsApp |
| Portail débiteur | Oui | Oui | Oui |
| Rôles et droits | Non (propriétaire + gestionnaire) | Oui | Oui |
| Tableau de bord | Essentiel | Complet | Complet + consolidé multi-sociétés |
| Plusieurs sociétés dans un compte | Non | Non | Oui |
| Domaine d'envoi propre | Non | Option | Oui |
| Module contentieux | Au dossier (~15 000 FCFA) | 2 dossiers / mois inclus, puis au dossier | Illimité |
| Volume SMS / WhatsApp inclus | À paramétrer | À paramétrer | À définir au devis |
| Support | Centre d'aide + assistant | + support prioritaire | Accompagnement dédié |
| Frais de mise en place | Aucun | Aucun | Facturés à part (import, paramétrage, formation) |

- **Mensuel prépayé** par défaut ; prépaiement 3, 6 ou 12 mois avec remise (12 mois : 2 mois offerts). C'est l'option à mettre en avant.
- Tous les prix, plafonds, volumes inclus, fonctions par formule et tarifs au dossier sont **paramétrables** en back-office, sans redéploiement.

### 8.3 Plafonds et notifications

- **Jauge de consommation** visible en permanence (débiteurs actifs, crédits SMS / WhatsApp).
- **Notification à 80 %** du plafond (in-app, email, SMS) avec présentation de la formule supérieure.
- **Notification à 100 %** avec lien de passage en un clic à la formule supérieure.
- **Tolérance** : dépassement accepté jusqu'à +10 % pendant 30 jours (paramétrable), avec rappels.
- Au-delà de la tolérance : les nouveaux débiteurs sont importés et suivis, mais **aucune nouvelle séquence de relance n'est lancée** pour eux tant que la formule n'est pas ajustée.
- **Les séquences déjà en cours ne sont jamais interrompues** pour une question de plafond.
- Crédits SMS / WhatsApp épuisés : notification, proposition d'achat d'un pack en un clic, et bascule automatique des étapes concernées sur l'email. Les relances ne s'arrêtent jamais pour cette raison.
- Si le volume baisse durablement, la formule inférieure est suggérée au renouvellement (jamais imposée).

### 8.4 Paiement en ligne de l'abonnement

**Wave et Orange Money sont les moyens de paiement principaux de l'abonnement**, complétés par la carte bancaire. Ils servent **uniquement** à payer OLU 360 ; ils ne sont pas utilisés pour les paiements des débiteurs (hors périmètre V1, voir §14).

- Intégration recommandée via un **agrégateur de paiement local** couvrant Wave, Orange Money et carte en une seule intégration (fournisseur à choisir), derrière l'interface `BillingProvider`.
- Confirmation par webhook → activation ou renouvellement immédiat, sans intervention humaine.
- **Renouvellement** : le mobile money ne permettant généralement pas le prélèvement automatique (à vérifier selon le fournisseur retenu), chaque échéance mensuelle déclenche un **lien de paiement** selon le cycle du §8.5. La carte peut être débitée automatiquement si le fournisseur le permet.
- Les prépaiements 3, 6 et 12 mois sont mis en avant pour limiter le nombre de renouvellements.
- Achat de packs de crédits, de dossiers contentieux et changement de formule : même parcours de paiement.
- Virement et chèque acceptés pour les Grands comptes, **uniquement en paiement d'avance**, enregistrés en back-office.

### 8.5 Prépaiement obligatoire et coupure automatique

**Règle absolue : OLU 360 ne fait jamais crédit.** Tout est payé d'avance : abonnement, packs de crédits, dossiers contentieux. Une entreprise de recouvrement ne doit avoir aucune créance client.

**Cycle mensuel (fonctionnement type Deezer) :**

| Moment | Action automatique |
|---|---|
| J-7 avant échéance | Lien de paiement envoyé (in-app, email, SMS, WhatsApp) |
| J-3 | Rappel |
| J-1 | Rappel : « vos relances s'arrêtent demain » |
| Jour d'échéance, fin de journée | **Coupure automatique** si le paiement n'est pas confirmé |

**Pendant la coupure :**
- aucune relance n'est envoyée aux débiteurs, les séquences sont mises en pause ;
- l'accès à l'outil est bloqué, sauf la page de paiement et l'**export des données** ;
- le portail débiteur affiche uniquement les coordonnées du client ;
- un rappel est envoyé à J+3, J+7, J+15 et J+30.

**Au paiement :** réactivation immédiate, sans intervention humaine. Les séquences reprennent à l'étape où elles s'étaient arrêtées (les étapes dont la date est dépassée sont envoyées au prochain créneau, une seule relance par débiteur).

**Sans paiement :** les données sont conservées 90 jours après la coupure, puis supprimées après deux avertissements (J+60 et J+85).

**Règles complémentaires :**
- Aucune période de grâce en V1 (paramétrable en back-office si nécessaire plus tard).
- Aucune facture « à payer » n'est émise : la facture est générée **après** paiement, à titre de justificatif.
- Prépaiement possible sur 3, 6 ou 12 mois, avec remise croissante (12 mois : 2 mois offerts), pour réduire les coupures.
- Carte bancaire : débit automatique à l'échéance si le fournisseur le permet ; en cas d'échec, même cycle de coupure.
- Grands comptes : même règle. Virement ou chèque accepté uniquement **avant** la période ; l'accès est activé à réception des fonds.
- Changement de formule : la montée en gamme est payée immédiatement au prorata ; la baisse prend effet à l'échéance suivante.
- Crédits SMS / WhatsApp et dossiers contentieux : achetés avant usage, jamais facturés après.

### 8.6 Calcul de la TVA et facturation

**Principe : tout le catalogue est raisonné et affiché en hors taxes (HT) ; la TVA est calculée automatiquement, jamais codée en dur dans un prix.**

- **Prix HT partout** : les prix des formules, des packs de crédits et des dossiers contentieux sont stockés et affichés HT (page d'arrivée §4.1, grille §8.2, écran de souscription §4.6). Le libellé « HT » est explicite à côté de chaque montant.
- **Taux par organisation** : chaque organisation porte un champ `taux_tva`, déterminé par son `pays` (§13) — **Sénégal : 18 %** ; Côte d'Ivoire : 18 % (à confirmer). Le taux est paramétrable en back-office et gère les cas d'exonération (taux 0 % avec justificatif). Aucun taux n'est écrit en dur dans le code.
- **Ventilation automatique au paiement** : à la souscription et à chaque paiement (renouvellement, changement de formule, achat de crédits ou de dossiers contentieux), le montant est ventilé automatiquement :

  `TVA = HT × taux_tva` &nbsp;·&nbsp; `TTC = HT + TVA`

  C'est le **TTC** qui est débité via `BillingProvider` (Wave / Orange Money / carte). L'écran de souscription (§4.6) affiche le détail **HT → TVA → TTC** avant paiement.
  *Exemple (Sénégal, Petite structure) : 35 000 HT + 6 300 TVA (18 %) = **41 300 FCFA TTC**.*
- **Ordre remise puis TVA** : le prépaiement pluri-mensuel (3 / 6 / 12 mois) et toute remise s'appliquent **sur le HT** ; la TVA est ensuite calculée sur le HT remisé. De même, le prorata d'une montée en gamme (§8.5) est calculé sur le HT puis taxé.
- **Facture conforme** : la facture (`factures_olu`), générée **après** paiement à titre de justificatif (§8.5), fait apparaître le montant HT, le taux et le montant de TVA, le montant TTC, et les **mentions fiscales obligatoires** — NINEA / identifiant fiscal et RCCM d'OLU 360 **et** du client, numéro de facture séquentiel, date, période. Conformité **DGID** (Sénégal) / **DGI** (Côte d'Ivoire) ; format à valider avec un comptable/fiscaliste avant mise en production (voir §17).
- **Cohérence des créances clients** : la TVA décrite ici concerne uniquement la facturation de l'abonnement OLU 360. Les montants des créances des clients envers leurs propres débiteurs (`creances.montant_ttc`) restent gérés par le client et hors de ce calcul.

---

## 9. Tableau de bord client

- Encours total et nombre de débiteurs.
- Répartition par ancienneté : 0–30 j, 31–90 j, 91–180 j, 181–365 j, 1–2 ans, plus de 2 ans.
- Montants encaissés sur la période, dont ceux encaissés après au moins une relance.
- Taux de recouvrement et délai moyen d'encaissement (DSO), avec évolution mensuelle.
- Efficacité par canal et par étape (quelle relance précède les paiements).
- Promesses en cours et promesses non tenues.
- Top débiteurs par montant dû.
- Exports Excel et PDF.

---

## 10. Module contentieux (outil)

Le module aide le client à préparer **lui-même** sa procédure. OLU 360 ne représente pas le client et ne traite aucun dossier.

Accès selon la formule (voir §8.2) : au dossier pour Petite structure, quota mensuel inclus puis au dossier pour PME, illimité pour Grands comptes. Un « dossier » est décompté à la génération du dossier PDF et du projet de requête pour une créance ou un débiteur ; les regénérations du même dossier ne sont pas refacturées.

- Bouton « Passer en contentieux » sur une créance ou un débiteur : la séquence amiable s'arrête.
- Checklist des pièces nécessaires (factures, bons de livraison, mise en demeure, preuves d'envoi).
- Constitution automatique du dossier à partir de l'historique de la plateforme (export PDF complet).
- Génération d'un projet de requête en injonction de payer selon l'Acte uniforme OHADA sur les procédures simplifiées de recouvrement. **Modèles à rédiger et valider par un juriste avant mise en production**, avec mention qu'ils ne constituent pas un conseil juridique.
- Suivi du statut saisi par le client : requête déposée, ordonnance, signification, exécution, clos.
- Champ libre pour renseigner l'avocat ou l'huissier choisi par le client.

---

## 11. Sécurité et conformité

- Chiffrement en transit (HTTPS) et au repos.
- Sauvegardes quotidiennes, restauration testée.
- Double authentification optionnelle.
- Journal d'audit complet (connexions, exports, modifications, envois).
- Export complet des données par le client ; suppression du compte avec purge différée.
- Gestion des oppositions : un débiteur opposé ne reçoit plus aucun message de ce client.
- CGU précisant que le client est seul responsable de ses relances, de leur contenu et de leur fondement ; OLU 360 fournit uniquement l'outil.
- Politique de confidentialité et accord de traitement des données (le client est responsable de traitement, OLU 360 est sous-traitant).
- **À valider par un avocat avant lancement** : obligations liées à la CDP (loi n° 2008-12 sur les données personnelles), mentions obligatoires des messages, rédaction des CGU, équivalents en Côte d'Ivoire.

---

## 12. Back-office OLU 360

- Liste des organisations : formule, statut (essai, actif, coupé, supprimé), date de la prochaine échéance, date d'inscription, étape d'activation, usage (débiteurs actifs, envois, connexions).
- Accès « se connecter en tant que » pour le support, **journalisé** et visible par le client.
- Gestion des formules, prix, fonctions par formule, volumes inclus, crédits, tarifs contentieux et fournisseurs par pays.
- Modification manuelle de la formule d'un client (Grands comptes, geste commercial), avec historique.
- Paramétrage des messages de nurturing, de l'essai et des seuils de notification.
- Suivi des paiements en ligne, des échecs de paiement, des coupures et des réactivations.
- Aucune fonction ne permet de laisser un client actif sans paiement, sauf geste commercial explicite, limité dans le temps et journalisé.
- Tickets escaladés par l'assistant IA.
- Enregistrement des règlements d'abonnement.
- Gestion des modèles de messages et juridiques fournis par défaut.
- Indicateurs SaaS : revenu mensuel récurrent, entonnoir d'activation (§4.8), conversion essai → payant, désabonnement, consommation de crédits.

---

## 13. Internationalisation

- Paramètre `pays` sur chaque organisation : SN au lancement, CI en lot 6.
- Par pays : taux de TVA, jours fériés, identifiants d'entreprise, fournisseurs SMS/WhatsApp, modèles juridiques.
- Interface en français ; structure prête pour l'anglais.

---

## 14. Hors périmètre de la V1

- Paiement en ligne par les débiteurs (Wave, Orange Money, carte) — envisagé en V2.
- Connecteurs directs aux logiciels comptables et aux banques (l'import Excel suffit au lancement).
- Application mobile native (le web mobile suffit).
- Appels vocaux automatisés.
- Scoring prédictif des débiteurs.

---

## 15. Plan de livraison

| Lot | Contenu | Résultat attendu |
|---|---|---|
| 1 | Multi-entreprises, authentification, rôles, inscription, checklist, import guidé, espace démo | Un prospect peut s'inscrire et importer ses créances seul |
| 2 | Moteur de relances, email et SMS, modèles | Les relances partent seules |
| 3 | Portail débiteur, saisie et import des encaissements, lettrage | Le suivi se met à jour sans ressaisie lourde |
| 4 | Formules par volume, plafonds et notifications, paiement Wave / Orange Money / carte, nurturing, prépaiement, coupure et réactivation automatiques | Démarrage et encaissement 100 % automatiques |
| 5 | WhatsApp, tableau de bord, back-office, page d'arrivée et simulateur, centre d'aide, assistant IA | Offre PME complète et acquisition autonome |
| 6 | Module contentieux, Côte d'Ivoire | Offre complète et ouverture régionale |

Les entités du groupe migrent à la fin du lot 3 et servent de premiers utilisateurs.

---

## 16. Critères d'acceptation

- Un nouvel utilisateur envoie sa première relance test en moins de 15 minutes.
- Aucun utilisateur ne peut accéder aux données d'une autre organisation (tests automatisés).
- Dès qu'un encaissement soldant une créance est enregistré, aucune relance ne part plus pour cette créance.
- Un import d'encaissements lettre automatiquement les lignes dont le n° de facture est reconnu.
- Aucun message n'est envoyé hors fenêtre horaire, à un débiteur opposé ou sur une créance en litige ou en contentieux.
- Tous les messages sont émis au nom du client, jamais au nom d'OLU 360.
- Un prospect peut aller de l'inscription à l'abonnement payé par Wave ou Orange Money sans aucune action humaine d'OLU 360.
- Sans paiement confirmé à l'échéance, l'accès est coupé et plus aucune relance ne part, sans intervention humaine.
- Un paiement après coupure réactive le compte dans la minute et les séquences reprennent sans doublon.
- OLU 360 n'émet jamais de facture à terme : l'encours client d'OLU 360 est toujours nul.
- L'abonnement est activé dans la minute suivant la confirmation du paiement.
- Les notifications de plafond partent à 80 % et à 100 % ; aucune séquence en cours n'est interrompue par un dépassement.
- Un solde de crédits épuisé bascule les envois SMS / WhatsApp sur l'email sans interrompre la séquence.
- La facture mensuelle OLU 360 est générée sans intervention.
- Toutes les pages clients et le portail débiteur sont utilisables sur un smartphone d'entrée de gamme.

---

## 17. Points à trancher avant le développement

1. Validation juridique : CGU, responsabilité du client, CDP, mentions obligatoires des messages, modèles contentieux.
2. Choix des fournisseurs : email, agrégateur SMS, fournisseur WhatsApp Business API.
3. Agrégateur de paiement pour l'abonnement (Wave, Orange Money, carte) : conditions, frais, délais, possibilité de paiement récurrent.
4. Prix définitifs, critère de volume (débiteurs actifs ou factures ouvertes), plafonds, tolérance, volumes SMS / WhatsApp inclus, packs de crédits et tarif au dossier contentieux.
5. Fournisseur de l'assistant IA et contenu du centre d'aide.
6. Stack définitive, en cohérence avec le prototype et la suite OLU 360.
7. Nom commercial et domaine de la solution.
8. Taux de TVA par pays et **format de facture conforme** (mentions DGID / DGI, ventilation HT / TVA / TTC, numérotation) validés avec un comptable / fiscaliste avant mise en production (voir §8.6).
