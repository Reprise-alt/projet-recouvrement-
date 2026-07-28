import { useMemo, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import { RecouvrementView } from './components/RecouvrementView';
import { ContractsView } from './components/ContractsView';
import { SettingsModal } from './components/SettingsModal';
import { ImportPanel } from './components/ImportPanel';
import { UsersPanel } from './components/UsersPanel';
import { IntegrationsPanel } from './components/IntegrationsPanel';
import { EntreprisesPanel } from './components/EntreprisesPanel';
import { Entite, Entreprise } from './api/types';
import { useResource } from './hooks/useResource';

type MainView = 'recouvrement' | 'contrats';
type EntityFilter = Entite | 'ALL';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager_entite: "Manager d'entité",
  comptable: 'Comptable',
};

export function App() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<MainView>('recouvrement');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [entreprisesOpen, setEntreprisesOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const bumpDataVersion = () => setDataVersion((v) => v + 1);

  const { data: entreprises, refetch: refetchEntreprises } = useResource<Entreprise[]>(user ? '/api/entreprises' : null);

  const availableEntities = useMemo<EntityFilter[]>(() => {
    if (!user) return ['ALL'];
    // L'entité commune ("COMMUN") est un pseudo-groupe partagé, jamais un
    // onglet de filtre sélectionnable — comme avant l'ajout des entités
    // dynamiques.
    const codes = (entreprises ?? []).filter((e) => !e.estCommun).map((e) => e.code);
    if (user.role === 'admin' || !user.entite) return ['ALL', ...codes];
    return [user.entite];
  }, [user, entreprises]);

  const effectiveEntity: EntityFilter = availableEntities.includes(entityFilter) ? entityFilter : availableEntities[0];

  if (loading) return null;
  if (!user) return <LoginPage />;

  const isAdmin = user.role === 'admin';

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
          <h1 className="brand-title">Suivi du recouvrement</h1>
        </div>
        <div className="topbar-actions">
          <div className="entity-toggle">
            {availableEntities.map((k) => (
              <button
                key={k}
                className={effectiveEntity === k ? 'active' : ''}
                onClick={() => setEntityFilter(k)}
                disabled={availableEntities.length === 1}
              >
                {k === 'ALL' ? 'Tous' : k}
              </button>
            ))}
          </div>
          {isAdmin && <button onClick={() => setSettingsOpen(true)}>Paramètres des paliers</button>}
          {isAdmin && <button onClick={() => setImportOpen(true)}>Importer un fichier</button>}
          {isAdmin && <button onClick={() => setUsersOpen(true)}>Utilisateurs</button>}
          {isAdmin && <button onClick={() => setIntegrationsOpen(true)}>Intégrations</button>}
          {isAdmin && <button onClick={() => setEntreprisesOpen(true)}>Entreprises</button>}
          <div className="topbar-user">
            <strong>{user.nom}</strong>
            <div className="role-badge">{ROLE_LABELS[user.role] ?? user.role}</div>
          </div>
          <button onClick={() => logout()}>Déconnexion</button>
        </div>
      </div>

      <div className="main-tabs">
        <button className={view === 'recouvrement' ? 'active' : ''} onClick={() => setView('recouvrement')}>
          Recouvrement
        </button>
        <button className={view === 'contrats' ? 'active' : ''} onClick={() => setView('contrats')}>
          Échéances de contrats
        </button>
      </div>

      {view === 'recouvrement' ? (
        <RecouvrementView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
      ) : (
        <ContractsView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={bumpDataVersion} />}
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={bumpDataVersion} />}
      {usersOpen && <UsersPanel onClose={() => setUsersOpen(false)} />}
      {integrationsOpen && <IntegrationsPanel onClose={() => setIntegrationsOpen(false)} />}
      {entreprisesOpen && (
        <EntreprisesPanel onClose={() => setEntreprisesOpen(false)} onChanged={refetchEntreprises} />
      )}
    </div>
  );
}
