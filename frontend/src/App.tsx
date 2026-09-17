import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import { InscriptionOtpPage } from './components/InscriptionOtpPage';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { RecouvrementView } from './components/RecouvrementView';
import { RelancesAVenirView } from './components/RelancesAVenirView';
import { ModelesRelancePanel } from './components/ModelesRelancePanel';
import { ContractsView } from './components/ContractsView';
import { ContentieuxView } from './components/ContentieuxView';
import { PlanningView } from './components/PlanningView';
import { OperationsView } from './components/OperationsView';
import { CoursierPublicView } from './components/CoursierPublicView';
import { SalleCoursierView } from './components/SalleCoursierView';
import { PortailDebiteurView } from './components/PortailDebiteurView';
import { PresentationView } from './components/PresentationView';
import { SettingsModal } from './components/SettingsModal';
import { ImportPanel } from './components/ImportPanel';
import { UsersPanel } from './components/UsersPanel';
import { IntegrationsPanel } from './components/IntegrationsPanel';
import { EntreprisesPanel } from './components/EntreprisesPanel';
import { FicheEntreprise } from './components/FicheEntreprise';
import { AbonnementBloque } from './components/AbonnementBloque';
import { SuperAdminPanel } from './components/SuperAdminPanel';
import { EntityLogo } from './components/EntityLogo';
import { Entite, Entreprise } from './api/types';
import { useResource } from './hooks/useResource';
import { useTheme } from './hooks/useTheme';
import { Moon, Sun } from 'lucide-react';
import { CONSOLE, CONSOLE_META, ECOSYSTEME } from './console';
import { AUTH_MODE, IS_SAAS, redirigerVersHub } from './auth/mode';

type EntityFilter = Entite | 'ALL';
type RecouvrementTab = 'recouvrement' | 'relances' | 'contrats' | 'contentieux';

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
  // Portail débiteur — lien public à token partagé au débiteur (contentieux).
  if (window.location.pathname.startsWith('/portail/')) {
    const token = window.location.pathname.slice('/portail/'.length);
    return <PortailDebiteurView token={token} />;
  }
  // Page vitrine publique (présentation + tarifs), sans session.
  if (window.location.pathname.startsWith('/presentation')) {
    return <PresentationView />;
  }

  const [recouvrementTab, setRecouvrementTab] = useState<RecouvrementTab>('recouvrement');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [modelesOpen, setModelesOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [entreprisesOpen, setEntreprisesOpen] = useState(false);
  const [ficheOpen, setFicheOpen] = useState(false);
  const [superAdminOpen, setSuperAdminOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  // Démarrage guidé SaaS : les comptes d'organisation (roleOrg) atterrissent sur
  // la checklist tant qu'ils ne sont pas entrés dans la console.
  const [enConsole, setEnConsole] = useState(false);
  const bumpDataVersion = () => setDataVersion((v) => v + 1);
  const { theme, toggle: toggleTheme } = useTheme();

  const meta = CONSOLE_META[CONSOLE];

  useEffect(() => {
    document.title = `OLU 360 — ${meta.titre}`;
  }, [meta.titre]);

  const { data: entreprises, refetch: refetchEntreprises } = useResource<Entreprise[]>(user ? '/api/entreprises' : null);

  // Alerte onglet Contentieux : nombre de propositions débiteur en attente.
  const { data: alertesContentieux } = useResource<{ propositionsEnAttente: number }>(
    user && CONSOLE === 'recouvrement' && (user.accesRecouvrement || user.accesContentieux) ? '/api/contentieux/alertes' : null,
    dataVersion,
  );
  const nbAlertesContentieux = alertesContentieux?.propositionsEnAttente ?? 0;

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
    // La console Recouvrement admet aussi les collaborateurs juridiques externes
    // (accesContentieux), qui n'y verront QUE l'onglet Contentieux.
    return user.accesRecouvrement || user.accesContentieux;
  }, [user]);

  // Collaborateur juridique externe : accès Contentieux sans le recouvrement
  // interne. On ne lui montre que l'onglet Contentieux, ni la partie financière
  // ni l'administration.
  const contentieuxSeul = !!user && user.accesContentieux && !user.accesRecouvrement;

  useEffect(() => {
    if (contentieuxSeul) setRecouvrementTab('contentieux');
  }, [contentieuxSeul]);

  if (loading) return null;
  if (!user) {
    // Mode SSO : pas de formulaire local — on renvoie au hub pour s'y
    // connecter (le cookie de session sera ensuite lu automatiquement).
    if (AUTH_MODE === 'sso') {
      redirigerVersHub();
      return null;
    }
    // Mode SaaS self-service : inscription/connexion par code email.
    if (AUTH_MODE === 'otp') return <InscriptionOtpPage />;
    return <LoginPage />;
  }

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

  // Abonnement bloqué (essai terminé / compte suspendu) : écran doux à la place
  // de la console, données conservées. Ne concerne que le SaaS (les comptes
  // groupe sont « actif »).
  const abo = user.abonnement;
  // L'exploitant plateforme n'est jamais bloqué (il doit toujours pouvoir
  // atteindre le back-office d'activation, même si son propre essai a expiré).
  if (!user.superAdmin && abo && (abo.etat === 'essai_expire' || abo.etat === 'suspendu')) {
    return <AbonnementBloque etat={abo.etat} />;
  }

  const isAdmin = user.role === 'admin';
  const roleBadge = CONSOLE === 'operations' ? ROLE_OPERATIONS_LABELS[user.roleOperations!] ?? '' : ROLE_LABELS[user.role] ?? user.role;

  // Comptes SaaS : écran de démarrage guidé tant qu'ils n'entrent pas dans la console.
  if (user.roleOrg && !enConsole) {
    return <OnboardingChecklist onEntrerConsole={() => setEnConsole(true)} />;
  }

  return (
    <div className="shell" data-entite={effectiveEntity === 'ALL' ? 'OLU' : effectiveEntity}>
      <nav className="rail">
        <div className="rail-brand">
          <img
            className="rail-brand-logo"
            src={IS_SAAS && user.logoUrl ? user.logoUrl : '/logos/olu360-blanc.svg'}
            alt={IS_SAAS && user.raisonSociale ? user.raisonSociale : 'OLU 360'}
            // Si le logo du client ne charge pas, on retombe proprement sur le
            // logo OLU plutôt que d'afficher une image cassée.
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.src.endsWith('/logos/olu360-blanc.svg')) img.src = '/logos/olu360-blanc.svg';
            }}
          />
          <b>{meta.marque}</b>
          <small>By Olu360</small>
          {/* Bandeau des entités du groupe : réservé à la console interne. En
              SaaS, on affiche la marque du client (jamais SORAM/IRIS/SIS). */}
          {IS_SAAS ? (
            user.raisonSociale ? <span className="rail-eyebrow">{user.raisonSociale}</span> : null
          ) : (
            <span className="rail-eyebrow">SORAM · IRIS · SIS</span>
          )}
        </div>

        {/* Sélecteur multi-consoles = navigation interne du groupe. Un client
            SaaS n'a accès à aucune autre console : on le masque entièrement. */}
        {!IS_SAAS && (
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
        )}

        {/* Sélecteur d'entité : masqué pour un client SaaS mono-entité (0 ou 1
            entité réelle) — il n'y a alors aucun choix à faire, et tout son
            portefeuille s'affiche. Le groupe et les clients multi-entités
            gardent le sélecteur. */}
        {!(IS_SAAS && availableEntities.filter((e) => e !== 'ALL').length <= 1) && (
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
        )}

        <div className="rail-section">
          <div className="rail-section-label">Navigation</div>
          <div className="rail-nav">
            {CONSOLE === 'recouvrement' ? (
              <>
                {!contentieuxSeul && (
                  <>
                    <button
                      className={recouvrementTab === 'recouvrement' ? 'active' : ''}
                      onClick={() => setRecouvrementTab('recouvrement')}
                    >
                      Recouvrement
                    </button>
                    <button className={recouvrementTab === 'relances' ? 'active' : ''} onClick={() => setRecouvrementTab('relances')}>
                      Relances à venir
                    </button>
                    {/* Suivi des échéances de contrats = métier distinct du
                        recouvrement (renouvellements/révisions). Masqué en SaaS
                        pour rester une solution 100 % recouvrement ; la console
                        interne du groupe conserve la fonction. */}
                    {!IS_SAAS && (
                      <button className={recouvrementTab === 'contrats' ? 'active' : ''} onClick={() => setRecouvrementTab('contrats')}>
                        Échéances de contrats
                      </button>
                    )}
                  </>
                )}
                <button
                  className={recouvrementTab === 'contentieux' ? 'active' : ''}
                  onClick={() => setRecouvrementTab('contentieux')}
                >
                  Contentieux
                  {nbAlertesContentieux > 0 && (
                    <span
                      title={`${nbAlertesContentieux} proposition(s) de règlement en attente`}
                      style={{
                        marginLeft: 6,
                        minWidth: 16,
                        height: 16,
                        padding: '0 4px',
                        borderRadius: 8,
                        background: 'var(--danger)',
                        color: '#fff',
                        fontSize: 10.5,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {nbAlertesContentieux}
                    </span>
                  )}
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
              {/* Fiche entreprise : profil de la société (logo, NINEA/IFU, RCCM,
                  adresse, contact, instructions de paiement). Accessible en
                  permanence en SaaS — plus seulement pendant l'onboarding. */}
              {IS_SAAS && <button onClick={() => setFicheOpen(true)}>Fiche entreprise</button>}
              <button onClick={() => setSettingsOpen(true)}>Paramètres des paliers</button>
              <button onClick={() => setModelesOpen(true)}>Modèles de relance</button>
              <button onClick={() => setImportOpen(true)}>Importer un fichier</button>
              <button onClick={() => setUsersOpen(true)}>Utilisateurs</button>
              <button onClick={() => setIntegrationsOpen(true)}>Intégrations</button>
              <button onClick={() => setEntreprisesOpen(true)}>Entreprises</button>
            </div>
          </div>
        )}

        {/* Exploitant plateforme : back-office d'activation des comptes (§8). */}
        {user.superAdmin && (
          <div className="rail-section">
            <div className="rail-section-label">Exploitant</div>
            <div className="rail-nav">
              <button onClick={() => setSuperAdminOpen(true)}>Organisations (activation)</button>
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
        {/* Bandeau d'essai : compte à rebours discret tant que le compte est en
            période d'essai. */}
        {abo?.etat === 'essai' && (
          <div
            style={{
              margin: '0 0 16px',
              padding: '10px 16px',
              borderRadius: 10,
              background: 'var(--amber-soft, #fff4e0)',
              border: '1px solid var(--amber, #e0a13a)',
              fontSize: 13,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <b>Essai gratuit</b>
            <span>
              {abo.joursRestants != null
                ? `Il vous reste ${abo.joursRestants} jour${abo.joursRestants > 1 ? 's' : ''} d'essai.`
                : "Vous êtes en période d'essai."}
            </span>
            <a href="mailto:contact@olu360.com" style={{ marginLeft: 'auto', fontWeight: 600 }}>
              Activer mon abonnement →
            </a>
          </div>
        )}

        <div className="app-main-head">
          <h1>{meta.titre}</h1>
          {/* Le sous-titre du groupe se termine par « — SORAM · IRIS · SIS » ;
              en SaaS on retire ce suffixe d'entités groupe. */}
          <div className="app-sub">{IS_SAAS ? meta.sous.split(' — ')[0] : meta.sous}</div>
        </div>

        {CONSOLE === 'operations' ? (
          <OperationsView entityFilter={effectiveEntity} user={user} reloadKey={dataVersion} />
        ) : CONSOLE === 'coursier' ? (
          <PlanningView entityFilter={effectiveEntity} role={user.role} />
        ) : contentieuxSeul || recouvrementTab === 'contentieux' ? (
          <ContentieuxView entityFilter={effectiveEntity} role={user.role} avocat={contentieuxSeul} />
        ) : recouvrementTab === 'relances' ? (
          <RelancesAVenirView reloadKey={dataVersion} canManage={isAdmin} />
        ) : !IS_SAAS && recouvrementTab === 'contrats' ? (
          <ContractsView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
        ) : (
          // Vue par défaut (onglet Recouvrement, et repli si l'onglet contrats
          // est masqué en SaaS).
          <RecouvrementView
            entityFilter={effectiveEntity}
            role={user.role}
            reloadKey={dataVersion}
            onImport={isAdmin ? () => setImportOpen(true) : undefined}
          />
        )}
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={bumpDataVersion} />}
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={bumpDataVersion} />}
      {usersOpen && <UsersPanel onClose={() => setUsersOpen(false)} />}
      {modelesOpen && <ModelesRelancePanel onClose={() => setModelesOpen(false)} />}
      {integrationsOpen && <IntegrationsPanel onClose={() => setIntegrationsOpen(false)} />}
      {entreprisesOpen && <EntreprisesPanel onClose={() => setEntreprisesOpen(false)} onChanged={refetchEntreprises} />}
      {ficheOpen && <FicheEntreprise onClose={() => setFicheOpen(false)} onSaved={bumpDataVersion} />}
      {superAdminOpen && <SuperAdminPanel onClose={() => setSuperAdminOpen(false)} />}
    </div>
  );
}
