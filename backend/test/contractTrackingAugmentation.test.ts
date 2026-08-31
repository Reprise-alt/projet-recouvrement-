import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseContractTrackingWorkbook } from '../src/lib/parsers/contractTracking';

// Construit un classeur « Suivi des contrats » (onglet Leasing) puis le relit
// via un buffer, exactement comme le fait l'import réel, pour valider la
// lecture des colonnes d'augmentation.
function workbook(rows: unknown[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Clients Leasing');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return XLSX.read(buf, { type: 'buffer' });
}

const HEADER = [
  'Code client', 'Raison sociale', 'Début', 'Fin contrat', 'Durée (ans)',
  'Augm.', "Date d'augmentation annuelle", 'Jours restants', 'Alerte',
  "Appel d'offre", 'Statut', 'Commentaire', 'Issue contrat', 'Notification',
];

describe('parseContractTrackingWorkbook — colonnes augmentation', () => {
  it('lit le taux, la date et le type d\'augmentation', () => {
    const wb = workbook([
      ['SORAM AFRIQUE – Suivi des contrats Leasing'],
      HEADER,
      [400003, 'LQT CONSULTING', '2020-01-15', '2025-01-14', 5, '5%', '2026-01-15', 100, '🟢 OK', '—', 'En cours', 'RAS', 'Nouveau contrat', 'sur notification'],
      [400011, 'AUTRE SARL', '2021-06-01', '2027-06-01', 6, '—', '', 200, '🟢 OK', '—', 'En cours', '', 'Tacite reconduction', 'sans notification'],
    ]);
    const res = parseContractTrackingWorkbook(wb);
    const lqt = res.clients.find((c) => c.nom === 'LQT CONSULTING')!.contrats[0];
    const autre = res.clients.find((c) => c.nom === 'AUTRE SARL')!.contrats[0];

    expect(lqt.tauxAugmentation).toBe(5);
    expect(lqt.dateRevisionTarif).toBe('2026-01-15');
    expect(lqt.typeAugmentation).toBe('sur_notification');

    // « — » / vide ne remplit rien (undefined = ne pas écraser au réimport).
    expect(autre.tauxAugmentation).toBeUndefined();
    expect(autre.dateRevisionTarif).toBeUndefined();
    expect(autre.typeAugmentation).toBe('sans_notification');
  });

  it('n\'invente rien quand les colonnes augmentation sont absentes', () => {
    const wb = workbook([
      ['SORAM AFRIQUE – Suivi des contrats Leasing'],
      ['Code client', 'Raison sociale', 'Début', 'Fin contrat', 'Statut', 'Issue contrat'],
      [400020, 'SANS COLONNES', '2022-03-01', '2025-03-01', 'En cours', ''],
    ]);
    const c = parseContractTrackingWorkbook(wb).clients[0].contrats[0];
    expect(c.tauxAugmentation).toBeUndefined();
    expect(c.typeAugmentation).toBeUndefined();
    expect(c.dateRevisionTarif).toBeUndefined();
  });
});
