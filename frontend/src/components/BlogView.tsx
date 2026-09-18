import { useEffect } from 'react';
import { ARTICLES, getArticle } from '../content/articles';
import { FeymaBrand } from './FeymaLogo';
import { SITE_URL, setJsonLd, setMeta, setPageSeo } from '../lib/seo';

// Blog / Actualités — pages publiques indexables (content marketing / SEO).
//   /blog          → liste des articles (BlogIndex)
//   /blog/<slug>   → article (ArticlePage)
// Aucune authentification. Partage l'univers visuel de la vitrine (classes lp-*)
// et ajoute quelques classes blog-* dédiées.

function Logo() {
  return <FeymaBrand size={28} />;
}

function Header() {
  return (
    <header className="lp-nav">
      <a href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Logo />
      </a>
      <nav className="lp-nav-links">
        <a href="/#tarifs">Tarifs</a>
        <a href="/blog">Actualités</a>
        <a className="lp-btn lp-btn-primary" href="/inscription">Essai gratuit</a>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <Logo />
      <span>© {new Date().getFullYear()} OLU 360 — Olu Ecosystems. Tous droits réservés.</span>
    </footer>
  );
}

// ---- Liste des articles (/blog) --------------------------------------------

export function BlogIndex() {
  useEffect(() => {
    setPageSeo({
      title: 'Actualités du recouvrement — conseils pour PME | Feyma OLU 360',
      description:
        'Conseils pratiques sur le recouvrement de créances, les délais de paiement et la relation client, pour les PME au Sénégal et en zone OHADA.',
      path: '/blog',
    });
    // Données structurées : liste d'articles (Blog).
    setJsonLd('ld-json-blog', {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Actualités du recouvrement — Feyma OLU 360',
      url: SITE_URL + '/blog',
      blogPost: ARTICLES.map((a) => ({
        '@type': 'BlogPosting',
        headline: a.titre,
        datePublished: a.dateISO,
        url: SITE_URL + '/blog/' + a.slug,
      })),
    });
  }, []);

  return (
    <div className="lp">
      <Header />
      <section className="lp-section" style={{ paddingTop: 32 }}>
        <h2>Actualités & conseils recouvrement</h2>
        <p className="lp-section-sub">
          Délais de paiement, relances, contentieux : nos conseils concrets pour être payé plus vite, sans casser la
          relation client.
        </p>
        <div className="blog-list">
          {ARTICLES.map((a) => (
            <a key={a.slug} className="blog-card" href={`/blog/${a.slug}`}>
              <div className="blog-card-meta">
                <time dateTime={a.dateISO}>{a.dateAffiche}</time> · {a.lecture} min de lecture
              </div>
              <h3 className="blog-card-titre">{a.titre}</h3>
              <p className="blog-card-desc">{a.description}</p>
              <span className="blog-card-lien">Lire l’article →</span>
            </a>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}

// ---- Article (/blog/<slug>) ------------------------------------------------

export function ArticlePage({ slug }: { slug: string }) {
  const article = getArticle(slug);

  useEffect(() => {
    if (!article) {
      setMeta('name', 'robots', 'noindex');
      document.title = 'Article introuvable | Feyma OLU 360';
      return;
    }
    setPageSeo({
      title: `${article.titre} | Feyma OLU 360`,
      description: article.description,
      path: `/blog/${article.slug}`,
    });
    setMeta('property', 'og:type', 'article');
    setJsonLd('ld-json-article', {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: article.titre,
      description: article.description,
      datePublished: article.dateISO,
      dateModified: article.dateISO,
      inLanguage: 'fr',
      mainEntityOfPage: SITE_URL + '/blog/' + article.slug,
      author: { '@type': 'Organization', name: 'Feyma — OLU 360' },
      publisher: { '@type': 'Organization', name: 'Feyma — OLU 360', url: SITE_URL },
    });
  }, [article]);

  if (!article) {
    return (
      <div className="lp">
        <Header />
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <h2>Article introuvable</h2>
          <p className="lp-section-sub">Cet article n’existe pas ou a été déplacé.</p>
          <a className="lp-btn lp-btn-ghost" href="/blog">← Retour aux actualités</a>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="lp">
      <Header />
      <article className="blog-article">
        <a className="blog-back" href="/blog">← Actualités</a>
        <div className="blog-card-meta" style={{ marginTop: 14 }}>
          <time dateTime={article.dateISO}>{article.dateAffiche}</time> · {article.lecture} min de lecture
        </div>
        <h1 className="blog-article-titre">{article.titre}</h1>
        <div className="blog-body">
          {article.blocs.map((b, i) => {
            if (b.type === 'h2') return <h2 key={i}>{b.texte}</h2>;
            if (b.type === 'ul')
              return (
                <ul key={i}>
                  {(b.items ?? []).map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              );
            return <p key={i}>{b.texte}</p>;
          })}
        </div>

        <div className="blog-cta">
          <h3>Passez de la théorie à la pratique.</h3>
          <p>Feyma automatise vos relances, à votre nom, du premier rappel au contentieux. Essai gratuit 14 jours.</p>
          <a className="lp-btn lp-btn-primary lp-btn-lg" href="/inscription">Démarrer l’essai gratuit</a>
        </div>
      </article>
      <Footer />
    </div>
  );
}
