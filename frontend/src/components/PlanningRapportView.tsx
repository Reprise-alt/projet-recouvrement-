import { useState } from 'react';
import { buildQuery } from '../api/client';
import { useResource } from '../hooks/useResource';
import { Entite, PlanningRapportResponse } from '../api/types';
import { EntityLogo } from './EntityLogo';

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

// Reporting sur période de l'activité coursiers -- distinct de la vue "un
// seul jour" au-dessus : tâches par jour, par coursier, et tâches
// reportées par entreprise (+ total groupe), pour objectiver la charge et
// la fiabilité du planning dans la durée plutôt qu'au jour le jour.
export function PlanningRapportView({ entityFilter }: Props) {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());

  const path = `/api/taches/reporting${buildQuery({ from, to, entite: entityFilter })}`;
  const { data, loading, error } = useResource<PlanningRapportResponse>(from && to ? path : null);

  const tauxReport = data && data.global.total > 0 ? Math.round((data.reporteesTotal / data.global.total) * 100) : 0;
  const maxParJour = data ? Math.max(1, ...data.parJour.map((r) => r.total)) : 1;
  const maxParCoursier = data ? Math.max(1, ...data.parCoursier.map((r) => r.total)) : 1;

  return (
    <div className="table-card" style={{ padding: '18px 22px', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Reporting planning</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label>Du</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label>Au</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {loading || !data ? (
        <div className="empty-state">Chargement…</div>
      ) : error ? (
        <div className="login-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : data.global.total === 0 ? (
        <div className="empty-state">
          <h3>Aucune tâche sur cette période</h3>
          <p>Élargissez la période ou changez d'entreprise.</p>
        </div>
      ) : (
        <>
          <div className="kpis" style={{ marginTop: 18, marginBottom: 22 }}>
            <div className="kpi">
              <div className="kpi-label">Total tâches</div>
              <div className="kpi-value">{data.global.total}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Faites</div>
              <div className="kpi-value success">{data.global.faites}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Reportées</div>
              <div className="kpi-value amber">{data.reporteesTotal}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Taux de report</div>
              <div className="kpi-value" style={tauxReport >= 20 ? { color: 'var(--amber)' } : undefined}>
                {tauxReport}%
              </div>
            </div>
          </div>

          <div className="section-title">Tâches par jour</div>
          <table>
            <thead>
              <tr>
                <th>Jour</th>
                <th>Total</th>
                <th>Faites</th>
                <th>Reportées</th>
                <th>À faire</th>
                <th>Annulées</th>
              </tr>
            </thead>
            <tbody>
              {data.parJour.map((r) => (
                <tr key={r.date}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 70, height: 8, borderRadius: 4, background: 'var(--paper-2)', overflow: 'hidden' }}>
                        <div style={{ width: `${(r.total / maxParJour) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                      <span className="mono" style={{ fontSize: 12 }}>
                        {fmtJourCourt(r.date)}
                      </span>
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>
                    {r.faites}
                  </td>
                  <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>
                    {r.reportees}
                  </td>
                  <td className="mono">{r.aFaire}</td>
                  <td className="mono">{r.annulees}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Tâches par coursier</div>
          <table>
            <thead>
              <tr>
                <th>Coursier</th>
                <th>Total</th>
                <th>Faites</th>
                <th>Reportées</th>
                <th>À faire</th>
              </tr>
            </thead>
            <tbody>
              {data.parCoursier.map((r) => (
                <tr key={r.coursierId ?? 'non-assignee'}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 8, borderRadius: 4, background: 'var(--paper-2)', overflow: 'hidden' }}>
                        <div style={{ width: `${(r.total / maxParCoursier) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                      {r.coursierId ? r.nom : <span style={{ color: 'var(--ink-soft)' }}>{r.nom}</span>}
                    </div>
                  </td>
                  <td className="mono">{r.total}</td>
                  <td className="mono" style={{ color: 'var(--success)' }}>
                    {r.faites}
                  </td>
                  <td className="mono" style={{ color: r.reportees > 0 ? 'var(--amber)' : undefined }}>
                    {r.reportees}
                  </td>
                  <td className="mono">{r.aFaire}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Tâches reportées par entreprise</div>
          {data.reporteesParEntite.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', padding: '6px 0 14px' }}>
              Aucune tâche reportée sur cette période — bon signe.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Entreprise</th>
                  <th>Tâches reportées</th>
                </tr>
              </thead>
              <tbody>
                {data.reporteesParEntite.map((r) => (
                  <tr key={r.entite}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <EntityLogo entite={r.entite} size={14} />
                        {r.entite}
                      </div>
                    </td>
                    <td className="mono">{r.nombre}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 600 }}>Ensemble</td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {data.reporteesTotal}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
