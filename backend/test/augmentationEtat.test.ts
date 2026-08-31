import { describe, it, expect } from 'vitest';
import { augmentationEtat } from '../src/lib/contracts';

const base = {
  dateDebut: '2020-05-23',
  dateFin: '2031-05-23',
  dateRevisionTarif: '2026-05-23',
  tauxAugmentation: 5,
  dateDerniereRevision: null as string | null,
};

describe('augmentationEtat', () => {
  it('aucune quand il n\'y a pas de taux', () => {
    expect(augmentationEtat({ ...base, tauxAugmentation: null }).statut).toBe('aucune');
  });

  it('depassee : anniversaire passé, jamais marqué appliqué', () => {
    // Club Tiossane : augmentation du 23/05, on est le 31/08, rien d'appliqué.
    const e = augmentationEtat(
      { dateDebut: '2026-05-23', dateFin: '2031-05-23', dateRevisionTarif: '2026-05-23', tauxAugmentation: 5, dateDerniereRevision: null },
      new Date('2026-08-31'),
    );
    expect(e.statut).toBe('depassee');
    expect(e.taux).toBe(5);
    expect(e.jours!).toBeLessThan(0);
  });

  it('realisee : marquée appliquée pour le cycle', () => {
    const e = augmentationEtat(
      { dateDebut: '2026-05-23', dateFin: '2031-05-23', dateRevisionTarif: '2026-05-23', tauxAugmentation: 5, dateDerniereRevision: '2027-05-23' },
      new Date('2026-08-31'),
    );
    expect(e.statut).toBe('realisee');
  });

  it('imminent : prochaine augmentation dans 30 jours ou moins', () => {
    const e = augmentationEtat({ ...base, dateDerniereRevision: '2025-05-23' }, new Date('2026-05-01'));
    expect(e.statut).toBe('imminent');
    expect(e.jours).toBe(22);
  });

  it('a_venir : premier anniversaire à plus de 30 jours', () => {
    const e = augmentationEtat(
      { dateDebut: '2026-05-23', dateFin: '2031-05-23', dateRevisionTarif: null, tauxAugmentation: 5, dateDerniereRevision: null },
      new Date('2026-03-01'),
    );
    expect(e.statut).toBe('a_venir');
    expect(e.jours!).toBeGreaterThan(30);
  });
});
