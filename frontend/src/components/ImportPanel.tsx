import { ChangeEvent, CSSProperties, useMemo, useRef, useState } from 'react';
import { api, ApiError, downloadFile } from '../api/client';
import { ImportPreview, ImportSummary } from '../api/types';
import { useToast } from '../hooks/useToast';
import { IS_SAAS } from '../auth/mode';

// Import guidé : on accepte N'IMPORTE QUEL classeur Excel/CSV (l'export
// comptable du prospect, pas seulement notre modèle). Le backend devine la
// correspondance des colonnes ; l'utilisateur la confirme avec un aperçu en
// direct, puis importe. C'est le verrou de la première prise en main : avant,
// tout fichier hors modèle échouait silencieusement.

type Phase = 'choose' | 'loading' | 'map' | 'recognized' | 'done';

const NONE = '';
const selStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12.5,
  border: '1px solid var(--line, #d9ded7)',
  borderRadius: 8,
  background: 'var(--surface, #fff)',
};

export function ImportPanel({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { showToast } = useToast();
  const [phase, setPhase] = useState<Phase>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
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
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f);
    setPhase('loading');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const pv = await api.upload<ImportPreview>('/api/import/preview', fd);
      if (pv.recognized) {
        setPreview(pv);
        setPhase('recognized');
      } else {
        const init: Record<string, string> = {};
        pv.fields.forEach((fld) => {
          init[fld.field] = pv.guess[fld.field] ?? NONE;
        });
        setMapping(init);
        setPreview(pv);
        setPhase('map');
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Échec de la lecture du fichier');
      setPhase('choose');
    }
  }

  // Import d'un classeur déjà reconnu (modèle OLU / contrats) : chemin direct.
  async function importRecognized() {
    if (!file) return;
    setPhase('loading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload<ImportSummary>('/api/import', fd);
      setResult(res);
      setPhase('done');
      showToast('Import terminé');
      onImported();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'import");
      setPhase('recognized');
    }
  }

  // Import avec la correspondance confirmée.
  async function importMapped() {
    if (!file) return;
    setPhase('loading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await api.upload<ImportSummary>('/api/import/mapped', fd);
      setResult(res);
      setPhase('done');
      showToast('Import terminé');
      onImported();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'import");
      setPhase('map');
    }
  }

  const headerIndex = useMemo(() => {
    const m: Record<string, number> = {};
    preview?.headers.forEach((h, i) => (m[h] = i));
    return m;
  }, [preview]);

  // Lignes d'aperçu reconstituées selon la correspondance en cours.
  const mappedCols = preview ? preview.fields.filter((f) => mapping[f.field]) : [];
  const previewRows = useMemo(() => {
    if (!preview) return [];
    const cols = preview.fields.filter((f) => mapping[f.field]);
    return preview.sample.map((row) =>
      cols.map((f) => {
        const idx = headerIndex[mapping[f.field]];
        return idx == null ? '' : row[idx] ?? '';
      }),
    );
  }, [preview, mapping, headerIndex]);

  const canImport = !!mapping.client_nom && (!!mapping.facture_montant || !!mapping.facture_numero);

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: phase === 'map' ? 680 : 520 }}>
        <h2 style={{ marginBottom: 4 }}>Importer vos créances</h2>

        {/* ---- Étape 1 : choix du fichier ---- */}
        {(phase === 'choose' || phase === 'loading') && (
          <>
            <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 14 }}>
              Déposez votre fichier tel quel — un export de votre logiciel de facturation, un Excel
              ou un CSV. Nous détectons les colonnes automatiquement et vous les confirmez avant
              l'import. Vos factures déjà payées et contacts saisis à la main sont préservés.
            </div>
            <div
              onClick={() => phase !== 'loading' && fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--accent, #1D9E75)',
                borderRadius: 14,
                padding: '26px 16px',
                textAlign: 'center',
                cursor: phase === 'loading' ? 'default' : 'pointer',
                background: 'color-mix(in srgb, var(--accent, #1D9E75) 6%, transparent)',
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 6 }} aria-hidden="true">📄</div>
              <div style={{ fontWeight: 600 }}>
                {phase === 'loading' ? 'Lecture du fichier…' : 'Choisir mon fichier'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                Excel (.xlsx, .xls) ou CSV
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <button onClick={handleTemplate} style={{ fontSize: 12.5 }}>
                Pas de fichier ? Télécharger un modèle
              </button>
              <button onClick={onClose}>Fermer</button>
            </div>
          </>
        )}

        {/* ---- Format déjà reconnu (modèle OLU / contrats) ---- */}
        {phase === 'recognized' && preview && (
          <>
            <div className="card-mini" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>✓ Format reconnu</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                {preview.message}
                {preview.clientsCount != null ? ` — ${preview.clientsCount} débiteur(s) détecté(s).` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPhase('choose')}>Changer de fichier</button>
              <button className="primary" onClick={importRecognized}>Importer</button>
            </div>
          </>
        )}

        {/* ---- Étape 2 : correspondance des colonnes ---- */}
        {phase === 'map' && preview && (
          <>
            <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 12 }}>
              <b style={{ color: 'var(--ink, inherit)' }}>{preview.rowCount}</b> ligne(s) détectée(s).
              Vérifiez la correspondance des colonnes — nous avons pré-rempli ce que nous avons reconnu.
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '10px 14px',
                marginBottom: 14,
              }}
            >
              {preview.fields.map((f) => (
                <label key={f.field} style={{ display: 'block' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 3 }}>
                    {f.label}
                    {f.required && <span style={{ color: 'var(--danger, #C0392B)' }}> *</span>}
                  </span>
                  <select
                    style={selStyle}
                    value={mapping[f.field] ?? NONE}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.field]: e.target.value }))}
                  >
                    <option value={NONE}>— (aucune)</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {mappedCols.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Aperçu</div>
                <div style={{ overflowX: 'auto', border: '1px solid var(--line, #e6e9e4)', borderRadius: 10 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>
                    <thead>
                      <tr>
                        {mappedCols.map((f) => (
                          <th
                            key={f.field}
                            style={{ textAlign: 'left', padding: '6px 9px', background: 'var(--surface-2, #f4f6f3)', whiteSpace: 'nowrap' }}
                          >
                            {f.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '5px 9px', borderTop: '1px solid var(--line, #eef1ec)', whiteSpace: 'nowrap' }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!canImport && (
              <div style={{ fontSize: 12, color: 'var(--danger, #C0392B)', marginBottom: 10 }}>
                Indiquez au minimum le <b>Nom du débiteur</b> et un <b>Montant</b> ou un <b>N° de facture</b>.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button onClick={() => setPhase('choose')}>Changer de fichier</button>
              <button className="primary" disabled={!canImport} onClick={importMapped}>
                Importer {preview.rowCount} ligne(s)
              </button>
            </div>
          </>
        )}

        {/* ---- Terminé ---- */}
        {phase === 'done' && result && (
          <>
            <div className="card-mini" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>✓ {result.message}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                {result.summary.clientsCreated} client(s) créé(s), {result.summary.clientsUpdated} mis à jour ·{' '}
                {result.summary.facturesCreated} facture(s) créée(s), {result.summary.facturesUpdated} mise(s) à jour
                {!IS_SAAS && (
                  <> · {result.summary.contratsCreated} contrat(s) créé(s), {result.summary.contratsUpdated} mis à jour</>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setPhase('choose'); setResult(null); setFile(null); }}>Importer un autre fichier</button>
              <button className="primary" onClick={onClose}>Terminer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
