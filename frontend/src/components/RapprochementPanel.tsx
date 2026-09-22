import { useState } from 'react';
import { Banknote, FileSpreadsheet, Landmark, ScanLine, Wallet } from 'lucide-react';
import { ImportRelevePanel } from './ImportRelevePanel';
import { ChequeScanLot } from './ChequeScanLot';

// Module « Rapprochement » : regroupe les sources d'encaissement à rapprocher des
// factures. Sous-modules : intégrateurs de paiement (Julaya…), portefeuilles
// virtuels (Wave / Orange Money), scan de chèque, et plus tard preuve de virement.
type Onglet = 'integrateurs' | 'portefeuilles' | 'cheque' | 'virement';

const ONGLETS: { id: Onglet; label: string; icon: React.ReactNode }[] = [
  { id: 'integrateurs', label: 'Intégrateurs de paiement', icon: <FileSpreadsheet size={15} /> },
  { id: 'portefeuilles', label: 'Portefeuilles virtuels', icon: <Wallet size={15} /> },
  { id: 'cheque', label: 'Scan de chèque', icon: <ScanLine size={15} /> },
  { id: 'virement', label: 'Preuve de virement', icon: <Landmark size={15} /> },
];

export function RapprochementPanel({ onClose, onChanged, ongletInitial }: { onClose: () => void; onChanged?: () => void; ongletInitial?: Onglet }) {
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial ?? 'integrateurs');
  const [julayaOpen, setJulayaOpen] = useState(false);

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(820px, 97%)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <Banknote size={20} style={{ color: 'var(--accent)' }} /> Rapprochement des paiements
        </h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 14 }}>
          Rapprochez vos encaissements (Mobile Money, chèques…) avec vos factures pour marquer les créances réglées.
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', marginBottom: 18 }}>
          {ONGLETS.map((o) => (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 0, borderBottom: onglet === o.id ? '2px solid var(--accent)' : '2px solid transparent', background: 'transparent', color: onglet === o.id ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: onglet === o.id ? 700 : 500, padding: '8px 10px', marginBottom: -1, fontSize: 12.5 }}
            >
              {o.icon} {o.label}
            </button>
          ))}
        </div>

        {onglet === 'integrateurs' && (
          <SousModule
            titre="Julaya"
            desc="Importez l'export Excel de votre compte Julaya : Feyma rapproche les encaissements par téléphone et vous validez les factures réglées."
            action={<button className="primary" onClick={() => setJulayaOpen(true)}>Importer un relevé Julaya</button>}
            aVenir="Paydunya arrive bientôt."
          />
        )}

        {onglet === 'portefeuilles' && (
          <SousModule
            titre="Wave & Orange Money"
            desc="Rapprochement des relevés de vos portefeuilles Wave et Orange Money."
            aVenir="Bientôt disponible — en attendant, les paiements Wave/OM transitant par Julaya sont déjà couverts par l'onglet « Intégrateurs »."
          />
        )}

        {onglet === 'cheque' && (
          <div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 14 }}>
              Scannez la pile de chèques du jour : la plateforme lit le montant et l'émetteur, identifie le client et propose la facture à régler. Vous n'avez qu'à valider.
            </div>
            <ChequeScanLot onEnregistre={onChanged} />
          </div>
        )}

        {onglet === 'virement' && (
          <SousModule titre="Preuve de virement" desc="Import et rapprochement des justificatifs de virement bancaire." aVenir="Bientôt disponible." />
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>

      {julayaOpen && <ImportRelevePanel onClose={() => setJulayaOpen(false)} onApplied={onChanged} />}
    </div>
  );
}

function SousModule({ titre, desc, action, aVenir }: { titre: string; desc: string; action?: React.ReactNode; aVenir?: string }) {
  return (
    <div style={{ padding: '18px 20px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface, #fff)' }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{titre}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: action ? 14 : 0 }}>{desc}</div>
      {action}
      {aVenir && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 12, fontStyle: 'italic' }}>{aVenir}</div>}
    </div>
  );
}
