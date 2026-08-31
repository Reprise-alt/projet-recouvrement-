import { describe, it, expect } from 'vitest';
import { genererLettreAugmentationPdf } from '../src/lib/actes/actesContentieux';
import { logoEntite, mentionsLegales } from '../src/lib/actes/mentionsLegales';

describe('genererLettreAugmentationPdf', () => {
  it('produit un PDF valide avec en-tête société', async () => {
    const base = mentionsLegales('SORAM');
    const pdf = await genererLettreAugmentationPdf({
      societe: { nom: base!.nom!, adresse: base?.adresse, rccm: base?.rccm, ninea: base?.ninea, tel: base?.tel, logo: logoEntite('SORAM') },
      clientNom: 'CLUB TIOSSANE',
      clientContact: 'M. le Directeur',
      numeroContrat: 'Leasing',
      taux: 5,
      dateEffet: new Date('2027-05-23'),
      surNotification: false,
      signataireNom: base?.signataireNom,
      signataireQualite: base?.signataireQualite,
    });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

import { genererLettreRevisionGeneralePdf, genererLettresRevisionLotPdf } from '../src/lib/actes/actesContentieux';

describe('lettre de révision tarifaire générale', () => {
  const base = mentionsLegales('SORAM');
  const societe = { nom: base!.nom!, adresse: base?.adresse, rccm: base?.rccm, ninea: base?.ninea, tel: base?.tel, logo: logoEntite('SORAM') };

  it('génère une lettre individuelle (PDF valide)', async () => {
    const pdf = await genererLettreRevisionGeneralePdf({
      societe, clientNom: 'CLIENT SANS AUGMENTATION', taux: 5.5, dateEffet: new Date('2026-10-01'),
      signataireNom: base?.signataireNom, signataireQualite: base?.signataireQualite,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('génère un lot multi-clients en un seul PDF', async () => {
    const one = { societe, taux: 5.5, dateEffet: new Date('2026-10-01') };
    const pdf = await genererLettresRevisionLotPdf([
      { ...one, clientNom: 'CLIENT A' },
      { ...one, clientNom: 'CLIENT B' },
      { ...one, clientNom: 'CLIENT C' },
    ]);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
