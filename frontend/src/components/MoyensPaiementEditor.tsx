import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';

// Éditeur de la liste des moyens de paiement (Wave, Julaya, Orange Money…).
// Chaque moyen : libellé + lien et/ou numéro et/ou QR, avec une case « utiliser »
// (actif). Seuls les moyens actifs sont proposés au débiteur.

interface Moyen {
  id: string;
  label: string;
  lien: string | null;
  numero: string | null;
  qrUrl: string | null;
  actif: boolean;
  ordre: number;
}

export function MoyensPaiementEditor() {
  const { showToast } = useToast();
  const [moyens, setMoyens] = useState<Moyen[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function charger() {
    try {
      setMoyens(await api.get<Moyen[]>('/api/organisation/moyens-paiement'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    charger();
  }, []);

  async function ajouter() {
    setBusy(true);
    try {
      const m = await api.post<Moyen>('/api/organisation/moyens-paiement', { label: 'Nouveau moyen' });
      setMoyens((l) => [...l, m]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  function majLocal(id: string, patch: Partial<Moyen>) {
    setMoyens((l) => l.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function enregistrer(id: string, patch: Partial<Moyen>) {
    try {
      await api.patch(`/api/organisation/moyens-paiement/${id}`, patch);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function supprimer(id: string) {
    setMoyens((l) => l.filter((m) => m.id !== id));
    try {
      await api.delete(`/api/organisation/moyens-paiement/${id}`);
    } catch {
      charger();
    }
  }

  if (loading) return <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Chargement…</div>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {moyens.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
          Aucun moyen de paiement pour l'instant. Ajoutez-en un (Wave, Julaya, Orange Money…).
        </div>
      )}
      {moyens.map((m) => (
        <MoyenRow key={m.id} m={m} onLocal={(p) => majLocal(m.id, p)} onSave={(p) => enregistrer(m.id, p)} onDelete={() => supprimer(m.id)} onQr={charger} />
      ))}
      <div>
        <button type="button" onClick={ajouter} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <Plus size={14} /> Ajouter un moyen de paiement
        </button>
      </div>
    </div>
  );
}

function MoyenRow({ m, onLocal, onSave, onDelete, onQr }: { m: Moyen; onLocal: (p: Partial<Moyen>) => void; onSave: (p: Partial<Moyen>) => void; onDelete: () => void; onQr: () => void }) {
  const { showToast } = useToast();
  const qrRef = useRef<HTMLInputElement>(null);
  const [qrBusy, setQrBusy] = useState(false);

  async function televerserQr(file: File) {
    if (file.size > 1024 * 1024) {
      showToast('Image trop lourde (max 1 Mo).');
      return;
    }
    setQrBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.upload(`/api/organisation/moyens-paiement/${m.id}/qr`, fd);
      onQr();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec du téléversement.');
    } finally {
      setQrBusy(false);
    }
  }

  async function retirerQr() {
    setQrBusy(true);
    try {
      await api.delete(`/api/organisation/moyens-paiement/${m.id}/qr`);
      onQr();
    } finally {
      setQrBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', background: m.actif ? 'var(--surface, #fff)' : 'var(--paper-2, #f2f4f2)', opacity: m.actif ? 1 : 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', flex: 'none' }} title="Proposer ce moyen aux débiteurs">
          <input
            type="checkbox"
            checked={m.actif}
            onChange={(e) => {
              onLocal({ actif: e.target.checked });
              onSave({ actif: e.target.checked });
            }}
            style={{ width: 'auto' }}
          />
          Utiliser
        </label>
        <input
          value={m.label}
          onChange={(e) => onLocal({ label: e.target.value })}
          onBlur={(e) => onSave({ label: e.target.value })}
          placeholder="Libellé (ex. Wave, Julaya, Orange Money)"
          style={{ flex: 1, fontWeight: 600 }}
        />
        <button type="button" onClick={onDelete} title="Supprimer" style={{ flex: 'none', color: 'var(--danger)', padding: '6px 8px' }}>
          <Trash2 size={14} />
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <input
          type="url"
          value={m.lien ?? ''}
          onChange={(e) => onLocal({ lien: e.target.value })}
          onBlur={(e) => onSave({ lien: e.target.value })}
          placeholder="Lien de paiement (https://pro.julaya.co/… ou https://pay.wave.com/…)"
          style={{ width: '100%', fontSize: 12.5 }}
        />
        <input
          value={m.numero ?? ''}
          onChange={(e) => onLocal({ numero: e.target.value })}
          onBlur={(e) => onSave({ numero: e.target.value })}
          placeholder="Numéro (ex. Orange Money 77 000 00 00) — optionnel"
          style={{ width: '100%', fontSize: 12.5 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {m.qrUrl ? (
            <img src={m.qrUrl} alt="QR" style={{ width: 56, height: 56, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: 3 }} />
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Aucun QR</span>
          )}
          <input ref={qrRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) televerserQr(f); e.target.value = ''; }} />
          <button type="button" onClick={() => qrRef.current?.click()} disabled={qrBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Upload size={13} /> {qrBusy ? 'Envoi…' : m.qrUrl ? 'Remplacer le QR' : 'Téléverser un QR'}
          </button>
          {m.qrUrl && (
            <button type="button" onClick={retirerQr} disabled={qrBusy} style={{ fontSize: 12, color: 'var(--danger)' }}>
              Retirer
            </button>
          )}
          {m.qrUrl && <Check size={14} style={{ color: 'var(--success)' }} />}
        </div>
      </div>
    </div>
  );
}
