// Helpers SEO pour une SPA : posent titre, méta, Open Graph, canonique et
// données structurées au rendu (Googlebot exécute le JS). Idempotents.

export const SITE_URL = 'https://feyma.olu360.com';

export function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export function setCanonical(url: string) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

// Injecte (ou remplace) un bloc JSON-LD identifié par `id`, pour pouvoir le
// mettre à jour sans en accumuler à chaque navigation.
export function setJsonLd(id: string, data: unknown) {
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.setAttribute('type', 'application/ld+json');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

// Pose le socle commun (title + description + OG + canonique) pour une page.
export function setPageSeo(opts: { title: string; description: string; path: string }) {
  const url = SITE_URL + opts.path;
  document.title = opts.title;
  setMeta('name', 'description', opts.description);
  setMeta('name', 'robots', 'index, follow');
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', 'Feyma — OLU 360');
  setMeta('property', 'og:locale', 'fr_SN');
  setMeta('property', 'og:title', opts.title);
  setMeta('property', 'og:description', opts.description);
  setMeta('property', 'og:url', url);
  setCanonical(url);
}
