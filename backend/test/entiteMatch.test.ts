import { describe, expect, it } from 'vitest';
import { DEFAULT_KNOWN_ENTITES, matchKnownEntite } from '../src/lib/parsers/entiteMatch';

describe('matchKnownEntite', () => {
  it('matches a known code as a whole word in banner text', () => {
    expect(matchKnownEntite('SORAM AFRIQUE – Suivi des contrats Leasing', DEFAULT_KNOWN_ENTITES)).toBe('SORAM');
    expect(matchKnownEntite('IRIS AFRIQUE – Gestion de flotte GPS', DEFAULT_KNOWN_ENTITES)).toBe('IRIS');
    expect(matchKnownEntite('SIS', DEFAULT_KNOWN_ENTITES)).toBe('SIS');
  });

  it('does not match a short code that only appears as a substring of an unrelated word', () => {
    // "SIS" ne doit pas matcher à l'intérieur de "ASSISTANCE" — c'est
    // précisément le risque d'un simple .includes() sur un code court.
    expect(matchKnownEntite('Service Assistance Client', DEFAULT_KNOWN_ENTITES)).toBeNull();
  });

  it('recognizes a company added dynamically, not just the 3 built-in defaults', () => {
    const withNova = [...DEFAULT_KNOWN_ENTITES, { code: 'NOVA', nom: 'Nova Tech Solutions' }];
    expect(matchKnownEntite('NOVA TECH SOLUTIONS — Facturation', withNova)).toBe('NOVA');
    expect(matchKnownEntite('Relevé de facturation Nova Tech Solutions', withNova)).toBe('NOVA');
  });

  it('returns null when nothing matches', () => {
    expect(matchKnownEntite('Consolidation trimestrielle', DEFAULT_KNOWN_ENTITES)).toBeNull();
  });
});
