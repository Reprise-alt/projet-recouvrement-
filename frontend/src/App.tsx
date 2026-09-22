import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './components/LoginPage';
import { InscriptionOtpPage } from './components/InscriptionOtpPage';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { RecouvrementView } from './components/RecouvrementView';
import { ImpactDashboard } from './components/ImpactDashboard';
import { RelancesAVenirView } from './components/RelancesAVenirView';
import { ContractsView } from './components/ContractsView';
import { ContentieuxView } from './components/ContentieuxView';
import { PlanningView } from './components/PlanningView';
import { OperationsView } from './components/OperationsView';
import { CoursierPublicView } from './components/CoursierPublicView';
import { SalleCoursierView } from './components/SalleCoursierView';
import { PortailDebiteurView } from './components/PortailDebiteurView';
import { DeclarationChequeView } from './components/DeclarationChequeView';
import { PresentationView } from './components/PresentationView';
import { ArticlePage, BlogIndex } from './components/BlogView';
import { WelcomeSplash } from './components/WelcomeSplash';
import { ImportPanel } from './components/ImportPanel';
import { IntegrationsPanel } from './components/IntegrationsPanel';
import { ParametresEntreprisePanel } from './components/ParametresEntreprisePanel';
import { AbonnementBloque } from './components/AbonnementBloque';
import { SuperAdminPanel } from './components/SuperAdminPanel';
import { ParrainagePanel } from './components/ParrainagePanel';
import { RapprochementPanel } from './components/RapprochementPanel';
import { RecapJournee } from './components/RecapJournee';
import { ChequesDeclaresPanel } from './components/ChequesDeclaresPanel';
import { OffresAbonnement } from './components/OffresAbonnement';
import { EntityLogo } from './components/EntityLogo';
import { Entite, Entreprise } from './api/types';
import { useResource } from './hooks/useResource';
import { useTheme } from './hooks/useTheme';
import { Lock, Moon, Sun } from 'lucide-react';
import { ContentieuxUpsell } from './components/ContentieuxUpsell';
import { PartenaireConsole } from './components/PartenaireConsole';
import { OperateurConsole } from './components/OperateurConsole';
import { CONSOLE, CONSOLE_META, ECOSYSTEME } from './console';
import { AUTH_MODE, IS_SAAS, redirigerVersHub } from './auth/mode';
import { setFeymaFavicon } from './lib/seo';

type EntityFilter = Entite | 'ALL';
type RecouvrementTab = 'tableau' | 'recouvrement' | 'relances' | 'contrats' | 'contentieux';

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
  const { user, loading, logout, refresh } = useAuth();

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
  // Déclaration publique « chèque disponible » (lien à token dans une relance).
  if (window.location.pathname.startsWith('/cheque/')) {
    const token = window.location.pathname.slice('/cheque/'.length);
    return <DeclarationChequeView token={token} />;
  }
  // Page vitrine publique (présentation + tarifs), sans session.
  if (window.location.pathname.startsWith('/presentation')) {
    return <PresentationView />;
  }
  // Blog / Actualités — pages publiques indexables (SEO / content marketing).
  if (window.location.pathname.startsWith('/blog')) {
    const rest = window.location.pathname.slice('/blog'.length).replace(/^\/+|\/+$/g, '');
    return rest ? <ArticlePage slug={rest} /> : <BlogIndex />;
  }
  // Inscription / connexion self-service (SaaS) — page dédiée pour laisser la
  // racine servir la vitrine (accueil public, indexable). Une fois connecté, on
  // ne bloque pas ici : la logique normale prend le relais (console).
  if (window.location.pathname.startsWith('/inscription') && AUTH_MODE === 'otp' && !user) {
    return <InscriptionOtpPage />;
  }

  // En SaaS, le tableau de bord « Impact » est l'accueil (vu à chaque connexion).
  const [recouvrementTab, setRecouvrementTab] = useState<RecouvrementTab>(IS_SAAS ? 'tableau' : 'recouvrement');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL');
  const [parametresOpen, setParametresOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [superAdminOpen, setSuperAdminOpen] = useState(false);
  const [espaceExploitantOuvert, setEspaceExploitantOuvert] = useState(false);
  const [offresOpen, setOffresOpen] = useState(false);
  const [parrainageOpen, setParrainageOpen] = useState(false);
  const [rapprochementOpen, setRapprochementOpen] = useState(false);
  const [rapprochementOnglet, setRapprochementOnglet] = useState<'integrateurs' | 'cheque' | undefined>(undefined);
  const [chequesOpen, setChequesOpen] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  // Démarrage guidé SaaS : les comptes d'organisation (roleOrg) atterrissent sur
  // la checklist tant qu'ils ne sont pas entrés dans la console.
  const [enConsole, setEnConsole] = useState(false);
  // Splash d'accueil « Bon recouvrement ! » — une fois par session, SaaS only.
  const [welcome, setWelcome] = useState(() => {
    try {
      return IS_SAAS && !sessionStorage.getItem('feyma_welcome');
    } catch {
      return false;
    }
  });
  const bumpDataVersion = () => setDataVersion((v) => v + 1);
  const { theme, toggle: toggleTheme } = useTheme();

  const meta = CONSOLE_META[CONSOLE];

  useEffect(() => {
    // En SaaS, l'appli est « Feyma » (jamais « OLU 360 ») — titre + favicon.
    document.title = IS_SAAS ? `Feyma — ${meta.titre}` : `OLU 360 — ${meta.titre}`;
    if (IS_SAAS) setFeymaFavicon();
  }, [meta.titre]);

  const { data: entreprises, refetch: refetchEntreprises } = useResource<Entreprise[]>(user ? '/api/entreprises' : null);

  // Alerte onglet Contentieux : nombre de propositions débiteur en attente.
  const { data: alertesContentieux } = useResource<{ propositionsEnAttente: number }>(
    user && CONSOLE === 'recouvrement' && (user.accesRecouvrement || user.accesContentieux) ? '/api/contentieux/alertes' : null,
    dataVersion,
  );
  const nbAlertesContentieux = alertesContentieux?.propositionsEnAttente ?? 0;

  // Chèques signalés disponibles par les débiteurs (badge + panneau).
  const { data: chequesAlertes } = useResource<{ nbNouvelles: number }>(
    user && IS_SAAS && CONSOLE === 'recouvrement' && user.accesRecouvrement ? '/api/cheques/alertes' : null,
    dataVersion,
  );
  const nbChequesDeclares = chequesAlertes?.nbNouvelles ?? 0;

  // Pastille « nouveaux essais » (exploitant) : nombre d'organisations inscrites
  // depuis la dernière ouverture du back-office. Un e-mail de notification peut
  // filer en spam ou échouer ; cette pastille, elle, ne rate jamais un inscrit.
  const [exploitantVu, setExploitantVu] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('feyma_exploitant_vu')) || 0;
    } catch {
      return 0;
    }
  });
  const { data: adminOrgs } = useResource<{ createdAt: string }[]>(
    user?.superAdmin ? '/api/admin/organisations' : null,
    dataVersion,
  );
  const nbNouveauxEssais = adminOrgs ? adminOrgs.filter((o) => new Date(o.createdAt).getTime() > exploitantVu).length : 0;
  const marquerExploitantVu = () => {
    const now = Date.now();
    setExploitantVu(now);
    try {
      localStorage.setItem('feyma_exploitant_vu', String(now));
    } catch {
      /* stockage indisponible — pas grave */
    }
  };

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
    // Mode SaaS self-service : la racine sert la VITRINE (accueil public,
    // indexable, vendeur) ; l'inscription/connexion est sur /inscription
    // (bouton « Commencer / Se connecter »).
    if (AUTH_MODE === 'otp') return <PresentationView />;
    return <LoginPage />;
  }

  // Session cabinet partenaire (avocat/huissier plateforme, sans organisation) :
  // console dédiée « dossiers confiés », transverse aux sociétés. Court-circuite
  // toute la console normale (rail, onglets, abonnement…).
  if (user.partenaire) {
    return <PartenaireConsole nom={user.nom} onLogout={logout} />;
  }

  // Session exploitant plateforme (gère les demandes + activations, sans société) :
  // espace dédié, transverse aux sociétés. Court-circuite la console normale.
  if (user.operateur) {
    return <OperateurConsole email={user.email} onLogout={logout} />;
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

  // Capacités de la formule (SaaS uniquement — la console groupe n'est pas
  // bridée). `!== false` : non renseigné ou hors SaaS = tout autorisé.
  const caps = user.capacites;
  const canReporting = !IS_SAAS || caps?.reporting !== false;
  const canContentieux = !IS_SAAS || caps?.contentieux !== false;
  // Onglet effectif : le tableau de bord n'existe qu'en SaaS avec le reporting ;
  // sinon on retombe sur « Recouvrement » (évite un onglet actif mais masqué).
  const tabActif: RecouvrementTab = recouvrementTab === 'tableau' && !(IS_SAAS && canReporting) ? 'recouvrement' : recouvrementTab;
  const canMultiEntites = !IS_SAAS || caps?.multiEntites !== false;
  // Contentieux non inclus dans la formule (SaaS « Petite structure ») : on
  // n'efface plus l'onglet, on le présente verrouillé avec un écran d'activation
  // (option +10 000 FCFA/mois) que l'admin peut souscrire en self-service.
  const contentieuxVerrouille = IS_SAAS && caps?.contentieux === false;

  // Comptes SaaS : écran de démarrage guidé tant qu'ils n'entrent pas dans la console.
  if (user.roleOrg && !enConsole) {
    return <OnboardingChecklist onEntrerConsole={() => setEnConsole(true)} />;
  }

  // Super-admin qui bascule vers l'espace exploitant plein écran depuis sa propre
  // console (sans changer de compte) : même vue que la session opérateur autonome,
  // avec un retour vers sa console au lieu d'une déconnexion.
  if (user.superAdmin && espaceExploitantOuvert) {
    return <OperateurConsole email={user.email} onLogout={logout} onClose={() => setEspaceExploitantOuvert(false)} />;
  }

  return (
    <div className={`shell${IS_SAAS ? ' is-feyma' : ''}`} data-entite={effectiveEntity === 'ALL' ? 'OLU' : effectiveEntity}>
      {welcome && (
        <WelcomeSplash
          nom={user.raisonSociale}
          onDone={() => {
            setWelcome(false);
            try {
              sessionStorage.setItem('feyma_welcome', '1');
            } catch {
              /* stockage indisponible : le splash ne rejouera pas dans ce rendu */
            }
          }}
        />
      )}
      <nav className="rail">
        <div className="rail-brand">
          <img
            className="rail-brand-logo"
            src={IS_SAAS && user.logoUrl ? user.logoUrl : IS_SAAS ? '/logos/feyma-blanc.svg' : '/logos/olu360-blanc.svg'}
            alt={IS_SAAS ? user.raisonSociale ?? 'Feyma' : 'OLU 360'}
            // Si le logo du client ne charge pas, on retombe proprement sur le
            // logo de la plateforme plutôt que d'afficher une image cassée.
            onError={(e) => {
              const img = e.currentTarget;
              const fallback = IS_SAAS ? '/logos/feyma-blanc.svg' : '/logos/olu360-blanc.svg';
              if (!img.src.endsWith(fallback)) img.src = fallback;
            }}
          />
          <b>{IS_SAAS ? 'Feyma' : meta.marque}</b>
          <small>{IS_SAAS ? 'by OLU 360' : 'By Olu360'}</small>
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
                    {IS_SAAS && canReporting && (
                      <button
                        className={tabActif === 'tableau' ? 'active' : ''}
                        onClick={() => setRecouvrementTab('tableau')}
                      >
                        Tableau de bord
                      </button>
                    )}
                    <button
                      className={tabActif === 'recouvrement' ? 'active' : ''}
                      onClick={() => setRecouvrementTab('recouvrement')}
                    >
                      Recouvrement
                    </button>
                    <button className={tabActif === 'relances' ? 'active' : ''} onClick={() => setRecouvrementTab('relances')}>
                      Relances à venir
                    </button>
                    {/* Suivi des échéances de contrats = métier distinct du
                        recouvrement (renouvellements/révisions). Masqué en SaaS
                        pour rester une solution 100 % recouvrement ; la console
                        interne du groupe conserve la fonction. */}
                    {!IS_SAAS && (
                      <button className={tabActif === 'contrats' ? 'active' : ''} onClick={() => setRecouvrementTab('contrats')}>
                        Échéances de contrats
                      </button>
                    )}
                  </>
                )}
                {/* Contentieux : inclus PME / Grands comptes ; en option pour la
                    formule Petite (SaaS). Verrouillé, l'onglet reste visible et
                    mène à l'écran d'activation. */}
                <button
                  className={tabActif === 'contentieux' ? 'active' : ''}
                  onClick={() => setRecouvrementTab('contentieux')}
                >
                  Contentieux
                  {contentieuxVerrouille && (
                    <Lock size={12} style={{ marginLeft: 6, opacity: 0.6, verticalAlign: '-1px' }} />
                  )}
                  {!contentieuxVerrouille && nbAlertesContentieux > 0 && (
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
              {/* Paramètres entreprise : hub regroupant toute la configuration
                  (fiche, paliers, modèles, utilisateurs, entités, délivrabilité)
                  derrière une seule entrée du rail. */}
              <button onClick={() => setParametresOpen(true)}>Paramètres entreprise</button>
              <button onClick={() => setImportOpen(true)}>Importer un fichier</button>
              {IS_SAAS && <button onClick={() => { setRapprochementOnglet(undefined); setRapprochementOpen(true); }}>Rapprochement des paiements</button>}
              {/* Accès direct au scan de chèques par lot (évite de passer par les
                  onglets du module Rapprochement) — l'usage quotidien de l'agent. */}
              {IS_SAAS && <button onClick={() => { setRapprochementOnglet('cheque'); setRapprochementOpen(true); }}>📸 Scanner des chèques</button>}
              {IS_SAAS && (
                <button onClick={() => setChequesOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span>Chèques déclarés</span>
                  {nbChequesDeclares > 0 && (
                    <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--danger)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {nbChequesDeclares}
                    </span>
                  )}
                </button>
              )}
              {/* Intégrations Gmail = envoi manuel côté groupe. En SaaS, l'envoi
                  (auto ET manuel) passe par le canal mutualisé au nom du client —
                  ce panneau ne sert à rien, on le masque. */}
              {!IS_SAAS && <button onClick={() => setIntegrationsOpen(true)}>Intégrations</button>}
              {/* Parrainage : inviter une entreprise, 1 mois offert (SaaS). */}
              {IS_SAAS && <button onClick={() => setParrainageOpen(true)}>🎁 Parrainage</button>}
            </div>
          </div>
        )}

        {/* Exploitant plateforme : back-office d'activation des comptes (§8). */}
        {user.superAdmin && (
          <div className="rail-section">
            <div className="rail-section-label">Exploitant</div>
            <div className="rail-nav">
              <button
                onClick={() => { setSuperAdminOpen(true); marquerExploitantVu(); }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
              >
                <span>Organisations (activation)</span>
                {nbNouveauxEssais > 0 && (
                  <span
                    title={`${nbNouveauxEssais} nouvel${nbNouveauxEssais > 1 ? 's essais' : ' essai'} depuis votre dernière visite`}
                    style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--danger)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {nbNouveauxEssais}
                  </span>
                )}
              </button>
              <button onClick={() => setEspaceExploitantOuvert(true)}>Ouvrir l’espace exploitant</button>
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
        {/* Bandeau d'essai (direction C « émeraude offre ») : incite à choisir une
            formule tant que le compte est en essai. Passe en registre d'urgence
            (ambre) dans les 3 derniers jours. Le clic ouvre les offres. */}
        {abo?.etat === 'essai' && (() => {
          const j = abo.joursRestants;
          const urgent = j != null && j <= 3;
          const dateStr = abo.dateFinEssai
            ? new Date(abo.dateFinEssai).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
            : null;
          const accent = urgent ? 'var(--amber, #b0700f)' : 'var(--accent, #0E7C5A)';
          const accentSoft = urgent ? 'var(--amber-soft, #FBF1DE)' : 'var(--accent-soft, #E3F2EC)';
          const border = urgent ? 'rgba(176,112,15,.30)' : 'rgba(14,124,90,.28)';
          const eyebrow = urgent ? 'Dernière ligne droite' : 'Débloquez tout le potentiel';
          const titre =
            j != null
              ? `${urgent ? 'Plus que' : 'Encore'} ${j} jour${j > 1 ? 's' : ''} d'essai — passez à Feyma illimité.`
              : 'Votre essai est en cours — passez à Feyma illimité.';
          return (
            <div
              style={{
                margin: '0 0 16px',
                padding: '16px 18px',
                borderRadius: 14,
                background: `linear-gradient(180deg, var(--surface, #fff) 0%, ${accentSoft} 100%)`,
                border: `1px solid ${border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                flexWrap: 'wrap',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  flex: 'none', width: 48, height: 48, borderRadius: 12, background: accent, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                </svg>
              </div>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: accent, marginBottom: 3 }}>
                  {eyebrow}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(16px, 2.4vw, 20px)', letterSpacing: '-.01em', lineHeight: 1.15 }}>
                  {titre}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 3 }}>
                  Portefeuille illimité, relances 24/7, contentieux — 2 mois offerts en annuel
                  {dateStr ? ` · jusqu'au ${dateStr}` : ''}.
                </div>
              </div>
              <button
                onClick={() => setOffresOpen(true)}
                style={{
                  flex: 'none', background: 'var(--ink, #0E1D33)', color: '#fff', fontWeight: 700, fontSize: 15,
                  padding: '12px 20px', borderRadius: 11, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Voir les formules →
              </button>
            </div>
          );
        })()}

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
        ) : IS_SAAS && canReporting && tabActif === 'tableau' && !contentieuxSeul ? (
          <ImpactDashboard onVoirReporting={() => setRecouvrementTab('recouvrement')} />
        ) : contentieuxSeul || (tabActif === 'contentieux' && canContentieux) ? (
          <ContentieuxView entityFilter={effectiveEntity} role={user.role} avocat={contentieuxSeul} />
        ) : tabActif === 'contentieux' ? (
          // Onglet Contentieux verrouillé (formule Petite) : écran d'activation.
          <ContentieuxUpsell canActivate={isAdmin} onActivated={refresh} />
        ) : tabActif === 'relances' ? (
          <RelancesAVenirView reloadKey={dataVersion} canManage={isAdmin} />
        ) : !IS_SAAS && tabActif === 'contrats' ? (
          <ContractsView entityFilter={effectiveEntity} role={user.role} reloadKey={dataVersion} />
        ) : (
          // Vue par défaut (onglet Recouvrement, et repli si l'onglet contrats
          // est masqué en SaaS).
          <RecouvrementView
            entityFilter={effectiveEntity}
            role={user.role}
            reloadKey={dataVersion}
            canReporting={canReporting}
            onImport={isAdmin ? () => setImportOpen(true) : undefined}
          />
        )}
      </main>

      {/* « Le Fantôme du jour » : récap animé de la journée, bouton flottant.
          Console recouvrement SaaS uniquement. */}
      {IS_SAAS && CONSOLE === 'recouvrement' && <RecapJournee />}

      {parametresOpen && (
        <ParametresEntreprisePanel
          onClose={() => setParametresOpen(false)}
          onSaved={bumpDataVersion}
          onEntreprisesChanged={refetchEntreprises}
          domaineInitial={user.email}
          canMultiEntites={canMultiEntites}
        />
      )}
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={bumpDataVersion} />}
      {integrationsOpen && <IntegrationsPanel onClose={() => setIntegrationsOpen(false)} />}
      {superAdminOpen && <SuperAdminPanel onClose={() => setSuperAdminOpen(false)} />}
      {parrainageOpen && <ParrainagePanel onClose={() => setParrainageOpen(false)} />}
      {rapprochementOpen && <RapprochementPanel onClose={() => setRapprochementOpen(false)} onChanged={bumpDataVersion} ongletInitial={rapprochementOnglet} />}
      {chequesOpen && <ChequesDeclaresPanel onClose={() => setChequesOpen(false)} onChanged={bumpDataVersion} />}
      {offresOpen && (
        <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && setOffresOpen(false)}>
          <div className="modal" style={{ width: 'min(760px, 96%)' }}>
            <h2 style={{ marginBottom: 4 }}>Nos offres</h2>
            <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, marginBottom: 16 }}>
              {abo?.etat === 'essai' && abo.joursRestants != null
                ? `Il vous reste ${abo.joursRestants} jour${abo.joursRestants > 1 ? 's' : ''} d'essai. Choisissez votre formule pour continuer sans interruption.`
                : 'Choisissez la formule adaptée à votre volume de débiteurs.'}
            </div>
            <OffresAbonnement formuleRecommandee={user.formule} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setOffresOpen(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
