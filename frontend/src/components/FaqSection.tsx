import { useEffect } from 'react';
import { setJsonLd } from '../lib/seo';

// FAQ vitrine — lève les objections (le levier de conversion le plus efficace)
// ET pose des données structurées FAQPage (extraits enrichis Google).
// Accordéon natif <details>/<summary> : accessible, sans JavaScript.

interface QA {
  q: string;
  r: string;
}

const FAQ: QA[] = [
  {
    q: 'Mes données sont-elles en sécurité ?',
    r: "Oui. Chaque entreprise dispose d'un espace strictement isolé des autres (cloisonnement au niveau de la base de données), les échanges sont chiffrés, et vos données restent les vôtres : vous pouvez les exporter à tout moment.",
  },
  {
    q: 'Ça marche avec mon Excel ou mon logiciel actuel ?',
    r: "Oui. Vous importez votre fichier Excel ou CSV de suivi (clients, factures, échéances) en un clic, sans double saisie. Pas besoin de changer vos habitudes du jour au lendemain.",
  },
  {
    q: 'Combien de temps pour démarrer ?',
    r: "Une dizaine de minutes : vous créez votre compte, importez votre fichier, et les premières relances peuvent partir. L'essai gratuit de 14 jours vous laisse tout tester sans engagement.",
  },
  {
    q: 'Les relances partent-elles à mon nom ?',
    r: "Oui. Vos débiteurs reçoivent les relances à votre identité — votre nom d'entreprise, votre logo, votre adresse de réponse. Feyma reste invisible pour eux : c'est votre marque qui recouvre.",
  },
  {
    q: 'Suis-je engagé sur la durée ?',
    r: "Non. L'abonnement est sans engagement et prépayé : vous payez au mois (ou à l'année avec 2 mois offerts) et vous arrêtez quand vous voulez. Aucune carte bancaire n'est requise pour l'essai.",
  },
  {
    q: 'Et si un client conteste ou demande un délai ?',
    r: "Chaque débiteur dispose d'un portail sécurisé où il peut consulter sa dette, proposer un échéancier ou signaler un paiement déjà effectué. Vous gardez la main sur ce que vous acceptez, et si l'amiable échoue, vous préparez le contentieux sur la même plateforme.",
  },
  {
    q: 'Feyma fonctionne-t-il en dehors du Sénégal ?',
    r: "Oui. Feyma est pensé pour toute la zone UEMOA et le cadre juridique OHADA : facturation en francs CFA, paiements par chèque et Mobile Money, et procédures de recouvrement alignées sur le droit des affaires en vigueur. Il s'adresse aux entreprises du Sénégal, de Côte d'Ivoire et des autres pays de la région.",
  },
  {
    q: 'Mes débiteurs peuvent-ils payer par Wave ou Orange Money ?',
    r: "Oui. Vos moyens de paiement mobile (Wave, Orange Money, Julaya) s'affichent directement dans les relances et dans le portail débiteur, avec le montant dû prérempli. Le client paie en un clic, sans quitter le message.",
  },
  {
    q: 'Comment fonctionne le scan de chèques ?',
    r: "Vous déposez un lot de chèques (photo ou PDF) : Feyma lit le montant et l'émetteur de chaque chèque, rapproche automatiquement la facture correspondante — même lorsqu'un chèque règle la somme de plusieurs factures — et la marque « payée ». Votre agent n'a plus qu'à valider d'un clic.",
  },
  {
    q: 'Puis-je gérer plusieurs sociétés dans un seul compte ?',
    r: "Oui. Feyma est multi-sociétés : vous pilotez plusieurs entités depuis un même compte, avec des rôles (propriétaire, gestionnaire, lecture) et des accès par entité, et un tableau de bord consolidé selon votre formule.",
  },
  {
    q: 'Que se passe-t-il si l’amiable ne suffit pas ?',
    r: "Feyma prépare le contentieux dans le cadre OHADA : mise en demeure, commandement de payer, requête en injonction de payer, décompte de créance et bordereau de pièces. Une console dédiée permet à votre avocat ou huissier de suivre les dossiers que vous lui confiez, toutes sociétés confondues.",
  },
];

export function FaqSection() {
  useEffect(() => {
    setJsonLd('ld-json-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.r },
      })),
    });
  }, []);

  return (
    <section className="lp-section" id="faq">
      <h2>Vos questions, nos réponses.</h2>
      <p className="lp-section-sub">Tout ce qu'on nous demande avant de se lancer.</p>
      <div className="faq-list">
        {FAQ.map((item) => (
          <details key={item.q} className="faq-item">
            <summary>
              {item.q}
              <svg className="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="faq-answer">{item.r}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
