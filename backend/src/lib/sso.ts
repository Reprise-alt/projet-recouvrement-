// lib/sso.ts — Authentification par le SSO du hub OLU 360 (session partagée).
//
// Quand AUTH_MODE=sso, la console ne vérifie plus un JWT Supabase : elle fait
// confiance au cookie `olu360_session` posé par le hub sur `.olu360.com`, et le
// fait valider server-to-server par le socle (`SOCLE_API_URL/moi`). Le socle
// répond : l'identité de l'utilisateur + les consoles auxquelles il a droit
// (avec un rôle et un tenant par accès). On en déduit l'accès local.
//
// Le cookie n'arrive au back-end que si celui-ci est servi sur un sous-domaine
// de `.olu360.com` (ex. reco-api.olu360.com) — cf. DEPLOYMENT.md.

const SOCLE_API_URL = (process.env.SOCLE_API_URL || 'https://api.olu360.com').replace(/\/+$/, '');
const TTL_MS = 30_000;

export interface SocleConsole {
  code: string;
  libelle?: string;
  url?: string;
  role: 'administrateur' | 'agent' | 'lecture' | string;
  tenant_code?: string | null;
  tenant_libelle?: string | null;
}

export interface SocleMoi {
  utilisateur: {
    id: string;
    identifiant: string;
    email?: string | null;
    nom_affiche: string;
    admin_groupe: boolean;
  };
  consoles: SocleConsole[];
}

// Petit cache par jeton (30 s) pour ne pas appeler /moi à chaque requête.
const cache = new Map<string, { moi: SocleMoi; expire: number }>();

// Résout la session partagée en interrogeant le socle. Retourne null en cas
// d'échec (jeton absent/invalide, socle injoignable) — fail-closed.
export async function resoudreSession(token: string | null): Promise<SocleMoi | null> {
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.expire > Date.now()) return hit.moi;
  try {
    const r = await fetch(`${SOCLE_API_URL}/moi`, { headers: { cookie: `olu360_session=${token}` } });
    if (!r.ok) return null;
    const moi = (await r.json()) as SocleMoi;
    if (!moi?.utilisateur) return null;
    cache.set(token, { moi, expire: Date.now() + TTL_MS });
    return moi;
  } catch {
    return null;
  }
}

export function oublierSession(token?: string | null): void {
  if (token) cache.delete(token);
}

// Accès local déduit de la réponse /moi du socle. Le socle est la source de
// vérité ; on traduit ses accès console + tenants vers le modèle recouvrement.
export interface AccesConsole {
  nom: string;
  email: string | null;
  role: 'admin' | 'manager_entite' | 'comptable';
  entite: string | null; // code entité : 'SORAM' | 'IRIS' | 'SIS'
  accesRecouvrement: boolean;
  roleOperations: 'directrice_operations' | 'charge_compte' | 'direction_generale' | null;
  accesPlanningCoursiers: boolean;
  // Accès au SEUL onglet Contentieux (prestataire externe : avocat / huissier),
  // accordé par société dans le socle. Source de vérité = socle.
  accesContentieux: boolean;
  estAgentRecouvrement: boolean;
}

// Correspondance des 4 niveaux voulus :
//   super admin  = admin_groupe            → accès à toutes les consoles, admin partout
//   admin        = 'administrateur' sur N consoles
//   admin console= 'administrateur' sur 1 console
//   agent        = 'agent' / 'lecture' sur 1 console
// L'entité vient du tenant de l'accès (un seul tenant → entité rattachée ;
// plusieurs / aucun → vue « toutes entités » comme un comptable).
export function accesDepuisMoi(moi: SocleMoi): AccesConsole {
  const superAdmin = !!moi.utilisateur.admin_groupe;
  const grants = moi.consoles || [];
  const of = (code: string) => grants.filter((c) => c.code === code);
  const hasAdmin = (code: string) => superAdmin || of(code).some((g) => g.role === 'administrateur');
  const tenantsOf = (code: string) => {
    const t = new Set<string>();
    for (const g of of(code)) if (g.tenant_code) t.add(g.tenant_code.toUpperCase());
    return t;
  };

  // Recouvrement
  const accesRecouvrement = superAdmin || of('recouvrement').length > 0;
  // Contentieux : console à part, accordée par société (avocats / huissiers).
  const accesContentieux = superAdmin || of('contentieux').length > 0;
  const recoTenants = tenantsOf('recouvrement');
  const contentieuxTenants = tenantsOf('contentieux');
  // Entité de rattachement : celle du recouvrement si unique ; sinon, pour un
  // prestataire contentieux pur, celle de son grant contentieux si unique.
  const entite = superAdmin
    ? null
    : recoTenants.size === 1
      ? [...recoTenants][0]
      : !accesRecouvrement && contentieuxTenants.size === 1
        ? [...contentieuxTenants][0]
        : null;
  const role: AccesConsole['role'] = hasAdmin('recouvrement') ? 'admin' : entite ? 'manager_entite' : 'comptable';

  // Opérations (SORAM / IRIS)
  let roleOperations: AccesConsole['roleOperations'] = null;
  if (superAdmin) {
    roleOperations = 'direction_generale';
  } else if (of('operations').length > 0) {
    if (hasAdmin('operations')) {
      roleOperations = tenantsOf('operations').size === 1 ? 'directrice_operations' : 'direction_generale';
    } else {
      roleOperations = 'charge_compte';
    }
  }

  // Coursier
  const accesPlanningCoursiers = superAdmin || of('coursier').length > 0;

  return {
    nom: moi.utilisateur.nom_affiche || moi.utilisateur.identifiant,
    email: moi.utilisateur.email ?? null,
    role,
    entite,
    accesRecouvrement,
    roleOperations,
    accesPlanningCoursiers,
    accesContentieux,
    // Un admin/super-admin consulte sans faire de relance de terrain : il ne
    // figure pas dans le reporting « performance par agent ».
    estAgentRecouvrement: !hasAdmin('recouvrement'),
  };
}

// Lit un cookie dans l'en-tête brut (pas de cookie-parser à installer).
export function lireCookie(header: string | undefined, nom: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const p = part.trim();
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i) === nom) return decodeURIComponent(p.slice(i + 1));
  }
  return null;
}

export { SOCLE_API_URL };
