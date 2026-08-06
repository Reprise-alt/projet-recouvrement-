import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alertesClient,
  couleurScore,
  DEFAULT_CONFIG_OPERATIONS,
  enDemarrage,
  etatDemarrage,
  lerp,
  memeSemaineIso,
  prochaineFenetre,
  scoresClient,
  seuilContact,
  semaineIsoKey,
  trierAlertes,
  type AlerteClientInput,
  type EtapeDemarrageConfigLike,
  type ScoreClientLike,
} from '../src/lib/operations';

const ETAPES_SORAM: EtapeDemarrageConfigLike[] = [
  { cle: 'inst', libelle: 'Parc installé', delaiJours: 7, ordre: 1 },
  { cle: 'contact', libelle: 'Contact post-install', delaiJours: 14, ordre: 2 },
  { cle: 'ope', libelle: 'Client opérationnel', delaiJours: 21, ordre: 3 },
  { cle: 'sat', libelle: 'Satisfaction 30j', delaiJours: 45, ordre: 4 },
  { cle: 'val', libelle: 'Démarrage validé', delaiJours: 90, ordre: 5 },
];

function baseClient(overrides: Partial<ScoreClientLike> = {}): ScoreClientLike {
  return {
    vip: false,
    dernierContact: null,
    climat: null,
    action: null,
    actionEcheance: null,
    actionFait: false,
    dernierCopil: null,
    demarreLe: null,
    demarrageCloture: false,
    resilie: false,
    problemes: [],
    ...overrides,
  };
}

describe('lerp', () => {
  it('returns 50 for a null value', () => {
    expect(lerp(null, 15, 60)).toBe(50);
  });

  it('interpolates and clamps between bon and mauvais', () => {
    expect(lerp(15, 15, 60)).toBe(100);
    expect(lerp(60, 15, 60)).toBe(0);
    expect(lerp(0, 15, 60)).toBe(100); // clamped, meilleur que "bon"
    expect(lerp(100, 15, 60)).toBe(0); // clamped, pire que "mauvais"
  });
});

describe('seuilContact', () => {
  it('resserre le rythme pour un compte VIP', () => {
    expect(seuilContact(false)).toEqual({ vigilance: 45, risque: 60 });
    expect(seuilContact(true)).toEqual({ vigilance: 25, risque: 35 });
  });
});

describe('scoresClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('un compte jamais relevé tombe sur climat=15, contact=50 (lerp null)', () => {
    const s = scoresClient(baseClient(), [], []);
    expect(s.contact).toBe(50);
    expect(s.climat).toBe(15);
    expect(s.problemes).toBe(100);
    expect(s.engagements).toBe(100);
    expect(s.global).toBe(Math.round((50 + 15 + 100 + 100) / 4));
  });

  it('climat vert/orange/rouge', () => {
    expect(scoresClient(baseClient({ climat: 'vert' }), [], []).climat).toBe(100);
    expect(scoresClient(baseClient({ climat: 'orange' }), [], []).climat).toBe(55);
    expect(scoresClient(baseClient({ climat: 'rouge' }), [], []).climat).toBe(15);
  });

  it('un problème bloquant pèse 1.7x un problème simple, et plus avec l\'âge', () => {
    const gene = scoresClient(
      baseClient({ problemes: [{ gravite: 'gene', ouvertLe: '2026-08-01' }] }),
      [],
      [],
    );
    const bloquant = scoresClient(
      baseClient({ problemes: [{ gravite: 'bloquant', ouvertLe: '2026-08-01' }] }),
      [],
      [],
    );
    // age = 5j -> poids * (16 + min(30, 5*0.55)) = poids * 18.75
    expect(gene.problemes).toBeCloseTo(100 - 18.75);
    expect(bloquant.problemes).toBeLessThan(gene.problemes);
    expect(bloquant.problemes).toBeCloseTo(100 - 1.7 * 18.75);
  });

  it('un engagement en retard fait baisser l\'axe Engagements', () => {
    const s = scoresClient(
      baseClient({ action: 'Renvoyer devis', actionEcheance: '2026-08-01', actionFait: false }),
      [],
      [],
    );
    // retard = 5j -> -min(55, 18 + 5*1.6) = -26
    expect(s.engagements).toBe(74);
  });

  it('un engagement tenu ou sans échéance ne pénalise pas', () => {
    expect(scoresClient(baseClient({ action: 'X', actionEcheance: '2026-08-01', actionFait: true }), [], []).engagements).toBe(100);
    expect(scoresClient(baseClient({ action: 'X', actionEcheance: null, actionFait: false }), [], []).engagements).toBe(100);
  });

  it('un VIP sans COPIL ce mois-ci perd 35 points sur Engagements', () => {
    const s = scoresClient(baseClient({ vip: true, dernierCopil: '2026-06-01' }), [], []);
    expect(s.engagements).toBe(65);
    const ok = scoresClient(baseClient({ vip: true, dernierCopil: '2026-08-01' }), [], []);
    expect(ok.engagements).toBe(100);
  });

  it('un démarrage en retard fait baisser Engagements de 15 par étape en retard, plafonné à 45', () => {
    // demarreLe il y a 30j -> inst(7) et contact(14) et ope(21) en retard = 3 étapes en retard
    const s = scoresClient(baseClient({ demarreLe: '2026-07-07' }), ETAPES_SORAM, []);
    expect(s.engagements).toBe(100 - Math.min(45, 3 * 15));
  });
});

describe('couleurScore', () => {
  it('applique les seuils vert>=70, orange 45-69, rouge<45', () => {
    expect(couleurScore(70)).toBe('success');
    expect(couleurScore(69)).toBe('amber');
    expect(couleurScore(45)).toBe('amber');
    expect(couleurScore(44)).toBe('danger');
  });
});

describe('etatDemarrage / enDemarrage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('null si pas démarré, résilié, ou démarrage clôturé', () => {
    expect(enDemarrage({ demarreLe: null, demarrageCloture: false, resilie: false })).toBe(false);
    expect(enDemarrage({ demarreLe: '2026-07-01', demarrageCloture: true, resilie: false })).toBe(false);
    expect(enDemarrage({ demarreLe: '2026-07-01', demarrageCloture: false, resilie: true })).toBe(false);
    expect(etatDemarrage({ demarreLe: null, demarrageCloture: false, resilie: false }, ETAPES_SORAM, [])).toBeNull();
  });

  it('calcule les étapes restantes et en retard', () => {
    // démarré il y a 30j : inst(7), contact(14), ope(21) dépassées ; sat(45), val(90) pas encore
    const etat = etatDemarrage({ demarreLe: '2026-07-07', demarrageCloture: false, resilie: false }, ETAPES_SORAM, []);
    expect(etat).not.toBeNull();
    expect(etat!.age).toBe(30);
    expect(etat!.retard.map((e) => e.cle)).toEqual(['inst', 'contact', 'ope']);
    expect(etat!.restantes).toHaveLength(5);
    expect(etat!.pct).toBe(0);
  });

  it('une étape cochée sort de "restantes" et n\'est plus jamais en retard', () => {
    const etat = etatDemarrage(
      { demarreLe: '2026-07-07', demarrageCloture: false, resilie: false },
      ETAPES_SORAM,
      [{ cle: 'inst' }, { cle: 'contact' }],
    );
    expect(etat!.nbFaits).toBe(2);
    expect(etat!.retard.map((e) => e.cle)).toEqual(['ope']);
    expect(etat!.pct).toBe(40);
  });
});

describe('semaineIsoKey / memeSemaineIso', () => {
  it('produit une clé AAAA-Www stable', () => {
    expect(semaineIsoKey(new Date('2026-08-06'))).toMatch(/^2026-W\d{2}$/);
  });

  it('deux dates de la même semaine ISO matchent', () => {
    expect(memeSemaineIso('2026-08-03', new Date('2026-08-06'))).toBe(true); // lundi + jeudi
    expect(memeSemaineIso('2026-07-27', new Date('2026-08-06'))).toBe(false); // semaine précédente
    expect(memeSemaineIso(null, new Date('2026-08-06'))).toBe(false);
  });
});

describe('prochaineFenetre', () => {
  it("avance à l'année suivante si la date est déjà passée cette année", () => {
    const from = new Date('2026-08-06');
    const fen = prochaineFenetre({ mois: 1, jour: 1, label: 'Nouvel exercice', anticipationJours: 60 }, from);
    expect(fen.date.getFullYear()).toBe(2027);
    expect(fen.date.getMonth()).toBe(0);
  });

  it('reste sur cette année si la date est encore à venir', () => {
    const from = new Date('2026-08-06');
    const fen = prochaineFenetre({ mois: 10, jour: 1, label: 'Rentrée', anticipationJours: 75 }, from);
    expect(fen.date.getFullYear()).toBe(2026);
    expect(fen.joursRestants).toBe(56);
  });
});

describe('alertesClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function baseInput(overrides: Partial<AlerteClientInput> = {}): AlerteClientInput {
    return {
      id: 'c1',
      nom: 'Client Test',
      criticite: 'B',
      finContrat: null,
      ...baseClient(),
      ...overrides,
    };
  }

  it("n'alerte jamais sur une fin de contrat non renseignée (régression du bug du prototype)", () => {
    const alertes = alertesClient(baseInput({ finContrat: null }), [], [], null);
    expect(alertes.some((a) => a.titre === 'Contrat à échéance')).toBe(false);
  });

  it('alerte "risque" sur un contrat échu, "vigilance" sur un contrat proche', () => {
    const echu = alertesClient(baseInput({ finContrat: '2026-08-01' }), [], [], null);
    expect(echu.find((a) => a.titre === 'Contrat à échéance')).toMatchObject({ niveau: 'risque' });

    const proche = alertesClient(baseInput({ finContrat: '2026-09-20' }), [], [], null);
    expect(proche.find((a) => a.titre === 'Renouvellement à préparer')).toMatchObject({ niveau: 'vigilance' });

    const loin = alertesClient(baseInput({ finContrat: '2027-06-01' }), [], [], null);
    expect(loin.some((a) => a.titre.includes('chéance') || a.titre.includes('enouvellement'))).toBe(false);
  });

  it('alerte sur un problème bloquant dès le seuil configuré, avant un problème simple équivalent', () => {
    const bloquant = alertesClient(
      baseInput({ problemes: [{ gravite: 'bloquant', ouvertLe: '2026-07-30' }] }), // 7j
      [],
      [],
      null,
    );
    expect(bloquant.find((a) => a.titre === 'Problème bloquant non résolu')).toMatchObject({ niveau: 'risque' });

    const simple = alertesClient(
      baseInput({ problemes: [{ gravite: 'gene', ouvertLe: '2026-07-30' }] }), // 7j, sous le seuil vigilance(14)
      [],
      [],
      null,
    );
    expect(simple.some((a) => a.titre.startsWith('Problème'))).toBe(false);
  });

  it('alerte "aucun contact enregistré" si dernierContact est null', () => {
    const alertes = alertesClient(baseInput({ dernierContact: null }), [], [], null);
    expect(alertes.some((a) => a.titre === 'Aucun contact enregistré')).toBe(true);
  });

  it('un VIP sans contact depuis plus de 35j déclenche une alerte risque dédiée', () => {
    const alertes = alertesClient(baseInput({ vip: true, dernierContact: '2026-06-01' }), [], [], null);
    expect(alertes.find((a) => a.titre === 'Grand compte sans contact ce mois')).toMatchObject({ niveau: 'risque' });
  });

  it('tri : risque avant vigilance, VIP avant non-VIP, puis criticité A>B>C, puis alpha', () => {
    const alertes = [
      { niveau: 'vigilance' as const, titre: 'a', detail: '', clientId: '1', clientNom: 'Zeta', vip: false, criticite: 'A' as const },
      { niveau: 'risque' as const, titre: 'b', detail: '', clientId: '2', clientNom: 'Beta', vip: false, criticite: 'C' as const },
      { niveau: 'risque' as const, titre: 'c', detail: '', clientId: '3', clientNom: 'Alpha', vip: true, criticite: 'C' as const },
      { niveau: 'risque' as const, titre: 'd', detail: '', clientId: '4', clientNom: 'Gamma', vip: false, criticite: 'A' as const },
    ];
    const tries = trierAlertes(alertes);
    expect(tries.map((a) => a.clientNom)).toEqual(['Alpha', 'Gamma', 'Beta', 'Zeta']);
  });
});
