import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ParsedClient, ParsedContrat, ParsedFacture } from '../lib/parsers/types';
import { planContactMerge, planContratMerge, planFactureMerge } from '../lib/merge';
import { ensureEntreprises } from './entrepriseService';

function toDate(iso?: string | null): Date | undefined {
  if (!iso) return undefined;
  return new Date(iso);
}

function factureFields(f: ParsedFacture): Prisma.FactureUncheckedCreateInput {
  return {
    clientId: '', // overwritten by caller
    numero: f.numero,
    montant: f.montant,
    montantHT: f.montantHT,
    dateFacture: toDate(f.dateFacture),
    dateEcheance: new Date(f.dateEcheance),
    statut: f.statut,
    datePaiement: toDate(f.datePaiement),
    modePaiement: f.modePaiement,
    numPiece: f.numPiece,
    remisSur: f.remisSur,
    designation: f.designation,
    commercial: f.commercial,
    traitePar: f.traitePar,
    etatFactures: f.etatFactures,
    dateDepot: toDate(f.dateDepot),
  };
}

function contratFields(c: ParsedContrat): Prisma.ContratUncheckedCreateInput {
  return {
    clientId: '', // overwritten by caller
    numero: c.numero,
    type: c.type,
    dateDebut: new Date(c.dateDebut),
    dateFin: new Date(c.dateFin),
    tacite: c.tacite,
    dateRevisionTarif: toDate(c.dateRevisionTarif),
    tauxAugmentation: c.tauxAugmentation ?? undefined,
    typeAugmentation: c.typeAugmentation ?? undefined,
    statutSource: c.statutSource,
    commentaire: c.commentaire,
  };
}

export interface ImportSummary {
  clientsCreated: number;
  clientsUpdated: number;
  facturesCreated: number;
  facturesUpdated: number;
  contratsCreated: number;
  contratsUpdated: number;
}

// Applique une liste de ParsedClient (issue d'un parseur Excel/CSV) contre la
// base : fusionne facture par facture et contrat par contrat plutôt que de
// remplacer en bloc, en respectant les règles de non-régression de §8.
// `organisationId` est passé EXPLICITEMENT (jamais laissé au défaut de colonne
// GUC) : un import fait des centaines d'écritures dans une même requête, et le
// contexte tenant (variable de session posée par tenantScope) peut se perdre sur
// une transaction interactive aussi longue — les lignes retomberaient alors dans
// l'organisation « socle » par défaut. En fixant l'organisation sur chaque client
// (création ET recherche de doublon), le rattachement est correct quoi qu'il
// arrive du contexte. Compatible RLS : la WITH CHECK passe soit par le contexte,
// soit par l'échappatoire quand il est absent.
export async function applyImport(clients: ParsedClient[], organisationId: string): Promise<ImportSummary> {
  const summary: ImportSummary = {
    clientsCreated: 0,
    clientsUpdated: 0,
    facturesCreated: 0,
    facturesUpdated: 0,
    contratsCreated: 0,
    contratsUpdated: 0,
  };

  // Les entités présentes dans le fichier sont matérialisées dans
  // l'organisation avant de rattacher les clients : un client SaaS découvre
  // ainsi ses entités depuis ses propres données (il n'en a aucune d'avance),
  // et le sélecteur d'entité ne montre que les siennes — jamais celles du
  // groupe. Sans effet pour le groupe, dont les entités existent déjà.
  await ensureEntreprises(
    clients.map((c) => c.entite),
    organisationId,
  );

  for (const parsed of clients) {
    const existing = await prisma.client.findFirst({
      where: { organisationId, entite: parsed.entite, nom: { equals: parsed.nom, mode: 'insensitive' } },
      include: { factures: true, contrats: true },
    });

    let clientId: string;
    if (!existing) {
      const created = await prisma.client.create({
        data: {
          organisationId,
          nom: parsed.nom,
          entite: parsed.entite,
          contact: parsed.contact || undefined,
          email: parsed.email || undefined,
          tel: parsed.tel || undefined,
        },
      });
      clientId = created.id;
      summary.clientsCreated++;
    } else {
      clientId = existing.id;
      const patch = planContactMerge(existing, parsed);
      if (Object.keys(patch).length) {
        await prisma.client.update({ where: { id: clientId }, data: patch });
        summary.clientsUpdated++;
      }
    }

    if (parsed.factures.length) {
      const facturePlan = planFactureMerge(existing?.factures ?? [], parsed.factures);
      for (const f of facturePlan.toCreate) {
        await prisma.facture.create({ data: { ...factureFields(f), clientId } });
        summary.facturesCreated++;
      }
      for (const u of facturePlan.toUpdate) {
        const { clientId: _drop, ...data } = factureFields(u.data);
        await prisma.facture.update({ where: { id: u.id }, data });
        summary.facturesUpdated++;
      }
    }

    if (parsed.contrats.length) {
      const contratPlan = planContratMerge(existing?.contrats ?? [], parsed.contrats);
      for (const c of contratPlan.toCreate) {
        await prisma.contrat.create({ data: { ...contratFields(c), clientId } });
        summary.contratsCreated++;
      }
      for (const u of contratPlan.toUpdate) {
        const { clientId: _drop, ...data } = contratFields(u.data);
        await prisma.contrat.update({ where: { id: u.id }, data });
        summary.contratsUpdated++;
      }
    }
  }

  return summary;
}
