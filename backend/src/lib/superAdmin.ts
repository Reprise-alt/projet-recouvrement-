// Exploitant de la plateforme (« super-admin ») — distinct des admins
// d'organisation. Défini par la variable d'environnement SUPERADMIN_EMAILS
// (liste d'emails séparés par des virgules). Sert au back-office d'activation
// des comptes (addendum §8) : lister toutes les organisations, activer,
// suspendre, prolonger un essai. Aucune donnée en base — configuration pure.
export function superAdminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function estSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.trim().toLowerCase());
}
