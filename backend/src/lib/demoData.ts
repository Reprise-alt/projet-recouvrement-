// Espace de démonstration (addendum §4.3) : jeu de données FICTIF, jamais écrit
// en base — servi tel quel au front pour un aperçu « prêt à l'emploi », toujours
// séparé des vraies données du client. Montants en XOF, contexte sénégalais.

export interface DemoFacture {
  numero: string;
  montant: number;
  echeance: string; // ISO
  joursRetard: number;
  palier: number; // 0..8
}
export interface DemoDebiteur {
  nom: string;
  contact: string;
  email: string;
  totalDu: number;
  factures: DemoFacture[];
}

export const DEMO_DEBITEURS: DemoDebiteur[] = [
  {
    nom: 'Clinique du Plateau',
    contact: 'Dr. A. Ndiaye',
    email: 'compta@cliniqueplateau.sn',
    totalDu: 4_800_000,
    factures: [
      { numero: 'FAC-2026-0142', montant: 2_800_000, echeance: '2026-07-31', joursRetard: 47, palier: 5 },
      { numero: 'FAC-2026-0176', montant: 2_000_000, echeance: '2026-08-31', joursRetard: 16, palier: 3 },
    ],
  },
  {
    nom: 'Ets. Diallo & Fils',
    contact: 'M. Diallo',
    email: 'contact@dialloetfils.sn',
    totalDu: 1_250_000,
    factures: [{ numero: 'FAC-2026-0203', montant: 1_250_000, echeance: '2026-09-05', joursRetard: 11, palier: 2 }],
  },
  {
    nom: 'Résidence Les Almadies',
    contact: 'Service comptabilité',
    email: 'finance@residence-almadies.sn',
    totalDu: 3_400_000,
    factures: [{ numero: 'FAC-2026-0088', montant: 3_400_000, echeance: '2026-06-30', joursRetard: 78, palier: 7 }],
  },
  {
    nom: 'Boulangerie Teranga',
    contact: 'Mme Sow',
    email: 'teranga.sow@gmail.com',
    totalDu: 320_000,
    factures: [{ numero: 'FAC-2026-0219', montant: 320_000, echeance: '2026-09-14', joursRetard: 2, palier: 1 }],
  },
];

export function demoSynthese() {
  const debiteurs = DEMO_DEBITEURS.length;
  const encours = DEMO_DEBITEURS.reduce((a, d) => a + d.totalDu, 0);
  const enAlerte = DEMO_DEBITEURS.filter((d) => d.factures.some((f) => f.palier >= 5)).length;
  return { debiteurs, encours, enAlerte, devise: 'XOF' };
}

// Aperçu de la relance « test » (§4.3 : montrer au client ce que recevront ses
// débiteurs), au nom de l'entreprise, avec ses instructions de paiement.
export function apercuRelanceTest(entreprise: string, instructionsPaiement: string | null) {
  const d = DEMO_DEBITEURS[0];
  const f = d.factures[0];
  const montant = f.montant.toLocaleString('fr-FR');
  const total = d.totalDu.toLocaleString('fr-FR');
  const instructions = (instructionsPaiement || '').trim() ||
    '[Vos instructions de paiement apparaîtront ici une fois renseignées]';
  const subject = `Relance — facture ${f.numero} en attente de règlement`;
  const text = [
    `Objet : ${subject}`,
    '',
    `Madame, Monsieur (${d.contact}),`,
    '',
    `Sauf erreur de notre part, la facture ${f.numero} d'un montant de ${montant} FCFA,`,
    `échue depuis ${f.joursRetard} jours, demeure impayée. Votre solde dû s'élève à ${total} FCFA.`,
    '',
    'Nous vous remercions de bien vouloir procéder au règlement selon les modalités suivantes :',
    instructions,
    '',
    `Cordialement,`,
    entreprise,
    '',
    '— Ceci est une relance TEST envoyée par OLU 360 pour vous montrer ce que recevront vos débiteurs. —',
  ].join('\n');
  return { subject, text };
}
