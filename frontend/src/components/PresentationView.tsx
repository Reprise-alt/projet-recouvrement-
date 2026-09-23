import { useEffect, useState } from 'react';
import { ContactRappelModal, SujetContact } from './ContactRappelModal';
import { PlateformeApercu } from './PlateformeApercu';
import { FaqSection } from './FaqSection';
import { FeymaBrand } from './FeymaLogo';
import { setFeymaFavicon } from '../lib/seo';

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
    setFeymaFavicon();
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
  { t: 'Relance automatique par email', d: 'Incluse et illimitée, à votre identité. SMS et WhatsApp à venir.' },
  { t: 'Portail débiteur', d: 'Vos clients consultent leur dette, proposent un échéancier, signalent un paiement.' },
  { t: 'Du rappel au contentieux', d: 'Générez un commandement de payer et préparez le dossier — sur la même plateforme.' },
];

// Fonctionnalités détaillées — le cœur du produit, décrit en clair. Contenu
// textuel riche : sert autant à convaincre qu'à faire comprendre l'outil aux
// moteurs (SEO, catégorisation des filtres web).
const FONCTIONNALITES = [
  { t: 'Relances automatiques multi-paliers', d: 'Chaque créance suit une séquence de relance qui s’enclenche toute seule dès l’échéance : avis d’échéance courtois, premier rappel, relance ferme, dernier rappel, puis bascule vers le contentieux. Vous ne saisissez plus rien — la plateforme envoie la bonne relance, au bon moment, au bon client.' },
  { t: 'Paliers entièrement personnalisables', d: 'Vous définissez vos propres délais (J+1, J+7, J+15…), le ton et le contenu de chaque message, palier par palier. Chaque entreprise pilote sa cadence de recouvrement selon son secteur et sa relation client.' },
  { t: 'Email de marque, à votre nom', d: 'Vos relances partent à votre identité — logo, raison sociale, adresse de réponse. Le débiteur répond directement chez vous ; Feyma reste invisible. Un compte à rebours vous indique quand part la prochaine salve.' },
  { t: 'Portail débiteur & règlement à l’amiable', d: 'Un lien sécurisé permet à votre client de consulter sa dette, de payer en un clic (Wave, Orange Money) ou de proposer un échéancier que vous acceptez d’un clic. L’amiable se règle sans coup de fil.' },
  { t: 'Rapprochement des paiements & scan de chèques', d: 'Scannez un lot de chèques (image ou PDF) : la plateforme lit le montant et l’émetteur, rapproche automatiquement la facture correspondante — même la somme de plusieurs factures — et la marque « payée ». Votre agent n’a plus qu’à valider.' },
  { t: 'Module contentieux OHADA', d: 'Quand l’amiable ne suffit plus, Feyma prépare le dossier dans le cadre OHADA : mise en demeure, commandement de payer, requête en injonction de payer, décompte de créance et bordereau de pièces. Une console dédiée permet à votre avocat ou huissier de suivre les dossiers qu’on lui confie.' },
  { t: 'Reporting & pilotage', d: 'Tableau de bord des encaissements, taux de recouvrement, délai moyen d’encaissement (DSO), balance âgée des créances. Un rapport mensuel peut être envoyé automatiquement par email pour suivre la performance sans y penser.' },
  { t: 'Multi-sociétés, rôles et paiement mobile', d: 'Gérez plusieurs sociétés dans un même compte, avec des rôles (propriétaire, gestionnaire, lecture) et des accès par entité. Les moyens de paiement mobile (Wave, Orange Money, Julaya) s’affichent directement dans les relances et le portail.' },
];

// Pour qui — personas et secteurs. Ancre le positionnement et enrichit le texte.
const POURQUI = [
  { t: 'PME & grandes entreprises', d: 'De la petite structure au grand compte multi-sociétés : dès que vous facturez à crédit en B2B et que des impayés traînent, Feyma automatise vos relances et raccourcit vos délais d’encaissement.' },
  { t: 'Services ADV & comptables', d: 'Les équipes administration des ventes et comptabilité clients gagnent des heures : plus de relances à la main, un portefeuille classé par palier, et le suivi de chaque envoi (envoyé, ouvert, réglé).' },
  { t: 'Cabinets d’avocats & huissiers', d: 'Une console partenaire dédiée : recevez les dossiers qu’on vous confie, toutes sociétés clientes confondues, avec décomptes, pièces et projets d’actes prêts à valider dans le cadre OHADA.' },
  { t: 'Tous les secteurs B2B', d: 'Distribution, services aux entreprises, BTP, santé, écoles et formation, industrie, logistique… Partout où le paiement se fait à échéance, souvent par chèque ou virement, Feyma s’adapte à votre cycle.' },
];

const FORMULES = [
  {
    nom: 'Petite structure', prix: '35 000', unite: 'FCFA HT / mois', tagline: 'Jusqu’à 50 débiteurs actifs',
    points: ['Factures illimitées', 'Relances email illimitées', 'Portail débiteur', 'Suivi & tableau de bord', '2 utilisateurs'],
    populaire: false,
  },
  {
    nom: 'PME', prix: '65 000', unite: 'FCFA HT / mois', tagline: 'Jusqu’à 500 débiteurs actifs',
    points: ['Tout ce qu’inclut « Petite structure »', 'Jusqu’à 5 utilisateurs', 'Reporting & suivi de performance', 'Gestion multi-entités', 'Module contentieux inclus'],
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
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#tarifs">Tarifs</a>
          <a href="#faq">FAQ</a>
          <a href="/blog">Actualités</a>
          {/* Bouton (lp-btn) pour rester visible sur mobile — la règle responsive
              masque les liens simples, pas les boutons. Un client existant doit
              toujours pouvoir se reconnecter depuis son téléphone. */}
          <a className="lp-btn lp-btn-ghost" href={CTA}>Se connecter</a>
          <a className="lp-btn lp-btn-primary" href={CTA}>Essai gratuit</a>
        </nav>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-eyebrow">Logiciel de recouvrement de créances · Dakar, Sénégal</div>
        <h1>Arrêtez de courir <span className="hl">après votre argent.</span></h1>
        <p className="lp-lead">
          Feyma relance vos impayés automatiquement — de l’avis d’échéance au contentieux, jour et nuit, à votre nom.
          Vous encaissez plus vite, sans changer vos habitudes.
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

      {/* FONCTIONNALITÉS DÉTAILLÉES */}
      <section className="lp-section" id="fonctionnalites">
        <h2>Le moteur de recouvrement, en détail.</h2>
        <p className="lp-section-sub">
          De l’avis d’échéance au contentieux OHADA, Feyma automatise chaque étape du recouvrement de vos créances B2B —
          relances, encaissement, rapprochement et suivi, sur une seule plateforme pensée pour l’Afrique de l’Ouest.
        </p>
        <div className="lp-benefits">
          {FONCTIONNALITES.map((f) => (
            <div key={f.t} className="lp-benefit">
              <div className="lp-benefit-t">{f.t}</div>
              <div className="lp-benefit-d">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* APERÇU DE LA PLATEFORME */}
      <PlateformeApercu />

      {/* POUR QUI */}
      <section className="lp-section" id="pour-qui">
        <h2>Pour qui est fait Feyma ?</h2>
        <p className="lp-section-sub">
          Pour toute entreprise qui facture à crédit en B2B et veut être payée à temps, ainsi que pour les professionnels
          du recouvrement qui l’accompagnent — au Sénégal et dans toute la zone UEMOA / OHADA.
        </p>
        <div className="lp-benefits">
          {POURQUI.map((p) => (
            <div key={p.t} className="lp-benefit">
              <div className="lp-benefit-t">{p.t}</div>
              <div className="lp-benefit-d">{p.d}</div>
            </div>
          ))}
        </div>
      </section>

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
          Prix hors taxes · TVA 18 % ajoutée à la souscription · module contentieux au dossier ou inclus selon la formule · SMS et WhatsApp à venir.
        </div>
      </section>

      {/* FAQ */}
      <FaqSection />

      {/* À PROPOS */}
      <section className="lp-section lp-section-soft" id="a-propos">
        <h2>À propos de Feyma</h2>
        <p className="lp-section-sub">
          Feyma est un logiciel de recouvrement de créances édité par <b>OLU 360</b>, basé à Dakar, au Sénégal. Son nom
          signifie « rends-moi mon argent » en wolof : c’est toute notre raison d’être.
        </p>
        <div className="lp-benefits">
          <div className="lp-benefit">
            <div className="lp-benefit-t">Pensé pour l’Afrique de l’Ouest francophone</div>
            <div className="lp-benefit-d">
              Feyma est conçu pour les réalités de la zone UEMOA et le cadre juridique OHADA : facturation en francs CFA,
              paiement par chèque et Mobile Money (Wave, Orange Money), et procédures de recouvrement (mise en demeure,
              injonction de payer) alignées sur le droit des affaires en vigueur au Sénégal et dans les pays membres.
            </div>
          </div>
          <div className="lp-benefit">
            <div className="lp-benefit-t">Un outil éprouvé sur le terrain</div>
            <div className="lp-benefit-d">
              La plateforme est née des besoins réels d’entreprises qui recouvrent au quotidien. Elle est déjà utilisée
              par des sociétés comme SORAM et IRIS pour automatiser leurs relances, réduire leurs délais d’encaissement
              et diminuer le volume de dossiers passant au contentieux.
            </div>
          </div>
          <div className="lp-benefit">
            <div className="lp-benefit-t">Vos données restent les vôtres</div>
            <div className="lp-benefit-d">
              Chaque entreprise dispose d’un espace strictement isolé, les échanges sont chiffrés, et vous pouvez exporter
              vos données à tout moment. Feyma reste invisible pour vos débiteurs : c’est votre marque qui recouvre.
            </div>
          </div>
        </div>
      </section>

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
