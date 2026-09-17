// Contenu éditorial de la vitrine (blog / actualités). Chaque article est une
// page publique indexable : c'est le levier « content marketing » du SEO —
// chaque sujet vise une recherche réelle (« délai de paiement PME », « mise en
// demeure OHADA », « relancer un client qui ne paie pas »).
//
// Le contenu est structuré en blocs (pas de HTML brut) pour un rendu propre et
// sûr, avec de vrais titres <h2> et paragraphes lus par les moteurs.
//
// Pour publier un nouvel article : ajouter une entrée en TÊTE de ARTICLES
// (le plus récent d'abord) et une <url> dans public/sitemap.xml.

export interface Bloc {
  type: 'p' | 'h2' | 'ul';
  texte?: string;
  items?: string[];
}

export interface Article {
  slug: string;
  titre: string;
  description: string; // méta-description / résumé de la carte
  dateISO: string; // AAAA-MM-JJ (pour <time> et JSON-LD)
  dateAffiche: string;
  lecture: number; // minutes
  blocs: Bloc[];
}

export const ARTICLES: Article[] = [
  {
    slug: 'reduire-delai-paiement-pme-senegal',
    titre: 'Réduire son délai de paiement : 5 leviers concrets pour une PME au Sénégal',
    description:
      "Trésorerie tendue à cause des impayés ? Voici cinq leviers simples pour raccourcir vos délais de paiement et encaisser plus vite, adaptés aux PME au Sénégal.",
    dateISO: '2026-09-15',
    dateAffiche: '15 septembre 2026',
    lecture: 5,
    blocs: [
      {
        type: 'p',
        texte:
          "Pour une PME, le délai de paiement n'est pas qu'un chiffre comptable : c'est la différence entre une trésorerie sereine et des fins de mois sous tension. Une facture payée en retard, c'est une vente déjà réalisée dont vous ne voyez pas encore la couleur. Bonne nouvelle : ce délai se pilote. Voici cinq leviers concrets, applicables dès cette semaine.",
      },
      { type: 'h2', texte: '1. Fixer des conditions de paiement claires, dès le devis' },
      {
        type: 'p',
        texte:
          "Un délai flou se traduit toujours par un paiement tardif. Indiquez la date d'échéance précise sur le devis, la facture et le bon de commande — pas « à 30 jours » mais « à régler avant le 15 ». Faites-la accepter par écrit. Un client qui a signé une échéance nette la respecte bien plus volontiers.",
      },
      { type: 'h2', texte: "2. Envoyer un avis d'échéance AVANT la date limite" },
      {
        type: 'p',
        texte:
          "La plupart des retards ne sont pas de la mauvaise foi : ce sont des oublis. Un simple rappel courtois quelques jours avant l'échéance suffit souvent à faire passer votre facture en haut de la pile. C'est le levier le plus rentable, et le plus négligé.",
      },
      { type: 'h2', texte: '3. Relancer tôt, systématiquement, et de façon graduée' },
      {
        type: 'p',
        texte:
          "Plus une créance vieillit, plus elle est difficile à recouvrer. Une relance dès le premier jour de retard, puis une escalade progressive (rappel amical, relance ferme, mise en demeure), donne de bien meilleurs résultats qu'une seule relance tardive. L'important n'est pas la sévérité : c'est la régularité.",
      },
      { type: 'h2', texte: '4. Faciliter le paiement au maximum' },
      {
        type: 'p',
        texte:
          "Chaque friction est un prétexte à retarder. Rappelez les coordonnées de paiement sur chaque relance, proposez un échéancier quand le montant est important, et laissez le client signaler facilement un règlement déjà effectué. Un débiteur qui peut agir en deux clics agit plus vite.",
      },
      { type: 'h2', texte: '5. Suivre son poste clients comme un tableau de bord' },
      {
        type: 'p',
        texte:
          "On ne pilote bien que ce que l'on mesure. Gardez en permanence sous les yeux : l'encours total, les créances par ancienneté (0-30, 30-60, 60-90, +90 jours) et les clients à relancer cette semaine. Cette visibilité transforme le recouvrement d'une corvée subie en un process maîtrisé.",
      },
      {
        type: 'p',
        texte:
          "Ces cinq leviers ont un point commun : la constance. C'est précisément ce qu'un outil de recouvrement automatise — les relances partent au bon moment, à votre nom, sans que vous ayez à y penser. Vous gardez la main sur la stratégie ; la machine s'occupe de la régularité.",
      },
    ],
  },
  {
    slug: 'mise-en-demeure-payer-ohada',
    titre: 'La mise en demeure de payer en zone OHADA : à quoi ça sert, comment la rédiger',
    description:
      "Avant le contentieux, la mise en demeure. Rôle, contenu et bonnes pratiques de la mise en demeure de payer pour recouvrer une créance en zone OHADA (Sénégal).",
    dateISO: '2026-09-10',
    dateAffiche: '10 septembre 2026',
    lecture: 6,
    blocs: [
      {
        type: 'p',
        texte:
          "Quand les relances amiables n'ont rien donné, la mise en demeure est l'étape charnière du recouvrement. C'est le dernier avertissement formel avant d'envisager une procédure. Bien utilisée, elle débloque une grande partie des dossiers sans jamais aller plus loin.",
      },
      { type: 'h2', texte: "Qu'est-ce qu'une mise en demeure ?" },
      {
        type: 'p',
        texte:
          "C'est un courrier formel par lequel vous sommez votre débiteur de payer sa dette dans un délai précis. Elle marque un changement de ton : on quitte le rappel courtois pour l'exigence écrite et datée. Elle constitue aussi une preuve — utile si le dossier devait ensuite être porté devant le juge.",
      },
      { type: 'h2', texte: 'Ce qu\'une mise en demeure doit contenir' },
      {
        type: 'ul',
        items: [
          "L'identité complète du créancier et du débiteur",
          "Le montant précis réclamé et son origine (numéro et date de facture)",
          "Le rappel des échéances déjà dépassées",
          "Un délai clair pour régulariser (souvent 8 à 15 jours)",
          "La mention explicite « mise en demeure de payer »",
          "L'annonce des suites envisagées en l'absence de paiement",
          "La date et la signature",
        ],
      },
      { type: 'h2', texte: 'Pourquoi elle est efficace' },
      {
        type: 'p',
        texte:
          "Un courrier formel, nominatif et daté change la perception du débiteur : la dette devient un risque concret, plus une simple ligne oubliée. Beaucoup de règlements interviennent précisément à ce stade, avant tout recours judiciaire.",
      },
      { type: 'h2', texte: 'Et après, si le débiteur ne paie toujours pas ?' },
      {
        type: 'p',
        texte:
          "En zone OHADA, le droit prévoit des procédures simplifiées de recouvrement — notamment l'injonction de payer — encadrées par l'Acte uniforme correspondant. C'est une voie plus rapide qu'un procès classique pour les créances certaines, liquides et exigibles. Constituer un dossier propre en amont (factures, preuves de livraison, relances, mise en demeure) est ce qui fait gagner du temps le moment venu.",
      },
      {
        type: 'p',
        texte:
          "Cet article est une information générale, pas un conseil juridique : pour un dossier précis, rapprochez-vous d'un professionnel du droit. En revanche, préparer et tracer chaque étape — relances, mise en demeure, pièces — est à votre portée dès aujourd'hui, et c'est exactement ce qu'un outil de recouvrement structure pour vous.",
      },
    ],
  },
  {
    slug: 'relancer-client-impaye-sans-casser-relation',
    titre: 'Relancer un client qui ne paie pas, sans casser la relation commerciale',
    description:
      "Réclamer son dû sans braquer un bon client, c'est possible. Ton, timing et méthode pour relancer un impayé tout en préservant la relation.",
    dateISO: '2026-09-05',
    dateAffiche: '5 septembre 2026',
    lecture: 4,
    blocs: [
      {
        type: 'p',
        texte:
          "La peur de « froisser » un client est la première raison pour laquelle les relances traînent. Pourtant, réclamer un paiement dû est parfaitement légitime — et se fait sans agressivité. Tout est une question de ton, de timing et de méthode.",
      },
      { type: 'h2', texte: 'Séparez la personne du problème' },
      {
        type: 'p',
        texte:
          "Un retard de paiement n'est pas une trahison personnelle. Adoptez un ton factuel et neutre : vous rappelez une échéance, vous n'accusez pas. « Sauf erreur de notre part, la facture n° X reste en attente » ouvre le dialogue, là où un reproche le ferme.",
      },
      { type: 'h2', texte: 'Relancez tôt — c\'est plus facile pour tout le monde' },
      {
        type: 'p',
        texte:
          "Contre-intuitif mais vrai : plus vous attendez, plus la relance est gênante. Relancer trois jours après l'échéance passe pour de la rigueur normale ; relancer après deux mois de silence crée un malaise. La régularité banalise la relance et la rend indolore.",
      },
      { type: 'h2', texte: 'Graduez le ton au fil des relances' },
      {
        type: 'p',
        texte:
          "Le premier rappel est cordial et suppose l'oubli. Le deuxième est plus ferme mais reste courtois. Ce n'est qu'après plusieurs tentatives sans réponse que le ton devient formel. Cette escalade progressive protège la relation avec les clients de bonne foi, tout en signalant votre sérieux aux mauvais payeurs.",
      },
      { type: 'h2', texte: 'Proposez une solution, pas seulement une réclamation' },
      {
        type: 'p',
        texte:
          "Un client en difficulté ponctuelle appréciera un échéancier. Offrir une porte de sortie transforme un rapport de force en résolution commune — et vous fait souvent récupérer une créance que la fermeté seule aurait bloquée.",
      },
      {
        type: 'p',
        texte:
          "Enfin, dépersonnalisez le processus : quand les relances partent automatiquement, au bon rythme et à votre nom, ce n'est plus « vous contre votre client ». C'est un suivi normal, systématique, que personne ne prend pour une attaque. La relation est préservée, et vous êtes payé.",
      },
    ],
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
