import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';

// Formulaire de prise de contact (page vitrine, public). Deux usages :
//   - « rappel » : offre grands comptes → un conseiller rappelle (tél requis) ;
//   - « demo »   : demande de démonstration → on recontacte (email suffit).
// La demande est envoyée à l'équipe (POST /api/contact) et enregistrée en base.
export type SujetContact = 'rappel' | 'demo';

interface Config {
  titre: string;
  sousTitre: string;
  telRequis: boolean;
  besoinLabel: string;
  besoinPlaceholder: string;
  envoi: string;
  succes: (nom: string) => string;
}

const CONFIGS: Record<SujetContact, Config> = {
  rappel: {
    titre: 'Être rappelé — offre grands comptes',
    sousTitre:
      'Laissez vos coordonnées : un conseiller vous rappelle pour cadrer vos besoins (multi-sociétés, volumes, contentieux) et établir un devis.',
    telRequis: true,
    besoinLabel: 'Votre besoin (facultatif)',
    besoinPlaceholder: 'Nombre de sociétés, volume de débiteurs, échéance…',
    envoi: 'Être rappelé',
    succes: (nom) => `Merci ${nom}. Notre équipe vous rappelle sous 24 h ouvrées au numéro indiqué.`,
  },
  demo: {
    titre: 'Demander une démonstration',
    sousTitre:
      'Voyez la plateforme en conditions réelles. Laissez vos coordonnées, on vous programme une démo (~20 min, en ligne ou sur place).',
    telRequis: false,
    besoinLabel: 'Un mot sur votre activité (facultatif)',
    besoinPlaceholder: 'Votre secteur, vos volumes de factures, votre outil actuel…',
    envoi: 'Demander une démo',
    succes: (nom) => `Merci ${nom}. On vous recontacte très vite pour convenir d’un créneau de démonstration.`,
  },
};

export function ContactRappelModal({ onClose, sujet = 'rappel' }: { onClose: () => void; sujet?: SujetContact }) {
  const cfg = CONFIGS[sujet];
  const [nom, setNom] = useState('');
  const [societe, setSociete] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setBusy(true);
    try {
      await api.post('/api/contact', {
        type: sujet,
        nom: nom.trim(),
        societe: societe.trim() || undefined,
        telephone: telephone.trim() || undefined,
        email: email.trim(),
        message: message.trim() || undefined,
      });
      setEnvoye(true);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Envoi impossible — réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 'min(480px, 96%)' }}>
        {envoye ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
            <h2 style={{ marginBottom: 8 }}>Demande envoyée</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, lineHeight: 1.55 }}>{cfg.succes(nom.trim() || '')}</p>
            <button className="primary" style={{ marginTop: 18 }} onClick={onClose}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ marginBottom: 4 }}>{cfg.titre}</h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{cfg.sousTitre}</div>
            <form onSubmit={envoyer}>
              <div className="field">
                <label>Nom et prénom *</label>
                <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={200} autoFocus />
              </div>
              <div className="field">
                <label>Société</label>
                <input type="text" value={societe} onChange={(e) => setSociete(e.target.value)} maxLength={200} placeholder="Votre entreprise" />
              </div>
              <div className="field">
                <label>Téléphone{cfg.telRequis ? ' *' : ''}</label>
                <input
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  required={cfg.telRequis}
                  maxLength={40}
                  placeholder="+221 …"
                  autoComplete="tel"
                />
              </div>
              <div className="field">
                <label>Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} autoComplete="email" />
              </div>
              <div className="field">
                <label>{cfg.besoinLabel}</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={3} placeholder={cfg.besoinPlaceholder} />
              </div>

              {erreur && <div className="login-error">{erreur}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={onClose} disabled={busy}>
                  Annuler
                </button>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? 'Envoi…' : cfg.envoi}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
