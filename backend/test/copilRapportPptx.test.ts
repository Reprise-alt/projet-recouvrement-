import { describe, expect, it } from 'vitest';
import { CopilRapportData, generateCopilRapportPptx } from '../src/lib/copilRapportPptx';

function baseData(overrides: Partial<CopilRapportData> = {}): CopilRapportData {
  return {
    clientNom: "SEN'EAU",
    entiteLabel: 'SORAM Afrique',
    periodeLabel: 'Avril – Juin 2026',
    dateGenerationLabel: '07 août 2026',
    prochainCopilLabel: null,
    contact: { nom: null, email: null, tel: null },

    equipementsActifs: 3,
    equipementsIntrouvables: 0,
    parModele: [{ modele: 'BH227', qte: 3 }],

    interventionsTotal: 2,
    interventionsPreventives: 1,
    sla: { total: 2, clotures: 1, ouverts: 1, tauxCloture: 50, delaiMoyenUrgenteHeures: 4, delaiMoyenStandardHeures: 12 },
    parSite: [{ site: 'Dakar', clotures: 1, enCours: 1, total: 2 }],
    parMoisInterventions: [{ mois: 'avril 2026', total: 2 }],
    parType: [
      { type: 'Curative', total: 1 },
      { type: 'Préventive', total: 1 },
    ],

    volumetriePeriodes: [{ periodeLabel: 'avril 2026', copiesNB: 1000, copiesCouleur: 50 }],
    copiesNBTotal: 1000,
    copiesCouleurTotal: 50,

    consommablesLivres: 5,
    referencesDifferentes: 2,
    parReference: [{ reference: 'TN323', qte: 5 }],
    parMoisConsommables: [{ mois: 'avril 2026', nbLignes: 2 }],

    actions: [{ priorite: 'p1', action: 'Clôturer les tickets', responsable: 'SORAM', echeance: '30/06/2026', statut: 'En cours' }],
    ...overrides,
  };
}

function isPptxZip(buf: Buffer): boolean {
  // Signature ZIP standard ("PK\x03\x04") -- un .pptx est un ZIP OOXML.
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

describe('generateCopilRapportPptx', () => {
  it('produces a valid non-empty pptx (zip) for realistic data', async () => {
    const buf = await generateCopilRapportPptx(baseData());
    expect(isPptxZip(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(10000);
  });

  it('does not throw when every collection is empty', async () => {
    const buf = await generateCopilRapportPptx(
      baseData({
        parModele: [],
        parSite: [],
        parMoisInterventions: [],
        volumetriePeriodes: [],
        parReference: [],
        parMoisConsommables: [],
        actions: [],
        equipementsActifs: 0,
        interventionsTotal: 0,
        sla: { total: 0, clotures: 0, ouverts: 0, tauxCloture: 0, delaiMoyenUrgenteHeures: null, delaiMoyenStandardHeures: null },
      })
    );
    expect(isPptxZip(buf)).toBe(true);
  });

  it('does not throw with a long consommable reference name (real ARTIS désignations can be long)', async () => {
    const buf = await generateCopilRapportPptx(
      baseData({
        parReference: [{ reference: 'TONER NOIR BH227 BH287 BH367 TN323 — référence article complète ARTIS', qte: 24 }],
      })
    );
    expect(isPptxZip(buf)).toBe(true);
  });
});
