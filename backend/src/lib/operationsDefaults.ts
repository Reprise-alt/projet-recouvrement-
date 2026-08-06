// Étapes de démarrage par défaut (cahier §5.3) -- posées pour SORAM et IRIS
// par prisma/seedOperations.ts au provisioning initial. Toute entité créée
// depuis l'admin des entreprises (SIS, ou une future entité) n'a pas ces
// lignes : réexportée ici pour que la route d'initialisation à la demande
// (POST /etapes-demarrage/init-defaut) applique exactement les mêmes valeurs
// sans dupliquer la liste.
export const ETAPES_DEMARRAGE_DEFAUT = [
  { cle: 'inst', libelle: 'Parc installé et opérationnel', description: null as string | null, delaiJours: 7, ordre: 1 },
  { cle: 'contact', libelle: 'Contact effectué après installation', description: null as string | null, delaiJours: 14, ordre: 2 },
  { cle: 'ope', libelle: 'Client opérationnel', description: 'Formation, paramétrage, dispatch des contacts internes', delaiJours: 21, ordre: 3 },
  { cle: 'sat', libelle: 'Point de satisfaction à 30 jours tenu', description: null as string | null, delaiJours: 45, ordre: 4 },
  { cle: 'val', libelle: 'Démarrage validé avec le client', description: null as string | null, delaiJours: 90, ordre: 5 },
];
