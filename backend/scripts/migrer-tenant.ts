/**
 * Migration base-à-base d'un tenant : copie TOUT l'actif d'une entité de la
 * console interne (base `recouvrement-db`, rangé par `entite`) vers un compte
 * Feyma (base `olu360-saas-db`, rangé par `organisationId`) — sans rien perdre :
 * clients, contacts, factures, contrats, échéanciers, historique des relances,
 * dossiers contentieux et leurs pièces/actes/décomptes/analyses/propositions,
 * fichiers binaires compris.
 *
 * Sécurité :
 *   - DRY-RUN par défaut : n'écrit RIEN, affiche seulement ce qui serait migré.
 *     Ajouter `--apply` pour exécuter réellement.
 *   - Écriture en UNE transaction sur la cible (tout ou rien).
 *   - Pré-contrôles : la cible doit être vide pour ce tenant ; collisions d'ID
 *     ou de référence détectées avant toute écriture.
 *
 * Usage :
 *   SOURCE_DATABASE_URL=postgres://…(recouvrement-db) \
 *   TARGET_DATABASE_URL=postgres://…(olu360-saas-db) \
 *   ENTITE=SORAM TARGET_ORG=soram \
 *   npx tsx scripts/migrer-tenant.ts            # dry-run
 *   …même chose… npx tsx scripts/migrer-tenant.ts --apply   # migration réelle
 *
 * TARGET_ORG = slug (ou id) de l'organisation Feyma cible, créée au préalable
 * (compte SORAM sur Feyma). Le script refuse d'écrire si elle contient déjà des
 * clients, sauf `--force`.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const ENTITE = process.env.ENTITE || 'SORAM';
const TARGET_ORG = process.env.TARGET_ORG || '';
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

function required(name: string, val?: string): string {
  if (!val) {
    console.error(`✖ Variable ${name} manquante.`);
    process.exit(1);
  }
  return val;
}

const SOURCE_URL = required('SOURCE_DATABASE_URL', process.env.SOURCE_DATABASE_URL);
const TARGET_URL = required('TARGET_DATABASE_URL', process.env.TARGET_DATABASE_URL);
if (!TARGET_ORG) required('TARGET_ORG', '');

const source = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
// Client cible NON étendu : aucune logique tenant. Sous RLS, l'absence de
// contexte (app.organisation_id non posé) laisse l'écriture passer, et on fixe
// organisationId explicitement sur chaque Client (les enfants suivent par FK).
const target = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });

const n = (x: unknown[]) => x.length;

async function main() {
  console.log(`\n=== Migration tenant « ${ENTITE} » → org Feyma « ${TARGET_ORG} » ===`);
  console.log(APPLY ? '⚙️  MODE RÉEL (--apply)\n' : '🔎 DRY-RUN (aucune écriture) — ajoutez --apply pour exécuter\n');

  // 1) Organisation cible ---------------------------------------------------
  const org = await target.organisation.findFirst({
    where: { OR: [{ slug: TARGET_ORG }, { id: TARGET_ORG }] },
    select: { id: true, raisonSociale: true, slug: true },
  });
  if (!org) {
    console.error(`✖ Organisation cible introuvable (slug/id « ${TARGET_ORG} »). Créez d'abord le compte ${ENTITE} sur Feyma.`);
    process.exit(1);
  }
  const dejaClients = await target.client.count({ where: { organisationId: org.id } });
  console.log(`Cible : ${org.raisonSociale} (${org.slug}) — ${dejaClients} client(s) déjà présent(s).`);
  if (dejaClients > 0 && !FORCE) {
    console.error('✖ La cible n’est pas vide pour ce tenant. Repartez d’un compte vide, ou passez --force en connaissance de cause.');
    process.exit(1);
  }

  // 2) Lecture de l'arbre source -------------------------------------------
  const clients = await source.client.findMany({ where: { entite: ENTITE } });
  const clientIds = clients.map((c) => c.id);
  if (clientIds.length === 0) {
    console.error(`✖ Aucun client avec entite=${ENTITE} dans la source.`);
    process.exit(1);
  }

  const contacts = await source.contact.findMany({ where: { clientId: { in: clientIds } } });
  const echeanciers = await source.echeancierPaiement.findMany({ where: { clientId: { in: clientIds } } });
  const echeancierIds = echeanciers.map((e) => e.id);
  const tranches = await source.tranchePaiement.findMany({ where: { echeancierId: { in: echeancierIds } } });
  const contrats = await source.contrat.findMany({ where: { clientId: { in: clientIds } } });
  const contratIds = contrats.map((c) => c.id);
  const envois = await source.envoiContrat.findMany({ where: { contratId: { in: contratIds } } });
  const actions = await source.actionRecouvrement.findMany({ where: { clientId: { in: clientIds } } });
  const dossiers = await source.dossierContentieux.findMany({ where: { clientId: { in: clientIds } } });
  const dossierIds = dossiers.map((d) => d.id);
  const factures = await source.facture.findMany({ where: { clientId: { in: clientIds } } });
  const pieces = await source.pieceContentieux.findMany({ where: { dossierId: { in: dossierIds } } });
  const decompte = await source.ligneDecompte.findMany({ where: { dossierId: { in: dossierIds } } });
  const actes = await source.acteContentieux.findMany({ where: { dossierId: { in: dossierIds } } });
  const analyses = await source.analyseContentieux.findMany({ where: { dossierId: { in: dossierIds } } });
  const propositions = await source.propositionPaiement.findMany({ where: { dossierId: { in: dossierIds } } });

  // Utilisateurs à migrer pour préserver l'attribution (« qui a fait quoi ») :
  // tout le roster de l'entité + tous ceux référencés par les données migrées
  // (auteurs de relances, créateurs / avocats de dossiers, valideurs d'actes).
  // Sans eux, ces liens retomberaient à null.
  const refUserIds = new Set<string>();
  for (const a of actions) if (a.utilisateurId) refUserIds.add(a.utilisateurId);
  for (const d of dossiers) {
    if (d.createurId) refUserIds.add(d.createurId);
    if (d.avocatId) refUserIds.add(d.avocatId);
    if (d.clotureParId) refUserIds.add(d.clotureParId);
  }
  for (const a of actes) if (a.valideParId) refUserIds.add(a.valideParId);
  const users = await source.utilisateur.findMany({
    where: { OR: [{ id: { in: [...refUserIds] } }, { entite: ENTITE }] },
  });

  const encoursBinaires = pieces.reduce((s, p) => s + p.taille, 0);
  console.log('À migrer :');
  console.log(`  Utilisateurs .......... ${n(users)}`);
  console.log(`  Clients ............... ${n(clients)}`);
  console.log(`  Contacts .............. ${n(contacts)}`);
  console.log(`  Factures .............. ${n(factures)}`);
  console.log(`  Contrats .............. ${n(contrats)}  (envois: ${n(envois)})`);
  console.log(`  Échéanciers ........... ${n(echeanciers)}  (tranches: ${n(tranches)})`);
  console.log(`  Relances (historique) . ${n(actions)}`);
  console.log(`  Dossiers contentieux .. ${n(dossiers)}`);
  console.log(`    ├─ pièces ........... ${n(pieces)}  (${(encoursBinaires / 1024 / 1024).toFixed(1)} Mo de fichiers)`);
  console.log(`    ├─ décompte ......... ${n(decompte)}`);
  console.log(`    ├─ actes ............ ${n(actes)}`);
  console.log(`    ├─ analyses ......... ${n(analyses)}`);
  console.log(`    └─ propositions ..... ${n(propositions)}`);

  // 3) Pré-contrôles de collision ------------------------------------------
  // 3a. IDs déjà présents dans la cible (extrêmement improbable avec des cuid,
  //     mais on refuse d'écraser quoi que ce soit).
  const idClash = await target.client.count({ where: { id: { in: clientIds } } });
  if (idClash > 0) {
    console.error(`✖ ${idClash} identifiant(s) client déjà présents dans la cible — collision. Migration annulée.`);
    process.exit(1);
  }
  // 3b. Références de dossier contentieux (UNIQUE GLOBAL) : renommées en cas de
  //     collision avec un autre tenant de la cible.
  const refs = dossiers.map((d) => d.reference);
  const refClash = new Set(
    (await target.dossierContentieux.findMany({ where: { reference: { in: refs } }, select: { reference: true } })).map((d) => d.reference),
  );
  const renomme = (ref: string) => (refClash.has(ref) ? `${ref}-${org.slug.toUpperCase()}` : ref);
  if (refClash.size > 0) {
    console.log(`\n⚠️  ${refClash.size} référence(s) de dossier en collision → renommées avec le suffixe -${org.slug.toUpperCase()}.`);
  }

  // 3c. Appariement des utilisateurs par email (identité naturelle, UNIQUE
  //     GLOBAL). Pour chaque utilisateur source : s'il existe déjà dans la cible
  //     et DANS l'org IRIS → on réutilise son id (pas de doublon). S'il existe
  //     dans une AUTRE org → on ne peut ni le recréer (email unique) ni l'y
  //     rattacher (cross-tenant) : ce lien précis retombe à null, et on le
  //     signale. Sinon → on le crée dans l'org IRIS en conservant son id.
  const cibleUsers = await target.utilisateur.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    select: { id: true, email: true, organisationId: true },
  });
  const mapUser = new Map<string, string | null>();
  const usersACreer: typeof users = [];
  const conflitsOrg: string[] = [];
  for (const u of users) {
    const ex = cibleUsers.find((c) => c.email === u.email);
    if (ex) {
      if (ex.organisationId === org.id) {
        mapUser.set(u.id, ex.id); // déjà présent dans IRIS → réutilisé
      } else {
        mapUser.set(u.id, null); // email pris dans une autre org → lien non rattachable
        conflitsOrg.push(u.email);
      }
    } else {
      mapUser.set(u.id, u.id); // à créer, id conservé
      usersACreer.push(u);
    }
  }
  const reutilises = n(users) - usersACreer.length - conflitsOrg.length;
  console.log(
    `  └─ dont ${usersACreer.length} créé(s), ${reutilises} réutilisé(s) (email déjà sur Feyma)` +
      (conflitsOrg.length ? `, ${conflitsOrg.length} non rattaché(s)` : ''),
  );
  if (conflitsOrg.length) {
    console.log(
      `\n⚠️  ${conflitsOrg.length} utilisateur(s) ont un email déjà pris dans une AUTRE organisation Feyma :\n     ${conflitsOrg.join(', ')}\n     → leurs actions/dossiers passés resteront « non attribués » (le reste est préservé).`,
    );
  }
  // Remappe un id d'utilisateur source vers la cible (null si non rattachable).
  const mu = (id: string | null | undefined): string | null => (id ? mapUser.get(id) ?? null : null);

  if (!APPLY) {
    console.log('\n🔎 DRY-RUN terminé — rien n’a été écrit. Relancez avec --apply pour migrer réellement.\n');
    return;
  }

  // 4) Écriture cible (une transaction, ordre des dépendances FK) -----------
  //    Les FK vers Utilisateur (source) n'existent pas dans la cible → null.
  //    portailToken remis à null (à ré-activer côté Feyma, évite toute collision).
  await target.$transaction(async (tx) => {
    // Utilisateurs d'abord : les FK utilisateurId / createurId / avocatId /
    // valideParId pointent vers eux. Rattachés à l'org IRIS ; roleOrg conservé
    // tel quel (les comptes SSO historiques gardent leur logique, les logins
    // actifs se règlent normalement côté Feyma, appariés par email).
    await tx.utilisateur.createMany({ data: usersACreer.map((u) => ({ ...u, organisationId: org.id })) });
    await tx.client.createMany({ data: clients.map((c) => ({ ...c, organisationId: org.id })) });
    await tx.contact.createMany({ data: contacts });
    await tx.echeancierPaiement.createMany({ data: echeanciers });
    await tx.tranchePaiement.createMany({ data: tranches });
    await tx.contrat.createMany({ data: contrats });
    await tx.envoiContrat.createMany({ data: envois });
    await tx.actionRecouvrement.createMany({ data: actions.map((a) => ({ ...a, utilisateurId: mu(a.utilisateurId) })) });
    await tx.dossierContentieux.createMany({
      data: dossiers.map((d) => ({
        ...d,
        reference: renomme(d.reference),
        createurId: mu(d.createurId),
        avocatId: mu(d.avocatId),
        clotureParId: mu(d.clotureParId),
        portailToken: null,
        confieAuPartenaire: false,
        confieLe: null,
      })),
    });
    await tx.facture.createMany({ data: factures }); // après les dossiers (FK dossierContentieuxId)
    // extraitJson est un champ Json nullable : le round-trip lecture→écriture
    // exige Prisma.DbNull pour représenter le NULL SQL (quirk Prisma).
    await tx.pieceContentieux.createMany({
      data: pieces.map((p) => ({
        ...p,
        extraitJson: p.extraitJson === null ? Prisma.DbNull : (p.extraitJson as Prisma.InputJsonValue),
      })),
    });
    await tx.ligneDecompte.createMany({ data: decompte });
    await tx.acteContentieux.createMany({ data: actes.map((a) => ({ ...a, valideParId: null })) });
    await tx.analyseContentieux.createMany({ data: analyses });
    await tx.propositionPaiement.createMany({ data: propositions });
  }, { timeout: 300_000 });

  // 5) Contrôle après coup --------------------------------------------------
  const apresClients = await target.client.count({ where: { organisationId: org.id } });
  const apresActions = await target.actionRecouvrement.count({ where: { clientId: { in: clientIds } } });
  const apresDossiers = await target.dossierContentieux.count({ where: { clientId: { in: clientIds } } });
  const apresUsers = await target.utilisateur.count({ where: { organisationId: org.id } });
  const actionsAttribuees = actions.filter((a) => mu(a.utilisateurId)).length;
  const apresAttribuees = await target.actionRecouvrement.count({ where: { clientId: { in: clientIds }, utilisateurId: { not: null } } });
  console.log('\n✅ Migration terminée. Contrôle cible :');
  console.log(`  Clients : ${apresClients} (attendu ${n(clients)})`);
  console.log(`  Relances : ${apresActions} (attendu ${n(actions)})`);
  console.log(`    ├─ attribuées à un agent : ${apresAttribuees} (attendu ${actionsAttribuees})`);
  console.log(`  Dossiers : ${apresDossiers} (attendu ${n(dossiers)})`);
  console.log(`  Utilisateurs (org) : ${apresUsers} (créés cette migration : ${usersACreer.length})`);
  const ok = apresClients === n(clients) && apresActions === n(actions) && apresDossiers === n(dossiers) && apresAttribuees === actionsAttribuees;
  console.log(ok ? '\n🎉 Totaux conformes.\n' : '\n⚠️  Écart de totaux — à vérifier.\n');
}

main()
  .catch((e) => {
    console.error('\n✖ Échec de la migration (aucune écriture partielle : transaction annulée).');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
