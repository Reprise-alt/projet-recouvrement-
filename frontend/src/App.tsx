import { useEffect, useMemo, useState } from 'react';
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
import { EntityLogo } from './components/EntityLogo';
import { Entite, Entreprise } from './api/types';
import { useResource } from './hooks/useResource';
import { useTheme } from './hooks/useTheme';
import { Moon, Sun } from 'lucide-react';
import { CONSOLE, CONSOLE_META, ECOSYSTEME } from './console';

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
  const [dataVersion, setDataVersion] = useState(0);
  const bumpDataVersion = () => setDataVersion((v) => v + 1);
  const { theme, toggle: toggleTheme } = useTheme();

  const meta = CONSOLE_META[CONSOLE];

  useEffect(() => {
    document.title = `OLU 360 — ${meta.titre}`;
  }, [meta.titre]);

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
    <div className="shell" data-entite={effectiveEntity === 'ALL' ? 'OLU' : effectiveEntity}>
      <nav className="rail">
        <div className="rail-brand">
          <img className="rail-brand-logo" src="/logos/olu360-blanc.svg" alt="OLU 360" />
          <b>{meta.marque}</b>
          <small>By Olu360</small>
          <span className="rail-eyebrow">SORAM · IRIS · SIS</span>
        </div>

        <details className="rail-switch">
          <summary>Changer de console</summary>
          <div className="rail-switch-list">
            {ECOSYSTEME.map((c) => (
              <a key={c.id} href={c.url} aria-current={c.id === CONSOLE ? 'page' : undefined}>
                {c.label}
              </a>
            ))}
          </div>
        </details>

        <div className="rail-section">
          <div className="rail-section-label">Entité</div>
          <div className="rail-entities">
            {availableEntities.map((k) => (
              <button
                key={k}
                className={effectiveEntity === k ? 'active' : ''}
                onClick={() => setEntityFilter(k)}
                disabled={availableEntities.length === 1}
              >
                {k !== 'ALL' && <EntityLogo entite={k} size={15} />}
                {k === 'ALL' ? 'Toutes les entités' : k}
              </button>
            ))}
          </div>
        </div>

        <div className="rail-section">
          <div className="rail-section-label">Navigation</div>
          <div className="rail-nav">
            {CONSOLE === 'recouvrement' ? (
              <>
                <button
                  className={recouvrementTab === 'recouvrement' ? 'active' : ''}
                  onClick={() => setRecouvrementTab('recouvrement')}
                >
                  Recouvrement
                </button>
                <button className={recouvrementTab === 'contrats' ? 'active' : ''} onClick={() => setRecouvrementTab('contrats')}>
                  Échéances de contrats
                </button>
              </>
            ) : CONSOLE === 'operations' ? (
              <button className="active">Opérations</button>
            ) : (
              <button className="active">Planning des coursiers</button>
            )}
          </div>
        </div>

        {isAdmin && CONSOLE === 'recouvrement' && (
          <div className="rail-section">
            <div className="rail-section-label">Administration</div>
            <div className="rail-nav">
              <button onClick={() => setSettingsOpen(true)}>Paramètres des paliers</button>
              <button onClick={() => setImportOpen(true)}>Importer un fichier</button>
              <button onClick={() => setUsersOpen(true)}>Utilisateurs</button>
              <button onClick={() => setIntegrationsOpen(true)}>Intégrations</button>
              <button onClick={() => setEntreprisesOpen(true)}>Entreprises</button>
            </div>
          </div>
        )}

        <div className="rail-foot">
          <div className="rail-user">
            <div className="avatar">
              {user.nom
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="rail-user-info">
              <strong>{user.nom}</strong>
              <div className="role-badge">{roleBadge}</div>
            </div>
          </div>
          <div className="rail-foot-actions">
            <button onClick={toggleTheme} title={theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit'}>
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {theme === 'dark' ? 'Jour' : 'Nuit'}
            </button>
            <button onClick={() => logout()}>Déconnexion</button>
          </div>
        </div>
      </nav>

      <main className="app-main">
        <div className="app-main-head">
          <h1>{meta.titre}</h1>
          <div className="app-sub">{meta.sous}</div>
        </div>

        {CONSOLE === 'operations' ? (
          <OperationsView entityFilter={effectiveEntity} user={user} reloadKey={dataVersion} />
        ) : CONSOLE === 'coursier' ? (
          <PlanningView entityFilter={effectiveEntity} role={user.role} />
        ) : recouvrementTab === 'recouvrement' ? (
          <RecouvrementView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
        ) : (
          <ContractsView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
        )}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={bumpDataVersion} />}
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={bumpDataVersion} />}
      {usersOpen && <UsersPanel onClose={() => setUsersOpen(false)} />}
      {integrationsOpen && <IntegrationsPanel onClose={() => setIntegrationsOpen(false)} />}
      {entreprisesOpen && <EntreprisesPanel onClose={() => setEntreprisesOpen(false)} onChanged={refetchEntreprises} />}
    </div>
  );
}
