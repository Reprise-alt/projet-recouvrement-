import { useState } from 'react';
import { buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import { AnalyseCoursesResponse, Coursier, CreneauReel, Entite, TypeTacheCoursier } from '../api/types';
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
function fmtJourCourt(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

const CRENEAU_LABELS: Record<CreneauReel, string> = {
  matin: 'Matin (avant 12h)',
  apres_midi: 'Après-midi (12h–17h)',
  soir: 'Soir (après 17h)',
  non_execute: 'Non exécutée',
};

// Barre de proportion réutilisée pour chaque ligne (part du total).
function Barre({ valeur, max, largeur = 70 }: { valeur: number; max: number; largeur?: number }) {
  return (
    <div style={{ width: largeur, height: 8, borderRadius: 4, background: 'var(--paper-2)', overflow: 'hidden', flex: 'none' }}>
      <div style={{ width: `${(valeur / Math.max(1, max)) * 100}%`, height: '100%', background: 'var(--accent)' }} />
    </div>
  );
}

// Écran « Analyse des courses » : nombre de courses ventilé par type, coursier,
// jour et créneau réalisé, avec filtres croisés (type / coursier / créneau /
// période). Lecture seule — aucune course n'est modifiée ici.
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
  const maxCoursier = data ? Math.max(1, ...data.parCoursier.map((r) => r.total)) : 1;
  const maxJour = data ? Math.max(1, ...data.parJour.map((r) => r.total)) : 1;
  const maxCreneau = data ? Math.max(1, ...data.parCreneau.map((r) => r.total)) : 1;
  const g = data?.global;
  const tauxFait = g && g.total > 0 ? Math.round((g.faites / g.total) * 100) : 0;
  const filtresActifs = !!(type || coursierId || creneau);

  return (
    <div className="table-card" style={{ padding: '18px 22px', marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Analyse des courses</div>

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
          <div className="kpis" style={{ marginTop: 18, marginBottom: 22 }}>
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

          <div className="section-title">Par type de course</div>
          <table>
            <thead><tr><th>Type</th><th>Total</th><th>Faites</th><th>Reportées</th><th>À faire</th></tr></thead>
            <tbody>
              {data.parType.map((r) => (
                <tr key={r.type}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Barre valeur={r.total} max={maxType} />
                      {TACHE_TYPE_LABELS[r.type] ?? r.type}
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                  <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>{r.reportees}</td>
                  <td className="mono">{r.aFaire}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Par coursier</div>
          <table>
            <thead><tr><th>Coursier</th><th>Total</th><th>Faites</th><th>Reportées</th><th>À faire</th></tr></thead>
            <tbody>
              {data.parCoursier.map((r) => (
                <tr key={r.coursierId ?? 'non-assignee'}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Barre valeur={r.total} max={maxCoursier} largeur={60} />
                      {r.coursierId ? r.nom : <span style={{ color: 'var(--ink-soft)' }}>{r.nom}</span>}
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                  <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>{r.reportees}</td>
                  <td className="mono">{r.aFaire}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Par créneau (heure de réalisation)</div>
          <table>
            <thead><tr><th>Créneau</th><th>Total</th><th>Faites</th></tr></thead>
            <tbody>
              {data.parCreneau.map((r) => (
                <tr key={r.creneau}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Barre valeur={r.total} max={maxCreneau} largeur={60} />
                      <span style={r.creneau === 'non_execute' ? { color: 'var(--ink-soft)' } : undefined}>{CRENEAU_LABELS[r.creneau]}</span>
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Par jour</div>
          <table>
            <thead><tr><th>Jour</th><th>Total</th><th>Faites</th><th>Reportées</th><th>À faire</th></tr></thead>
            <tbody>
              {data.parJour.map((r) => (
                <tr key={r.date}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Barre valeur={r.total} max={maxJour} />
                      <span className="mono" style={{ fontSize: 12 }}>{fmtJourCourt(r.date)}</span>
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>{r.faites}</td>
                  <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>{r.reportees}</td>
                  <td className="mono">{r.aFaire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
