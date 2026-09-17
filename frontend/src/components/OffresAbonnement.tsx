import { useState } from 'react';

// Bloc « offres + activation » réutilisable (bandeau d'essai en console ET
// écran de blocage). Montre les formules en mensuel ou annuel (2 mois offerts),
// met en avant la formule recommandée, et donne un contact clair pour activer.
// Prix alignés sur la vitrine (§8.2).

interface Formule {
  v: string;
  nom: string;
  // Prix mensuel HT en FCFA ; null = « sur devis ».
  prixMensuel: number | null;
  cible: string;
  points: string[];
}

const FORMULES: Formule[] = [
  {
    v: 'petite',
    nom: 'Petite structure',
    prixMensuel: 35000,
    cible: "Jusqu'à 50 débiteurs actifs",
    points: ['Relances automatiques de marque', 'Paliers & modèles personnalisables', 'Portail débiteur & reçus'],
  },
  {
    v: 'pme',
    nom: 'PME',
    prixMensuel: 65000,
    cible: "Jusqu'à 500 débiteurs actifs",
    points: ['Tout Petite structure', 'Plusieurs utilisateurs & entités', 'Reporting & suivi de performance'],
  },
  {
    v: 'grands_comptes',
    nom: 'Grands comptes',
    prixMensuel: null,
    cible: 'Au-delà de 500 débiteurs',
    points: ['Tout PME', 'Accompagnement dédié', 'Volumétrie & intégrations sur mesure'],
  },
];

// Annuel = 10 mois payés pour 12 → « 2 mois offerts » (~-17 %).
const MOIS_PAYES_ANNUEL = 10;

// Coordonnées d'activation. Centralisées ici pour être changées en un endroit.
const CONTACT_EMAIL = 'f.baudoin@iris-afrique.com';
const CONTACT_TEL = '+221 77 099 89 52';
const CONTACT_TEL_WA = '221770998952';

const fcfa = (n: number) => n.toLocaleString('fr-FR');

export function OffresAbonnement({ formuleRecommandee }: { formuleRecommandee?: string | null }) {
  const [annuel, setAnnuel] = useState(false);

  return (
    <div>
      {/* Bascule Mensuel / Annuel */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
          <button
            onClick={() => setAnnuel(false)}
            style={{
              padding: '6px 14px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
              background: annuel ? 'transparent' : 'var(--accent, #177f5e)',
              color: annuel ? 'var(--ink)' : '#fff',
            }}
          >
            Mensuel
          </button>
          <button
            onClick={() => setAnnuel(true)}
            style={{
              padding: '6px 14px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
              background: annuel ? 'var(--accent, #177f5e)' : 'transparent',
              color: annuel ? '#fff' : 'var(--ink)',
            }}
          >
            Annuel
          </button>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent, #177f5e)' }}>2 mois offerts</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {FORMULES.map((f) => {
          const reco = f.v === formuleRecommandee;
          const surDevis = f.prixMensuel === null;
          const prixAnnuel = f.prixMensuel != null ? f.prixMensuel * MOIS_PAYES_ANNUEL : null;
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
              <div style={{ marginBottom: 4 }}>
                {surDevis ? (
                  <>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>Sur devis</span>{' '}
                    <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>dès 250 000 FCFA HT / mois</span>
                  </>
                ) : annuel ? (
                  <>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>{fcfa(prixAnnuel!)}</span>{' '}
                    <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>FCFA HT / an</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>{fcfa(f.prixMensuel!)}</span>{' '}
                    <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>FCFA HT / mois</span>
                  </>
                )}
              </div>
              {!surDevis && annuel && (
                <div style={{ fontSize: 11, color: 'var(--accent, #177f5e)', fontWeight: 600, marginBottom: 6 }}>
                  soit {fcfa(f.prixMensuel!)}/mois — 2 mois offerts
                </div>
              )}
              <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--ink)', lineHeight: 1.6 }}>
                {f.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 10 }}>
        Prix hors taxes (TVA 18 %). SMS/WhatsApp par crédits. {annuel ? 'Engagement 12 mois.' : 'Sans engagement.'}
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
          Dites-nous la formule (mensuelle ou annuelle) qui vous convient : nous activons votre espace sous 24 h après
          confirmation du règlement. Vos données et réglages sont conservés.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
              'Activation de mon abonnement OLU 360',
            )}&body=${encodeURIComponent(
              `Bonjour,\n\nJe souhaite activer mon abonnement OLU 360.\nFormule souhaitée : \nEngagement : ${
                annuel ? 'annuel (2 mois offerts)' : 'mensuel'
              }\nEntreprise : \n\nMerci.`,
            )}`}
            style={{
              background: 'var(--accent, #177f5e)',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 13,
            }}
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
