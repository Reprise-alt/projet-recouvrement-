import { PrismaClient, Prisma } from '@prisma/client';

// Logique de migration base-à-base d'un tenant (console interne → Feyma),
// partagée entre le script CLI (scripts/migrer-tenant.ts) et l'endpoint
// back-office super-admin. Copie TOUT l'actif d'une entité (clients + enfants +
// contentieux + fichiers) d'une base source vers une organisation cible, sans
// rien perdre. Les FK vers Utilisateur (source) sont remises à null ;
// portailToken remis à null. Écriture en une transaction (tout ou rien).

export interface CountsMigration {
  clients: number; contacts: number; factures: number; contrats: number; envois: number;
  echeanciers: number; tranches: number; actions: number; dossiers: number; pieces: number;
  decompte: number; actes: number; analyses: number; propositions: number; fichiersMo: number;
}

export interface RapportMigration {
  entite: string;
  orgId: string;
  cibleAvant: number;      // clients déjà présents dans l'org cible
  counts: CountsMigration;
  refsRenommees: number;   // références de dossier renommées (collision)
  applied: boolean;        // écriture réellement effectuée ?
  vide: boolean;           // cible purgée avant écriture ?
  apres?: { clients: number; actions: number; dossiers: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lireArbre(source: PrismaClient, entite: string) {
  const clients = await source.client.findMany({ where: { entite } });
  const clientIds = clients.map((c) => c.id);
  const contacts = await source.contact.findMany({ where: { clientId: { in: clientIds } } });
  const echeanciers = await source.echeancierPaiement.findMany({ where: { clientId: { in: clientIds } } });
  const tranches = await source.tranchePaiement.findMany({ where: { echeancierId: { in: echeanciers.map((e) => e.id) } } });
  const contrats = await source.contrat.findMany({ where: { clientId: { in: clientIds } } });
  const envois = await source.envoiContrat.findMany({ where: { contratId: { in: contrats.map((c) => c.id) } } });
  const actions = await source.actionRecouvrement.findMany({ where: { clientId: { in: clientIds } } });
  const dossiers = await source.dossierContentieux.findMany({ where: { clientId: { in: clientIds } } });
  const dossierIds = dossiers.map((d) => d.id);
  const factures = await source.facture.findMany({ where: { clientId: { in: clientIds } } });
  const pieces = await source.pieceContentieux.findMany({ where: { dossierId: { in: dossierIds } } });
  const decompte = await source.ligneDecompte.findMany({ where: { dossierId: { in: dossierIds } } });
  const actes = await source.acteContentieux.findMany({ where: { dossierId: { in: dossierIds } } });
  const analyses = await source.analyseContentieux.findMany({ where: { dossierId: { in: dossierIds } } });
  const propositions = await source.propositionPaiement.findMany({ where: { dossierId: { in: dossierIds } } });
  return { clients, contacts, echeanciers, tranches, contrats, envois, actions, dossiers, factures, pieces, decompte, actes, analyses, propositions };
}

type Arbre = Awaited<ReturnType<typeof lireArbre>>;

function compter(a: Arbre): CountsMigration {
  return {
    clients: a.clients.length, contacts: a.contacts.length, factures: a.factures.length,
    contrats: a.contrats.length, envois: a.envois.length, echeanciers: a.echeanciers.length,
    tranches: a.tranches.length, actions: a.actions.length, dossiers: a.dossiers.length,
    pieces: a.pieces.length, decompte: a.decompte.length, actes: a.actes.length,
    analyses: a.analyses.length, propositions: a.propositions.length,
    fichiersMo: Math.round((a.pieces.reduce((s, p) => s + p.taille, 0) / 1024 / 1024) * 10) / 10,
  };
}

// Purge des données de recouvrement de l'org cible (les enfants tombent en
// cascade via onDelete: Cascade). Ne touche pas à la fiche org ni aux users.
async function viderCible(target: PrismaClient, orgId: string) {
  await target.client.deleteMany({ where: { organisationId: orgId } });
}

export async function migrerTenant(opts: {
  source: PrismaClient;
  target: PrismaClient;
  entite: string;
  orgId: string;
  orgSlug: string;
  apply: boolean;
  vider: boolean;
}): Promise<RapportMigration> {
  const { source, target, entite, orgId, orgSlug, apply, vider } = opts;

  const cibleAvant = await target.client.count({ where: { organisationId: orgId } });
  const a = await lireArbre(source, entite);
  const counts = compter(a);

  // Collisions de références de dossier (UNIQUE GLOBAL) → renommées.
  const refs = a.dossiers.map((d) => d.reference);
  const refClash = new Set(
    (await target.dossierContentieux.findMany({ where: { reference: { in: refs } }, select: { reference: true } })).map((d) => d.reference),
  );
  const renomme = (ref: string) => (refClash.has(ref) ? `${ref}-${orgSlug.toUpperCase()}` : ref);

  const rapport: RapportMigration = {
    entite, orgId, cibleAvant, counts, refsRenommees: refClash.size, applied: false, vide: false,
  };

  if (!apply) return rapport;

  await target.$transaction(async (tx) => {
    if (vider) {
      await (tx as unknown as PrismaClient).client.deleteMany({ where: { organisationId: orgId } });
      rapport.vide = true;
    }
    const t = tx as unknown as PrismaClient;
    await t.client.createMany({ data: a.clients.map((c) => ({ ...c, organisationId: orgId })) });
    await t.contact.createMany({ data: a.contacts });
    await t.echeancierPaiement.createMany({ data: a.echeanciers });
    await t.tranchePaiement.createMany({ data: a.tranches });
    await t.contrat.createMany({ data: a.contrats });
    await t.envoiContrat.createMany({ data: a.envois });
    await t.actionRecouvrement.createMany({ data: a.actions.map((x) => ({ ...x, utilisateurId: null })) });
    await t.dossierContentieux.createMany({
      data: a.dossiers.map((d) => ({
        ...d, reference: renomme(d.reference), createurId: null, avocatId: null,
        clotureParId: null, portailToken: null, confieAuPartenaire: false, confieLe: null,
      })),
    });
    await t.facture.createMany({ data: a.factures });
    await t.pieceContentieux.createMany({
      data: a.pieces.map((p) => ({ ...p, extraitJson: p.extraitJson === null ? Prisma.DbNull : (p.extraitJson as Prisma.InputJsonValue) })),
    });
    await t.ligneDecompte.createMany({ data: a.decompte });
    await t.acteContentieux.createMany({ data: a.actes.map((x) => ({ ...x, valideParId: null })) });
    await t.analyseContentieux.createMany({ data: a.analyses });
    await t.propositionPaiement.createMany({ data: a.propositions });
  }, { timeout: 300_000 });

  rapport.applied = true;
  rapport.apres = {
    clients: await target.client.count({ where: { organisationId: orgId } }),
    actions: await target.actionRecouvrement.count({ where: { clientId: { in: a.clients.map((c) => c.id) } } }),
    dossiers: await target.dossierContentieux.count({ where: { clientId: { in: a.clients.map((c) => c.id) } } }),
  };
  return rapport;
}

// Utilitaire exposé pour le back-office : purge seule (avant ré-import propre).
export { viderCible };
