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

  it('démarre au palier 1 un client en retard jamais relancé, quel que soit l’âge', () => {
    // Même échu depuis 40 j (ancien palier d'âge 4), la séquence part du palier 1.
    const c = client({ id: 'b', factures: [factureEchue(40)] });
    const e = evaluerRelance(c, undefined, NOW);
    expect(e.due?.palier).toBe(1);
    expect(e.due?.joursRetard).toBe(40);
  });

  it('démarre AUSSI au palier 1 sur un stock de factures très anciennes (import)', () => {
    // Cœur du changement : une facture de 300 j jamais relancée ne saute plus
    // directement en contentieux — elle entame l'amiable au palier 1.
    const c = client({ id: 'vieux', factures: [factureEchue(300)] });
    const e = evaluerRelance(c, undefined, NOW);
    expect(e.due?.palier).toBe(1);
  });

  it('monte d’un palier une fois le délai écoulé', () => {
    // Relancé au palier 1 il y a 7 j (écart j0→j1 = 6 j) → palier 2 dû.
    const dateP1 = new Date(NOW.getTime() - 7 * 86_400_000);
    const c = client({ id: 'c', factures: [factureEchue(40)], actions: [{ palier: 1, date: dateP1 }] });
    expect(evaluerRelance(c, undefined, NOW).due?.palier).toBe(2);
  });

  it('attend le délai avant d’enchaîner deux paliers (espacement)', () => {
    // Relancé au palier 1 il y a 2 j (< 6 j) → on patiente, rien ne part.
    const dateP1 = new Date(NOW.getTime() - 2 * 86_400_000);
    const c = client({ id: 'd', factures: [factureEchue(40)], actions: [{ palier: 1, date: dateP1 }] });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('espacement');
  });

  it('arrête l’envoi automatique au-delà de l’amiable (palier 5 atteint)', () => {
    const c = client({ id: 'max', factures: [factureEchue(300)], actions: [{ palier: 5, date: new Date(NOW.getTime() - 100 * 86_400_000) }] });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('amiable_epuise');
  });

  it('arrête la séquence si un dossier contentieux est ouvert', () => {
    const c = client({ id: 'cont', factures: [factureEchue(40)], enContentieux: true });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('contentieux');
  });

  it('arrête la séquence en cas de litige', () => {
    const c = client({ id: 'e', factures: [factureEchue(40)], enLitige: true });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('litige');
  });

  it('arrête la séquence en cas d’opposition', () => {
    const c = client({ id: 'f', factures: [factureEchue(40)], opposition: true });
    expect(evaluerRelance(c, undefined, NOW).motifBlocage).toBe('opposition');
  });

  it('saute un palier désactivé et monte au palier actif suivant', () => {
    // Palier 1 désactivé par l'organisation → le premier contact se fait au
    // palier actif suivant (2), pas en dessous.
    const c = client({ id: 'g', factures: [factureEchue(40)] });
    const actifs = new Set([2, 3, 4, 5, 6, 7, 8]); // 1 retiré
    expect(evaluerRelance(c, undefined, NOW, actifs).due?.palier).toBe(2);
  });

  it('ne relance pas si aucun palier amiable n’est actif', () => {
    const c = client({ id: 'h', factures: [factureEchue(40)] });
    const actifs = new Set([6, 7, 8]); // aucun palier amiable (1..5)
    expect(evaluerRelance(c, undefined, NOW, actifs).motifBlocage).toBe('palier_desactive');
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
