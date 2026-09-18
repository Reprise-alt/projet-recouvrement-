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
