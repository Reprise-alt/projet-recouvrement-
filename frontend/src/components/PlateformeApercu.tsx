// Aperçu illustré de la plateforme (page vitrine). Maquettes en HTML/CSS aux
// couleurs du produit, avec des DONNÉES D'EXEMPLE — jamais de données client
// réelles. S'adapte au thème clair/sombre via les tokens. Présenté comme un
// aperçu, pas comme des captures réelles.

const KPIS = [
  { label: 'Encours total', valeur: '12 450 000', unite: 'FCFA' },
  { label: 'À relancer cette semaine', valeur: '23', unite: 'clients' },
  { label: 'Recouvré (septembre)', valeur: '4 200 000', unite: 'FCFA', trend: '+12 %' },
];

// Encours par ancienneté (largeurs en %). Sévérité croissante 0-30 → +90.
const AGING = [
  { label: '0–30 j', pct: 45, color: 'var(--accent)' },
  { label: '30–60 j', pct: 28, color: 'var(--amber)' },
  { label: '60–90 j', pct: 17, color: 'var(--danger)' },
  { label: '+90 j', pct: 10, color: 'color-mix(in srgb, var(--danger), #000 24%)' },
];

const RELANCES = [
  { nom: 'Distribution Ndiaye', montant: '850 000 FCFA', palier: 'Rappel', tone: 'amber', retard: '+8 j' },
  { nom: 'Ets Fall & Fils', montant: '1 200 000 FCFA', palier: 'Mise en demeure', tone: 'danger', retard: '+42 j' },
  { nom: 'Sokhna Services', montant: '320 000 FCFA', palier: 'Avis d’échéance', tone: 'neutral', retard: 'J-2' },
];

const PALIERS = [
  { t: 'Avis d’échéance', etat: 'done' },
  { t: '1er rappel', etat: 'done' },
  { t: 'Relance ferme', etat: 'active' },
  { t: 'Mise en demeure', etat: 'todo' },
];

export function PlateformeApercu() {
  return (
    <section className="lp-section" id="apercu">
      <h2>L’interface, en un coup d’œil</h2>
      <p className="lp-section-sub">
        Un tableau de bord clair, des relances qui s’enchaînent toutes seules, un portail pour vos débiteurs. Aperçu de
        la plateforme — données d’exemple.
      </p>

      {/* Fenêtre principale : tableau de bord */}
      <div className="mock-frame">
        <div className="mock-bar">
          <span className="mock-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="mock-url">feyma.olu360.com/console</span>
        </div>
        <div className="mock-body">
          <div className="mock-head">
            <div>
              <div className="mock-h">Tableau de bord</div>
              <div className="mock-sub">Vue d’ensemble · septembre</div>
            </div>
            <span className="mock-user" aria-hidden="true">DN</span>
          </div>

          <div className="mock-kpis">
            {KPIS.map((k) => (
              <div key={k.label} className="mock-kpi">
                <div className="mock-kpi-label">{k.label}</div>
                <div className="mock-kpi-val">
                  {k.valeur} <span>{k.unite}</span>
                </div>
                {k.trend && <div className="mock-kpi-trend">{k.trend} vs août</div>}
              </div>
            ))}
          </div>

          <div className="mock-card">
            <div className="mock-card-h">Encours par ancienneté</div>
            <div className="mock-aging-bar">
              {AGING.map((a) => (
                <span key={a.label} style={{ width: `${a.pct}%`, background: a.color }} title={`${a.label} — ${a.pct} %`} />
              ))}
            </div>
            <div className="mock-legend">
              {AGING.map((a) => (
                <span key={a.label} className="mock-legend-item">
                  <i style={{ background: a.color }} />
                  {a.label} · {a.pct} %
                </span>
              ))}
            </div>
          </div>

          <div className="mock-card">
            <div className="mock-card-h">Clients à relancer</div>
            <div className="mock-table">
              {RELANCES.map((r) => (
                <div key={r.nom} className="mock-row">
                  <span className="mock-cell-nom">{r.nom}</span>
                  <span className="mock-cell-montant">{r.montant}</span>
                  <span className={`mock-pill mock-pill-${r.tone}`}>{r.palier}</span>
                  <span className="mock-cell-retard">{r.retard}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Duo : relances automatiques + portail débiteur */}
      <div className="mock-duo">
        <div className="mock-frame">
          <div className="mock-bar">
            <span className="mock-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="mock-url">Relances automatiques</span>
          </div>
          <div className="mock-body">
            <div className="mock-card-h" style={{ marginBottom: 4 }}>Ets Fall &amp; Fils · facture n°2043</div>
            <div className="mock-steps">
              {PALIERS.map((p) => (
                <div key={p.t} className={`mock-step mock-step-${p.etat}`}>
                  <span className="mock-step-dot" />
                  <span className="mock-step-t">{p.t}</span>
                  {p.etat === 'active' && <span className="mock-step-tag">en cours</span>}
                </div>
              ))}
            </div>
            <div className="mock-foot">Chaque palier part tout seul, par email, à votre nom — au bon moment.</div>
          </div>
        </div>

        <div className="mock-frame">
          <div className="mock-bar">
            <span className="mock-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="mock-url">Portail débiteur · lien sécurisé</span>
          </div>
          <div className="mock-body mock-portail">
            <div className="mock-portail-hi">Bonjour, Ets Fall &amp; Fils</div>
            <div className="mock-portail-label">Solde dû</div>
            <div className="mock-portail-montant">1 200 000 <span>FCFA</span></div>
            <div className="mock-portail-actions">
              <span className="mock-btn mock-btn-primary">Proposer un échéancier</span>
              <span className="mock-btn mock-btn-ghost">J’ai déjà payé</span>
            </div>
            <div className="mock-foot">Accès par lien unique, sans mot de passe.</div>
          </div>
        </div>
      </div>
    </section>
  );
}
