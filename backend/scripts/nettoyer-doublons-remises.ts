/**
 * Nettoyage one-shot des doublons de remises bancaires « à rapprocher ».
 *
 * La banque envoie souvent plusieurs avis (e-mails distincts) pour une MÊME
 * opération : la file de rapprochement se retrouve alors avec plusieurs chèques
 * identiques (cf. signalement Gaetan : 283 200 FCFA répété). Ce script garde le
 * chèque le plus ANCIEN par clé d'opération et supprime les autres —
 * UNIQUEMENT parmi les chèques encore « a_rapprocher » (jamais un règlement déjà
 * validé/rapproché).
 *
 * Clé d'opération : organisation + source + montant + émetteur (tireur) +
 * date d'opération (dateCheque) + échéance — la même règle que le
 * dé-doublonnage ajouté à l'ingestion (cf. services/remisesBancairesService.ts).
 *
 * Sécurité :
 *   - DRY-RUN par défaut : n'écrit RIEN, affiche seulement ce qui serait supprimé.
 *     Ajouter `--apply` pour exécuter réellement la suppression.
 *
 * Usage :
 *   DATABASE_URL=postgres://…(olu360-saas-db) npx tsx scripts/nettoyer-doublons-remises.ts
 *   DATABASE_URL=… npx tsx scripts/nettoyer-doublons-remises.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

interface LigneRemise {
  id: string;
  organisationId: string;
  source: string;
  montant: number;
  tireur: string | null;
  dateCheque: Date | null;
  echeance: Date | null;
  createdAt: Date;
}

function cleOperation(c: LigneRemise): string {
  return [
    c.organisationId,
    c.source,
    c.montant,
    c.tireur ?? '∅',
    c.dateCheque ? c.dateCheque.toISOString() : '∅',
    c.echeance ? c.echeance.toISOString() : '∅',
  ].join('|');
}

async function main(): Promise<void> {
  const remises: LigneRemise[] = await prisma.cheque.findMany({
    where: { source: { in: ['banque', 'assureur'] }, statut: 'a_rapprocher' },
    orderBy: { createdAt: 'asc' }, // le plus ancien d'abord -> c'est lui qu'on garde
    select: {
      id: true,
      organisationId: true,
      source: true,
      montant: true,
      tireur: true,
      dateCheque: true,
      echeance: true,
      createdAt: true,
    },
  });

  const groupes = new Map<string, LigneRemise[]>();
  for (const c of remises) {
    const k = cleOperation(c);
    const arr = groupes.get(k) ?? [];
    arr.push(c);
    groupes.set(k, arr);
  }

  const aSupprimer: LigneRemise[] = [];
  for (const arr of groupes.values()) {
    if (arr.length > 1) aSupprimer.push(...arr.slice(1)); // garde l'index 0 (le plus ancien)
  }

  console.log(
    `Remises « à rapprocher » : ${remises.length} · groupes distincts : ${groupes.size} · doublons à supprimer : ${aSupprimer.length}`,
  );
  for (const c of aSupprimer) {
    const jour = c.dateCheque ? c.dateCheque.toISOString().slice(0, 10) : '—';
    console.log(
      `  ${APPLY ? 'SUPPRIME ' : 'supprimerait'} ${c.id} — ${c.montant} FCFA · ${c.tireur ?? '—'} · remise ${jour}`,
    );
  }

  if (!aSupprimer.length) {
    console.log('Aucun doublon détecté. Rien à faire.');
    return;
  }
  if (!APPLY) {
    console.log('DRY-RUN — rien supprimé. Relancer avec --apply pour exécuter.');
    return;
  }
  const r = await prisma.cheque.deleteMany({ where: { id: { in: aSupprimer.map((c) => c.id) } } });
  console.log(`Supprimés : ${r.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
