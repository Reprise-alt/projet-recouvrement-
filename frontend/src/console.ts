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
  // Nom de marque, affiché dans le bloc logo (« Console X / By Olu360 »),
  // aligné sur les autres consoles du groupe (SAV, Smart Reporting, Relevés).
  marque: string;
  // Titre de la page, sous le bloc de marque et dans l'onglet du navigateur.
  titre: string;
  // Périmètre du sélecteur d'entités : 'groupe' = toutes les entités (SORAM,
  // IRIS, SIS...), 'operations' = SORAM et IRIS seulement (cf. cahier §1).
  entites: 'groupe' | 'operations';
}

export const CONSOLE_META: Record<ConsoleId, ConsoleMeta> = {
  recouvrement: { marque: 'Console Recouvrement', titre: 'Suivi du recouvrement', entites: 'groupe' },
  operations: { marque: 'Console Opérations', titre: 'Suivi des opérations', entites: 'operations' },
  coursier: { marque: 'Console Coursier', titre: 'Planning des coursiers', entites: 'groupe' },
};
