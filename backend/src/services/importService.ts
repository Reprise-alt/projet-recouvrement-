import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { ParsedClient, ParsedContrat, ParsedFacture } from '../lib/parsers/types';
import { planContactMerge, planContratMerge, planFactureMerge } from '../lib/merge';

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
export async function applyImport(clients: ParsedClient[]): Promise<ImportSummary> {
  const summary: ImportSummary = {
    clientsCreated: 0,
    clientsUpdated: 0,
    facturesCreated: 0,
    facturesUpdated: 0,
    contratsCreated: 0,
    contratsUpdated: 0,
  };

  for (const parsed of clients) {
    const existing = await prisma.client.findFirst({
      where: { entite: parsed.entite, nom: { equals: parsed.nom, mode: 'insensitive' } },
      include: { factures: true, contrats: true },
    });

    let clientId: string;
    if (!existing) {
      const created = await prisma.client.create({
        data: {
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
