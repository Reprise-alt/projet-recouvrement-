import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Sparkles } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';
import { fmtFCFA } from '../lib/constants';

// Scan d'un chèque : photo → extraction assistée (Claude) → relecture par l'agent
// → rapprochement à un client / des factures → enregistrement.

interface ClientLite {
  id: string;
  nom: string;
  encours: number;
}
interface FactureLite {
  id: string;
  numero: string;
  montant: number;
  statut: string;
}

export function ChequeScanForm({ onEnregistre }: { onEnregistre?: () => void }) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [extraction, setExtraction] = useState(false);
  const [autoDispo, setAutoDispo] = useState<boolean | null>(null);

  const [montant, setMontant] = useState('');
  const [banque, setBanque] = useState('');
  const [numero, setNumero] = useState('');
  const [dateCheque, setDateCheque] = useState('');
  const [tireur, setTireur] = useState('');

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [recherche, setRecherche] = useState('');
  const [client, setClient] = useState<ClientLite | null>(null);
  const [factures, setFactures] = useState<FactureLite[]>([]);
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<ClientLite[]>('/api/clients?all=true').then((l) => setClients(l.map((c) => ({ id: c.id, nom: c.nom, encours: c.encours })))).catch(() => {});
  }, []);

  async function choisirClient(c: ClientLite) {
    setClient(c);
    setRecherche('');
    setChoisies(new Set());
    try {
      const detail = await api.get<{ factures: FactureLite[] }>(`/api/clients/${c.id}`);
      setFactures((detail.factures ?? []).filter((f) => f.statut === 'impayee'));
    } catch {
      setFactures([]);
    }
  }

  async function analyser(f: File) {
    setFile(f);
    setApercu(URL.createObjectURL(f));
    setExtraction(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await api.upload<{ disponible: boolean; montant?: number | null; banque?: string | null; numeroCheque?: string | null; dateCheque?: string | null; tireur?: string | null }>('/api/cheques/scan', fd);
      setAutoDispo(r.disponible);
      if (r.disponible) {
        if (r.montant) setMontant(String(r.montant));
        if (r.banque) setBanque(r.banque);
        if (r.numeroCheque) setNumero(r.numeroCheque);
        if (r.dateCheque) setDateCheque(r.dateCheque);
        if (r.tireur) setTireur(r.tireur);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Échec de l'analyse");
    } finally {
      setExtraction(false);
    }
  }

  async function enregistrer() {
    const m = Math.round(Number(montant));
    if (!Number.isFinite(m) || m <= 0) {
      showToast('Renseignez le montant du chèque.');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      if (file) fd.append('file', file);
      fd.append('montant', String(m));
      if (banque.trim()) fd.append('banque', banque.trim());
      if (numero.trim()) fd.append('numeroCheque', numero.trim());
      if (dateCheque) fd.append('dateCheque', dateCheque);
      if (tireur.trim()) fd.append('tireur', tireur.trim());
      if (client) fd.append('clientId', client.id);
      if (choisies.size) fd.append('factureIds', [...choisies].join(','));
      const r = await api.upload<{ facturesReglees: number }>('/api/cheques', fd);
      showToast(r.facturesReglees ? `Chèque enregistré — ${r.facturesReglees} facture(s) réglée(s)` : 'Chèque enregistré');
      // Réinitialise pour le chèque suivant.
      setFile(null); setApercu(null); setMontant(''); setBanque(''); setNumero(''); setDateCheque(''); setTireur('');
      setClient(null); setFactures([]); setChoisies(new Set()); setAutoDispo(null);
      onEnregistre?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  const matches = recherche.trim().length >= 2
    ? clients.filter((c) => c.nom.toLowerCase().includes(recherche.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Photo */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          onClick={() => fileRef.current?.click()}
          style={{ width: 200, height: 120, border: '1.5px dashed var(--line)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--surface, #fff)', overflow: 'hidden', flex: 'none' }}
        >
          {apercu ? (
            <img src={apercu} alt="chèque" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
              <Camera size={22} />
              <div style={{ fontSize: 12, marginTop: 4 }}>Photo du chèque</div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) analyser(f); e.target.value = ''; }} />
        </div>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: 'var(--ink-soft)' }}>
          {extraction ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-dark)' }}><Sparkles size={14} /> Lecture du chèque…</span>
          ) : autoDispo === true ? (
            <span style={{ color: 'var(--success)' }}>Champs pré-remplis depuis la photo — vérifiez et corrigez si besoin.</span>
          ) : autoDispo === false ? (
            'Extraction auto indisponible (clé API non configurée). Saisissez les champs à la main.'
          ) : (
            'Prenez ou choisissez la photo du chèque. Les champs se pré-remplissent automatiquement.'
          )}
        </div>
      </div>

      {/* Champs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="Montant (FCFA)"><input type="number" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="Ex. 250000" style={{ width: '100%' }} /></Field>
        <Field label="Banque"><input value={banque} onChange={(e) => setBanque(e.target.value)} placeholder="Ex. CBAO" style={{ width: '100%' }} /></Field>
        <Field label="N° du chèque"><input value={numero} onChange={(e) => setNumero(e.target.value)} style={{ width: '100%' }} /></Field>
        <Field label="Date"><input type="date" value={dateCheque} onChange={(e) => setDateCheque(e.target.value)} style={{ width: '100%' }} /></Field>
        <Field label="Émetteur (tireur)"><input value={tireur} onChange={(e) => setTireur(e.target.value)} style={{ width: '100%' }} /></Field>
      </div>

      {/* Rapprochement client */}
      <div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 6 }}>Rapprocher à un client (optionnel)</div>
        {client ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge" data-tone="accent">{client.nom}</span>
            <button type="button" onClick={() => { setClient(null); setFactures([]); setChoisies(new Set()); }} style={{ fontSize: 12 }}>Changer</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un client par nom…" style={{ width: '100%' }} />
            {matches.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 2, maxHeight: 220, overflowY: 'auto', boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,.1))' }}>
                {matches.map((c) => (
                  <button key={c.id} type="button" onClick={() => choisirClient(c)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
                    {c.nom} <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}>· {fmtFCFA(c.encours)} d'encours</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {client && factures.length > 0 && (
          <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            {factures.map((f, i) => (
              <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                <input type="checkbox" checked={choisies.has(f.id)} onChange={(e) => setChoisies((s) => { const n = new Set(s); e.target.checked ? n.add(f.id) : n.delete(f.id); return n; })} style={{ width: 'auto' }} />
                <span className="mono">{f.numero}</span>
                <span className="currency" style={{ marginLeft: 'auto', color: 'var(--ink-soft)' }}>{fmtFCFA(f.montant)}</span>
              </label>
            ))}
          </div>
        )}
        {client && factures.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>Aucune facture impayée pour ce client.</div>}
      </div>

      <div>
        <button className="primary" onClick={enregistrer} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Check size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer le chèque'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{label}</label>
      <div style={{ marginTop: 3 }}>{children}</div>
    </div>
  );
}
