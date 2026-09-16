import { describe, expect, it } from 'vitest';
import { construireMessage, PALIER_MAX_AUTO } from '../src/lib/executerRelances';
import { LetterClient } from '../src/lib/letters';

function clientEchu(jours: number): LetterClient {
  const d = new Date(Date.now() - jours * 86_400_000).toISOString();
  return {
    nom: 'Boulangerie Diarra',
    entite: 'COMMUN',
    contact: 'Awa',
    factures: [{ montant: 120_000, dateEcheance: d, statut: 'impayee', numero: 'F-042' }],
  };
}

describe('construireMessage', () => {
  it('extrait la ligne « Objet : … » comme sujet et la retire du corps', () => {
    const { sujet, corps } = construireMessage(clientEchu(9), 2);
    expect(sujet.length).toBeGreaterThan(0);
    expect(sujet).not.toMatch(/^Objet\s*:/);
    expect(corps).not.toMatch(/^Objet\s*:/);
    expect(corps.length).toBeGreaterThan(0);
  });

  it('ajoute les modalités de paiement de l’organisation quand elles existent', () => {
    const { corps } = construireMessage(clientEchu(9), 2, 'Wave : +221 77 000 00 00');
    expect(corps).toContain('Modalités de paiement');
    expect(corps).toContain('Wave : +221 77 000 00 00');
  });

  it('n’ajoute rien si les instructions de paiement sont vides', () => {
    const { corps } = construireMessage(clientEchu(9), 2, '   ');
    expect(corps).not.toContain('Modalités de paiement');
  });

  it('dérive le sujet du contenu de la ligne « Objet : … » du courrier', () => {
    // Palier 2 → « Objet : Rappel de règlement — … » : le sujet reprend ce libellé.
    const { sujet } = construireMessage(clientEchu(9), 2);
    expect(sujet).toContain('Rappel de règlement');
  });
});

describe('PALIER_MAX_AUTO', () => {
  it('borne l’envoi automatique à l’amiable (≤ 5)', () => {
    expect(PALIER_MAX_AUTO).toBe(5);
  });
});
