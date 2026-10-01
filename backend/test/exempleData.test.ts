import { describe, expect, it } from 'vitest';
import { construireClientsExemple, NB_CLIENTS_EXEMPLE } from '../src/lib/exempleData';

describe('jeu de données d\'exemple', () => {
  it('produit le bon nombre de clients, tous marqués estExemple', () => {
    const clients = construireClientsExemple('org-1', 'PRINCIPAL');
    expect(clients).toHaveLength(NB_CLIENTS_EXEMPLE);
    expect(clients.every((c) => c.estExemple === true)).toBe(true);
    expect(clients.every((c) => c.organisationId === 'org-1' && c.entite === 'PRINCIPAL')).toBe(true);
  });

  it('calcule des échéances en retard par rapport à la date de référence', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    const clients = construireClientsExemple('org-1', 'PRINCIPAL', now);
    const toutesFactures = clients.flatMap((c) => c.factures.create);
    expect(toutesFactures.length).toBeGreaterThan(0);
    // Toutes les échéances d'exemple sont dans le passé => retard réel.
    expect(toutesFactures.every((f) => f.dateEcheance.getTime() < now.getTime())).toBe(true);
    expect(toutesFactures.every((f) => f.statut === 'impayee')).toBe(true);
    expect(toutesFactures.every((f) => f.montant > 0)).toBe(true);
  });

  it('numérote les factures de façon unique (pas de collision clientId+numero)', () => {
    const numeros = construireClientsExemple('org-1', 'PRINCIPAL').flatMap((c) =>
      c.factures.create.map((f) => f.numero),
    );
    expect(new Set(numeros).size).toBe(numeros.length);
  });
});
