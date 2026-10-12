import { useEffect } from 'react';
import { getImpersonateOrg, getImpersonateLabel, setImpersonateOrg } from '../api/client';

// Bandeau persistant affiché quand un super-admin « ouvre la console » d'une
// organisation (impersonation). Rappelle l'identité empruntée et permet de
// revenir à son propre compte. Monté à la racine → visible sur tous les écrans.
export function ImpersonationBanner() {
  const orgId = getImpersonateOrg();
  const label = getImpersonateLabel();

  // Décale le contenu pour ne pas masquer l'en-tête de l'application.
  useEffect(() => {
    if (!orgId) return;
    const prev = document.body.style.paddingTop;
    document.body.style.paddingTop = '34px';
    return () => {
      document.body.style.paddingTop = prev;
    };
  }, [orgId]);

  if (!orgId) return null;

  function quitter() {
    setImpersonateOrg(null);
    window.location.reload();
  }

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#7a1f1f',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 1px 6px rgba(0,0,0,.25)',
      }}
    >
      <span>
        Vous agissez en tant que <strong>{label || 'organisation prospect'}</strong> — impersonation super-admin
      </span>
      <button
        onClick={quitter}
        style={{
          background: '#fff',
          color: '#7a1f1f',
          border: 'none',
          borderRadius: 6,
          padding: '3px 10px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Revenir à mon compte
      </button>
    </div>
  );
}
