import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { FeymaMark } from './FeymaLogo';

// Formule recommandée selon la tranche déclarée (addendum §4.2 → §8.2).
const FORMULE_PAR_TRANCHE: Record<string, string> = {
  moins_50: 'Petite structure',
  entre_50_500: 'PME',
  plus_500: 'Grands comptes',
};

// Inscription / connexion self-service par code email (addendum §4). Deux étapes :
//   1) saisie de l'email → envoi d'un code ;
//   2) saisie du code (+ nom de l'entreprise si c'est une première connexion) →
//      connexion, ou création du compte + de l'organisation.
export function InscriptionOtpPage() {
  const { requestOtp, verifyOtp, error } = useAuth();
  const [etape, setEtape] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [raisonSociale, setRaisonSociale] = useState('');
  // Profilage facultatif (addendum §4.2) — utilisé seulement à la première
  // connexion (création du compte), ignoré côté serveur pour une reconnexion.
  const [secteur, setSecteur] = useState('');
  const [tranche, setTranche] = useState<'' | 'moins_50' | 'entre_50_500' | 'plus_500'>('');
  const [outil, setOutil] = useState('');
  // Code de parrainage : prérempli depuis ?parrain= (lien de parrainage partagé).
  const [parrain, setParrain] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('parrain')?.trim().toUpperCase() ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [renvoye, setRenvoye] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await requestOtp(email.trim());
      setEtape('code');
    } catch {
      // erreur exposée via useAuth().error
    } finally {
      setBusy(false);
    }
  }

  async function valider(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyOtp(email.trim(), code.trim(), {
        raisonSociale: raisonSociale.trim() || undefined,
        secteur: secteur.trim() || undefined,
        trancheDebiteurs: tranche || undefined,
        outilFacturation: outil.trim() || undefined,
        codeParrainage: parrain.trim() || undefined,
      });
      // Succès : AuthContext charge l'utilisateur et l'app bascule automatiquement.
      // On nettoie l'URL /inscription → racine (la console prend le relais).
      if (window.location.pathname.startsWith('/inscription')) {
        window.history.replaceState({}, '', '/');
      }
    } catch {
      // erreur exposée via useAuth().error
    } finally {
      setBusy(false);
    }
  }

  async function renvoyer() {
    setBusy(true);
    try {
      await requestOtp(email.trim());
      setRenvoye(true);
      setTimeout(() => setRenvoye(false), 4000);
    } catch {
      /* idem */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap login-feyma">
      <div className="login-brand">
        <span className="brand-mark">
          <FeymaMark size={28} />
        </span>
        <span className="brand-id">
          <b>Feyma</b>
          <small>by OLU 360 — reprenez la main sur vos impayés</small>
        </span>
      </div>

      <div className="login-card">
        {etape === 'email' ? (
          <>
            <h1>Commencer</h1>
            <div className="sub">Inscription ou connexion — un code vous est envoyé par email.</div>
            <form onSubmit={envoyer}>
              <div className="field">
                <label>Votre email professionnel</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@votre-entreprise.sn"
                  autoComplete="email"
                  required
                />
              </div>
              <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Envoi…' : 'Recevoir mon code'}
              </button>
            </form>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-soft)' }}>
              14 jours d'essai gratuit, sans carte bancaire.
            </div>
          </>
        ) : (
          <>
            <h1>Votre code</h1>
            <div className="sub">
              Saisissez le code à 6 chiffres envoyé à <b>{email}</b>.
            </div>
            <form onSubmit={valider}>
              <div className="field">
                <label>Code de connexion</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  required
                  style={{ letterSpacing: '.35em', fontFamily: 'monospace', fontSize: 20, textAlign: 'center' }}
                />
              </div>
              <div className="field">
                <label>
                  Nom de votre entreprise <span style={{ color: 'var(--ink-soft)' }}>(si première connexion)</span>
                </label>
                <input
                  type="text"
                  value={raisonSociale}
                  onChange={(e) => setRaisonSociale(e.target.value)}
                  placeholder="Ex. Alpha SA"
                />
              </div>

              {/* Profilage (§4.2) : trois questions facultatives pour préparer l'espace. */}
              <div className="otp-profil-head">Pour préparer votre espace (facultatif)</div>
              <div className="field">
                <label>Votre secteur d'activité</label>
                <input
                  type="text"
                  value={secteur}
                  onChange={(e) => setSecteur(e.target.value)}
                  placeholder="Ex. Distribution, BTP, services…"
                />
              </div>
              <div className="field">
                <label>Combien de clients en retard de paiement, environ ?</label>
                <select value={tranche} onChange={(e) => setTranche(e.target.value as typeof tranche)}>
                  <option value="">Je ne sais pas encore</option>
                  <option value="moins_50">Moins de 50</option>
                  <option value="entre_50_500">Entre 50 et 500</option>
                  <option value="plus_500">Plus de 500</option>
                </select>
                {tranche && (
                  <div className="otp-reco">
                    Formule recommandée : <b>{FORMULE_PAR_TRANCHE[tranche]}</b>
                  </div>
                )}
              </div>
              <div className="field">
                <label>Votre outil de facturation actuel</label>
                <input
                  type="text"
                  value={outil}
                  onChange={(e) => setOutil(e.target.value)}
                  placeholder="Ex. Excel, Sage, Odoo, aucun…"
                />
              </div>
              <div className="field">
                <label>Code de parrainage</label>
                <input
                  type="text"
                  value={parrain}
                  onChange={(e) => setParrain(e.target.value.toUpperCase())}
                  placeholder="Ex. FEY-7K3Q"
                  style={{ textTransform: 'uppercase' }}
                />
                {parrain.trim() && (
                  <div className="otp-reco">🎁 1 mois d'essai offert en plus grâce à ce parrainage.</div>
                )}
              </div>

              <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Vérification…' : 'Valider'}
              </button>
            </form>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <button
                type="button"
                onClick={() => {
                  setEtape('email');
                  setCode('');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', padding: 0 }}
              >
                ← Changer d'email
              </button>
              <button
                type="button"
                onClick={renvoyer}
                disabled={busy}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
              >
                {renvoye ? 'Code renvoyé ✓' : 'Renvoyer le code'}
              </button>
            </div>
          </>
        )}

        {error && <div className="login-error">{error}</div>}
      </div>

      <div style={{ marginTop: 20, fontSize: 12.5 }}>
        <a href="/presentation" style={{ color: 'var(--ink-soft)' }}>
          Découvrir la plateforme →
        </a>
      </div>
    </div>
  );
}
