import { useEffect, useMemo, useState } from 'react';
import { Banknote, RefreshCw, Landmark, Coins, CheckCircle2, Link2, Unlink } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtFCFA, fmtDate } from '../lib/constants';
import type { RoleOrg } from '../api/types';

// Onglet « Encaissements bancaires » : les avis de remise (chèque / virement /
// espèce) lus automatiquement dans la boîte Gmail de l'organisation, avec
// pré-rapprochement par montant. La banque ne donne pas toujours l'émetteur —
// on rapproche donc d'abord par le montant, et l'agent valide.

interface GmailAvisStatus {
  connected: boolean;
  compteEmail: string | null;
  derniereSync: string | null;
}

interface PropositionFacture {
  id: string;
  numero: string;
  montant: number;
  statut: string;
  client: { id: string; nom: string } | null;
}

interface RemiseBancaire {
  id: string;
  type: 'cheque' | 'virement' | 'espece';
  montant: number;
  banque: string | null;
  agence: string | null;
  dateCheque: string | null;
  echeance: string | null;
  tireur: string | null;
  statut: string;
  client: { id: string; nom: string } | null;
  facturesReglees: string | null;
  createdAt: string;
  propositions: PropositionFacture[];
}

const TYPE_LABEL: Record<RemiseBancaire['type'], { label: string; icon: React.ReactNode }> = {
  cheque: { label: 'Remise de chèque', icon: <Banknote size={15} /> },
  virement: { label: 'Virement reçu', icon: <Landmark size={15} /> },
  espece: { label: "Remise d'espèces", icon: <Coins size={15} /> },
};

export function RemisesBancairesTab({ roleOrg, onChanged }: { roleOrg?: RoleOrg | null; onChanged?: () => void }) {
  const { showToast } = useToast();
  const { data: status, loading: loadingStatus, refetch: refetchStatus } = useResource<GmailAvisStatus>('/api/remises/gmail/status');
  const { data: remises, loading: loadingRemises, refetch: refetchRemises } = useResource<RemiseBancaire[]>('/api/remises');
  const [syncing, setSyncing] = useState(false);

  const peutConnecter = roleOrg === 'proprietaire' || roleOrg === 'administrateur';

  // Le consentement Google se termine dans un autre onglet (le callback n'a pas
  // le token de cette session) — on rafraîchit le statut au retour de focus.
  useEffect(() => {
    function onFocus() {
      refetchStatus();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetchStatus]);

  async function connecter() {
    try {
      const { url } = await api.get<{ url: string }>('/api/remises/gmail/auth-url');
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function deconnecter() {
    if (!confirm('Déconnecter la lecture des avis bancaires ? Les avis déjà importés sont conservés.')) return;
    try {
      await api.post('/api/remises/gmail/disconnect');
      showToast('Lecture des avis bancaires déconnectée');
      refetchStatus();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function synchroniser() {
    setSyncing(true);
    try {
      const r = await api.post<{ connecte: boolean; lus: number; nouveaux: number; preRapproches: number; ignores: number }>('/api/remises/sync');
      if (!r.connecte) showToast('Connectez d’abord la boîte Gmail de l’organisation.');
      else if (r.nouveaux === 0) showToast('Aucun nouvel avis bancaire.');
      else showToast(`${r.nouveaux} avis importé${r.nouveaux > 1 ? 's' : ''}${r.preRapproches ? ` · ${r.preRapproches} pré-rapproché${r.preRapproches > 1 ? 's' : ''}` : ''}.`);
      refetchStatus();
      refetchRemises();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur de synchronisation');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14, lineHeight: 1.5 }}>
        Feyma lit <strong>uniquement</strong> les avis de votre banque (remise de chèque, virement, remise d’espèces)
        dans la boîte mail connectée, et les pré-rapproche à vos factures impayées <strong>par le montant</strong>.
        La banque ne fournissant pas toujours l’émetteur, vous validez le rapprochement en un clic.
      </div>

      {/* Connexion Gmail « avis bancaires » de l'organisation */}
      <div className="card-mini" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <div>
            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Link2 size={15} style={{ color: 'var(--accent)' }} /> Boîte mail bancaire
            </strong>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              {loadingStatus
                ? 'Chargement…'
                : status?.connected
                ? `${status.compteEmail}${status.derniereSync ? ` · dernière synchro : ${fmtDate(status.derniereSync)}` : ''}`
                : 'Aucune boîte connectée — connectez celle qui reçoit vos avis bancaires.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {status?.connected ? (
              <>
                <button className="primary" onClick={synchroniser} disabled={syncing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={14} className={syncing ? 'spin' : undefined} /> {syncing ? 'Synchro…' : 'Synchroniser'}
                </button>
                {peutConnecter && (
                  <button className="danger-btn" onClick={deconnecter} title="Déconnecter" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Unlink size={14} />
                  </button>
                )}
              </>
            ) : peutConnecter ? (
              <button className="primary" onClick={connecter} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Link2 size={14} /> Connecter la boîte
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                Réservé au propriétaire du compte.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Liste des encaissements bancaires */}
      {loadingRemises ? (
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Chargement des encaissements…</div>
      ) : !remises || remises.length === 0 ? (
        <div style={{ padding: '18px 20px', border: '1px dashed var(--line)', borderRadius: 12, fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center' }}>
          Aucun encaissement bancaire importé pour l’instant.
          {status?.connected ? ' Cliquez sur « Synchroniser » pour lire les derniers avis.' : ' Connectez d’abord votre boîte mail bancaire.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {remises.map((r) => (
            <RemiseCard key={r.id} remise={r} onValide={() => { refetchRemises(); onChanged?.(); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function RemiseCard({ remise, onValide }: { remise: RemiseBancaire; onValide: () => void }) {
  const { showToast } = useToast();
  const [valide, setValide] = useState(false);
  const t = TYPE_LABEL[remise.type] ?? TYPE_LABEL.cheque;
  const rapproche = remise.statut === 'rapproche';

  // Client déductible : distinct parmi les factures proposées.
  const clientsProposes = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of remise.propositions) if (p.client) map.set(p.client.id, p.client.nom);
    return [...map.entries()].map(([id, nom]) => ({ id, nom }));
  }, [remise.propositions]);

  const clientUnique = remise.client ?? (clientsProposes.length === 1 ? clientsProposes[0] : null);
  const peutValider = !rapproche && clientUnique !== null && remise.propositions.length > 0;

  async function valider() {
    if (!clientUnique) return;
    setValide(true);
    try {
      await api.post(`/api/remises/${remise.id}/valider`, {
        clientId: clientUnique.id,
        factureIds: remise.propositions.map((p) => p.id),
      });
      showToast('Encaissement rapproché — facture(s) marquée(s) réglée(s).');
      onValide();
    } catch (err) {
      setValide(false);
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  return (
    <div className="card-mini" style={{ borderLeft: `3px solid ${rapproche ? 'var(--accent)' : 'var(--line)'}` }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14 }}>
            <span style={{ color: 'var(--accent)' }}>{t.icon}</span>
            {fmtFCFA(remise.montant)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>
            {t.label}
            {remise.banque ? ` · ${remise.banque}` : ''}
            {remise.agence ? ` · ${remise.agence}` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }} className="mono">
            {remise.dateCheque ? `remise ${fmtDate(remise.dateCheque)}` : ''}
            {remise.echeance ? ` · échéance ${fmtDate(remise.echeance)}` : ''}
            {remise.tireur ? ` · ${remise.tireur}` : ''}
          </div>
        </div>
        {rapproche ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            <CheckCircle2 size={15} /> Rapproché
          </span>
        ) : (
          peutValider && (
            <button className="primary" onClick={valider} disabled={valide} style={{ whiteSpace: 'nowrap' }}>
              {valide ? 'Validation…' : 'Valider le règlement'}
            </button>
          )
        )}
      </div>

      {/* Détail du rapprochement */}
      {!rapproche && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 12 }}>
          {remise.propositions.length === 0 ? (
            <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>
              Aucune facture impayée du même montant — à rapprocher manuellement.
            </span>
          ) : clientUnique ? (
            <div>
              <span style={{ color: 'var(--ink-soft)' }}>Rapprochement proposé — </span>
              <strong>{clientUnique.nom}</strong>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {remise.propositions.map((p) => (
                  <span key={p.id} className="mono" style={{ fontSize: 11, background: 'var(--accent-soft, #eef7f3)', color: 'var(--ink)', padding: '2px 7px', borderRadius: 6 }}>
                    {p.numero} · {fmtFCFA(p.montant)}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                Plusieurs clients ont une facture à ce montant — à choisir manuellement :
              </span>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {remise.propositions.map((p) => (
                  <span key={p.id} className="mono" style={{ fontSize: 11, background: 'var(--surface, #f7f7f5)', border: '1px solid var(--line)', padding: '2px 7px', borderRadius: 6 }}>
                    {p.client?.nom ?? '—'} · {p.numero} · {fmtFCFA(p.montant)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
