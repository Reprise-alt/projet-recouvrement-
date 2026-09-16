import { describe, expect, it } from 'vitest';
import {
  ClientRelance,
  dansFenetreEnvoi,
  dejaRelanceCePalier,
  evaluerRelance,
  promesseEnCours,
  relancesDues,
} from '../src/lib/moteurRelances';

// clientPalier s'appuie sur daysBetween, qui lit l'horloge réelle (le palier
// n'est pas injectable) — on ancre donc NOW sur maintenant, pour que « échu
// depuis N jours » corresponde bien au palier attendu quel que soit le moment
// où le test tourne. Les cas de fenêtre d'envoi utilisent, eux, des dates fixes.
const NOW = new Date();

// Facture échue depuis `jours` jours, impayée.
function factureEchue(jours: number, montant = 100_000) {
  const d = new Date(NOW.getTime() - jours * 86_400_000);
  return { montant, dateEcheance: d.toISOString(), statut: 'impayee' as const, numero: 'F1' };
}

function client(partial: Partial<ClientRelance> & { id: string }): ClientRelance {
  return { nom: partial.id, factures: [], ...partial };
}

describe('evaluerRelance', () => {
  it('ne relance pas un client à jour', () => {
    const c = client({ id: 'a', factures: [] });
    expect(evaluerRelance(c, undefined, NOW)).toEqual({ due: null, motifBlocage: 'a_jour' });
  });

  it('relance un client en retard jamais relancé', () => {
    const c = client({ id: 'b', factures: [factureEchue(40)] }); // palier 4 (J+30..44)
    const e = evaluerRelance(c, undefined, NOW);
    expect(e.due).not.toBeNull();
    expect(e.due?.palier).toBe(4);
    expect(e.due?.joursRetard).toBe(40);
  });

  it('ne relance pas deux fois le même palier', () => {
    const c = client({ id: 'c', factures: [factureEchue(40)], actions: [{ palier: 4, date: NOW }] });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('deja_relance');
  });

  it('relance à nouveau quand le palier a progressé', () => {
    // Relancé au palier 3, désormais au palier 4 → une nouvelle relance est due.
    const c = client({ id: 'd', factures: [factureEchue(40)], actions: [{ palier: 3, date: NOW }] });
    expect(evaluerRelance(c, undefined, NOW).due?.palier).toBe(4);
  });

  it('arrête la séquence en cas de litige', () => {
    const c = client({ id: 'e', factures: [factureEchue(40)], enLitige: true });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('litige');
  });

  it('arrête la séquence en cas d’opposition', () => {
    const c = client({ id: 'f', factures: [factureEchue(40)], opposition: true });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('opposition');
  });

  it('suspend tant qu’une promesse court, reprend une fois dépassée', () => {
    const futur = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    const passe = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
    const avecPromesse = client({
      id: 'g',
      factures: [factureEchue(40)],
      echeanciers: [{ tranches: [{ dateEcheance: futur, statut: 'impayee' }] }],
    });
    expect(evaluerRelance(avecPromesse, undefined, NOW).motifBlocage).toBe('promesse_en_cours');

    const promesseDepassee = client({
      id: 'h',
      factures: [factureEchue(40)],
      echeanciers: [{ tranches: [{ dateEcheance: passe, statut: 'impayee' }] }],
    });
    expect(evaluerRelance(promesseDepassee, undefined, NOW).due).not.toBeNull();
  });

  it('l’opposition prime sur une promesse en cours', () => {
    const futur = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    const c = client({
      id: 'i',
      factures: [factureEchue(40)],
      opposition: true,
      echeanciers: [{ tranches: [{ dateEcheance: futur, statut: 'impayee' }] }],
    });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('opposition');
  });
});

describe('promesseEnCours', () => {
  it('faux sans échéancier', () => {
    expect(promesseEnCours(undefined, NOW)).toBe(false);
    expect(promesseEnCours([], NOW)).toBe(false);
  });
  it('faux si toutes les tranches promises sont échues et impayées', () => {
    const passe = new Date(NOW.getTime() - 86_400_000).toISOString();
    expect(promesseEnCours([{ tranches: [{ dateEcheance: passe, statut: 'impayee' }] }], NOW)).toBe(false);
  });
  it('faux si la tranche future est déjà payée', () => {
    const futur = new Date(NOW.getTime() + 86_400_000).toISOString();
    expect(promesseEnCours([{ tranches: [{ dateEcheance: futur, statut: 'payee' }] }], NOW)).toBe(false);
  });
});

describe('dejaRelanceCePalier', () => {
  it('vrai s’il existe une action au palier ou au-delà', () => {
    expect(dejaRelanceCePalier([{ palier: 5, date: NOW }], 4)).toBe(true);
    expect(dejaRelanceCePalier([{ palier: 4, date: NOW }], 4)).toBe(true);
  });
  it('faux si les actions sont à un palier inférieur', () => {
    expect(dejaRelanceCePalier([{ palier: 2, date: NOW }], 4)).toBe(false);
    expect(dejaRelanceCePalier([], 4)).toBe(false);
  });
});

describe('relancesDues', () => {
  it('ne retient que les clients réellement à relancer', () => {
    const clients: ClientRelance[] = [
      client({ id: 'a-jour', factures: [] }),
      client({ id: 'du', factures: [factureEchue(40)] }),
      client({ id: 'litige', factures: [factureEchue(40)], enLitige: true }),
    ];
    const dues = relancesDues(clients, undefined, NOW);
    expect(dues.map((d) => d.clientId)).toEqual(['du']);
  });
});

describe('dansFenetreEnvoi', () => {
  it('ouverte un jour ouvré à 10h (Dakar)', () => {
    expect(dansFenetreEnvoi(new Date('2026-06-15T10:00:00Z'))).toBe(true); // lundi
  });
  it('fermée avant 8h et après 19h', () => {
    expect(dansFenetreEnvoi(new Date('2026-06-15T06:00:00Z'))).toBe(false);
    expect(dansFenetreEnvoi(new Date('2026-06-15T20:00:00Z'))).toBe(false);
  });
  it('fermée le week-end', () => {
    expect(dansFenetreEnvoi(new Date('2026-06-13T10:00:00Z'))).toBe(false); // samedi
    expect(dansFenetreEnvoi(new Date('2026-06-14T10:00:00Z'))).toBe(false); // dimanche
  });
  it('respecte une fenêtre personnalisée', () => {
    expect(dansFenetreEnvoi(new Date('2026-06-15T07:30:00Z'), { heureDebut: 7 })).toBe(true);
    expect(dansFenetreEnvoi(new Date('2026-06-13T10:00:00Z'), { joursOuvresSeulement: false })).toBe(true);
  });
});
