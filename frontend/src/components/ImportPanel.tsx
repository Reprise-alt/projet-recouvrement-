import { ChangeEvent, useRef, useState } from 'react';
import { api, ApiError, downloadFile } from '../api/client';
import { ImportSummary } from '../api/types';
import { useToast } from '../hooks/useToast';

export function ImportPanel({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleTemplate() {
    try {
      await downloadFile('/api/import/template', 'modele_recouvrement.csv');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setBusy(true);
    setResult(null);
    try {
      const res = await api.upload<ImportSummary>('/api/import', formData);
      setResult(res);
      showToast('Import terminé');
      onImported();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'import");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 style={{ marginBottom: 4 }}>Importer un fichier</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Classeur de facturation OLU, suivi de contrats, ou modèle CSV générique — le type est détecté
          automatiquement. La fusion préserve les factures déjà payées, les contacts saisis à la main et
          l'historique des envois.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={handleTemplate}>Télécharger le modèle</button>
          <button className="primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {busy ? 'Import en cours…' : 'Choisir un fichier'}
          </button>
          <input type="file" ref={fileInputRef} accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />
        </div>

        {result && (
          <div className="card-mini">
            <div style={{ marginBottom: 6 }}>{result.message}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {result.summary.clientsCreated} client(s) créé(s), {result.summary.clientsUpdated} mis à jour ·{' '}
              {result.summary.facturesCreated} facture(s) créée(s), {result.summary.facturesUpdated} mise(s) à jour ·{' '}
              {result.summary.contratsCreated} contrat(s) créé(s), {result.summary.contratsUpdated} mis à jour
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
