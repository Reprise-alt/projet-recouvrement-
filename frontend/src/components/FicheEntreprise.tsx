import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
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
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Organisation>('/api/organisation')
      .then(setOrg)
      .catch(() => setErreur('Impossible de charger la fiche.'));
  }, []);

  function champ<K extends keyof Organisation>(k: K, v: Organisation[K]) {
    setOrg((o) => (o ? { ...o, [k]: v } : o));
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
              <label>Logo (URL)</label>
              <input value={org.logoUrl ?? ''} onChange={(e) => champ('logoUrl', e.target.value)} placeholder="https://…" />
            </div>

            <div className="field">
              <label>Instructions de paiement</label>
              <textarea
                autoFocus={focusPaiement}
                rows={4}
                value={org.instructionsPaiement ?? ''}
                onChange={(e) => champ('instructionsPaiement', e.target.value)}
                placeholder="Ex. Virement CBAO n° 0012345 — ou Wave au 77 000 00 00 — référence : n° de facture."
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                Affichées telles quelles à vos débiteurs dans les relances et le portail.
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
