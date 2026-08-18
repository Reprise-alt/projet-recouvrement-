import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import { RecouvrementView } from './components/RecouvrementView';
import { ContractsView } from './components/ContractsView';
import { PlanningView } from './components/PlanningView';
import { OperationsView } from './components/OperationsView';
import { CoursierPublicView } from './components/CoursierPublicView';
import { SalleCoursierView } from './components/SalleCoursierView';
import { SettingsModal } from './components/SettingsModal';
import { ImportPanel } from './components/ImportPanel';
import { UsersPanel } from './components/UsersPanel';
import { IntegrationsPanel } from './components/IntegrationsPanel';
import { EntreprisesPanel } from './components/EntreprisesPanel';
import { EntityLogo, entityAccent } from './components/EntityLogo';
import { Entite, Entreprise } from './api/types';
import { useResource } from './hooks/useResource';
import { useTheme } from './hooks/useTheme';
import { ChevronDown, Moon, Sun } from 'lucide-react';
import { CONSOLE, CONSOLE_META } from './console';

type EntityFilter = Entite | 'ALL';
type RecouvrementTab = 'recouvrement' | 'contrats';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager_entite: "Manager d'entité",
  comptable: 'Comptable',
};

const ROLE_OPERATIONS_LABELS: Record<string, string> = {
  directrice_operations: 'Directrice des opérations',
  charge_compte: 'Chargé de compte',
  direction_generale: 'Direction générale',
};

export function App() {
  const { user, loading, logout } = useAuth();

  // Liens publics — accessibles sans session, identifiés par un token dans
  // l'URL et scopés côté API. Ils appartiennent à la console Planning des
  // coursiers mais restent résolus quelle que soit la console servie, pour
  // qu'un lien partagé fonctionne toujours.
  if (window.location.pathname.startsWith('/coursier/')) {
    const token = window.location.pathname.slice('/coursier/'.length);
    return <CoursierPublicView token={token} />;
  }
  if (window.location.pathname.startsWith('/salle/')) {
    const token = window.location.pathname.slice('/salle/'.length);
    return <SalleCoursierView token={token} />;
  }

  const [recouvrementTab, setRecouvrementTab] = useState<RecouvrementTab>('recouvrement');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [entreprisesOpen, setEntreprisesOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const bumpDataVersion = () => setDataVersion((v) => v + 1);
  const { theme, toggle: toggleTheme } = useTheme();

  const meta = CONSOLE_META[CONSOLE];

  useEffect(() => {
    document.title = `OLU 360 — ${meta.titre}`;
  }, [meta.titre]);

  useEffect(() => {
    if (!adminMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) setAdminMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [adminMenuOpen]);

  const { data: entreprises, refetch: refetchEntreprises } = useResource<Entreprise[]>(user ? '/api/entreprises' : null);

  // Périmètre du sélecteur d'entités selon la console. Pour le groupe
  // (recouvrement, coursier) : toutes les entités hors "COMMUN" (pseudo-groupe
  // partagé, jamais un onglet sélectionnable). Pour les opérations : SORAM et
  // IRIS seulement (cahier §1). Un compte rattaché à une entité ne voit que la
  // sienne ; un admin / une direction générale / un compte sans entité voient
  // "Tous" plus le détail.
  const availableEntities = useMemo<EntityFilter[]>(() => {
    if (!user) return ['ALL'];
    if (meta.entites === 'operations') {
      const codes = (entreprises ?? []).filter((e) => e.code === 'SORAM' || e.code === 'IRIS').map((e) => e.code);
      if (user.roleOperations === 'direction_generale' || !user.entite) return ['ALL', ...codes];
      return [user.entite];
    }
    const codes = (entreprises ?? []).filter((e) => !e.estCommun).map((e) => e.code);
    if (user.role === 'admin' || !user.entite) return ['ALL', ...codes];
    return [user.entite];
  }, [user, entreprises, meta.entites]);

  const effectiveEntity: EntityFilter = availableEntities.includes(entityFilter) ? entityFilter : availableEntities[0];

  // Droit d'accès à CETTE console. Les trois périmètres sont orthogonaux : un
  // compte peut avoir le recouvrement sans le planning, les opérations sans le
  // recouvrement, etc. Le back-end applique la même règle sur chaque route
  // (requireAcces… / requireModuleOperations) — ce test ne fait que masquer
  // l'interface d'une console à laquelle le compte n'a pas droit.
  const hasAccess = useMemo<boolean>(() => {
    if (!user) return false;
    if (CONSOLE === 'operations') return !!user.roleOperations;
    if (CONSOLE === 'coursier') return user.accesPlanningCoursiers;
    return user.accesRecouvrement;
  }, [user]);

  if (loading) return null;
  if (!user) return <LoginPage />;

  if (!hasAccess) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <h3>Accès non autorisé</h3>
        <p>
          Votre compte n'a pas accès à la console « {meta.titre} ». Si vous pensez qu'il s'agit d'une erreur, contactez un
          administrateur.
        </p>
        <button onClick={() => logout()} style={{ marginTop: 16 }}>
          Déconnexion
        </button>
      </div>
    );
  }

  const isAdmin = user.role === 'admin';
  const roleBadge = CONSOLE === 'operations' ? ROLE_OPERATIONS_LABELS[user.roleOperations!] ?? '' : ROLE_LABELS[user.role] ?? user.role;

  return (
    <div className="wrap">
      <div className="topbar">
        <div>
          <div className="brand-logo-row">
            <svg className="brand-mark" viewBox="0 0 100 100" width="32" height="32">
              <circle
                cx="50"
                cy="50"
                r="34"
                fill="none"
                stroke="#1D9E75"
                strokeWidth="13"
                strokeLinecap="round"
                strokeDasharray="168 46"
                transform="rotate(100 50 50)"
              />
            </svg>
            <div className="brand-wordmark">
              <span className="w-olu">OLU</span> <span className="w-360">360</span>
            </div>
          </div>
          <div className="brand-rule"></div>
          <div className="brand-eyebrow">SORAM · IRIS · SIS — écosystème IT</div>
          <h1 className="brand-title">{meta.titre}</h1>
          <div className="brand-partners">
            {(['SORAM', 'SIS', 'IRIS'] as const).map((code) => (
              <div key={code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <EntityLogo entite={code} size={18} />
                <div style={{ width: 22, height: 2, borderRadius: 1, background: entityAccent(code) }} />
              </div>
            ))}
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
            aria-label={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div className="entity-toggle">
            {availableEntities.map((k) => (
              <button
                key={k}
                className={effectiveEntity === k ? 'active' : ''}
                onClick={() => setEntityFilter(k)}
                disabled={availableEntities.length === 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: k !== 'ALL' ? `inset 2px 0 0 ${entityAccent(k)}` : undefined,
                }}
              >
                {k !== 'ALL' && <EntityLogo entite={k} size={13} />}
                {k === 'ALL' ? 'Tous' : k}
              </button>
            ))}
          </div>
          {isAdmin && CONSOLE === 'recouvrement' && (
            <div className="admin-menu" ref={adminMenuRef}>
              <button className="admin-menu-trigger" onClick={() => setAdminMenuOpen((v) => !v)}>
                Administration <ChevronDown size={14} />
              </button>
              {adminMenuOpen && (
                <div className="admin-menu-panel">
                  <button
                    onClick={() => {
                      setSettingsOpen(true);
                      setAdminMenuOpen(false);
                    }}
                  >
                    Paramètres des paliers
                  </button>
                  <button
                    onClick={() => {
                      setImportOpen(true);
                      setAdminMenuOpen(false);
                    }}
                  >
                    Importer un fichier
                  </button>
                  <button
                    onClick={() => {
                      setUsersOpen(true);
                      setAdminMenuOpen(false);
                    }}
                  >
                    Utilisateurs
                  </button>
                  <button
                    onClick={() => {
                      setIntegrationsOpen(true);
                      setAdminMenuOpen(false);
                    }}
                  >
                    Intégrations
                  </button>
                  <button
                    onClick={() => {
                      setEntreprisesOpen(true);
                      setAdminMenuOpen(false);
                    }}
                  >
                    Entreprises
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="topbar-user">
            <div className="avatar">
              {user.nom
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="topbar-user-info">
              <strong>{user.nom}</strong>
              <div className="role-badge">{roleBadge}</div>
            </div>
          </div>
          <button onClick={() => logout()}>Déconnexion</button>
        </div>
      </div>

      {CONSOLE === 'operations' ? (
        <OperationsView entityFilter={effectiveEntity} user={user} reloadKey={dataVersion} />
      ) : CONSOLE === 'coursier' ? (
        <PlanningView entityFilter={effectiveEntity} role={user.role} />
      ) : (
        <>
          <div className="main-tabs">
            <button className={recouvrementTab === 'recouvrement' ? 'active' : ''} onClick={() => setRecouvrementTab('recouvrement')}>
              Recouvrement
            </button>
            <button className={recouvrementTab === 'contrats' ? 'active' : ''} onClick={() => setRecouvrementTab('contrats')}>
              Échéances de contrats
            </button>
          </div>

          {recouvrementTab === 'recouvrement' ? (
            <RecouvrementView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
          ) : (
            <ContractsView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
          )}
        </>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={bumpDataVersion} />}
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={bumpDataVersion} />}
      {usersOpen && <UsersPanel onClose={() => setUsersOpen(false)} />}
      {integrationsOpen && <IntegrationsPanel onClose={() => setIntegrationsOpen(false)} />}
      {entreprisesOpen && <EntreprisesPanel onClose={() => setEntreprisesOpen(false)} onChanged={refetchEntreprises} />}
    </div>
  );
}
