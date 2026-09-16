import { NextFunction, Request, Response } from 'express';
import { withTenant, rlsActive } from '../lib/tenantDb';

// À monter APRÈS l'authentification sur les routeurs de données tenant. Quand la
// RLS est active (RLS_ENABLED=true), enveloppe toute la suite de la requête dans
// le contexte de l'organisation de l'utilisateur : la variable de session
// `app.organisation_id` est posée et la RLS Postgres isole automatiquement toutes
// les opérations Prisma de la requête. INERTE sinon (simple passe-plat) — le
// comportement mono-tenant du groupe reste strictement inchangé tant que
// RLS_ENABLED n'est pas activé.
//
// La transaction tenant reste ouverte jusqu'à la fin de la réponse. À NE PAS
// monter sur des routeurs qui réalisent des appels externes longs dans la même
// requête (envoi d'email, IA) : y câbler plutôt withTenant autour des seuls
// accès base, pour ne pas garder une transaction ouverte pendant l'appel externe.
export function tenantScope(req: Request, res: Response, next: NextFunction): void {
  if (!rlsActive() || !req.user) return next();
  withTenant(
    req.user.organisationId,
    () =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        // La transaction se referme quand la réponse est terminée (commit) ou que
        // la connexion se coupe.
        res.once('finish', done);
        res.once('close', done);
        try {
          next();
        } catch (err) {
          if (!settled) {
            settled = true;
            reject(err);
          }
        }
      }),
  ).catch(next);
}
