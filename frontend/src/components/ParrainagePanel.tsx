import { useState } from 'react';
import { Check, Copy, Gift, Users } from 'lucide-react';
import { useResource } from '../hooks/useResource';
import { fmtDate } from '../lib/constants';

// Panneau de parrainage (« Invitez une entreprise, 1 mois offert »). Affiche le
// code de l'organisation, un lien prêt à partager, et le suivi des filleuls.

interface ParrainageData {
  code: string;
  lien: string;
  moisOffertsGagnes: number;
  nbFilleuls: number;
  nbConfirmes: number;
  filleuls: { raisonSociale: string; actif: boolean; createdAt: string }[];
}

export function ParrainagePanel({ onClose }: { onClose: () => void }) {
  const { data, loading } = useResource<ParrainageData>('/api/parrainage');
  const [copie, setCopie] = useState<'code' | 'lien' | 'msg' | null>(null);

  function copier(quoi: 'code' | 'lien' | 'msg', texte: string) {
    navigator.clipboard?.writeText(texte).then(
      () => {
        setCopie(quoi);
        setTimeout(() => setCopie(null), 1800);
      },
      () => {},
    );
  }

  const message = data
    ? `Je gère mes relances de paiement avec Feyma et ça marche vraiment. Essaie avec mon code parrainage ${data.code} : tu as 1 mois offert.${data.lien ? ` ${data.lien}` : ''}`
    : '';

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(620px, 96%)' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <Gift size={20} style={{ color: 'var(--accent)' }} /> Parrainage
        </h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 18 }}>
          Invitez une entreprise à essayer Feyma. Elle reçoit <b>1 mois d'essai offert</b>, et vous gagnez{' '}
          <b>1 mois offert</b> dès qu'elle devient cliente.
        </div>

        {loading || !data ? (
          <div className="empty-state">Chargement…</div>
        ) : (
          <>
            {/* Code + lien */}
            <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
              <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--accent-soft)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent-dark)', marginBottom: 6 }}>
                  Votre code
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '.04em' }}>{data.code}</span>
                  <button onClick={() => copier('code', data.code)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    {copie === 'code' ? <><Check size={14} /> Copié</> : <><Copy size={14} /> Copier</>}
                  </button>
                </div>
              </div>

              {data.lien && (
                <div>
                  <label style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Lien de parrainage</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input readOnly value={data.lien} style={{ flex: 1, fontSize: 12.5 }} onFocus={(e) => e.target.select()} />
                    <button onClick={() => copier('lien', data.lien)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, flex: 'none' }}>
                      {copie === 'lien' ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              <button className="primary" onClick={() => copier('msg', message)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
                {copie === 'msg' ? <><Check size={15} /> Message copié — collez-le sur WhatsApp</> : <><Copy size={15} /> Copier un message d'invitation</>}
              </button>
            </div>

            {/* Compteurs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <Compteur valeur={data.nbFilleuls} label="Invitées" />
              <Compteur valeur={data.nbConfirmes} label="Devenues clientes" />
              <Compteur valeur={data.moisOffertsGagnes} label="Mois offerts" accent />
            </div>

            {/* Liste des filleuls */}
            {data.filleuls.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)', margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={13} /> Entreprises parrainées
                </div>
                <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                  {data.filleuls.map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', fontSize: 13, borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                      <span>
                        {f.raisonSociale}
                        <span style={{ color: 'var(--ink-soft)', fontSize: 11.5 }}> · {fmtDate(f.createdAt)}</span>
                      </span>
                      <span className="badge" data-tone={f.actif ? 'success' : 'amber'}>{f.actif ? 'Cliente' : "En essai"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 14 }}>
              Le mois offert vous est crédité automatiquement dès qu'une entreprise que vous avez parrainée devient
              cliente. Si votre compte est déjà actif, il est appliqué sur votre prochaine facture.
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function Compteur({ valeur, label, accent }: { valeur: number; label: string; accent?: boolean }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', textAlign: 'center', background: accent ? 'var(--accent-soft)' : 'var(--surface, #fff)' }}>
      <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: accent ? 'var(--accent-dark)' : 'var(--ink)' }}>{valeur}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
