import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import { fmtDate, fmtFCFA } from '../lib/constants';

// Import d'un relevé Julaya → rapprochement des encaissements avec les factures.
// L'agent valide (coche) les rapprochements avant de les appliquer.

interface Proposition {
  transactionId: string;
  montant: number;
  date: string | null;
  telPayeur: string | null;
  reference: string | null;
  dejaImporte: boolean;
  client: { id: string; nom: string } | null;
  facturesProposees: { id: string; numero: string; montant: number; dateEcheance: string | null }[];
}
interface Analyse {
  total: number;
  nbRapproches: number;
  nbDejaImportes: number;
  paiements: Proposition[];
}

export function ImportRelevePanel({ onClose, onApplied }: { onClose: () => void; onApplied?: () => void }) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function analyser(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.upload<Analyse>('/api/paiements/analyser', fd);
      setAnalyse(r);
      // Pré-coche les paiements rapprochés et pas encore importés.
      setCoches(new Set(r.paiements.filter((p) => p.client && !p.dejaImporte).map((p) => p.transactionId)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Analyse impossible');
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setCoches((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function appliquer() {
    if (!analyse) return;
    const payload = analyse.paiements
      .filter((p) => coches.has(p.transactionId) && p.client)
      .map((p) => ({
        transactionId: p.transactionId,
        clientId: p.client!.id,
        montant: p.montant,
        date: p.date,
        reference: p.reference,
        factureIds: p.facturesProposees.map((f) => f.id),
      }));
    if (!payload.length) return;
    setBusy(true);
    try {
      const r = await api.post<{ encaissements: number; facturesReglees: number; montantTotal: number }>(
        '/api/paiements/appliquer',
        { paiements: payload },
      );
      showToast(`${r.encaissements} encaissement(s) appliqué(s) — ${r.facturesReglees} facture(s) réglée(s)`);
      onApplied?.();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Application impossible');
    } finally {
      setBusy(false);
    }
  }

  const nbCoches = analyse ? analyse.paiements.filter((p) => coches.has(p.transactionId) && p.client).length : 0;

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(820px, 97%)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <FileSpreadsheet size={20} style={{ color: 'var(--accent)' }} /> Importer un relevé Julaya
        </h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 16 }}>
          Déposez l'export Excel Julaya. Feyma rapproche chaque encaissement d'un client (par téléphone), et vous
          validez les factures à marquer réglées.
        </div>

        {!analyse ? (
          <div
            style={{ border: '1.5px dashed var(--line)', borderRadius: 12, padding: '34px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface, #fff)' }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={26} style={{ color: 'var(--accent)', marginBottom: 8 }} />
            <div style={{ fontWeight: 600 }}>{busy ? 'Analyse…' : 'Choisir le fichier Excel (.xlsx)'}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Export « Compte principal » depuis Julaya.</div>
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) analyser(f); e.target.value = ''; }} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 12 }}>
              <span>{analyse.total} encaissement(s)</span>
              <span style={{ color: 'var(--success)' }}>● {analyse.nbRapproches} rapproché(s)</span>
              {analyse.nbDejaImportes > 0 && <span>● {analyse.nbDejaImportes} déjà importé(s)</span>}
              <span>● {analyse.total - analyse.nbRapproches - analyse.nbDejaImportes} sans correspondance</span>
            </div>

            <div style={{ maxHeight: '52vh', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}></th>
                    <th>Encaissement</th>
                    <th>Client rapproché</th>
                    <th>Factures à régler</th>
                  </tr>
                </thead>
                <tbody>
                  {analyse.paiements.map((p) => {
                    const applicable = !!p.client && !p.dejaImporte;
                    return (
                      <tr key={p.transactionId} style={{ opacity: applicable ? 1 : 0.6 }}>
                        <td style={{ textAlign: 'center' }}>
                          {applicable ? (
                            <input type="checkbox" checked={coches.has(p.transactionId)} onChange={() => toggle(p.transactionId)} style={{ width: 'auto' }} />
                          ) : p.dejaImporte ? (
                            <CheckCircle2 size={15} style={{ color: 'var(--ink-soft)' }} />
                          ) : (
                            <AlertTriangle size={15} style={{ color: 'var(--amber)' }} />
                          )}
                        </td>
                        <td>
                          <div className="currency" style={{ fontWeight: 600 }}>{fmtFCFA(p.montant)}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                            {p.date ? fmtDate(p.date) : '—'}{p.telPayeur ? ` · ${p.telPayeur}` : ''}
                          </div>
                        </td>
                        <td>
                          {p.dejaImporte ? (
                            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Déjà importé</span>
                          ) : p.client ? (
                            <strong style={{ fontSize: 13 }}>{p.client.nom}</strong>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--amber)' }}>Aucun client (tél. {p.telPayeur ?? '—'})</span>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {p.facturesProposees.length ? (
                            p.facturesProposees.map((f) => (
                              <div key={f.id} className="mono" style={{ color: 'var(--ink-soft)' }}>
                                {f.numero} · {fmtFCFA(f.montant)}
                              </div>
                            ))
                          ) : p.client ? (
                            <span style={{ color: 'var(--ink-soft)' }}>Aucune facture impayée</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => { setAnalyse(null); setCoches(new Set()); }} disabled={busy}>← Choisir un autre fichier</button>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{nbCoches} sélectionné(s)</span>
                <button className="primary" onClick={appliquer} disabled={busy || nbCoches === 0}>
                  {busy ? 'Application…' : `Valider ${nbCoches} rapprochement(s)`}
                </button>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
