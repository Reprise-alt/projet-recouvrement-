import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Organisation } from '../api/types';

// Fiche entreprise (addendum §3, §4.3 étapes 1-2) : identité, identifiants fiscaux,
// logo, et instructions de paiement affichées aux débiteurs. Modal branché sur
// /api/organisation. `focusPaiement` fait défiler vers les instructions (étape 2).
export function FicheEntreprise({
  onClose,
  onSaved,
  focusPaiement,
}: {
  onClose: () => void;
  onSaved: () => void;
  focusPaiement?: boolean;
}) {
  const [org, setOrg] = useState<Organisation | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailResult, setEmailResult] = useState<{
    ok: boolean;
    mode?: string;
    message?: string;
    error?: string;
    keySource?: string;
    keyHint?: string;
    keyLength?: number;
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  // Envoie un email de test à l'administrateur et affiche le résultat exact
  // (mode actif + succès ou erreur) — pour vérifier la délivrabilité.
  async function testerEmail() {
    setEmailBusy(true);
    setEmailResult(null);
    try {
      const r = await api.post<typeof emailResult & object>('/api/organisation/test-email', {});
      setEmailResult(r);
    } catch (err) {
      setEmailResult({ ok: false, error: err instanceof ApiError ? err.message : 'Échec de l’envoi.' });
    } finally {
      setEmailBusy(false);
    }
  }

  useEffect(() => {
    api
      .get<Organisation>('/api/organisation')
      .then(setOrg)
      .catch(() => setErreur('Impossible de charger la fiche.'));
  }, []);

  function champ<K extends keyof Organisation>(k: K, v: Organisation[K]) {
    setOrg((o) => (o ? { ...o, [k]: v } : o));
  }

  // Téléverse un fichier logo : le backend le stocke et renvoie l'URL publique
  // (utilisable dans les emails), qu'on reflète aussitôt dans logoUrl.
  async function televerserLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-choisir le même fichier ensuite
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setErreur('Logo trop lourd (max 1 Mo).');
      return;
    }
    setLogoBusy(true);
    setErreur(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const { logoUrl } = await api.upload<{ logoUrl: string }>('/api/organisation/logo', form);
      champ('logoUrl', logoUrl);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Échec du téléversement du logo.');
    } finally {
      setLogoBusy(false);
    }
  }

  // Téléverse l'image du QR Wave (stockée + servie par une URL publique).
  async function televerserQr(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setErreur('Image trop lourde (max 1 Mo).');
      return;
    }
    setQrBusy(true);
    setErreur(null);
    try {
      const { waveQrUrl } = await (async () => {
        const form = new FormData();
        form.append('file', file);
        return api.upload<{ waveQrUrl: string }>('/api/organisation/wave-qr', form);
      })();
      champ('waveQrUrl', waveQrUrl);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Échec du téléversement du QR.');
    } finally {
      setQrBusy(false);
    }
  }

  async function retirerQr() {
    setQrBusy(true);
    try {
      await api.delete('/api/organisation/wave-qr');
      champ('waveQrUrl', null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Échec du retrait du QR.');
    } finally {
      setQrBusy(false);
    }
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    setErreur(null);
    try {
      await api.patch('/api/organisation', {
        raisonSociale: org.raisonSociale,
        pays: org.pays,
        identifiantFiscal: org.identifiantFiscal,
        rccm: org.rccm,
        formeJuridique: org.formeJuridique,
        capitalSocial: org.capitalSocial,
        nomDirigeant: org.nomDirigeant,
        cniDirigeant: org.cniDirigeant,
        adresse: org.adresse,
        logoUrl: org.logoUrl,
        instructionsPaiement: org.instructionsPaiement,
        waveLien: org.waveLien,
        orangeMoneyNumero: org.orangeMoneyNumero,
        contactRecouvrement: org.contactRecouvrement,
        emailReponse: org.emailReponse,
      });
      onSaved();
      onClose();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Échec de l’enregistrement');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2 style={{ marginBottom: 4 }}>Fiche entreprise</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Ces informations figurent sur vos courriers et sur le portail de vos débiteurs.
        </div>

        {!org ? (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{erreur || 'Chargement…'}</div>
        ) : (
          <form onSubmit={enregistrer}>
            <div className="field">
              <label>Raison sociale</label>
              <input value={org.raisonSociale ?? ''} onChange={(e) => champ('raisonSociale', e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Pays</label>
                <select value={org.pays} onChange={(e) => champ('pays', e.target.value as Organisation['pays'])}>
                  <option value="SN">Sénégal</option>
                  <option value="CI">Côte d’Ivoire</option>
                </select>
              </div>
              <div className="field">
                <label>{org.pays === 'CI' ? 'IFU' : 'NINEA'}</label>
                <input value={org.identifiantFiscal ?? ''} onChange={(e) => champ('identifiantFiscal', e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>RCCM</label>
                <input value={org.rccm ?? ''} onChange={(e) => champ('rccm', e.target.value)} />
              </div>
              <div className="field">
                <label>Contact recouvrement</label>
                <input
                  value={org.contactRecouvrement ?? ''}
                  onChange={(e) => champ('contactRecouvrement', e.target.value)}
                  placeholder="email ou téléphone"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Forme juridique</label>
                <input value={org.formeJuridique ?? ''} onChange={(e) => champ('formeJuridique', e.target.value)} placeholder="Ex. SARL, SAS…" />
              </div>
              <div className="field">
                <label>Capital social</label>
                <input value={org.capitalSocial ?? ''} onChange={(e) => champ('capitalSocial', e.target.value)} placeholder="Ex. 500 000 FCFA" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Nom du dirigeant</label>
                <input value={org.nomDirigeant ?? ''} onChange={(e) => champ('nomDirigeant', e.target.value)} placeholder="Représentant légal" />
              </div>
              <div className="field">
                <label>CNI du dirigeant</label>
                <input value={org.cniDirigeant ?? ''} onChange={(e) => champ('cniDirigeant', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Adresse</label>
              <input value={org.adresse ?? ''} onChange={(e) => champ('adresse', e.target.value)} />
            </div>

            <div className="field">
              <label>Email de réponse aux relances</label>
              <input
                type="email"
                value={org.emailReponse ?? ''}
                onChange={(e) => champ('emailReponse', e.target.value)}
                placeholder="recouvrement@votre-entreprise.sn"
              />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                Vos relances partent à votre nom ; si un débiteur répond, sa réponse arrive à cette adresse.
              </div>
            </div>

            <div className="field">
              <label>Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                {org.logoUrl ? (
                  <img
                    src={org.logoUrl}
                    alt="Logo"
                    style={{ maxHeight: 44, maxWidth: 160, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, padding: 4, background: '#fff' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun logo</span>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={televerserLogo}
                />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={logoBusy}>
                  {logoBusy ? 'Envoi…' : org.logoUrl ? 'Remplacer' : 'Téléverser un logo'}
                </button>
              </div>
              <label style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>ou coller une URL externe</label>
              <input value={org.logoUrl ?? ''} onChange={(e) => champ('logoUrl', e.target.value)} placeholder="https://…" />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                PNG ou JPEG conseillé (max 1 Mo) pour un affichage fiable dans les emails.
              </div>
            </div>

            <div className="field">
              <label>Paiement en ligne (Mobile Money / agrégateur)</label>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', margin: '2px 0 10px' }}>
                Un bouton « Payer maintenant » apparaît dans vos relances et le portail, avec le montant dû pré-rempli.
                Le plus rapide pour être payé.
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Lien de paiement (Wave, Julaya, Orange Money…)</label>
                  <input
                    autoFocus={focusPaiement}
                    type="url"
                    value={org.waveLien ?? ''}
                    onChange={(e) => champ('waveLien', e.target.value)}
                    placeholder="https://pro.julaya.co/payment/… ou https://pay.wave.com/…"
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                    Collez le lien de paiement de votre agrégateur (Julaya, Wave…). Astuce : si votre lien accepte un
                    montant, écrivez <code>{'{montant}'}</code> à sa place — il sera remplacé par la somme due.
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--ink-soft)' }}>QR code de paiement (image)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    {org.waveQrUrl ? (
                      <img
                        src={org.waveQrUrl}
                        alt="QR Wave"
                        style={{ width: 72, height: 72, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: 4 }}
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Aucun QR</span>
                    )}
                    <input ref={qrInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={televerserQr} />
                    <button type="button" onClick={() => qrInputRef.current?.click()} disabled={qrBusy}>
                      {qrBusy ? 'Envoi…' : org.waveQrUrl ? 'Remplacer' : 'Téléverser le QR'}
                    </button>
                    {org.waveQrUrl && (
                      <button type="button" onClick={retirerQr} disabled={qrBusy} style={{ color: 'var(--danger)' }}>
                        Retirer
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                    PNG ou JPEG (QR Julaya, Wave…). Si vous n’avez que le QR en PDF, faites-en une capture d’écran.
                    Il s’affichera dans vos relances et le portail pour que le débiteur le scanne.
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Numéro Orange Money</label>
                  <input
                    type="tel"
                    value={org.orangeMoneyNumero ?? ''}
                    onChange={(e) => champ('orangeMoneyNumero', e.target.value)}
                    placeholder="Ex. 77 000 00 00 (numéro marchand ou compte)"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label>Autres modalités de paiement</label>
              <textarea
                rows={3}
                value={org.instructionsPaiement ?? ''}
                onChange={(e) => champ('instructionsPaiement', e.target.value)}
                placeholder="Ex. Virement CBAO n° 0012345 — référence : n° de facture."
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                Affichées telles quelles à vos débiteurs, sous le bouton Mobile Money.
              </div>
            </div>

            <div className="field">
              <label>Diagnostic e-mail</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={testerEmail} disabled={emailBusy}>
                  {emailBusy ? 'Envoi…' : "M'envoyer un email de test"}
                </button>
                {emailResult && (
                  <span style={{ fontSize: 12.5, color: emailResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                    {emailResult.ok
                      ? emailResult.message ?? 'Email de test envoyé.'
                      : emailResult.error
                        ? `Échec : ${emailResult.error}`
                        : emailResult.message ?? 'Aucun envoi (mode test).'}
                  </span>
                )}
              </div>
              {emailResult && (emailResult.mode || emailResult.keySource) && (
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  mode : {emailResult.mode ?? '—'} · clé : {emailResult.keySource ?? '—'} ({emailResult.keyHint ?? '—'},{' '}
                  {emailResult.keyLength ?? 0} car.)
                </div>
              )}
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                Confirme que vos relances partent réellement à vos débiteurs. Si vous recevez l'email (vérifiez les spams),
                l'envoi est opérationnel.
              </div>
            </div>

            {erreur && <div className="login-error">{erreur}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={onClose}>
                Annuler
              </button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
