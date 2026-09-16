import { CalendarClock, CheckCircle2, Clock, Info } from 'lucide-react';
import { useResource } from '../hooks/useResource';
import { fmtFCFA, PALIERS } from '../lib/constants';

// Aperçu « relances à venir » (addendum §5) — lecture seule. Montre, pour
// l'organisation courante, les relances que le moteur ferait partir maintenant
// (endpoint GET /api/relances/dues). AUCUN envoi n'est déclenché ici : c'est la
// vitrine avant activation de l'envoi automatique.
interface RelanceDueItem {
  clientId: string;
  nom: string;
  palier: number;
  joursRetard: number;
  palierLabel: string;
  encours: number;
  email: string | null;
}

interface RelancesDuesResponse {
  fenetreOuverte: boolean;
  relancesActivees: boolean | null;
  total: number;
  relances: RelanceDueItem[];
}

export function RelancesAVenirView({ reloadKey }: { reloadKey: unknown }) {
  const res = useResource<RelancesDuesResponse>('/api/relances/dues', reloadKey);

  if (res.loading) return <div className="empty-state">Chargement…</div>;
  if (res.error) {
    return (
      <div className="empty-state">
        <h3>Erreur</h3>
        <p>{res.error}</p>
      </div>
    );
  }
  const data = res.data;
  if (!data) return null;

  const encoursTotal = data.relances.reduce((s, r) => s + r.encours, 0);

  return (
    <div>
      {/* Bandeau d'état : envoi automatique activé ? fenêtre ouverte ? */}
      <div className="rv-status">
        <div className={`rv-chip ${data.relancesActivees ? 'rv-chip-on' : 'rv-chip-off'}`}>
          {data.relancesActivees ? <CheckCircle2 size={15} /> : <Clock size={15} />}
          {data.relancesActivees === null
            ? 'Envoi automatique — non configuré'
            : data.relancesActivees
              ? 'Envoi automatique activé'
              : 'Envoi automatique en pause'}
        </div>
        <div className={`rv-chip ${data.fenetreOuverte ? 'rv-chip-on' : 'rv-chip-neutral'}`}>
          <CalendarClock size={15} />
          {data.fenetreOuverte ? 'Fenêtre d’envoi ouverte' : 'Hors fenêtre d’envoi'}
        </div>
      </div>

      <div className="rv-note">
        <Info size={15} />
        <span>
          Aperçu — <b>rien n’est envoyé depuis cet écran</b>. Voici les relances que le moteur ferait
          partir maintenant, selon l’échelle de paliers et les règles d’arrêt (créance soldée, promesse
          en cours, litige, opposition).
        </span>
      </div>

      {data.total === 0 ? (
        <div className="empty-state">
          <h3>Aucune relance à envoyer</h3>
          <p>Toutes les créances sont à jour, déjà relancées à leur palier, ou en pause (promesse, litige).</p>
        </div>
      ) : (
        <>
          <div className="rv-summary">
            <b>{data.total}</b> relance{data.total > 1 ? 's' : ''} prête{data.total > 1 ? 's' : ''} à partir
            <span className="rv-dot" />
            <b>{fmtFCFA(encoursTotal)}</b> d’encours concerné
          </div>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Palier à envoyer</th>
                <th>Jours de retard</th>
                <th>Encours</th>
                <th>Destinataire</th>
              </tr>
            </thead>
            <tbody>
              {data.relances.map((r) => {
                const tone = PALIERS[r.palier]?.tone ?? 'amber';
                return (
                  <tr key={r.clientId}>
                    <td>{r.nom}</td>
                    <td>
                      <span className="badge" data-tone={tone}>
                        {r.palierLabel}
                      </span>
                    </td>
                    <td>{r.joursRetard} j</td>
                    <td className="currency">{fmtFCFA(r.encours)}</td>
                    <td>{r.email ?? <span style={{ color: 'var(--danger)' }}>email manquant</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="rv-foot">
            Les relances aux clients sans adresse email ne pourront pas partir automatiquement — complétez la
            fiche client.
          </div>
        </>
      )}
    </div>
  );
}
