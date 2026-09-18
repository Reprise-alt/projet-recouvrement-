import { useAuth } from '../auth/AuthContext';
import { EtatAbonnement } from '../api/types';
import { OffresAbonnement } from './OffresAbonnement';

// Écran de blocage doux (addendum §8) : affiché à la place de la console quand
// l'essai est terminé ou le compte suspendu. On ne supprime rien — les données
// sont conservées ; il suffit d'activer l'abonnement pour tout retrouver.
export function AbonnementBloque({ etat }: { etat: EtatAbonnement }) {
  const { user, logout } = useAuth();
  const suspendu = etat === 'suspendu';

  return (
    <div className="empty-state" style={{ maxWidth: 760, margin: '64px auto', textAlign: 'center' }}>
      <h2 style={{ marginBottom: 8 }}>{suspendu ? 'Compte suspendu' : "Votre essai est terminé"}</h2>
      <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>
        {suspendu ? (
          <>Votre accès est temporairement suspendu. Vos données sont conservées.</>
        ) : (
          <>
            Merci d'avoir testé Feyma{user?.raisonSociale ? `, ${user.raisonSociale}` : ''} ! Votre période
            d'essai gratuite est terminée. Vos données et vos réglages sont conservés — activez votre abonnement
            pour reprendre là où vous vous êtes arrêté.
          </>
        )}
      </p>
      <div style={{ marginTop: 20, textAlign: 'left' }}>
        <OffresAbonnement formuleRecommandee={user?.formule} />
      </div>
      <button onClick={() => logout()} style={{ marginTop: 20 }}>
        Se déconnecter
      </button>
    </div>
  );
}
