import { describe, expect, it } from 'vitest';
import {
  construireRelanceMarque,
  emailRelanceHtml,
  MODELES_DEFAUT,
  OrgIdentite,
  rendreVariables,
  variablesRelance,
} from '../src/lib/modelesRelance';

const ORG: OrgIdentite = {
  raisonSociale: 'Boulangerie Diarra',
  logoUrl: 'https://cdn.ex/logo.png',
  adresse: 'Dakar, Plateau',
  identifiantFiscal: 'NINEA123',
  rccm: 'SN-DKR-2020-B-1',
  contactRecouvrement: 'compta@diarra.sn',
  instructionsPaiement: 'Wave au 77 000 00 00',
  pays: 'SN',
};

function client(jours: number) {
  const d = new Date(Date.now() - jours * 86_400_000).toISOString();
  return { nom: 'Client X', factures: [{ montant: 120_000, dateEcheance: d, statut: 'impayee' as const, numero: 'F-042' }] };
}

describe('rendreVariables', () => {
  it('remplace les variables connues et laisse les inconnues intactes', () => {
    expect(rendreVariables('Bonjour {debiteur}, {inconnu}', { debiteur: 'X' })).toBe('Bonjour X, {inconnu}');
  });
});

describe('variablesRelance', () => {
  it('calcule les variables depuis le client et l’organisation', () => {
    const v = variablesRelance(client(9), ORG);
    expect(v.entreprise).toBe('Boulangerie Diarra');
    expect(v.debiteur).toBe('Client X');
    expect(v.facture).toBe('F-042');
    expect(v.montant_du).toContain('120');
    expect(Number(v.jours_retard)).toBeGreaterThanOrEqual(8);
  });
});

describe('emailRelanceHtml', () => {
  it('inclut le logo, le nom et les coordonnées de l’organisation', () => {
    const html = emailRelanceHtml(ORG, 'Bonjour,\n\nMerci.', ORG.instructionsPaiement);
    expect(html).toContain('https://cdn.ex/logo.png');
    expect(html).toContain('Boulangerie Diarra');
    expect(html).toContain('NINEA : NINEA123');
    expect(html).toContain('RCCM : SN-DKR-2020-B-1');
    expect(html).toContain('Modalités de paiement');
    expect(html).toContain('Wave au 77 000 00 00');
  });

  it('échappe le HTML des valeurs dynamiques', () => {
    const html = emailRelanceHtml({ raisonSociale: 'A<script>B' }, 'x', null);
    expect(html).toContain('A&lt;script&gt;B');
    expect(html).not.toContain('<script>B');
  });

  it('affiche le nom en texte quand il n’y a pas de logo', () => {
    const html = emailRelanceHtml({ raisonSociale: 'Sans Logo' }, 'x', null);
    expect(html).not.toContain('<img');
    expect(html).toContain('Sans Logo');
  });
});

describe('construireRelanceMarque', () => {
  it('rend le modèle du palier avec les variables et un email de marque', () => {
    const { sujet, texte, html } = construireRelanceMarque(client(40), ORG, 2);
    expect(sujet).toContain('F-042'); // {facture} rendu
    expect(texte).toContain('Client X'); // {debiteur} rendu
    expect(texte).toContain('Boulangerie Diarra'); // {entreprise} rendu
    expect(texte).not.toMatch(/\{[a-z_]+\}/); // plus aucune variable brute
    expect(html).toContain('Boulangerie Diarra');
  });

  it('a un modèle par défaut pour chaque palier amiable (1 à 5)', () => {
    for (let p = 1; p <= 5; p++) {
      expect(MODELES_DEFAUT[p]).toBeTruthy();
      expect(MODELES_DEFAUT[p].sujet.length).toBeGreaterThan(0);
    }
  });
});
