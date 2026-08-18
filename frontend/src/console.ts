// Identité de la console servie par ce build. Le dépôt est unique mais il
// produit trois consoles autonomes (recouvrement / operations / coursier),
// déployées chacune sur son propre domaine olu360.com. La valeur est figée à
// la compilation par la variable VITE_CONSOLE (voir vite build sur Render) —
// à défaut, on sert le recouvrement, historiquement la console principale.
export type ConsoleId = 'recouvrement' | 'operations' | 'coursier';

export const CONSOLE: ConsoleId = ((): ConsoleId => {
  const v = import.meta.env.VITE_CONSOLE as string | undefined;
  return v === 'operations' || v === 'coursier' ? v : 'recouvrement';
})();

interface ConsoleMeta {
  // Titre affiché dans la barre supérieure et l'onglet du navigateur.
  titre: string;
  // Périmètre du sélecteur d'entités : 'groupe' = toutes les entités (SORAM,
  // IRIS, SIS...), 'operations' = SORAM et IRIS seulement (cf. cahier §1).
  entites: 'groupe' | 'operations';
}

export const CONSOLE_META: Record<ConsoleId, ConsoleMeta> = {
  recouvrement: { titre: 'Suivi du recouvrement', entites: 'groupe' },
  operations: { titre: 'Suivi des opérations', entites: 'operations' },
  coursier: { titre: 'Planning des coursiers', entites: 'groupe' },
};
