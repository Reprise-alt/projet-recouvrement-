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
  // Sous-titre d'une ligne, sous le titre de page.
  sous: string;
  // Périmètre du sélecteur d'entités : 'groupe' = toutes les entités (SORAM,
  // IRIS, SIS...), 'operations' = SORAM et IRIS seulement (cf. cahier §1).
  entites: 'groupe' | 'operations';
}

export const CONSOLE_META: Record<ConsoleId, ConsoleMeta> = {
  recouvrement: {
    marque: 'Console Recouvrement',
    titre: 'Suivi du recouvrement',
    sous: 'Relances, paliers et encours — SORAM · IRIS · SIS',
    entites: 'groupe',
  },
  operations: {
    marque: 'Console Opérations',
    titre: 'Suivi des opérations',
    sous: 'Suivi relationnel du portefeuille SORAM · IRIS',
    entites: 'operations',
  },
  coursier: {
    marque: 'Console Coursier',
    titre: 'Planning des coursiers',
    sous: 'Tournées, tâches et rapports des coursiers',
    entites: 'groupe',
  },
};

// Les autres consoles de l'écosystème OLU 360, pour le sélecteur « Changer de
// console » du rail. `id` correspond à ConsoleId pour les trois consoles de ce
// dépôt (afin de marquer la console courante) ; les autres pointent vers leurs
// domaines respectifs. En dev/preview les liens restent absolus vers *.olu360.
export const ECOSYSTEME: { id: string; label: string; url: string }[] = [
  { id: 'recouvrement', label: 'Recouvrement', url: 'https://recouvrement.olu360.com' },
  { id: 'operations', label: 'Opérations', url: 'https://operations.olu360.com' },
  { id: 'coursier', label: 'Coursier', url: 'https://coursier.olu360.com' },
  { id: 'sav', label: 'SAV', url: 'https://sav.olu360.com' },
  { id: 'fleet', label: 'Smart Reporting', url: 'https://fleet.olu360.com' },
  { id: 'releves', label: 'Relevés compteurs', url: 'https://releves.olu360.com' },
];
