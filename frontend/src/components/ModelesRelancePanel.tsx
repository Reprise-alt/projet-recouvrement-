import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

// Éditeur de modèles de relance (addendum §5.3). L'administrateur personnalise,
// par palier, le sujet et le corps des relances automatiques (variables + aperçu
// de marque). Sans personnalisation, le modèle par défaut s'applique.
interface Variable {
  cle: string;
  desc: string;
}
interface Modele {
  palier: number;
  label: string;
  sujet: string;
  corps: string;
  personnalise: boolean;
}

export function ModelesRelancePanel({ onClose }: { onClose: () => void }) {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [sel, setSel] = useState<number>(1);
  const [sujet, setSujet] = useState('');
  const [corps, setCorps] = useState('');
  const [apercuHtml, setApercuHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Champ actif pour l'insertion de variables (sujet ou corps).
  const dernierChamp = useRef<'sujet' | 'corps'>('corps');
  const sujetRef = useRef<HTMLInputElement>(null);
  const corpsRef = useRef<HTMLTextAreaElement>(null);

  function charger() {
    api
      .get<{ variables: Variable[]; modeles: Modele[] }>('/api/relances/modeles')
      .then((d) => {
        setVariables(d.variables);
        setModeles(d.modeles);
      })
      .catch(() => setErreur('Impossible de charger les modèles.'));
  }
  useEffect(charger, []);

  // Charge le palier sélectionné dans l'éditeur.
  useEffect(() => {
    const m = modeles.find((x) => x.palier === sel);
    if (m) {
      setSujet(m.sujet);
      setCorps(m.corps);
      setApercuHtml(null);
    }
  }, [sel, modeles]);

  const courant = modeles.find((m) => m.palier === sel);

  function insererVariable(cle: string) {
    const jeton = `{${cle}}`;
    if (dernierChamp.current === 'sujet') {
      const el = sujetRef.current;
      const pos = el?.selectionStart ?? sujet.length;
      setSujet(sujet.slice(0, pos) + jeton + sujet.slice(pos));
    } else {
      const el = corpsRef.current;
      const pos = el?.selectionStart ?? corps.length;
      setCorps(corps.slice(0, pos) + jeton + corps.slice(pos));
    }
  }

  async function apercu() {
    setBusy(true);
    setErreur(null);
    try {
      const r = await api.post<{ html: string }>(`/api/relances/modeles/${sel}/apercu`, { sujet, corps });
      setApercuHtml(r.html);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l’aperçu');
    } finally {
      setBusy(false);
    }
  }

  async function enregistrer() {
    setBusy(true);
    setErreur(null);
    try {
      await api.put(`/api/relances/modeles/${sel}`, { sujet, corps });
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l’enregistrement');
    } finally {
      setBusy(false);
    }
  }

  async function reinitialiser() {
    setBusy(true);
    setErreur(null);
    try {
      const r = await api.delete<Modele>(`/api/relances/modeles/${sel}`);
      setSujet(r.sujet);
      setCorps(r.corps);
      setApercuHtml(null);
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de la réinitialisation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal mr-modal">
        <h2 style={{ marginBottom: 4 }}>Modèles de relance</h2>
        <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
          Personnalisez le message envoyé à chaque palier. Vos relances partent à votre nom, avec votre logo et vos coordonnées.
        </div>

        <div className="mr-grid">
          {/* Colonne paliers */}
          <div className="mr-paliers">
            {modeles.map((m) => (
              <button
                key={m.palier}
                className={`mr-palier${m.palier === sel ? ' active' : ''}`}
                onClick={() => setSel(m.palier)}
              >
                <span>{m.label}</span>
                {m.personnalise && <span className="mr-badge">Personnalisé</span>}
              </button>
            ))}
          </div>

          {/* Éditeur */}
          <div className="mr-editeur">
            <div className="field">
              <label>Sujet de l’email</label>
              <input
                ref={sujetRef}
                value={sujet}
                onFocus={() => (dernierChamp.current = 'sujet')}
                onChange={(e) => setSujet(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea
                ref={corpsRef}
                rows={9}
                value={corps}
                onFocus={() => (dernierChamp.current = 'corps')}
                onChange={(e) => setCorps(e.target.value)}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </div>
            <div className="mr-vars">
              <span className="mr-vars-label">Variables (cliquer pour insérer) :</span>
              {variables.map((v) => (
                <button key={v.cle} type="button" className="mr-var" title={v.desc} onClick={() => insererVariable(v.cle)}>
                  {`{${v.cle}}`}
                </button>
              ))}
            </div>

            {apercuHtml && (
              <div className="mr-apercu">
                <div className="mr-apercu-label">Aperçu</div>
                <iframe title="Aperçu de la relance" srcDoc={apercuHtml} className="mr-iframe" />
              </div>
            )}

            {erreur && <div className="login-error">{erreur}</div>}

            <div className="mr-actions">
              <button type="button" onClick={reinitialiser} disabled={busy || !courant?.personnalise}>
                Rétablir le modèle par défaut
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={apercu} disabled={busy}>
                Aperçu
              </button>
              <button type="button" className="primary" onClick={enregistrer} disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
