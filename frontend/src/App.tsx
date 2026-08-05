import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Landing } from './components/Landing';
import { RecouvrementView } from './components/RecouvrementView';
import { ContractsView } from './components/ContractsView';
import { PlanningView } from './components/PlanningView';
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

type MainView = 'recouvrement' | 'contrats' | 'planning';
type EntityFilter = Entite | 'ALL';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager_entite: "Manager d'entité",
  comptable: 'Comptable',
};

export function App() {
  const { user, loading, logout } = useAuth();

  // Page vitrine publique — pas d'authentification requise, ne dépend pas de
  // l'état de connexion (contrairement au reste de l'app ci-dessous).
  if (window.location.pathname === '/presentation') return <Landing />;

  // Lien personnel d'un coursier — identifié par un token dans l'URL, pas
  // par une session : même logique d'accès public que la vitrine, mais
  // scopée à un seul coursier côté API (cf. routes/coursierPublic.ts).
  if (window.location.pathname.startsWith('/coursier/')) {
    const token = window.location.pathname.slice('/coursier/'.length);
    return <CoursierPublicView token={token} />;
  }

  // Écran de salle des coursiers — un seul lien partagé, pas un par
  // personne (cf. SalleCoursierView), même logique d'accès public.
  if (window.location.pathname.startsWith('/salle/')) {
    const token = window.location.pathname.slice('/salle/'.length);
    return <SalleCoursierView token={token} />;
  }
  const [view, setView] = useState<MainView>('recouvrement');
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

  useEffect(() => {
    if (!adminMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) setAdminMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [adminMenuOpen]);

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
          {isAdmin && (
            <div className="admin-menu" ref={adminMenuRef}>
              <button className="admin-menu-trigger" onClick={() => setAdminMenuOpen((v) => !v)}>
                Administration ▾
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
              <div className="role-badge">{ROLE_LABELS[user.role] ?? user.role}</div>
            </div>
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
        <button className={view === 'planning' ? 'active' : ''} onClick={() => setView('planning')}>
          Planning des coursiers
        </button>
      </div>

      {view === 'recouvrement' ? (
        <RecouvrementView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
      ) : view === 'contrats' ? (
        <ContractsView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
      ) : (
        <PlanningView entityFilter={effectiveEntity} role={user.role} />
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
