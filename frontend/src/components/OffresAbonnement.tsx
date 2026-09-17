// Bloc « offres + activation » réutilisable (bandeau d'essai en console ET
// écran de blocage). Montre les formules, met en avant celle recommandée, et
// donne un contact clair pour activer. Prix alignés sur la vitrine (§8.2).

interface Formule {
  v: string;
  nom: string;
  prix: string;
  unite: string;
  cible: string;
  points: string[];
}

const FORMULES: Formule[] = [
  {
    v: 'petite',
    nom: 'Petite structure',
    prix: '35 000',
    unite: 'FCFA HT / mois',
    cible: "Jusqu'à 50 débiteurs actifs",
    points: ['Relances automatiques de marque', 'Paliers & modèles personnalisables', 'Portail débiteur & reçus'],
  },
  {
    v: 'pme',
    nom: 'PME',
    prix: '65 000',
    unite: 'FCFA HT / mois',
    cible: "Jusqu'à 500 débiteurs actifs",
    points: ['Tout Petite structure', 'Plusieurs utilisateurs & entités', 'Reporting & suivi de performance'],
  },
  {
    v: 'grands_comptes',
    nom: 'Grands comptes',
    prix: 'Sur devis',
    unite: 'dès 250 000 FCFA HT / mois',
    cible: 'Au-delà de 500 débiteurs',
    points: ['Tout PME', 'Accompagnement dédié', 'Volumétrie & intégrations sur mesure'],
  },
];

// Coordonnées d'activation. Centralisées ici pour être changées en un endroit.
const CONTACT_EMAIL = 'contact@olu360.com';
const CONTACT_TEL = '+221 77 099 89 52';
const CONTACT_TEL_WA = '221770998952';

export function OffresAbonnement({ formuleRecommandee }: { formuleRecommandee?: string | null }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {FORMULES.map((f) => {
          const reco = f.v === formuleRecommandee;
          return (
            <div
              key={f.v}
              style={{
                border: `1px solid ${reco ? 'var(--accent, #177f5e)' : 'var(--line)'}`,
                borderRadius: 12,
                padding: '16px 16px 14px',
                background: 'var(--surface)',
                position: 'relative',
                boxShadow: reco ? '0 0 0 1px var(--accent, #177f5e)' : 'none',
              }}
            >
              {reco && (
                <span
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: 14,
                    background: 'var(--accent, #177f5e)',
                    color: '#fff',
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 20,
                    textTransform: 'uppercase',
                    letterSpacing: '.04em',
                  }}
                >
                  Recommandé pour vous
                </span>
              )}
              <div style={{ fontWeight: 700, fontSize: 14 }}>{f.nom}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 8 }}>{f.cible}</div>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{f.prix}</span>{' '}
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{f.unite}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--ink)', lineHeight: 1.6 }}>
                {f.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 10 }}>
        Prix hors taxes (TVA 18 %). SMS/WhatsApp par crédits. Sans engagement.
      </div>

      <div
        style={{
          marginTop: 16,
          padding: '14px 16px',
          background: 'var(--paper-2, #f4f6f5)',
          border: '1px solid var(--line)',
          borderRadius: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Activer votre abonnement</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 10 }}>
          Dites-nous la formule qui vous convient : nous activons votre espace sous 24 h après confirmation du
          règlement. Vos données et réglages sont conservés.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            className="btn primary"
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
              'Activation de mon abonnement OLU 360',
            )}&body=${encodeURIComponent(
              'Bonjour,\n\nJe souhaite activer mon abonnement OLU 360.\nFormule souhaitée : \nEntreprise : \n\nMerci.',
            )}`}
            style={{ background: 'var(--accent, #177f5e)', color: '#fff', padding: '8px 14px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
          >
            Nous écrire ({CONTACT_EMAIL})
          </a>
          <a
            href={`https://wa.me/${CONTACT_TEL_WA}`}
            target="_blank"
            rel="noreferrer"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line)', textDecoration: 'none', fontSize: 13 }}
          >
            WhatsApp {CONTACT_TEL}
          </a>
        </div>
      </div>
    </div>
  );
}
