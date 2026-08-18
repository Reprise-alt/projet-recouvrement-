import { describe, it, expect } from 'vitest';
import { accesDepuisMoi, SocleMoi } from '../src/lib/sso';

function moi(partial: Partial<SocleMoi['utilisateur']>, consoles: SocleMoi['consoles']): SocleMoi {
  return {
    utilisateur: {
      id: 'u1',
      identifiant: 'jean',
      email: 'jean@olu.sn',
      nom_affiche: 'Jean Diop',
      admin_groupe: false,
      ...partial,
    },
    consoles,
  };
}

describe('accesDepuisMoi — mapping des 4 niveaux du socle vers le recouvrement', () => {
  it('super admin (admin_groupe) : accès à toutes les consoles, admin, toutes entités', () => {
    const a = accesDepuisMoi(moi({ admin_groupe: true }, []));
    expect(a.role).toBe('admin');
    expect(a.entite).toBeNull();
    expect(a.accesRecouvrement).toBe(true);
    expect(a.accesPlanningCoursiers).toBe(true);
    expect(a.roleOperations).toBe('direction_generale');
    expect(a.estAgentRecouvrement).toBe(false);
  });

  it('admin de plusieurs consoles : admin recouvrement + accès coursier', () => {
    const a = accesDepuisMoi(
      moi({}, [
        { code: 'recouvrement', role: 'administrateur', tenant_code: null },
        { code: 'coursier', role: 'administrateur', tenant_code: null },
      ]),
    );
    expect(a.role).toBe('admin');
    expect(a.accesRecouvrement).toBe(true);
    expect(a.accesPlanningCoursiers).toBe(true);
    expect(a.estAgentRecouvrement).toBe(false);
  });

  it('admin d’une seule console (recouvrement) : pas d’accès opérations ni coursier', () => {
    const a = accesDepuisMoi(moi({}, [{ code: 'recouvrement', role: 'administrateur', tenant_code: null }]));
    expect(a.role).toBe('admin');
    expect(a.accesRecouvrement).toBe(true);
    expect(a.accesPlanningCoursiers).toBe(false);
    expect(a.roleOperations).toBeNull();
  });

  it('agent d’une console avec un seul tenant : manager rattaché à l’entité', () => {
    const a = accesDepuisMoi(moi({}, [{ code: 'recouvrement', role: 'agent', tenant_code: 'soram' }]));
    expect(a.role).toBe('manager_entite');
    expect(a.entite).toBe('SORAM');
    expect(a.accesRecouvrement).toBe(true);
    expect(a.estAgentRecouvrement).toBe(true);
  });

  it('agent recouvrement multi-tenant : comptable, toutes entités', () => {
    const a = accesDepuisMoi(
      moi({}, [
        { code: 'recouvrement', role: 'agent', tenant_code: 'soram' },
        { code: 'recouvrement', role: 'agent', tenant_code: 'iris' },
      ]),
    );
    expect(a.role).toBe('comptable');
    expect(a.entite).toBeNull();
    expect(a.accesRecouvrement).toBe(true);
  });

  it('opérations : agent → chargé de compte ; admin mono-tenant → directrice', () => {
    const agent = accesDepuisMoi(moi({}, [{ code: 'operations', role: 'agent', tenant_code: 'iris' }]));
    expect(agent.roleOperations).toBe('charge_compte');
    expect(agent.accesRecouvrement).toBe(false);

    const dir = accesDepuisMoi(moi({}, [{ code: 'operations', role: 'administrateur', tenant_code: 'soram' }]));
    expect(dir.roleOperations).toBe('directrice_operations');
  });

  it('aucun accès console : tous les modules fermés', () => {
    const a = accesDepuisMoi(moi({}, []));
    expect(a.accesRecouvrement).toBe(false);
    expect(a.roleOperations).toBeNull();
    expect(a.accesPlanningCoursiers).toBe(false);
    // sans accès recouvrement, le rôle local par défaut est comptable (inerte)
    expect(a.role).toBe('comptable');
  });
});
