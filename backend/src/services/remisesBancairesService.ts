import { prisma } from '../db';
import { lireEmailsBancaires } from '../lib/gmail';
import { parseAvisBancaire } from '../lib/parseRemiseBancaire';
import { proposerFactures } from '../lib/rapprochementCheque';

// Ingestion des avis bancaires d'une organisation : lit sa boîte Gmail
// (connexion « avis_bancaires » scopée à l'org), ne traite QUE les expéditeurs
// de la liste blanche, parse chaque avis (chèque / virement / espèce), le
// dédoublonne par identifiant de message, l'enregistre comme encaissement
// bancaire et le PRÉ-RAPPROCHE par montant aux factures impayées.
//
// À exécuter dans le contexte tenant de l'org (withTenant) : toutes les
// écritures Cheque restent isolées dans cette organisation.

// Expéditeurs bancaires reconnus (liste blanche). Surchargeable par
// BANK_SENDERS (séparés par des virgules). Rien d'autre n'est jamais lu.
function expediteursBancaires(): string[] {
  const defauts = ['avis.sgsn@socgen.com'];
  const env = (process.env.BANK_SENDERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...defauts, ...env])];
}

// Connexion Gmail « lecture des avis bancaires » propre à l'organisation.
export function getConnexionAvisBancaires(organisationId: string) {
  return prisma.integrationCredential.findFirst({
    where: { service: 'gmail', usage: 'avis_bancaires', organisationId, statut: 'actif' },
  });
}

// Enregistre / met à jour la connexion « avis bancaires » d'une organisation.
export async function saveConnexionAvisBancaires(organisationId: string, refreshToken: string, compteEmail: string) {
  const existing = await prisma.integrationCredential.findFirst({
    where: { service: 'gmail', usage: 'avis_bancaires', organisationId },
  });
  const data = { statut: 'actif' as const, refreshToken, compteEmail, derniereSync: null };
  if (existing) return prisma.integrationCredential.update({ where: { id: existing.id }, data });
  return prisma.integrationCredential.create({
    data: { service: 'gmail', usage: 'avis_bancaires', organisationId, entite: null, ...data },
  });
}

// Déconnecte (révoque côté base) la connexion « avis bancaires » de l'org.
export async function clearConnexionAvisBancaires(organisationId: string) {
  const existing = await prisma.integrationCredential.findFirst({
    where: { service: 'gmail', usage: 'avis_bancaires', organisationId },
  });
  if (!existing) return;
  await prisma.integrationCredential.update({ where: { id: existing.id }, data: { statut: 'inactif', refreshToken: null } });
}

export interface RapportIngestion {
  connecte: boolean;
  lus: number;
  nouveaux: number;
  preRapproches: number;
  ignores: number;
}

export async function ingererRemisesBancaires(organisationId: string): Promise<RapportIngestion> {
  const cred = await getConnexionAvisBancaires(organisationId);
  if (!cred?.refreshToken) return { connecte: false, lus: 0, nouveaux: 0, preRapproches: 0, ignores: 0 };

  // On relit depuis la dernière synchro (moins un jour de marge, au cas où un
  // avis arriverait avec un léger retard d'indexation Gmail).
  const depuis = cred.derniereSync ? new Date(cred.derniereSync.getTime() - 24 * 3600 * 1000) : undefined;
  const emails = await lireEmailsBancaires(cred.refreshToken, expediteursBancaires(), depuis);

  // Factures impayées de l'org (RLS actif → uniquement ce tenant), pour le
  // pré-rapprochement par montant.
  const factures = await prisma.facture.findMany({
    where: { statut: 'impayee' },
    select: { id: true, numero: true, montant: true, clientId: true },
  });
  const facturesPourMatch = factures.map((f) => ({ id: f.id, numero: f.numero, montant: f.montant }));

  let nouveaux = 0;
  let preRapproches = 0;
  let ignores = 0;

  for (const email of emails) {
    const avis = parseAvisBancaire(email.from, email.subject, email.text);
    if (!avis) {
      ignores++;
      continue;
    }
    // Idempotence : jamais deux fois le même message.
    const existe = await prisma.cheque.findFirst({ where: { emailMessageId: email.id }, select: { id: true } });
    if (existe) continue;

    const prop = proposerFactures(avis.montant, facturesPourMatch);
    // Client déduit si une seule facture est proposée (rapprochement net).
    let clientId: string | null = null;
    if (prop.proposees.length === 1) {
      clientId = factures.find((f) => f.id === prop.proposees[0])?.clientId ?? null;
    }
    if (prop.proposees.length) preRapproches++;

    await prisma.cheque.create({
      data: {
        organisationId,
        source: 'banque',
        type: avis.type,
        montant: avis.montant,
        banque: avis.banque,
        agence: avis.agence,
        dateCheque: avis.dateOperation,
        echeance: avis.echeance,
        tireur: avis.emetteur,
        emailMessageId: email.id,
        facturesProposees: prop.proposees.join(',') || null,
        clientId,
        statut: 'a_rapprocher',
      },
    });
    nouveaux++;
  }

  await prisma.integrationCredential.update({ where: { id: cred.id }, data: { derniereSync: new Date() } });
  return { connecte: true, lus: emails.length, nouveaux, preRapproches, ignores };
}
