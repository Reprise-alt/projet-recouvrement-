// Jeu d'exemple INJECTABLE en base (à la différence de demoData.ts qui n'est
// qu'un aperçu en lecture seule). Permet au prospect d'explorer une console
// peuplée — relances, paliers, reporting — avant d'avoir préparé son fichier.
// Les créances portent estExemple=true : jamais comptées comme de vraies
// créances et supprimables d'un clic. Échéances calculées par rapport à
// aujourd'hui pour que les retards (et donc les paliers) restent réalistes dans
// le temps. Contexte sénégalais, montants en XOF.

interface FactureExemple {
  numero: string;
  montant: number;
  joursRetard: number; // échéance = aujourd'hui - joursRetard
}
interface ClientExemple {
  nom: string;
  contact: string;
  email: string;
  tel: string;
  factures: FactureExemple[];
}

const MODELE: ClientExemple[] = [
  {
    nom: 'Clinique du Plateau (exemple)',
    contact: 'Dr. A. Ndiaye',
    email: 'exemple+clinique@feyma.app',
    tel: '+221 33 821 10 10',
    factures: [
      { numero: 'EX-2026-0142', montant: 2_800_000, joursRetard: 47 },
      { numero: 'EX-2026-0176', montant: 2_000_000, joursRetard: 16 },
    ],
  },
  {
    nom: 'Ets. Diallo & Fils (exemple)',
    contact: 'M. Diallo',
    email: 'exemple+diallo@feyma.app',
    tel: '+221 77 512 34 56',
    factures: [{ numero: 'EX-2026-0203', montant: 1_250_000, joursRetard: 11 }],
  },
  {
    nom: 'Résidence Les Almadies (exemple)',
    contact: 'Service comptabilité',
    email: 'exemple+almadies@feyma.app',
    tel: '+221 33 869 22 00',
    factures: [{ numero: 'EX-2026-0088', montant: 3_400_000, joursRetard: 78 }],
  },
  {
    nom: 'Boulangerie Teranga (exemple)',
    contact: 'Mme Sow',
    email: 'exemple+teranga@feyma.app',
    tel: '+221 76 440 09 11',
    factures: [{ numero: 'EX-2026-0219', montant: 320_000, joursRetard: 2 }],
  },
];

function echeance(joursRetard: number, now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - joursRetard);
  return d;
}

// Prépare les clients d'exemple pour une création Prisma imbriquée dans une
// organisation/entité donnée. `now` injectable pour les tests.
export function construireClientsExemple(
  organisationId: string,
  entite: string,
  now: Date = new Date(),
) {
  return MODELE.map((c) => ({
    organisationId,
    entite,
    nom: c.nom,
    contact: c.contact,
    email: c.email,
    tel: c.tel,
    estExemple: true,
    factures: {
      create: c.factures.map((f) => ({
        numero: f.numero,
        montant: f.montant,
        dateEcheance: echeance(f.joursRetard, now),
        statut: 'impayee' as const,
      })),
    },
  }));
}

export const NB_CLIENTS_EXEMPLE = MODELE.length;
