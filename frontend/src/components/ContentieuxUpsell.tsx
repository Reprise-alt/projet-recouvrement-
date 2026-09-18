import { useState } from 'react';
import { Check, Gavel, Lock } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useToast } from '../hooks/useToast';

// Écran d'activation du module Contentieux (formule « Petite structure »).
// Le module est inclus pour PME / Grands comptes ; pour Petite, il s'active en
// option (+10 000 FCFA/mois). Facturation hors-ligne : l'activation est
// immédiate et l'exploitant est notifié pour l'ajout au prélèvement.
const AVANTAGES = [
  'Mise en demeure et commandement de payer, dans les règles OHADA',
  'Dossier contentieux prêt à transmettre à l’huissier ou l’avocat',
  'Suivi des propositions de règlement du débiteur (portail débiteur)',
  'Tout reste sur la même plateforme que vos relances amiables',
];

export function ContentieuxUpsell({
  canActivate,
  onActivated,
}: {
  canActivate: boolean;
  onActivated: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function activer() {
    setBusy(true);
    try {
      await api.post('/api/organisation/option-contentieux');
      showToast('Module contentieux activé');
      await onActivated();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur lors de l’activation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '32px auto' }}>
      <div
        style={{
          border: '1px solid var(--line)',
          borderRadius: 18,
          padding: '28px 26px',
          background: 'var(--paper, #fff)',
          boxShadow: '0 1px 2px rgba(0,0,0,.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--paper-2, #f2f4f2)',
              color: 'var(--accent-dark, #177f5e)',
              flex: 'none',
            }}
          >
            <Gavel size={22} />
          </span>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
              <Lock size={12} /> Option non incluse
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 21 }}>Passez au contentieux</h2>
          </div>
        </div>

        <p style={{ color: 'var(--ink-soft)', lineHeight: 1.55, margin: '10px 0 18px' }}>
          Quand l’amiable ne suffit pas, enchaînez sur la procédure sans changer d’outil. Le module
          contentieux est <b>inclus</b> dans les formules PME et Grands comptes ; sur « Petite structure »,
          il s’ajoute en option.
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'grid', gap: 10 }}>
          {AVANTAGES.map((a) => (
            <li key={a} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.45 }}>
              <Check size={17} style={{ flex: 'none', marginTop: 1, color: 'var(--accent-dark, #177f5e)' }} />
              <span>{a}</span>
            </li>
          ))}
        </ul>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--paper-2, #f2f4f2)',
            marginBottom: 18,
          }}
        >
          <b style={{ fontSize: 22 }}>+10 000 FCFA</b>
          <span style={{ color: 'var(--ink-soft)' }}>/ mois · hors taxes</span>
        </div>

        {canActivate ? (
          <>
            <button type="button" onClick={activer} disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Activation…' : 'Activer le module contentieux'}
            </button>
            <p style={{ color: 'var(--ink-soft)', fontSize: 12.5, lineHeight: 1.5, margin: '12px 0 0', textAlign: 'center' }}>
              Activation immédiate. Le montant est ajouté à votre prochain prélèvement — aucun paiement
              en ligne n’est demandé ici.
            </p>
          </>
        ) : (
          <div className="rv-note" style={{ marginBottom: 0 }}>
            <Lock size={15} />
            <span>
              Seul un administrateur du compte peut activer cette option. Rapprochez-vous du responsable
              de votre organisation.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
