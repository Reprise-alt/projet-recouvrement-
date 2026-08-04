import { FormEvent, ReactNode, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Icon } from './LandingIcons';

function IconRow({ icon, title, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; children: ReactNode }) {
  return (
    <div className="landing-icon-row">
      <div className="landing-icon-circle">
        <Icon name={icon} />
      </div>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

const PRODUCT_TABS = [
  {
    key: 'dashboard',
    label: 'Tableau de bord',
    img: '/landing/dashboard.jpg',
    title: 'Une vue d’ensemble en temps réel',
    points: [
      <><strong>Encours, retards, contentieux</strong> — les chiffres qui comptent, en un coup d’œil.</>,
      <><strong>Échelle de recouvrement</strong> — chaque client positionné automatiquement selon ses jours de retard.</>,
      <><strong>Signal de retard inhabituel</strong> — un client dont le retard dépasse nettement son propre historique de paiement est repéré avant même d’atteindre le palier suivant.</>,
      <><strong>Multi-société</strong> — vue consolidée ou filtrée par entité, en un clic.</>,
    ],
  },
  {
    key: 'fiche',
    label: 'Fiche client',
    img: '/landing/fiche-client.jpg',
    title: 'Toute l’information sur un client, au même endroit',
    points: [
      <><strong>Contacts multiples</strong> — comptabilité, direction, service juridique.</>,
      <><strong>Échéancier de paiement</strong> — un accord échelonné suivi tranche par tranche.</>,
      <><strong>Facturation adaptée</strong> — mensuelle, trimestrielle ou annuelle.</>,
    ],
  },
  {
    key: 'lettre',
    label: 'Automatisation',
    img: '/landing/lettre.jpg',
    title: 'De la relance à l’encaissement, sans ressaisie',
    points: [
      <><strong>Courrier généré</strong> — texte adapté au palier, prêt à l’envoi.</>,
      <><strong>Moyens de paiement intégrés</strong> — virement, Wave, Orange Money.</>,
      <><strong>Relance groupée</strong> — tout un palier relancé en un clic.</>,
    ],
  },
  {
    key: 'tracabilite',
    label: 'Traçabilité',
    img: '/landing/tracabilite.jpg',
    title: 'Un journal d’audit complet, échéanciers compris',
    points: [
      <><strong>Chaque action tracée</strong> — auteur et horodatage, pour le jour où un chiffre est contesté.</>,
      <><strong>Continuité d’équipe</strong> — un agent qui reprend un dossier voit tout l’historique.</>,
      <><strong>Accords de règlement suivis</strong> — jusqu’à solde.</>,
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    img: '/landing/reporting.jpg',
    title: 'Des comptes rendus qui se lisent comme un mémo, pas comme un export',
    points: [
      <><strong>Analyse rédigée automatiquement</strong> — points forts, actions positives, points de vigilance et recommandations générés à partir des vrais chiffres de la période, puis librement corrigés avant envoi.</>,
      <><strong>Comparaison de deux périodes</strong> — montant encaissé, délai, volume de relances, avec l’écart déjà calculé — de quoi trancher si l’usage de la plateforme fait une vraie différence.</>,
      <><strong>Export PDF / Excel aux couleurs de chaque entité</strong> — logo, mise en forme pro, performance par agent incluse — prêt pour le comité de direction.</>,
    ],
  },
];

const TYPE_LABELS: Record<string, string> = { investir: 'Investir', poc: 'Devenir client pilote', autre: 'Autre' };

function ContactForm({ initialType }: { initialType: 'investir' | 'poc' }) {
  const [type, setType] = useState<'investir' | 'poc' | 'autre'>(initialType);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [societe, setSociete] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api.post('/api/contact', { type, nom, email, societe, message });
      setStatus({ kind: 'ok', message: 'Message envoyé — nous revenons vers vous rapidement.' });
      setNom('');
      setEmail('');
      setSociete('');
      setMessage('');
    } catch (err) {
      setStatus({ kind: 'err', message: err instanceof ApiError ? err.message : 'Erreur d’envoi — réessayez.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="landing-form-card" id="contact" onSubmit={handleSubmit}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 4 }}>Nous contacter</h3>
      <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 20 }}>
        Investisseur ou PME intéressée par un POC — dites-nous en un mot ce que vous cherchez.
      </div>
      <div className="landing-form-type">
        {(['investir', 'poc', 'autre'] as const).map((t) => (
          <button type="button" key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="landing-form-row">
        <div className="field">
          <label>Nom</label>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="field">
        <label>Société (optionnel)</label>
        <input type="text" value={societe} onChange={(e) => setSociete(e.target.value)} />
      </div>
      <div className="field">
        <label>Message</label>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
      </div>
      <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
        {busy ? 'Envoi…' : 'Envoyer'}
      </button>
      {status && (
        <div className={`send-status ${status.kind === 'ok' ? 'ok' : 'err'}`} style={{ display: 'block', marginTop: 12 }}>
          {status.message}
        </div>
      )}
    </form>
  );
}

export function Landing() {
  const [tab, setTab] = useState(PRODUCT_TABS[0].key);
  const active = PRODUCT_TABS.find((t) => t.key === tab)!;
  const [ctaType, setCtaType] = useState<'investir' | 'poc'>('poc');

  function scrollToContact(type: 'investir' | 'poc') {
    setCtaType(type);
    requestAnimationFrame(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand-logo-row">
          <svg viewBox="0 0 100 100" width="26" height="26">
            <circle cx="50" cy="50" r="34" fill="none" stroke="#1D9E75" strokeWidth="13" strokeLinecap="round" strokeDasharray="168 46" transform="rotate(100 50 50)" />
          </svg>
          <div className="brand-wordmark" style={{ fontSize: 18 }}>
            <span className="w-olu">OLU</span> <span className="w-360">360</span>
          </div>
        </div>
        <div className="landing-nav-links">
          <a href="#produit">Produit</a>
          <a href="#marche">Marché</a>
          <a href="#modele">Modèle</a>
          <a href="#investisseurs">Investisseurs</a>
        </div>
        <div className="landing-nav-cta">
          <button onClick={() => scrollToContact('poc')}>Devenir client pilote</button>
          <a href="/">Se connecter</a>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="landing-hero-inner">
          <div>
            <div className="landing-hero-kicker">Recouvrement &amp; suivi contractuel — logiciel B2B</div>
            <h1>
              Olu <span className="accent">360</span>
            </h1>
            <p className="landing-hero-tag">
              La plateforme qui transforme le recouvrement de créances en un processus piloté, automatisé et mesurable — pensée pour les groupes et PME
              d’Afrique de l’Ouest.
            </p>
            <div className="landing-hero-actions">
              <a href="#investisseurs" className="primary">
                Voir pour les investisseurs
              </a>
              <a
                href="#contact"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToContact('poc');
                }}
              >
                Devenir client pilote
              </a>
            </div>
          </div>
          <div className="landing-shot">
            <img src="/landing/dashboard.jpg" alt="Tableau de bord Olu 360" />
          </div>
        </div>
      </header>

      <section className="landing-section">
        <div className="landing-eyebrow">Le problème</div>
        <h2 className="landing-h2">Le recouvrement reste l’angle mort des PME africaines</h2>
        <p className="landing-lede">
          Chaque agent gère ses relances dans son coin, sans échelle formalisée ni traçabilité — jusqu’à ce qu’une créance se perde dans les mailles du
          filet.
        </p>
        <div className="landing-icon-grid">
          <IconRow icon="fileText" title="Un suivi éclaté sur Excel">
            Aucune vue d’ensemble, aucune règle commune appliquée de façon fiable.
          </IconRow>
          <IconRow icon="alertTriangle" title="Des relances envoyées au hasard">
            Sans échelle formalisée, une créance qui traîne se perd — jusqu’à ce qu’il soit trop tard.
          </IconRow>
          <IconRow icon="clock" title="Le délai d’encaissement, un angle mort">
            Peu d’entreprises mesurent réellement leur DSO — la trésorerie se pilote à l’aveugle.
          </IconRow>
          <IconRow icon="fileText" title="Le suivi contractuel oublié">
            Renouvellements et révisions tarifaires passent inaperçus, faute d’alerte automatique.
          </IconRow>
        </div>
      </section>

      <section className="landing-section landing-section-tight">
        <div className="landing-eyebrow">La solution</div>
        <h2 className="landing-h2">Une échelle de recouvrement automatisée, de bout en bout</h2>
        <div className="landing-icon-grid">
          <IconRow icon="layers" title="8 paliers calculés automatiquement">
            De « à jour » à « huissier », chaque client repositionné en continu selon ses jours de retard réels.
          </IconRow>
          <IconRow icon="mail" title="Courriers générés et envoyés">
            Texte adapté au palier, moyens de paiement intégrés, envoi groupé en un clic.
          </IconRow>
          <IconRow icon="barChart" title="Reporting DSO pondéré">
            Délai d’encaissement suivi mois par mois, pondéré par le montant.
          </IconRow>
          <IconRow icon="users" title="Multi-société, multi-rôle">
            Chaque entité son propre compte d’envoi, ses propres agents — étanches entre elles.
          </IconRow>
          <IconRow icon="shield" title="Journal d’audit complet">
            Chaque correction, chaque suppression, tracée avec son auteur et son horodatage.
          </IconRow>
          <IconRow icon="creditCard" title="Échéanciers de paiement">
            Pour les comptes en difficulté, un accord de règlement suivi tranche par tranche.
          </IconRow>
        </div>
      </section>

      <section className="landing-section" id="produit">
        <div className="landing-eyebrow">Le produit</div>
        <h2 className="landing-h2">Cinq écrans, un seul système</h2>
        <div className="landing-tabs">
          {PRODUCT_TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="landing-tab-panel">
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 21, marginBottom: 16 }}>{active.title}</h3>
            <ul>
              {active.points.map((p, i) => (
                <li key={i} style={{ marginBottom: 10 }}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-shot">
            <img src={active.img} alt={active.label} />
          </div>
        </div>
      </section>

      <section className="landing-section-dark">
        <div className="landing-section-dark-inner">
          <div className="landing-eyebrow">Traction</div>
          <h2 className="landing-h2" style={{ color: '#fff' }}>
            Déjà en production — pas un prototype
          </h2>
          <div className="landing-stat-grid" style={{ marginTop: 36 }}>
            <div className="landing-stat">
              <div className="landing-stat-value">3</div>
              <div className="landing-stat-label">sociétés du groupe sur une seule plateforme (SORAM, SIS, IRIS Afrique)</div>
            </div>
            <div className="landing-stat">
              <div className="landing-stat-value">8</div>
              <div className="landing-stat-label">paliers de relance automatisés, de l’amiable au contentieux</div>
            </div>
            <div className="landing-stat">
              <div className="landing-stat-value">100%</div>
              <div className="landing-stat-label">web — accessible à tous les agents, aucune installation</div>
            </div>
          </div>
          <div className="landing-fact">
            Développée en continu avec les équipes recouvrement du groupe SORAM / SIS / IRIS : chaque fonctionnalité répond à un besoin remonté par les
            agents sur le terrain — pas une liste de fonctionnalités imaginées à froid.
          </div>
        </div>
      </section>

      <section className="landing-section" id="marche">
        <div className="landing-eyebrow">Le marché</div>
        <h2 className="landing-h2">Un besoin partagé par des milliers de PME ouest-africaines</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 760 }}>
          <IconRow icon="globe" title="Un problème universel">
            Toute entreprise qui facture à crédit — distribution, prestations B2B, industrie — affronte le même besoin de suivi et de relance structurée.
          </IconRow>
          <IconRow icon="fileText" title="Un marché sous-équipé">
            Excel et les rappels téléphoniques manuels restent la norme chez la majorité des PME et groupes familiaux de la région.
          </IconRow>
          <IconRow icon="creditCard" title="Conçu localement, pour ce contexte">
            Wave, Orange Money, FCFA, réalités réglementaires locales — pas un outil occidental adapté à la marge.
          </IconRow>
        </div>
      </section>

      <section className="landing-section landing-section-tight" id="modele">
        <div className="landing-eyebrow">Modèle économique</div>
        <h2 className="landing-h2">SaaS multi-tenant, simple à adopter</h2>
        <div className="landing-card-grid">
          <div className="landing-card">
            <div className="landing-card-icon">
              <Icon name="refresh" />
            </div>
            <h3>Abonnement mensuel</h3>
            <p>Par société ou par groupe, sans engagement long — un modèle pensé pour rester accessible aux PME.</p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon">
              <Icon name="checkCircle" />
            </div>
            <h3>Déploiement rapide</h3>
            <p>Import Excel des données existantes, aucune migration lourde — opérationnel en quelques jours.</p>
          </div>
          <div className="landing-card">
            <div className="landing-card-icon">
              <Icon name="creditCard" />
            </div>
            <h3>Tarification en cours de calibrage</h3>
            <p>Volontairement, pour l’ajuster au retour des premiers clients pilotes plutôt qu’à une hypothèse de bureau.</p>
          </div>
        </div>
      </section>

      <section className="landing-section-dark" id="investisseurs">
        <div className="landing-section-dark-inner">
          <div className="landing-eyebrow">Pour les fonds d’investissement</div>
          <h2 className="landing-h2" style={{ color: '#fff', maxWidth: '28ch' }}>
            Un outil de pilotage de portefeuille, pas seulement un produit isolé
          </h2>
          <p className="landing-lede" style={{ marginBottom: 32 }}>
            Un fonds qui suit plusieurs PME ouest-africaines peut aligner leur recouvrement sur une même plateforme — et obtenir des KPIs comparables entre
            participations, chose impossible avec des Excel ou des comptabilités hétérogènes.
          </p>
          <div className="landing-vc-grid">
            {[
              { icon: 'layers' as const, title: 'Un standard commun sur tout le portefeuille', text: 'Chaque participation garde ses données et ses agents, mais applique la même échelle de recouvrement.' },
              { icon: 'barChart' as const, title: 'Des KPIs recouvrement enfin comparables', text: 'DSO pondéré, encours, taux de contentieux — mesurés de la même façon sur chaque société.' },
              { icon: 'shield' as const, title: 'Un signal de risque avant le comité', text: 'Une créance qui dérive chez une participation se voit immédiatement.' },
              { icon: 'checkCircle' as const, title: 'Déjà prouvé en environnement multi-société', text: 'SORAM, SIS et IRIS Afrique tournent aujourd’hui sur la même plateforme.' },
            ].map((c) => (
              <div className="landing-cta-card" key={c.title}>
                <div className="landing-icon-circle" style={{ background: 'rgba(29,158,117,.22)', color: '#3ED999' }}>
                  <Icon name={c.icon} />
                </div>
                <h3 style={{ color: '#fff' }}>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-tight">
        <div className="landing-eyebrow">Prochaines étapes</div>
        <h2 className="landing-h2">Ce que la prochaine version rendra possible</h2>
        <div className="landing-icon-grid">
          <IconRow icon="refresh" title="Rapprochement bancaire automatique">
            Le relevé de compte matche seul les paiements reçus avec les factures ouvertes.
          </IconRow>
          <IconRow icon="link" title="Lien de paiement dans le mail">
            Règlement en un clic depuis le courrier de relance, confirmation automatique.
          </IconRow>
          <IconRow icon="link" title="Synchronisation ARTIS / MAPON">
            Facturation et géolocalisation de flotte connectées directement à la plateforme.
          </IconRow>
          <IconRow icon="mail" title="Canal WhatsApp">
            Relances là où les clients lisent vraiment leurs messages.
          </IconRow>
        </div>
      </section>

      <section className="landing-section-dark">
        <div className="landing-section-dark-inner">
          <div className="landing-eyebrow">La suite</div>
          <h2 className="landing-h2" style={{ color: '#fff' }}>
            Deux façons de nous aider à accélérer
          </h2>
          <div className="landing-cta-grid" style={{ marginTop: 32 }}>
            <div className="landing-cta-card">
              <div className="landing-icon-circle" style={{ background: 'var(--accent)', color: '#0E2A22' }}>
                <Icon name="rocket" />
              </div>
              <h3 style={{ color: '#fff' }}>Investir</h3>
              <p>
                Nous cherchons des investisseurs pour accélérer le développement produit et l’équipe technique — transformer un outil interne éprouvé en
                produit commercialisable à l’échelle de l’Afrique de l’Ouest. Montant et utilisation des fonds à discuter ensemble.
              </p>
              <button className="primary" onClick={() => scrollToContact('investir')}>
                Nous écrire pour investir
              </button>
            </div>
            <div className="landing-cta-card">
              <div className="landing-icon-circle" style={{ background: 'var(--accent)', color: '#0E2A22' }}>
                <Icon name="target" />
              </div>
              <h3 style={{ color: '#fff' }}>Devenir client pilote</h3>
              <p>
                Nous recherchons 2 à 3 PME ou groupes prêts à tester Olu 360 en conditions réelles sur leur propre recouvrement, avec un accompagnement
                direct de l’équipe fondatrice pendant le POC.
              </p>
              <button className="primary" onClick={() => scrollToContact('poc')}>
                Devenir client pilote
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-tight">
        <ContactForm key={ctaType} initialType={ctaType} />
      </section>

      <footer className="landing-footer">
        <div>Olu 360 — Florian Baudoin · f.baudoin@iris-afrique.com</div>
        <a href="/">Se connecter</a>
      </footer>
    </div>
  );
}
