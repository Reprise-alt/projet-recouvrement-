import { createContext, ReactNode, useContext } from 'react';
import { ReglagePalier } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useResource } from '../hooks/useResource';
import { PALIERS } from './constants';

// Réglages de paliers propres à l'organisation (SaaS) : libellés personnalisés
// et activation. Chargés une fois par ouverture d'app (utilisateur connecté) et
// exposés à toute la console, pour que le nom d'un palier renommé s'affiche
// partout (tableau, badges, aperçu de relances), pas seulement dans l'écran de
// réglages. Repli sur les libellés par défaut (lib/constants) tant que rien
// n'est chargé ou personnalisé.
interface PaliersConfigValue {
  reglages: ReglagePalier[];
  // Libellé effectif d'un palier (personnalisé sinon défaut).
  libelle: (palierId: number) => string;
  // Le palier est-il actif dans la séquence de relance ? (défaut : oui.)
  estActif: (palierId: number) => boolean;
  refetch: () => void;
}

const defautLibelle = (id: number) => PALIERS[id]?.label ?? `Palier ${id}`;

const PaliersConfigContext = createContext<PaliersConfigValue>({
  reglages: [],
  libelle: defautLibelle,
  estActif: () => true,
  refetch: () => {},
});

export function PaliersConfigProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Réservé au périmètre recouvrement (l'endpoint l'exige) ; ailleurs, repli.
  const path = user && (user.accesRecouvrement || user.role === 'admin') ? '/api/config/paliers' : null;
  const { data, refetch } = useResource<ReglagePalier[]>(path);
  const parPalier = new Map((data ?? []).map((r) => [r.palier, r]));

  const value: PaliersConfigValue = {
    reglages: data ?? [],
    libelle: (id) => parPalier.get(id)?.libelle || defautLibelle(id),
    estActif: (id) => parPalier.get(id)?.actif ?? true,
    refetch,
  };
  return <PaliersConfigContext.Provider value={value}>{children}</PaliersConfigContext.Provider>;
}

export function usePaliersConfig(): PaliersConfigValue {
  return useContext(PaliersConfigContext);
}
