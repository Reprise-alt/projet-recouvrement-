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
