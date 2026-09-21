import { useState } from 'react';
import { Check, FileCheck2 } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtDate, fmtFCFA } from '../lib/constants';

// Chèques signalés « disponibles » par les débiteurs (depuis une relance). L'agent
// les voit, contacte / organise l'enlèvement, puis marque l'alerte traitée.

interface Alerte {
  id: string;
  clientNom: string;
  clientTel: string | null;
  montantEstime: number | null;
  message: string | null;
  statut: string;
  createdAt: string;
}
interface AlertesResponse {
  nbNouvelles: number;
  alertes: Alerte[];
}

export function ChequesDeclaresPanel({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useResource<AlertesResponse>('/api/cheques/alertes?statut=toutes');
  const [busy, setBusy] = useState<string | null>(null);

  async function traiter(id: string, traitee: boolean) {
    setBusy(id);
    try {
      await api.post(`/api/cheques/alertes/${id}/traiter`, { traitee });
      refetch();
      onChanged?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  }

  const nouvelles = data?.alertes.filter((a) => a.statut === 'nouvelle') ?? [];
  const traitees = data?.alertes.filter((a) => a.statut !== 'nouvelle') ?? [];

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(600px, 96%)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <FileCheck2 size={20} style={{ color: 'var(--accent)' }} /> Chèques déclarés disponibles
        </h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Des débiteurs ont signalé un chèque prêt depuis leur relance. Organisez l'enlèvement puis classez l'alerte.
        </div>

        {loading || !data ? (
          <div className="empty-state">Chargement…</div>
        ) : data.alertes.length === 0 ? (
          <div className="empty-state"><p>Aucun chèque signalé pour l'instant.</p></div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {nouvelles.map((a) => (
              <Ligne key={a.id} a={a} busy={busy === a.id} onTraiter={() => traiter(a.id, true)} />
            ))}
            {traitees.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)', margin: '8px 0 -2px' }}>
                  Classés ({traitees.length})
                </div>
                {traitees.map((a) => (
                  <Ligne key={a.id} a={a} busy={busy === a.id} traitee onTraiter={() => traiter(a.id, false)} />
                ))}
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function Ligne({ a, busy, traitee, onTraiter }: { a: Alerte; busy: boolean; traitee?: boolean; onTraiter: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', borderLeft: traitee ? '3px solid var(--line)' : '3px solid var(--accent)', opacity: traitee ? 0.7 : 1 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 14 }}>{a.clientNom}</b>
          {a.montantEstime != null && <span className="badge" data-tone="accent">{fmtFCFA(a.montantEstime)}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 3 }}>
          {a.clientTel ? `${a.clientTel} · ` : ''}signalé le {fmtDate(a.createdAt)}
        </div>
        {a.message && <div style={{ fontSize: 12.5, marginTop: 5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>« {a.message} »</div>}
      </div>
      <button onClick={onTraiter} disabled={busy} style={{ flex: 'none', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {traitee ? 'Rouvrir' : <><Check size={14} /> Classer</>}
      </button>
    </div>
  );
}
