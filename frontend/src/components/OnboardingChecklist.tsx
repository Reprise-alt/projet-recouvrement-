import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { FicheEntreprise } from './FicheEntreprise';
import { ImportPanel } from './ImportPanel';

// Démarrage guidé SaaS (addendum §4.3) : checklist d'activation branchée sur
// /api/onboarding, avec actions (voir le scénario, relance test, activer) et un
// aperçu de l'espace de démonstration. Écran plein page tant que l'utilisateur
// n'entre pas dans la console.

interface Etape {
  id: string;
  titre: string;
  description: string;
  fait: boolean;
}
interface Checklist {
  etapes: Etape[];
  progression: { faites: number; total: number; pourcentage: number };
  afficherChecklist: boolean;
}
interface DemoDebiteur {
  nom: string;
  contact: string;
  totalDu: number;
  factures: { numero: string; joursRetard: number; palier: number }[];
}
interface Demo {
  synthese: { debiteurs: number; encours: number; enAlerte: number };
  debiteurs: DemoDebiteur[];
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

export function OnboardingChecklist({ onEntrerConsole }: { onEntrerConsole: () => void }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState<Checklist | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [voirDemo, setVoirDemo] = useState(false);
  const [modal, setModal] = useState<'fiche' | 'fiche-paiement' | 'import' | null>(null);

  async function charger() {
    setData(await api.get<Checklist>('/api/onboarding'));
  }
  useEffect(() => {
    charger().catch(() => setData(null));
  }, []);

  async function action(id: string, path: string) {
    setBusy(id);
    try {
      if (id === 'relance_test') {
        const r = await api.post<{ apercu: { text: string }; checklist: Checklist }>(path);
        setApercu(r.apercu.text);
        setData(r.checklist);
      } else {
        setData(await api.post<Checklist>(path));
      }
    } catch {
      /* silencieux ; l'utilisateur peut réessayer */
    } finally {
      setBusy(null);
    }
  }

  async function ouvrirDemo() {
    setVoirDemo(true);
    if (!demo) setDemo(await api.get<Demo>('/api/onboarding/demo').catch(() => null));
  }

  // Chaque étape porte son action : ouverture d'un écran (fiche, import) ou appel
  // direct à l'API (scénario, relance test, activation).
  function cta(id: string): { label: string; onClick: () => void } | null {
    switch (id) {
      case 'fiche_entreprise':
        return { label: 'Compléter', onClick: () => setModal('fiche') };
      case 'instructions_paiement':
        return { label: 'Renseigner', onClick: () => setModal('fiche-paiement') };
      case 'import_creances':
        return { label: 'Importer', onClick: () => setModal('import') };
      case 'verifier_scenario':
        return { label: 'Voir le scénario', onClick: () => action('verifier_scenario', '/api/onboarding/scenario-vu') };
      case 'relance_test':
        return { label: "M'envoyer une relance test", onClick: () => action('relance_test', '/api/onboarding/relance-test') };
      case 'activer_relances':
        return { label: 'Activer les relances', onClick: () => action('activer_relances', '/api/onboarding/activer-relances') };
      default:
        return null;
    }
  }

  return (
    <div className="onb-wrap">
      <div className="onb-head">
        <span className="brand-mark">
          <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true">
            <circle cx="50" cy="50" r="34" fill="none" stroke="var(--accent)" strokeWidth="13" strokeLinecap="round" strokeDasharray="168 46" transform="rotate(100 50 50)" />
          </svg>
        </span>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 15 }}>OLU 360 — Recouvrement</b>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Bienvenue{user?.nom ? `, ${user.nom}` : ''} 👋</div>
        </div>
        <button onClick={() => logout()} style={{ fontSize: 12.5 }}>Déconnexion</button>
      </div>

      <div className="onb-card">
        <h1 style={{ margin: '0 0 4px' }}>Prêt en quelques minutes</h1>
        <div className="sub" style={{ marginBottom: 18 }}>Suivez ces étapes pour lancer vos premières relances.</div>

        {data && (
          <>
            <div className="onb-progress">
              <div className="onb-progress-bar"><span style={{ width: `${data.progression.pourcentage}%` }} /></div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                {data.progression.faites} / {data.progression.total} étapes · {data.progression.pourcentage}%
              </div>
            </div>

            <ol className="onb-steps">
              {data.etapes.map((e, i) => {
                const c = cta(e.id);
                return (
                  <li key={e.id} className={e.fait ? 'done' : ''}>
                    <span className="onb-check" aria-hidden="true">
                      {e.fait ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      ) : (
                        <span className="onb-num">{i + 1}</span>
                      )}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="onb-step-titre">{e.titre}</div>
                      <div className="onb-step-desc">{e.description}</div>
                    </div>
                    {!e.fait && c && (
                      <button className="onb-cta" disabled={busy === e.id} onClick={c.onClick}>
                        {busy === e.id ? '…' : c.label}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>

            {apercu && (
              <div className="onb-apercu">
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12.5 }}>Aperçu de la relance test (aussi envoyée à votre email)</div>
                <pre>{apercu}</pre>
              </div>
            )}
          </>
        )}

        <div className="onb-actions">
          <button onClick={ouvrirDemo}>Explorer un exemple (démo)</button>
          <button className="primary" onClick={onEntrerConsole}>Accéder à la console →</button>
        </div>
      </div>

      {voirDemo && (
        <div className="onb-card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Exemple — ce à quoi ressemblera votre console</h2>
            <button onClick={() => setVoirDemo(false)} style={{ fontSize: 12.5 }}>Fermer</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 14px' }}>Données fictives, jamais mêlées à vos vraies données.</div>
          {demo && (
            <>
              <div className="onb-demo-kpis">
                <div><b>{demo.synthese.debiteurs}</b><span>débiteurs</span></div>
                <div><b>{fmt(demo.synthese.encours)}</b><span>F CFA d'encours</span></div>
                <div><b style={{ color: 'var(--danger, #C0392B)' }}>{demo.synthese.enAlerte}</b><span>en alerte</span></div>
              </div>
              <table className="onb-demo-table">
                <thead><tr><th>Débiteur</th><th>Contact</th><th style={{ textAlign: 'right' }}>Dû</th><th style={{ textAlign: 'right' }}>Retard max</th></tr></thead>
                <tbody>
                  {demo.debiteurs.map((d) => (
                    <tr key={d.nom}>
                      <td><b>{d.nom}</b></td>
                      <td style={{ color: 'var(--ink-soft)' }}>{d.contact}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.totalDu)} F</td>
                      <td style={{ textAlign: 'right' }}>{Math.max(...d.factures.map((f) => f.joursRetard))} j</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
      {(modal === 'fiche' || modal === 'fiche-paiement') && (
        <FicheEntreprise
          focusPaiement={modal === 'fiche-paiement'}
          onClose={() => setModal(null)}
          onSaved={() => charger()}
        />
      )}
      {modal === 'import' && <ImportPanel onClose={() => setModal(null)} onImported={() => charger()} />}
    </div>
  );
}
