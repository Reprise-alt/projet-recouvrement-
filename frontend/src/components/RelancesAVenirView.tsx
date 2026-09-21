import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock, Gavel, Info, MessageCircle } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../auth/AuthContext';
import { fmtFCFA, PALIERS } from '../lib/constants';
import { lienWhatsApp, messageRelanceWhatsApp } from '../lib/whatsapp';
import { JournalRelances } from './JournalRelances';

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
  ccCount: number;
  tel: string | null;
}

interface ContentieuxAVenirItem {
  clientId: string;
  nom: string;
  palier: number;
  palierLabel: string;
  joursRetard: number;
  encours: number;
}

interface RelancesDuesResponse {
  fenetreOuverte: boolean;
  relancesActivees: boolean | null;
  total: number;
  relances: RelanceDueItem[];
  contentieux: ContentieuxAVenirItem[];
}

export function RelancesAVenirView({ reloadKey, canManage }: { reloadKey: unknown; canManage?: boolean }) {
  const res = useResource<RelancesDuesResponse>('/api/relances/dues', reloadKey);
  const { showToast } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [vue, setVue] = useState<'avenir' | 'historique'>('avenir');
  // Édition rapide des coordonnées d'un client depuis la liste (gain de temps).
  const [editClient, setEditClient] = useState<RelanceDueItem | null>(null);

  async function basculerEnvoi(actif: boolean) {
    setBusy(true);
    try {
      await api.put('/api/relances/envoi-automatique', { actif });
      showToast(actif ? 'Envoi automatique activé' : 'Envoi automatique suspendu');
      res.refetch();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

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
      <div className="main-tabs" style={{ marginBottom: 16 }}>
        <button className={vue === 'avenir' ? 'active' : ''} onClick={() => setVue('avenir')}>
          À venir
        </button>
        <button className={vue === 'historique' ? 'active' : ''} onClick={() => setVue('historique')}>
          Historique des envois
        </button>
      </div>
      {vue === 'historique' ? (
        <JournalRelances />
      ) : (
        <>
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
        {/* Interrupteur admin : activer / suspendre l'envoi automatique. */}
        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => basculerEnvoi(!data.relancesActivees)}
            style={{ marginLeft: 'auto' }}
          >
            {data.relancesActivees ? 'Suspendre l’envoi automatique' : 'Activer l’envoi automatique'}
          </button>
        )}
      </div>

      {data.relancesActivees && <ProchainEnvoi fenetreOuverte={data.fenetreOuverte} />}

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
                <th>Relance manuelle</th>
              </tr>
            </thead>
            <tbody>
              {data.relances.map((r) => {
                const tone = PALIERS[r.palier]?.tone ?? 'amber';
                const waHref = lienWhatsApp(r.tel, messageRelanceWhatsApp({ entreprise: user?.raisonSociale, encours: r.encours }));
                return (
                  <tr key={r.clientId}>
                    <td>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setEditClient(r)}
                          title="Compléter / modifier les coordonnées"
                          style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'var(--line)', textUnderlineOffset: 3 }}
                        >
                          {r.nom}
                        </button>
                      ) : (
                        r.nom
                      )}
                    </td>
                    <td>
                      <span className="badge" data-tone={tone}>
                        {r.palierLabel}
                      </span>
                    </td>
                    <td>{r.joursRetard} j</td>
                    <td className="currency">{fmtFCFA(r.encours)}</td>
                    <td>
                      {r.email ? (
                        r.email
                      ) : canManage ? (
                        <button
                          type="button"
                          onClick={() => setEditClient(r)}
                          style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--danger)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                        >
                          + ajouter un email
                        </button>
                      ) : (
                        <span style={{ color: 'var(--danger)' }}>email manquant</span>
                      )}
                      {r.email && r.ccCount > 0 && (
                        <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}> +{r.ccCount} en copie</span>
                      )}
                    </td>
                    <td>
                      {/* Relance manuelle par WhatsApp : ouvre wa.me avec le numéro
                          du client et un message pré-rempli. Utile surtout quand
                          l'email manque. Désactivé si aucun numéro sur la fiche. */}
                      {waHref ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Relance manuelle possible par WhatsApp"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#25D366',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: 12.5,
                            padding: '5px 11px',
                            borderRadius: 8,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <MessageCircle size={14} /> WhatsApp
                        </a>
                      ) : canManage ? (
                        <button
                          type="button"
                          onClick={() => setEditClient(r)}
                          style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 2 }}
                        >
                          + ajouter un n°
                        </button>
                      ) : (
                        <span style={{ color: 'var(--ink-soft)', fontSize: 12 }} title="Aucun numéro de téléphone sur la fiche client">
                          n° manquant
                        </span>
                      )}
                    </td>
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

      {data.contentieux.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="rv-note" style={{ borderLeft: '3px solid var(--danger)' }}>
            <Gavel size={15} />
            <span>
              <b>{data.contentieux.length} client{data.contentieux.length > 1 ? 's ont' : ' a'} atteint le seuil contentieux.</b>{' '}
              Ces dossiers ne partent <b>pas</b> en relance automatique (action juridique) — traitez-les dans l’onglet <b>Contentieux</b>.
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Palier atteint</th>
                <th>Jours de retard</th>
                <th>Encours</th>
              </tr>
            </thead>
            <tbody>
              {data.contentieux.map((c) => (
                <tr key={c.clientId}>
                  <td>{c.nom}</td>
                  <td>
                    <span className="badge" data-tone="danger">{c.palierLabel}</span>
                  </td>
                  <td>{c.joursRetard} j</td>
                  <td className="currency">{fmtFCFA(c.encours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
      {editClient && (
        <ContactQuickEdit
          client={editClient}
          onClose={() => setEditClient(null)}
          onSaved={() => {
            setEditClient(null);
            res.refetch();
          }}
        />
      )}
    </div>
  );
}

// Édition rapide des coordonnées (email + téléphone) d'un client, depuis la liste
// des relances à venir. Enregistre dans la fiche client (PATCH .../contact).
function ContactQuickEdit({
  client,
  onClose,
  onSaved,
}: {
  client: RelanceDueItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [email, setEmail] = useState(client.email ?? '');
  const [tel, setTel] = useState(client.tel ?? '');
  const [saving, setSaving] = useState(false);

  async function enregistrer() {
    setSaving(true);
    try {
      await api.patch(`/api/clients/${client.clientId}/contact`, { email: email.trim(), tel: tel.trim() });
      showToast('Coordonnées enregistrées');
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(440px, 96%)' }}>
        <h2 style={{ marginBottom: 2, fontSize: 18 }}>{client.nom}</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Complétez les coordonnées — enregistrées directement dans la fiche client.
        </div>
        <div className="field">
          <label>Adresse email</label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
            placeholder="client@exemple.sn"
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
            Nécessaire pour l'envoi automatique des relances par email.
          </div>
        </div>
        <div className="field">
          <label>Téléphone</label>
          <input
            type="tel"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
            placeholder="77 000 00 00"
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
            Sert à la relance WhatsApp et au rapprochement des paiements.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving}>Annuler</button>
          <button className="primary" onClick={enregistrer} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Prochain envoi automatique : le cron passe à chaque heure pleine mais n'envoie
// que dans la fenêtre 8h–19h, lun–ven (heure de Dakar = UTC+0). On calcule donc
// le prochain « top d'heure » qui tombe dans cette fenêtre, et on décompte.
function prochainEnvoi(now: Date): Date {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1); // prochain top d'heure
  for (let i = 0; i < 24 * 8; i++) {
    const jour = d.getUTCDay(); // 0 = dimanche, 6 = samedi
    const h = d.getUTCHours();
    if (jour >= 1 && jour <= 5 && h >= 8 && h < 19) return d;
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return d;
}

function ProchainEnvoi({ fenetreOuverte }: { fenetreOuverte: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const cible = prochainEnvoi(now);
  const reste = Math.max(0, Math.floor((cible.getTime() - now.getTime()) / 1000));
  const hh = Math.floor(reste / 3600);
  const mm = Math.floor((reste % 3600) / 60);
  const ss = reste % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const compteur = hh > 0 ? `${hh} h ${pad(mm)} min ${pad(ss)} s` : `${pad(mm)} min ${pad(ss)} s`;

  // Libellé de la cible en heure de Dakar (= UTC).
  const memeJour = cible.getUTCDate() === now.getUTCDate() && cible.getUTCMonth() === now.getUTCMonth();
  const jourLbl = memeJour
    ? "aujourd'hui"
    : cible.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const heureLbl = cible.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        margin: '0 0 18px',
        padding: '14px 18px',
        borderRadius: 14,
        border: '1px solid var(--line)',
        borderLeft: '3px solid var(--accent)',
        background: 'linear-gradient(180deg, var(--surface, #fff) 0%, var(--accent-soft) 100%)',
      }}
    >
      <div
        style={{
          flex: 'none',
          width: 42,
          height: 42,
          borderRadius: 11,
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Clock size={21} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-dark)' }}>
          Prochain envoi automatique
        </div>
        <div className="mono" style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.01em', marginTop: 2, lineHeight: 1.05 }}>
          {compteur}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>
          {fenetreOuverte
            ? `Départ ${jourLbl} à ${heureLbl} (heure de Dakar)`
            : `Fenêtre fermée — reprise ${jourLbl} à ${heureLbl} (8h–19h, lun–ven)`}
        </div>
      </div>
    </div>
  );
}
