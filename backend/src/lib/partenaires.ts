// Cabinet partenaire (avocat/huissier au niveau plateforme, transverse aux
// sociétés clientes). Défini par la variable d'environnement PARTENAIRE_EMAILS
// (liste d'emails séparés par des virgules) — même principe que SUPERADMIN_EMAILS.
// Ces comptes n'appartiennent à AUCUNE organisation : ils voient, dans une
// console dédiée, les dossiers contentieux qui leur sont explicitement confiés,
// toutes sociétés confondues. Aucune donnée en base : configuration pure.
export function partenaireEmails(): string[] {
  return (process.env.PARTENAIRE_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function estPartenaire(email?: string | null): boolean {
  if (!email) return false;
  return partenaireEmails().includes(email.trim().toLowerCase());
}

// Nom d'affichage du cabinet partenaire (bandeau de sa console). Variable
// d'environnement PARTENAIRE_NOM, repli neutre sinon.
export function partenaireNom(): string {
  return (process.env.PARTENAIRE_NOM || '').trim() || 'Cabinet partenaire';
}
