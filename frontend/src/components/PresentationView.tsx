import { useEffect, useState } from 'react';
import { ContactRappelModal, SujetContact } from './ContactRappelModal';
import { PlateformeApercu } from './PlateformeApercu';
import { FaqSection } from './FaqSection';
import { FeymaBrand } from './FeymaLogo';

// Page d'arrivée publique (addendum §4.1) + tarifs (§8.2). Aucune authentification.
// Sert de PAGE D'ACCUEIL (racine) en mode SaaS ET sur /presentation. Le CTA
// renvoie vers l'inscription self-service. Prix indicatifs HT, ajustables en
// back-office.

const CTA = '/inscription';

// Coordonnées publiques (NAP — Name/Address/Phone). Doivent rester IDENTIQUES
// partout (vitrine, fiche Google, annuaires) : Google recoupe ces mentions pour
// juger de la fiabilité locale d'un établissement.
const SITE_URL = 'https://feyma.olu360.com';
const NAP = {
  nom: 'Feyma — OLU 360',
  rue: 'Amitié 3, École de Police',
  ville: 'Dakar',
  pays: 'SN',
  telAffiche: '+221 77 099 89 52',
  telE164: '+221770998952',
  email: 'f.baudoin@iris-afrique.com',
};

// Pose ou met à jour une balise <meta> (par name ou property) de façon idempotente.
function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

// SEO : titre, description, Open Graph, canonique et données structurées injectés
// au rendu (SPA). Googlebot exécute le JS, donc ces balises sont lues au crawl.
// Ciblage local « recouvrement Dakar / Sénégal ». À faire indexer via Search
// Console + fiche Google Business.
function useSeo() {
  useEffect(() => {
    const title = 'Feyma — Logiciel de recouvrement de créances à Dakar, Sénégal | OLU 360';
    const desc =
      'Feyma (OLU 360) : logiciel de recouvrement de créances à Dakar, au Sénégal. Relances automatiques par email à votre nom, paliers personnalisables, portail débiteur et contentieux. Zone OHADA, francs CFA. Essai gratuit 14 jours.';

    document.title = title;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', 'index, follow');

    // Open Graph / partage social
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', 'Feyma — OLU 360');
    setMeta('property', 'og:locale', 'fr_SN');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', SITE_URL + '/');

    // URL canonique (évite le contenu dupliqué entre domaines)
    let canon = document.head.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement('link');
      canon.setAttribute('rel', 'canonical');
      document.head.appendChild(canon);
    }
    canon.setAttribute('href', SITE_URL + '/');

    // Données structurées JSON-LD : établissement local + application logicielle.
    // Aide Google à comprendre « éditeur de logiciel de recouvrement à Dakar ».
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': ['Organization', 'LocalBusiness'],
          '@id': SITE_URL + '/#organisation',
          name: NAP.nom,
          url: SITE_URL,
          email: NAP.email,
          telephone: NAP.telE164,
          address: {
            '@type': 'PostalAddress',
            streetAddress: NAP.rue,
            addressLocality: NAP.ville,
            addressCountry: NAP.pays,
          },
          areaServed: [
            { '@type': 'City', name: 'Dakar' },
            { '@type': 'Country', name: 'Sénégal' },
          ],
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Feyma',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description:
            'Logiciel de recouvrement de créances : relances automatiques, paliers, portail débiteur et contentieux.',
          url: SITE_URL,
          publisher: { '@id': SITE_URL + '/#organisation' },
          offers: { '@type': 'Offer', price: '35000', priceCurrency: 'XOF' },
        },
      ],
    };
    let script = document.getElementById('ld-json-feyma');
    if (!script) {
      script = document.createElement('script');
      script.id = 'ld-json-feyma';
      script.setAttribute('type', 'application/ld+json');
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);
  }, []);
}

function Logo() {
  return <FeymaBrand size={28} />;
}

const ETAPES = [
  { n: 1, t: 'Importez votre fichier', d: 'Votre Excel ou CSV de suivi : clients, factures et échéances repris en un clic, sans double saisie.' },
  { n: 2, t: 'Les relances partent seules', d: 'Chaque créance suit une échelle de paliers — avis d’échéance, rappels, mise en demeure — par email, au bon moment, à votre nom.' },
  { n: 3, t: 'Vous encaissez plus vite', d: 'Vos débiteurs proposent un échéancier ou signalent un paiement via un lien sécurisé. Vous pilotez tout depuis un tableau de bord.' },
];

// Repères sectoriels (volontairement généraux et prudents — pas de fausse
// précision). À terme, à remplacer par les résultats réels SORAM / IRIS, plus
// crédibles et incontestables.
const STATS = [
  { n: '1 sur 4', t: "défaillances d'entreprises où les retards de paiement jouent un rôle (estimation sectorielle)." },
  { n: '90 jours', t: "au-delà de trois mois, une créance devient nettement plus difficile à recouvrer. Agir tôt, c'est encaisser." },
  { n: '24/7', t: 'vos relances partent au bon moment, jour et nuit, sans oubli — pendant que vous gérez votre activité.' },
];

const ENJEUX = [
  { t: 'La trésorerie d’abord', d: 'Une facture impayée, c’est une vente déjà réalisée mais pas encaissée. Trop d’encours, et c’est vous qui financez vos clients — parfois jusqu’à emprunter pour tourner.' },
  { t: 'Le temps perdu en relances', d: 'Rappeler chaque client, au bon moment, avec le bon ton : un travail chronophage, vite abandonné quand l’activité s’accélère. Les relances s’espacent, les retards s’installent.' },
  { t: 'La créance qui vieillit', d: 'Plus une facture traîne, moins elle a de chances d’être payée. Une relance dès l’échéance, systématique et tracée, change tout.' },
  { t: 'Du rappel au contentieux', d: 'Quand l’amiable ne suffit pas : mise en demeure puis commandement de payer, dans les règles OHADA. Autant l’avoir sur le même outil, dossier prêt.' },
];

const BENEFICES = [
  { t: 'Tout votre portefeuille en un écran', d: 'Encours, clients en alerte, à relancer cette semaine — classés par palier.' },
  { t: 'Relance automatique multicanal', d: 'Email inclus et illimité ; SMS et WhatsApp en option, depuis votre identité.' },
  { t: 'Portail débiteur', d: 'Vos clients consultent leur dette, proposent un échéancier, signalent un paiement.' },
  { t: 'Du rappel au contentieux', d: 'Générez un commandement de payer et préparez le dossier — sur la même plateforme.' },
];

const FORMULES = [
  {
    nom: 'Petite structure', prix: '35 000', unite: 'FCFA HT / mois', tagline: 'Jusqu’à 50 débiteurs actifs',
    points: ['Factures illimitées', 'Relances email illimitées', 'Email + SMS', 'Portail débiteur', '2 utilisateurs'],
    populaire: false,
  },
  {
    nom: 'PME', prix: '65 000', unite: 'FCFA HT / mois', tagline: 'Jusqu’à 500 débiteurs actifs',
    points: ['Tout « Petite structure »', 'Email + SMS + WhatsApp', 'Rôles et droits', 'Tableau de bord complet', '2 dossiers contentieux / mois inclus', 'Utilisateurs illimités'],
    populaire: true,
  },
  {
    nom: 'Grands comptes', prix: 'Sur devis', unite: 'à partir de 250 000 FCFA HT / mois', tagline: 'Au-delà de 500 débiteurs',
    points: ['Plusieurs sociétés dans un compte', 'Domaine d’envoi propre', 'Contentieux illimité', 'Tableau de bord consolidé', 'Accompagnement dédié'],
    populaire: false,
  },
];

// Témoignages clients (à faire valider par les intéressés avant diffusion).
const TEMOIGNAGES = [
  {
    citation:
      "Depuis qu'on est passés à Feyma, nos relances sont automatisées de bout en bout. On encaisse plus vite, et on a beaucoup moins de dossiers qui partent en contentieux — le process tourne tout seul, sans qu'on ait à y penser.",
    nom: 'Nicole Sikadi',
    poste: 'Directrice ADV',
    societe: 'SORAM',
    initiales: 'NS',
  },
  {
    citation:
      "L'automatisation des relances nous a fait gagner un temps fou. On peut enfin se concentrer sur les gros dossiers contentieux — ceux qui font vraiment la différence — et encaisser des sommes bien plus importantes. Un vrai gain de trésorerie, ressenti en moins de 3 mois.",
    nom: 'Gaëtan Goudeagbe',
    poste: 'Directeur ADV',
    societe: 'IRIS',
    initiales: 'GG',
  },
];

export function PresentationView() {
  useSeo();
  const [contact, setContact] = useState<SujetContact | null>(null);
  return (
    <div className="lp">
      {contact && <ContactRappelModal sujet={contact} onClose={() => setContact(null)} />}
      <header className="lp-nav">
        <Logo />
        <nav className="lp-nav-links">
          <a href="#tarifs">Tarifs</a>
          <a href="#faq">FAQ</a>
          <a href="/blog">Actualités</a>
          <a href={CTA}>Se connecter</a>
          <a className="lp-btn lp-btn-primary" href={CTA}>Essai gratuit</a>
        </nav>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-eyebrow">Logiciel de recouvrement de créances · Dakar, Sénégal</div>
        <h1>Reprenez la main sur vos impayés.</h1>
        <p className="lp-lead">
          Importez votre suivi, laissez les relances partir toutes seules — de l’avis d’échéance au contentieux — et
          encaissez plus vite. Sans changer vos habitudes.
        </p>
        <div className="lp-feyma-note">
          <b>Feyma</b>, « rends-moi mon argent » en wolof. Parce que votre argent doit vous revenir.
        </div>
        <div className="lp-hero-cta">
          <a className="lp-btn lp-btn-primary lp-btn-lg" href={CTA}>Démarrer l’essai gratuit — 14 jours</a>
          <button type="button" className="lp-btn lp-btn-ghost lp-btn-lg" onClick={() => setContact('demo')}>
            Demander une démo
          </button>
        </div>
        <div className="lp-proof">
          <span>Déjà utilisé par <b>SORAM</b>, <b>IRIS</b> et <b>SIS</b></span>
          <span className="lp-dot" />
          <span><b>−15 jours</b> de délai de recouvrement</span>
          <span className="lp-dot" />
          <span><b>−25 %</b> d’impayés</span>
        </div>
        <ul className="lp-reassurance">
          <li>Installé en 10 minutes</li>
          <li>Sans engagement</li>
          <li>Vos données restent les vôtres</li>
          <li>Sans carte bancaire</li>
        </ul>
      </section>

      {/* ENJEUX / POURQUOI */}
      <section className="lp-section" id="enjeux">
        <h2>Les impayés coûtent plus cher qu’on ne croit.</h2>
        <p className="lp-section-sub">
          Au Sénégal comme dans toute la zone OHADA, le retard de paiement pèse d’abord sur la trésorerie — puis sur la
          solidité de l’entreprise. Le recouvrement n’est pas une corvée de fin de mois : c’est un process qui se pilote.
        </p>
        <div className="lp-stats">
          {STATS.map((s) => (
            <div key={s.n} className="lp-stat">
              <div className="lp-stat-n">{s.n}</div>
              <div className="lp-stat-t">{s.t}</div>
            </div>
          ))}
        </div>
        <div className="lp-stat-src">
          Repères sectoriels généraux — vos résultats dépendent de votre portefeuille et de votre rigueur de relance.
        </div>
        <div className="lp-enjeux">
          {ENJEUX.map((e) => (
            <div key={e.t} className="lp-enjeu">
              <div className="lp-enjeu-t">{e.t}</div>
              <div className="lp-enjeu-d">{e.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="lp-section" id="comment">
        <h2>Trois étapes, dix minutes.</h2>
        <div className="lp-steps">
          {ETAPES.map((e) => (
            <div key={e.n} className="lp-step">
              <div className="lp-step-n">{e.n}</div>
              <div className="lp-step-t">{e.t}</div>
              <div className="lp-step-d">{e.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* BÉNÉFICES */}
      <section className="lp-section lp-section-soft">
        <h2>Tout ce qu’il faut pour être payé.</h2>
        <div className="lp-benefits">
          {BENEFICES.map((b) => (
            <div key={b.t} className="lp-benefit">
              <div className="lp-benefit-t">{b.t}</div>
              <div className="lp-benefit-d">{b.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* APERÇU DE LA PLATEFORME */}
      <PlateformeApercu />

      {/* TÉMOIGNAGES */}
      <section className="lp-section lp-section-soft" id="temoignages">
        <h2>Ils recouvrent avec Feyma.</h2>
        <div className="lp-temoignages">
          {TEMOIGNAGES.map((t) => (
            <figure key={t.nom} className="lp-temoignage">
              <blockquote>« {t.citation} »</blockquote>
              <figcaption>
                <span className="lp-temoignage-av" aria-hidden="true">{t.initiales}</span>
                <span>
                  <b>{t.nom}</b>
                  <small>{t.poste} · {t.societe}</small>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* TARIFS */}
      <section className="lp-section" id="tarifs">
        <h2>Un prix simple, prépayé.</h2>
        <p className="lp-section-sub">Prix hors taxes, sans engagement. Facturé au volume de débiteurs actifs. La TVA (18 %) est calculée automatiquement au moment de la souscription. Économisez 2 mois en paiement annuel.</p>
        <div className="lp-plans">
          {FORMULES.map((f) => (
            <div key={f.nom} className={`lp-plan${f.populaire ? ' lp-plan-pop' : ''}`}>
              {f.populaire && <div className="lp-plan-badge">Le plus choisi</div>}
              <div className="lp-plan-nom">{f.nom}</div>
              <div className="lp-plan-tagline">{f.tagline}</div>
              <div className="lp-plan-prix"><b>{f.prix}</b> <span>{f.unite}</span></div>
              <ul className="lp-plan-points">
                {f.points.map((p) => (
                  <li key={p}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    {p}
                  </li>
                ))}
              </ul>
              {f.prix === 'Sur devis' ? (
                <button
                  type="button"
                  className="lp-btn lp-btn-ghost"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setContact('rappel')}
                >
                  Être rappelé
                </button>
              ) : (
                <a className={`lp-btn ${f.populaire ? 'lp-btn-primary' : 'lp-btn-ghost'}`} href={CTA} style={{ width: '100%', justifyContent: 'center' }}>
                  Commencer
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="lp-note" style={{ textAlign: 'center' }}>
          Prix hors taxes · TVA 18 % ajoutée à la souscription · SMS / WhatsApp par crédits · module contentieux au dossier ou inclus selon la formule.
        </div>
      </section>

      {/* FAQ */}
      <FaqSection />

      {/* CTA FINAL */}
      <section className="lp-final">
        <h2>Moins d’impayés, moins d’efforts, plus de trésorerie.</h2>
        <div className="lp-hero-cta" style={{ marginBottom: 0 }}>
          <a className="lp-btn lp-btn-primary lp-btn-lg" href={CTA}>Créer mon compte gratuitement</a>
          <button type="button" className="lp-btn lp-btn-on-dark lp-btn-lg" onClick={() => setContact('demo')}>
            Demander une démonstration
          </button>
        </div>
      </section>

      <footer className="lp-footer">
        <Logo />
        <address style={{ fontStyle: 'normal', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
          <b>Feyma — OLU 360</b>, logiciel de recouvrement de créances à Dakar.
          <br />
          {NAP.rue}, {NAP.ville}, Sénégal · <a href={`tel:${NAP.telE164}`}>{NAP.telAffiche}</a> ·{' '}
          <a href={`mailto:${NAP.email}`}>{NAP.email}</a>
        </address>
        <span>© {new Date().getFullYear()} OLU 360 — Olu Ecosystems. Tous droits réservés.</span>
      </footer>
    </div>
  );
}
