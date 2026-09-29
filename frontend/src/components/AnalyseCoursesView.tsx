import { useState } from 'react';
import { buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import {
  AnalyseCoursesResponse,
  Coursier,
  CreneauReel,
  DecompteStatuts,
  Entite,
  TypeTacheCoursier,
} from '../api/types';
import { TACHE_TYPE_LABELS } from '../lib/constants';

interface Props {
  entityFilter: Entite | 'ALL';
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}
function fmtJourCourt(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}
function taux(d: DecompteStatuts): number {
  return d.total > 0 ? Math.round((d.faites / d.total) * 100) : 0;
}

const CRENEAU_LABELS: Record<CreneauReel, string> = {
  matin: 'Matin (avant 12h)',
  apres_midi: 'Après-midi (12h–17h)',
  soir: 'Soir (après 17h)',
  non_execute: 'Non exécutée',
};

const COL = {
  faites: 'var(--success)',
  reportees: 'var(--amber)',
  aFaire: 'var(--ink-soft)',
  annulees: '#c7ccd1',
};

// Barre segmentée : faites / reportées / à faire / annulées, proportionnelles au total.
function SegBar({ d }: { d: DecompteStatuts }) {
  const total = Math.max(1, d.total);
  const seg = (v: number, color: string, key: string) =>
    v > 0 ? <div key={key} style={{ width: `${(v / total) * 100}%`, background: color, height: '100%' }} /> : null;
  return (
    <div style={{ display: 'flex', width: '100%', height: 9, borderRadius: 5, overflow: 'hidden', background: 'var(--paper-2)' }}>
      {seg(d.faites, COL.faites, 'f')}
      {seg(d.reportees, COL.reportees, 'r')}
      {seg(d.aFaire, COL.aFaire, 'a')}
      {seg(d.annulees, COL.annulees, 'x')}
    </div>
  );
}

function Pastille({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--ink-soft)' }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: 'none' }} /> {label}
    </span>
  );
}

// Écran « Analyse des courses » : lecture claire des courses par coursier et par
// jour, avec la liste des courses reportées. Filtres croisés (type / coursier /
// créneau / période). Lecture seule — aucune course n'est modifiée ici.
export function AnalyseCoursesView({ entityFilter }: Props) {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [type, setType] = useState<'' | TypeTacheCoursier>('');
  const [coursierId, setCoursierId] = useState('');
  const [creneau, setCreneau] = useState<'' | CreneauReel>('');

  const coursiersRes = useResource<Coursier[]>('/api/taches/coursiers');
  const coursiers = coursiersRes.data ?? [];

  const query = buildQuery({
    from,
    to,
    entite: entityFilter,
    type: type || undefined,
    coursierId: coursierId || undefined,
    creneau: creneau || undefined,
  });
  const { data, loading, error } = useResource<AnalyseCoursesResponse>(from && to ? `/api/taches/analyse${query}` : null);

  const maxType = data ? Math.max(1, ...data.parType.map((r) => r.total)) : 1;
  const maxCreneau = data ? Math.max(1, ...data.parCreneau.map((r) => r.total)) : 1;
  const g = data?.global;
  const tauxFait = g ? taux(g) : 0;
  const filtresActifs = !!(type || coursierId || creneau);
  const unSeulJour = from === to;

  const setJour = (iso: string) => { setFrom(iso); setTo(iso); };
  const actif: 'auj' | 'hier' | 'mois' | '' =
    from === today() && to === today() ? 'auj'
    : from === yesterday() && to === yesterday() ? 'hier'
    : from === firstDayOfMonth() && to === today() ? 'mois'
    : '';

  return (
    <div className="table-card" style={{ padding: '18px 22px', marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Analyse des courses</div>

      {/* Raccourcis de période */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {([['auj', 'Aujourd’hui', () => setJour(today())], ['hier', 'Hier', () => setJour(yesterday())], ['mois', 'Ce mois', () => { setFrom(firstDayOfMonth()); setTo(today()); }]] as const).map(([k, label, on]) => (
          <button
            key={k}
            type="button"
            onClick={on}
            style={{
              padding: '6px 13px',
              borderRadius: 999,
              border: `1px solid ${actif === k ? 'var(--accent)' : 'var(--line, #e0e0e0)'}`,
              background: actif === k ? 'var(--accent)' : 'transparent',
              color: actif === k ? '#fff' : 'var(--ink-soft)',
              fontWeight: actif === k ? 600 : 500,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label>Du</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label>Au</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label>Type de course</label>
          <select value={type} onChange={(e) => setType(e.target.value as '' | TypeTacheCoursier)}>
            <option value="">Tous les types</option>
            {(Object.keys(TACHE_TYPE_LABELS) as TypeTacheCoursier[]).map((t) => (
              <option key={t} value={t}>{TACHE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Coursier</label>
          <select value={coursierId} onChange={(e) => setCoursierId(e.target.value)}>
            <option value="">Tous les coursiers</option>
            {coursiers.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
            <option value="__non_assignee__">Non assignées</option>
          </select>
        </div>
        <div>
          <label>Créneau (réalisé)</label>
          <select value={creneau} onChange={(e) => setCreneau(e.target.value as '' | CreneauReel)}>
            <option value="">Tous les créneaux</option>
            <option value="matin">{CRENEAU_LABELS.matin}</option>
            <option value="apres_midi">{CRENEAU_LABELS.apres_midi}</option>
            <option value="soir">{CRENEAU_LABELS.soir}</option>
            <option value="non_execute">{CRENEAU_LABELS.non_execute}</option>
          </select>
        </div>
        {filtresActifs && (
          <button type="button" onClick={() => { setType(''); setCoursierId(''); setCreneau(''); }}>
            Effacer les filtres
          </button>
        )}
      </div>

      {loading || !data ? (
        <div className="empty-state">Chargement…</div>
      ) : error ? (
        <div className="login-error" style={{ marginTop: 12 }}>{error}</div>
      ) : data.global.total === 0 ? (
        <div className="empty-state">
          <h3>Aucune course sur ces critères</h3>
          <p>Élargissez la période ou retirez un filtre.</p>
        </div>
      ) : (
        <>
          <div className="kpis" style={{ marginTop: 18, marginBottom: 10 }}>
            <div className="kpi">
              <div className="kpi-label">Total courses</div>
              <div className="kpi-value">{g!.total}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Faites</div>
              <div className="kpi-value success">{g!.faites}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Reportées</div>
              <div className="kpi-value amber">{g!.reportees}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Taux de réalisation</div>
              <div className="kpi-value" style={tauxFait < 80 ? { color: 'var(--amber)' } : undefined}>{tauxFait}%</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
            <Pastille color={COL.faites} label="Faites" />
            <Pastille color={COL.reportees} label="Reportées" />
            <Pastille color={COL.aFaire} label="À faire" />
            <Pastille color={COL.annulees} label="Annulées" />
          </div>

          {/* HERO — par coursier : qui a fait quoi, avec taux de réalisation */}
          <div className="section-title">Courses par coursier{unSeulJour ? ` — ${fmtJourCourt(from)}` : ''}</div>
          <table>
            <thead>
              <tr>
                <th style={{ width: '38%' }}>Coursier</th>
                <th>Réalisation</th>
                <th className="mono">Faites</th>
                <th className="mono">Reportées</th>
                <th className="mono">À faire</th>
                <th className="mono">Taux</th>
              </tr>
            </thead>
            <tbody>
              {data.parCoursier.map((r) => (
                <tr key={r.coursierId ?? 'non-assignee'}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 34, fontSize: 12, color: 'var(--ink-soft)' }} className="mono">{r.total}</span>
                      {r.coursierId ? <strong>{r.nom}</strong> : <span style={{ color: 'var(--ink-soft)' }}>{r.nom}</span>}
                    </div>
                  </td>
                  <td style={{ minWidth: 120 }}><SegBar d={r} /></td>
                  <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                  <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>{r.reportees}</td>
                  <td className="mono">{r.aFaire}</td>
                  <td className="mono" style={{ fontWeight: 600, color: taux(r) < 80 ? 'var(--amber)' : 'var(--success)' }}>{taux(r)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Courses reportées : la LISTE, pas juste un compteur */}
          <div className="section-title" style={{ marginTop: 22 }}>
            Courses reportées {data.reportees.length > 0 && <span style={{ color: 'var(--amber)' }}>({data.reportees.length})</span>}
          </div>
          {data.reportees.length === 0 ? (
            <div className="empty-state" style={{ padding: '14px 0' }}>
              <p>Aucune course reportée sur la période. 👍</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Prévue le</th>
                  <th>Reportée au</th>
                  <th>Type</th>
                  <th>Client / entité</th>
                  <th>Coursier</th>
                </tr>
              </thead>
              <tbody>
                {data.reportees.map((r, i) => (
                  <tr key={`${r.entite}-${r.prevueLe}-${i}`}>
                    <td className="mono" style={{ fontSize: 12 }}>{fmtJourCourt(r.prevueLe)}</td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--amber)' }}>→ {fmtJourCourt(r.reporteeAu)}</td>
                    <td>{TACHE_TYPE_LABELS[r.type] ?? r.type}</td>
                    <td>{r.clientNom ?? <span style={{ color: 'var(--ink-soft)' }}>{r.entite}</span>}</td>
                    <td>{r.coursierNom ?? <span style={{ color: 'var(--ink-soft)' }}>Non assignée</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Par jour */}
          {!unSeulJour && (
            <>
              <div className="section-title" style={{ marginTop: 22 }}>Par jour</div>
              <table>
                <thead><tr><th style={{ width: '30%' }}>Jour</th><th>Réalisation</th><th className="mono">Total</th><th className="mono">Faites</th><th className="mono">Reportées</th></tr></thead>
                <tbody>
                  {data.parJour.map((r) => (
                    <tr key={r.date}>
                      <td className="mono" style={{ fontSize: 12 }}>{fmtJourCourt(r.date)}</td>
                      <td style={{ minWidth: 120 }}><SegBar d={r} /></td>
                      <td className="mono">{r.total}</td>
                      <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                      <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>{r.reportees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Répartition secondaire : type + créneau */}
          <div className="section-title" style={{ marginTop: 22 }}>Par type de course</div>
          <table>
            <thead><tr><th style={{ width: '40%' }}>Type</th><th className="mono">Total</th><th className="mono">Faites</th><th className="mono">Reportées</th></tr></thead>
            <tbody>
              {data.parType.map((r) => (
                <tr key={r.type}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 8, borderRadius: 4, background: 'var(--paper-2)', overflow: 'hidden', flex: 'none' }}>
                        <div style={{ width: `${(r.total / maxType) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                      {TACHE_TYPE_LABELS[r.type] ?? r.type}
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                  <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>{r.reportees}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title" style={{ marginTop: 22 }}>Par créneau (heure de réalisation)</div>
          <table>
            <thead><tr><th style={{ width: '40%' }}>Créneau</th><th className="mono">Total</th><th className="mono">Faites</th></tr></thead>
            <tbody>
              {data.parCreneau.map((r) => (
                <tr key={r.creneau}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 8, borderRadius: 4, background: 'var(--paper-2)', overflow: 'hidden', flex: 'none' }}>
                        <div style={{ width: `${(r.total / maxCreneau) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                      <span style={r.creneau === 'non_execute' ? { color: 'var(--ink-soft)' } : undefined}>{CRENEAU_LABELS[r.creneau]}</span>
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
