import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Valeurs par défaut du module Opérations -- étapes de démarrage de contrat
// (cahier §5.3) et fenêtres saisonnières par secteur (cahier §5.1). Toutes
// deux explicitement "paramétrables en administration" dans le cahier des
// charges : ce script pose juste le point de départ, à ajuster ensuite
// depuis l'interface. Idempotent (upsert sur les clés naturelles) -- peut
// être relancé sans dupliquer ni écraser un ajustement déjà fait en
// administration au-delà de sa première exécution... sauf si relancé
// explicitement, auquel cas il réécrase les valeurs par défaut : à ne pas
// relancer en production après une première customisation.
const ETAPES_DEMARRAGE = [
  {
    entite: 'SORAM',
    etapes: [
      { cle: 'inst', libelle: 'Parc installé et opérationnel', description: null, delaiJours: 7, ordre: 1 },
      { cle: 'contact', libelle: 'Contact effectué après installation', description: null, delaiJours: 14, ordre: 2 },
      { cle: 'ope', libelle: 'Client opérationnel', description: 'Formation, paramétrage, dispatch des contacts internes', delaiJours: 21, ordre: 3 },
      { cle: 'sat', libelle: 'Point de satisfaction à 30 jours tenu', description: null, delaiJours: 45, ordre: 4 },
      { cle: 'val', libelle: 'Démarrage validé avec le client', description: null, delaiJours: 90, ordre: 5 },
    ],
  },
  {
    entite: 'IRIS',
    etapes: [
      { cle: 'inst', libelle: 'Boîtiers installés sur toute la flotte', description: null, delaiJours: 10, ordre: 1 },
      { cle: 'contact', libelle: 'Contact effectué après installation', description: null, delaiJours: 17, ordre: 2 },
      { cle: 'ope', libelle: 'Client opérationnel', description: 'Formation, paramétrage des alertes et rapports, dispatch des contacts internes', delaiJours: 25, ordre: 3 },
      { cle: 'sat', libelle: 'Point de satisfaction à 30 jours tenu', description: null, delaiJours: 45, ordre: 4 },
      { cle: 'val', libelle: 'Démarrage validé avec le client', description: null, delaiJours: 90, ordre: 5 },
    ],
  },
];

const FENETRES_SAISONNIERES: { secteur: 'education' | 'administration' | 'sante' | 'hotellerie' | 'distribution' | 'agro' | 'btp'; label: string; mois: number; jour: number; anticipationJours: number }[] = [
  { secteur: 'education', label: 'Rentrée scolaire', mois: 10, jour: 1, anticipationJours: 75 },
  { secteur: 'administration', label: "Préparation budgétaire et appels d'offres", mois: 11, jour: 1, anticipationJours: 60 },
  { secteur: 'sante', label: 'Nouvel exercice budgétaire', mois: 1, jour: 1, anticipationJours: 60 },
  { secteur: 'hotellerie', label: 'Haute saison touristique', mois: 11, jour: 1, anticipationJours: 60 },
  { secteur: 'distribution', label: "Pics de fin d'année", mois: 11, jour: 15, anticipationJours: 45 },
  { secteur: 'agro', label: 'Campagne agricole', mois: 11, jour: 1, anticipationJours: 45 },
  { secteur: 'btp', label: 'Reprise après hivernage', mois: 11, jour: 1, anticipationJours: 30 },
];

async function main() {
  const prisma = new PrismaClient();

  for (const { entite, etapes } of ETAPES_DEMARRAGE) {
    for (const etape of etapes) {
      await prisma.etapeDemarrageConfig.upsert({
        where: { entite_cle: { entite, cle: etape.cle } },
        update: { libelle: etape.libelle, description: etape.description, delaiJours: etape.delaiJours, ordre: etape.ordre },
        create: { entite, ...etape },
      });
    }
  }
  console.log(`Étapes de démarrage seedées : ${ETAPES_DEMARRAGE.reduce((n, e) => n + e.etapes.length, 0)} lignes (SORAM + IRIS).`);

  for (const f of FENETRES_SAISONNIERES) {
    await prisma.fenetreSaisonniere.upsert({
      where: { secteur: f.secteur },
      update: { label: f.label, mois: f.mois, jour: f.jour, anticipationJours: f.anticipationJours },
      create: f,
    });
  }
  console.log(`Fenêtres saisonnières seedées : ${FENETRES_SAISONNIERES.length} secteurs.`);

  await prisma.configOperations.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  console.log('Config Opérations initialisée (valeurs par défaut du cahier des charges).');

  await prisma.$disconnect();
}

main();
