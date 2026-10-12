import { useMemo, useState } from 'react';
import { ShieldCheck, Link2, Image as ImageIcon, CheckCircle2, Banknote } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { ClientListItem } from '../api/types';
import { useResource } from '../hooks/useResource';
import { useToast } from '../hooks/useToast';
import { fmtFCFA } from '../lib/constants';

// Module « Assureurs » (secteurs tiers-payant) : liste les assureurs (débiteurs)
// et donne, pour chacun, le lien de son Espace Assureur (relevé + signalement de
// règlement) et son logo (co-branding). Les règlements signalés arrivent dans
// « Rapprochement des paiements ».
export function EspaceAssureursPanel({
  onClose,
  onChanged,
  onOpenRapprochement,
}: {
  onClose: () => void;
  onChanged?: () => void;
  onOpenRapprochement?: () => void;
}) {
  const { showToast } = useToast();
  const { data, loading, refetch } = useResource<{ list: ClientListItem[] }>('/api/clients/console');
  const [q, setQ] = useState('');
  const [lienBusyId, setLienBusyId] = useState<string | null>(null);
  const [logoBusyId, setLogoBusyId] = useState<string | null>(null);

  const assureurs = useMemo(() => {
    const list = data?.list ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle ? list.filter((c) => c.nom.toLowerCase().includes(needle)) : list;
    return [...filtered].sort((a, b) => b.encours - a.encours);
  }, [data, q]);

  async function copierLien(c: ClientListItem) {
    setLienBusyId(c.id);
    try {
      const r = await api.get<{ url: string }>(`/api/clients/${c.id}/lien-assureur`);
      try {
        await navigator.clipboard.writeText(r.url);
        showToast(`Lien de ${c.nom} copié`);
      } catch {
        window.prompt('Lien de l’espace assureur (copiez-le) :', r.url);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setLienBusyId(null);
    }
  }

  async function envoyerLogo(c: ClientListItem, file: File) {
    setLogoBusyId(c.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.upload(`/api/clients/${c.id}/logo-assureur`, fd);
      showToast(`Logo de ${c.nom} enregistré`);
      refetch();
      onChanged?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setLogoBusyId(null);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(820px, 97%)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <ShieldCheck size={20} style={{ color: 'var(--accent)' }} /> Assureurs
        </h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 14 }}>
          Chaque assureur dispose d’un lien privé pour consulter son relevé et signaler ses règlements, sans compte.
          Les règlements signalés arrivent dans{' '}
          <button
            onClick={() => { onClose(); onOpenRapprochement?.(); }}
            style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, padding: 0, cursor: 'pointer' }}
          >
            Rapprochement des paiements
          </button>
          {' '}pour validation.
        </div>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un assureur…"
          style={{ width: '100%', marginBottom: 14 }}
        />

        {loading ? (
          <div style={{ color: 'var(--ink-soft)' }}>Chargement…</div>
        ) : assureurs.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <p>Aucun assureur pour l’instant. Importez vos créances pour les voir apparaître ici.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ink-soft)', fontSize: 11.5 }}>
                  <th style={{ padding: '6px 6px', fontWeight: 600 }}>Assureur</th>
                  <th style={{ padding: '6px 6px', fontWeight: 600, textAlign: 'right' }}>Encours</th>
                  <th style={{ padding: '6px 6px', fontWeight: 600, textAlign: 'center' }}>Logo</th>
                  <th style={{ padding: '6px 6px', fontWeight: 600, textAlign: 'right' }}>Lien assureur</th>
                </tr>
              </thead>
              <tbody>
                {assureurs.map((c) => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '8px 6px' }}>
                      <div style={{ fontWeight: 600 }}>{c.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                        {c.nbFactures ? `${c.nbFactures} facture${c.nbFactures > 1 ? 's' : ''}` : '—'}
                      </div>
                    </td>
                    <td className="mono" style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {fmtFCFA(c.encours)}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      <label
                        title={c.logoAssureur ? 'Remplacer le logo' : 'Ajouter le logo'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: c.logoAssureur ? 'var(--accent-dark)' : 'var(--ink-soft)' }}
                      >
                        {logoBusyId === c.id ? '…' : c.logoAssureur ? <CheckCircle2 size={16} /> : <ImageIcon size={16} />}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) envoyerLogo(c, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      <button
                        type="button"
                        disabled={lienBusyId === c.id}
                        onClick={() => copierLien(c)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}
                      >
                        <Link2 size={14} /> {lienBusyId === c.id ? '…' : 'Copier le lien'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => { onClose(); onOpenRapprochement?.(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Banknote size={14} /> Voir les règlements signalés
          </button>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
