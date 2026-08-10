import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { prisma } from '../db';
import { AuthedUser } from '../middleware/auth';
import { Entite, resolveEntiteScope } from './entites';
import { chargeDeCompteWhere, resolveEntiteScopeOperations } from './operationsAuth';
import { clientEncours, clientJoursRetard, clientPalier, PALIERS } from './paliers';
import { computeParcSynthese, computeSlaStats } from './parcImpression';
import { buildPlanningRapport, TacheRapportEntree } from './taches';
import { contractAlertLevel, contractEcheance } from './contracts';
import { getConfig } from '../services/configService';
import { buildPeriod, computeAgentStats } from '../routes/reporting';

// Assistant Claude connecté aux vraies données de l'app -- bulle flottante
// visible sur toute la plateforme (Recouvrement + Opérations + Parc
// d'impression). Volontairement construit en tool-use plutôt qu'en accès
// SQL libre : chaque outil interroge la base avec exactement le même
// scoping (entité, rôle, charge_compte) que les routes REST existantes,
// jamais un raccourci qui contournerait l'isolation déjà en place --
// notamment l'isolation financière d'Opérations (cahier §7) : les outils
// Opérations ne touchent jamais Facture/Contrat/montant, structurellement
// (CLIENT_SELECT n'a pas de tel champ), pas par simple omission de prompt.

const CLIENT_SELECT_OPERATIONS = { id: true, nom: true, entite: true } as const;

function entiteWhereRecouvrement(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { OR: [{ entite: entiteFilter as any }, { entite: 'COMMUN' as any }] };
}

function entiteWhereOperations(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { entite: entiteFilter };
}

// TacheCoursier porte directement son entité (pas de relation Client
// systématique -- une tâche générique n'en a pas) -- mêmes règles de
// filtrage que routes/taches.ts:tacheEntiteFilter.
function tacheEntiteFilter(entiteFilter: Entite | 'ALL') {
  if (entiteFilter === 'ALL') return {};
  return { entite: { in: [entiteFilter, 'COMMUN'] } };
}

function parseDateOnlyAssistant(v?: string): Date | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
}

function buildSystemPrompt(user: AuthedUser): string {
  const modules: string[] = [];
  if (user.accesRecouvrement) modules.push('Recouvrement (suivi des impayés et relances)');
  if (user.roleOperations) modules.push('Opérations (suivi relationnel du portefeuille SORAM/IRIS, y compris Parc d\'impression)');

  return [
    `Tu es l'assistant intégré à Olu 360, la plateforme de SORAM/SIS/IRIS Afrique, sous forme de bulle de chat flottante.`,
    `L'utilisateur actuel s'appelle ${user.nom} et a accès à : ${modules.join(', ') || 'aucun module'}.`,
    `Réponds toujours en français, de façon concise et directe -- pas de formules creuses.`,
    `Pour toute question portant sur des données réelles de l'app (clients, retards, encours, climat, interventions, parc imprimante...), utilise TOUJOURS un outil plutôt que de deviner ou d'inventer un chiffre. Si aucun outil ne couvre la question, dis-le clairement plutôt que d'improviser.`,
    `Les outils disponibles reflètent déjà les droits de l'utilisateur (son entité, son rôle) -- n'essaie jamais de contourner ça, et si un outil ne renvoie rien ou une erreur d'accès, explique-le simplement sans supposer une cause.`,
    `N'affiche jamais de montant/chiffre financier si l'utilisateur n'a accès qu'au module Opérations -- cette donnée n'existe structurellement pas dans les outils Opérations, donc elle ne devrait de toute façon jamais apparaître.`,
  ].join('\n');
}

function getToolsForUser(user: AuthedUser): Tool[] {
  const tools: Tool[] = [];
  if (user.accesRecouvrement) {
    tools.push(
      {
        name: 'stats_recouvrement',
        description:
          "Statistiques agrégées de recouvrement : encours total, nombre de clients en retard de paiement, encours en contentieux, répartition par palier de relance. Utiliser pour toute question sur les impayés, retards ou encours globaux.",
        input_schema: {
          type: 'object',
          properties: {
            entite: { type: 'string', description: "Code entité (ex: SORAM, IRIS, SIS) -- omettre pour toutes les entités accessibles à l'utilisateur" },
          },
        },
      },
      {
        name: 'chercher_client_recouvrement',
        description: 'Recherche un client par nom (recherche partielle) et renvoie son encours, ses jours de retard et son palier de relance actuel.',
        input_schema: {
          type: 'object',
          properties: {
            nom: { type: 'string', description: 'Nom ou fragment de nom du client recherché' },
            entite: { type: 'string', description: 'Code entité pour restreindre la recherche (optionnel)' },
          },
          required: ['nom'],
        },
      },
      {
        name: 'stats_planning_coursiers',
        description:
          "Statistiques sur le planning des coursiers sur une période : nombre total de tâches, moyenne de tâches par jour (globale et par coursier), tâches faites/reportées par coursier. Utiliser pour toute question sur l'activité des coursiers, leur charge de travail ou le nombre de tâches traitées.",
        input_schema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Date de début AAAA-MM-JJ (par défaut : 30 jours avant la date de fin)' },
            to: { type: 'string', description: "Date de fin AAAA-MM-JJ (par défaut : aujourd'hui)" },
            entite: { type: 'string', description: 'Code entité (optionnel)' },
          },
        },
      },
      {
        name: 'relances_par_agent',
        description:
          "Charge de travail par agent de recouvrement sur une période : nombre de relances effectuées, délai moyen de paiement après intervention, montant recouvré. Utiliser pour toute question sur l'activité ou la performance d'un agent de recouvrement précis ou de l'équipe.",
        input_schema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Date de début AAAA-MM-JJ (par défaut : 30 jours avant la date de fin)' },
            to: { type: 'string', description: "Date de fin AAAA-MM-JJ (par défaut : aujourd'hui)" },
            entite: { type: 'string', description: 'Code entité (optionnel)' },
          },
        },
      },
      {
        name: 'echeances_contrats',
        description:
          "Contrats dont l'échéance (révision tarifaire ou renouvellement) approche, triés par urgence. Utiliser pour toute question sur les contrats à renouveler, à réviser, ou arrivant à échéance.",
        input_schema: {
          type: 'object',
          properties: {
            entite: { type: 'string', description: 'Code entité (optionnel)' },
            jours_max: { type: 'number', description: "Ne retenir que les échéances à moins de N jours (par défaut 90) -- une valeur négative n'a aucun sens et sera ignorée" },
          },
        },
      },
    );
  }
  if (user.roleOperations) {
    tools.push(
      {
        name: 'stats_operations',
        description:
          "Statistiques agrégées du portefeuille Opérations : taille du portefeuille, nombre de comptes VIP, répartition par climat (vert/orange/rouge), nombre de problèmes ouverts. Ne contient jamais de donnée financière (le module Opérations n'en a structurellement pas).",
        input_schema: {
          type: 'object',
          properties: {
            entite: { type: 'string', description: 'Code entité (SORAM ou IRIS) -- omettre pour toutes les entités accessibles' },
          },
        },
      },
      {
        name: 'chercher_client_operations',
        description: "Recherche un compte Opérations par nom de client (recherche partielle) et renvoie son secteur, climat, statut VIP, dernier contact et nombre de problèmes ouverts.",
        input_schema: {
          type: 'object',
          properties: {
            nom: { type: 'string', description: 'Nom ou fragment de nom du client recherché' },
            entite: { type: 'string', description: 'Code entité pour restreindre la recherche (optionnel)' },
          },
          required: ['nom'],
        },
      },
      {
        name: 'parc_impression_resume',
        description:
          "Synthèse du parc d'impression d'UN client précis (équipements actifs, nombre d'interventions, délais médians SLA, volumétrie de copies, consommables livrés). Nécessite un nom de client -- pour une question portant sur l'ensemble du portefeuille (\"quel client a une machine qui a fait...\"), utiliser plutôt alertes_parc_impression_portefeuille.",
        input_schema: {
          type: 'object',
          properties: {
            nom_client: { type: 'string', description: 'Nom ou fragment de nom du client' },
            entite: { type: 'string', description: 'Code entité pour restreindre la recherche (optionnel)' },
          },
          required: ['nom_client'],
        },
      },
      {
        name: 'alertes_parc_impression_portefeuille',
        description:
          "Balaie TOUS les clients du portefeuille accessible (pas un seul) pour repérer les machines qui dépassent un seuil, sur un critère donné : volumétrie mensuelle (nécessite une période AAAA-MM), compteur total cumulé, ou nombre d'interventions. Utiliser pour toute question du type \"quel client a une machine qui a...\", \"y a-t-il une machine qui dépasse...\" sans nom de client précisé.",
        input_schema: {
          type: 'object',
          properties: {
            critere: {
              type: 'string',
              enum: ['volumetrie_mensuelle', 'compteur_total', 'interventions_frequentes'],
              description:
                "volumetrie_mensuelle = pages imprimées sur UN mois donné (nécessite periode) ; compteur_total = pages cumulées depuis toujours ; interventions_frequentes = nombre total d'interventions techniques",
            },
            periode: { type: 'string', description: "Mois au format AAAA-MM (ex: 2026-07) -- requis uniquement pour critere=volumetrie_mensuelle" },
            seuil: { type: 'number', description: 'Seuil à dépasser -- valeurs par défaut si omis : 10000 pages/mois, 700000 pages cumulées, ou 4 interventions selon le critère' },
            entite: { type: 'string', description: 'Code entité pour restreindre la recherche (optionnel)' },
          },
          required: ['critere'],
        },
      },
      {
        name: 'resiliations_stats',
        description:
          "Statistiques sur les comptes résiliés : nombre total, répartition par motif de résiliation, liste des comptes concernés. Utiliser pour toute question sur le churn, les résiliations, ou la raison des départs de clients.",
        input_schema: {
          type: 'object',
          properties: {
            mois: { type: 'string', description: 'Restreindre à un mois précis, format AAAA-MM (ex: 2026-07) -- omettre pour toutes les résiliations confondues' },
            entite: { type: 'string', description: 'Code entité (optionnel)' },
          },
        },
      },
    );
  }
  return tools;
}

export async function statsRecouvrement(user: AuthedUser, input: { entite?: string }) {
  const entiteFilter = resolveEntiteScope(user, input.entite);
  const config = await getConfig();
  const clients = await prisma.client.findMany({ where: entiteWhereRecouvrement(entiteFilter), include: { factures: true } });

  const totalEncoursFCFA = clients.reduce((s, c) => s + clientEncours(c), 0);
  const nombreClientsEnRetard = clients.filter((c) => clientPalier(c, config) >= 1).length;
  const encoursEnContentieuxFCFA = clients.filter((c) => clientPalier(c, config) >= 6).reduce((s, c) => s + clientEncours(c), 0);

  const repartitionParPalier: Record<string, number> = {};
  PALIERS.forEach((p) => (repartitionParPalier[p.label] = 0));
  clients.forEach((c) => {
    if (clientEncours(c) > 0) {
      const p = PALIERS.find((pp) => pp.id === clientPalier(c, config));
      if (p) repartitionParPalier[p.label]++;
    }
  });

  return {
    entite: entiteFilter,
    nombreClients: clients.length,
    totalEncoursFCFA,
    nombreClientsEnRetard,
    encoursEnContentieuxFCFA,
    repartitionParPalier,
  };
}

export async function chercherClientRecouvrement(user: AuthedUser, input: { nom: string; entite?: string }) {
  if (!input.nom?.trim()) return { error: 'Nom requis' };
  const entiteFilter = resolveEntiteScope(user, input.entite);
  const config = await getConfig();
  const clients = await prisma.client.findMany({
    where: { ...entiteWhereRecouvrement(entiteFilter), nom: { contains: input.nom, mode: 'insensitive' } },
    include: { factures: true },
    take: 10,
  });
  if (clients.length === 0) return { resultat: 'Aucun client trouvé pour ce nom dans le périmètre accessible.' };
  return clients.map((c) => ({
    nom: c.nom,
    entite: c.entite,
    encoursFCFA: clientEncours(c),
    joursRetard: clientJoursRetard(c),
    palier: clientPalier(c, config),
  }));
}

export async function statsPlanningCoursiers(user: AuthedUser, input: { from?: string; to?: string; entite?: string }) {
  const to = parseDateOnlyAssistant(input.to) ?? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const from = parseDateOnlyAssistant(input.from) ?? new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (from > to) return { error: 'La date de début doit précéder la date de fin' };
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  const entiteFilter = resolveEntiteScope(user, input.entite);
  const taches = await prisma.tacheCoursier.findMany({
    where: { dateInitiale: { gte: from, lt: toExclusive }, ...tacheEntiteFilter(entiteFilter) },
    select: { statut: true, date: true, dateInitiale: true, entite: true, coursierId: true, coursier: { select: { nom: true } } },
  });
  if (taches.length === 0) {
    return { resultat: `Aucune tâche planifiée entre ${from.toISOString().slice(0, 10)} et ${to.toISOString().slice(0, 10)} dans le périmètre accessible.` };
  }

  const entrees: TacheRapportEntree[] = taches.map((t) => ({
    statut: t.statut,
    date: t.date,
    dateInitiale: t.dateInitiale,
    entite: t.entite,
    coursierId: t.coursierId,
    coursierNom: t.coursier?.nom ?? null,
  }));
  const rapport = buildPlanningRapport(entrees);
  // Moyenne calculée sur les jours calendaires de la période demandée (pas
  // seulement les jours avec activité) -- une période incluant un jour sans
  // aucune tâche doit faire baisser la moyenne, pas être ignorée.
  const nombreJours = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const arrondi1 = (n: number) => Math.round(n * 10) / 10;

  return {
    periode: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), nombreJoursCalendaires: nombreJours },
    totalTaches: rapport.global.total,
    moyenneTachesParJourGlobale: arrondi1(rapport.global.total / nombreJours),
    parCoursier: rapport.parCoursier
      .filter((c) => c.coursierId !== null)
      .map((c) => ({
        nom: c.nom,
        totalTaches: c.total,
        moyenneTachesParJour: arrondi1(c.total / nombreJours),
        faites: c.faites,
        reportees: c.reportees,
      })),
  };
}

export async function relancesParAgent(user: AuthedUser, input: { from?: string; to?: string; entite?: string }) {
  const toDate = parseDateOnlyAssistant(input.to) ?? new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const fromDate = parseDateOnlyAssistant(input.from) ?? new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (fromDate > toDate) return { error: 'La date de début doit précéder la date de fin' };
  const period = buildPeriod(fromDate.toISOString().slice(0, 10), toDate.toISOString().slice(0, 10));
  if (!period) return { error: 'Période invalide' };

  const entiteFilter = resolveEntiteScope(user, input.entite);
  const agents = await computeAgentStats(period, entiteWhereRecouvrement(entiteFilter));
  if (agents.length === 0) {
    return { resultat: `Aucune relance enregistrée entre ${period.fromStr} et ${period.toStr} dans le périmètre accessible.` };
  }
  return {
    periode: { from: period.fromStr, to: period.toStr },
    agents: agents.map((a) => ({
      nom: a.nom,
      nombreRelances: a.actions,
      delaiMoyenApresInterventionJours: a.delaiMoyenApresIntervention,
      montantRecouvreFCFA: a.montantRecouvre,
      nombreFacturesPayees: a.nombreFactures,
    })),
  };
}

export async function echeancesContrats(user: AuthedUser, input: { entite?: string; jours_max?: number }) {
  const entiteFilter = resolveEntiteScope(user, input.entite);
  const joursMax = input.jours_max && input.jours_max > 0 ? input.jours_max : 90;

  const clients = await prisma.client.findMany({
    where: entiteWhereRecouvrement(entiteFilter),
    include: { contrats: true },
  });
  const rows = clients
    .flatMap((c) =>
      c.contrats.map((contrat) => {
        const e = contractEcheance(contrat);
        return {
          client: c.nom,
          entite: c.entite,
          numeroContrat: contrat.numero,
          type: contrat.type,
          echeanceType: e.type,
          echeanceDate: e.date,
          joursRestants: e.jours,
          niveauAlerte: contractAlertLevel(contrat),
        };
      })
    )
    .filter((r) => r.joursRestants <= joursMax)
    .sort((a, b) => a.joursRestants - b.joursRestants)
    .slice(0, 30);

  if (rows.length === 0) return { resultat: `Aucun contrat avec une échéance à moins de ${joursMax} jours dans le périmètre accessible.` };
  return { joursMax, contrats: rows };
}

export async function statsOperations(user: AuthedUser, input: { entite?: string }) {
  const entiteFilter = resolveEntiteScopeOperations(user, input.entite);
  const rows = await prisma.clientOperations.findMany({
    where: { client: entiteWhereOperations(entiteFilter), resilie: false, ...chargeDeCompteWhere(user) },
    include: { client: { select: CLIENT_SELECT_OPERATIONS }, problemes: true },
  });
  const repartitionClimat = { vert: 0, orange: 0, rouge: 0, inconnu: 0 };
  rows.forEach((r) => {
    const cle = (r.climat ?? 'inconnu') as keyof typeof repartitionClimat;
    repartitionClimat[cle]++;
  });
  const vip = rows.filter((r) => r.vip).length;
  const problemesOuverts = rows.reduce((s, r) => s + r.problemes.filter((p) => !p.resoluLe).length, 0);
  return { entite: entiteFilter, totalPortefeuille: rows.length, vip, repartitionClimat, problemesOuverts };
}

export async function chercherClientOperations(user: AuthedUser, input: { nom: string; entite?: string }) {
  if (!input.nom?.trim()) return { error: 'Nom requis' };
  const entiteFilter = resolveEntiteScopeOperations(user, input.entite);
  const rows = await prisma.clientOperations.findMany({
    where: {
      client: { ...entiteWhereOperations(entiteFilter), nom: { contains: input.nom, mode: 'insensitive' } },
      ...chargeDeCompteWhere(user),
    },
    include: { client: { select: CLIENT_SELECT_OPERATIONS }, problemes: true },
    take: 10,
  });
  if (rows.length === 0) return { resultat: 'Aucun compte Opérations trouvé pour ce nom dans le périmètre accessible.' };
  return rows.map((r) => ({
    nom: r.client.nom,
    entite: r.client.entite,
    secteur: r.secteur,
    vip: r.vip,
    climat: r.climat ?? 'non renseigné',
    resilie: r.resilie,
    dernierContact: r.dernierContact,
    problemesOuverts: r.problemes.filter((p) => !p.resoluLe).length,
  }));
}

export async function parcImpressionResume(user: AuthedUser, input: { nom_client: string; entite?: string }) {
  if (!input.nom_client?.trim()) return { error: 'Nom de client requis' };
  const entiteFilter = resolveEntiteScopeOperations(user, input.entite);
  const co = await prisma.clientOperations.findFirst({
    where: {
      client: { ...entiteWhereOperations(entiteFilter), nom: { contains: input.nom_client, mode: 'insensitive' } },
      ...chargeDeCompteWhere(user),
    },
    include: { client: { select: CLIENT_SELECT_OPERATIONS } },
  });
  if (!co) return { resultat: 'Aucun compte Opérations trouvé pour ce nom dans le périmètre accessible.' };

  const [equipements, interventions, volumetrie, livraisons] = await Promise.all([
    prisma.equipementParc.findMany({ where: { clientOperationsId: co.id } }),
    prisma.intervention.findMany({ where: { clientOperationsId: co.id } }),
    prisma.releveVolumetrie.findMany({ where: { clientOperationsId: co.id } }),
    prisma.livraisonConsommable.findMany({ where: { clientOperationsId: co.id } }),
  ]);
  const synthese = computeParcSynthese(equipements, interventions, volumetrie, livraisons);
  return { client: co.client.nom, entite: co.client.entite, ...synthese };
}

interface AlerteMachinePortefeuille {
  client: string;
  entite: string;
  numeroSerie: string;
  modele: string;
  site: string;
  total: number;
}

// Contrairement à parcImpressionResume (un client à la fois), balaie tous
// les comptes du périmètre accessible -- répond à "quel client a une
// machine qui dépasse X", question à laquelle aucun autre outil ne peut
// répondre sans connaître déjà le nom du client recherché.
export async function alertesParcImpressionPortefeuille(
  user: AuthedUser,
  input: { critere?: string; periode?: string; seuil?: number; entite?: string }
) {
  const critere = input.critere;
  if (critere !== 'volumetrie_mensuelle' && critere !== 'compteur_total' && critere !== 'interventions_frequentes') {
    return { error: "critere requis : 'volumetrie_mensuelle', 'compteur_total' ou 'interventions_frequentes'" };
  }
  if (critere === 'volumetrie_mensuelle' && !/^\d{4}-\d{2}$/.test(input.periode ?? '')) {
    return { error: 'periode requise au format AAAA-MM pour ce critère (ex: 2026-07)' };
  }

  const entiteFilter = resolveEntiteScopeOperations(user, input.entite);
  const cos = await prisma.clientOperations.findMany({
    where: { client: entiteWhereOperations(entiteFilter), ...chargeDeCompteWhere(user) },
    select: { id: true, client: { select: CLIENT_SELECT_OPERATIONS } },
  });
  if (cos.length === 0) return { resultat: 'Aucun compte dans le périmètre accessible.' };
  const clientParCoId = new Map(cos.map((c) => [c.id, c.client]));
  const coIds = cos.map((c) => c.id);

  // Résultat plafonné à 30 lignes -- suffisant pour répondre, sans gonfler
  // inutilement le payload renvoyé au modèle sur un portefeuille chargé.
  const TOP_N = 30;

  if (critere === 'interventions_frequentes') {
    const seuil = input.seuil ?? 4;
    const interventions = await prisma.intervention.findMany({
      where: { clientOperationsId: { in: coIds }, equipementId: { not: null } },
      select: { equipementId: true, clientOperationsId: true, equipement: { select: { numeroSerie: true, modele: true, site: true } } },
    });
    const parMachine = new Map<string, AlerteMachinePortefeuille>();
    for (const iv of interventions) {
      if (!iv.equipementId || !iv.equipement) continue;
      const c = clientParCoId.get(iv.clientOperationsId);
      const acc = parMachine.get(iv.equipementId) ?? {
        client: c?.nom ?? '?',
        entite: c?.entite ?? '?',
        numeroSerie: iv.equipement.numeroSerie,
        modele: iv.equipement.modele,
        site: iv.equipement.site,
        total: 0,
      };
      acc.total++;
      parMachine.set(iv.equipementId, acc);
    }
    const alertes = Array.from(parMachine.values())
      .filter((a) => a.total > seuil)
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP_N);
    return alertes.length ? { critere, seuil, alertes } : { resultat: `Aucune machine au-dessus de ${seuil} interventions dans le périmètre accessible.` };
  }

  // volumetrie_mensuelle et compteur_total partagent la même source
  // (VolumetrieEquipement) -- seul le filtre de période diffère.
  const seuil = input.seuil ?? (critere === 'volumetrie_mensuelle' ? 10000 : 700000);
  const releves = await prisma.volumetrieEquipement.findMany({
    where: {
      equipement: { clientOperationsId: { in: coIds } },
      ...(critere === 'volumetrie_mensuelle' ? { periode: input.periode } : {}),
    },
    select: {
      equipementId: true,
      copiesNB: true,
      copiesCouleur: true,
      equipement: { select: { numeroSerie: true, modele: true, site: true, clientOperationsId: true } },
    },
  });

  if (critere === 'volumetrie_mensuelle') {
    const alertes = releves
      .map((r) => {
        const c = clientParCoId.get(r.equipement.clientOperationsId);
        return {
          client: c?.nom ?? '?',
          entite: c?.entite ?? '?',
          numeroSerie: r.equipement.numeroSerie,
          modele: r.equipement.modele,
          site: r.equipement.site,
          total: r.copiesNB + r.copiesCouleur,
        };
      })
      .filter((r) => r.total > seuil)
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP_N);
    return alertes.length
      ? { critere, periode: input.periode, seuil, alertes }
      : { resultat: `Aucune machine au-dessus de ${seuil} pages pour la période ${input.periode} dans le périmètre accessible.` };
  }

  // compteur_total : cumul toutes périodes confondues, par machine.
  const cumulParMachine = new Map<string, AlerteMachinePortefeuille>();
  for (const r of releves) {
    const c = clientParCoId.get(r.equipement.clientOperationsId);
    const acc = cumulParMachine.get(r.equipementId) ?? {
      client: c?.nom ?? '?',
      entite: c?.entite ?? '?',
      numeroSerie: r.equipement.numeroSerie,
      modele: r.equipement.modele,
      site: r.equipement.site,
      total: 0,
    };
    acc.total += r.copiesNB + r.copiesCouleur;
    cumulParMachine.set(r.equipementId, acc);
  }
  const alertes = Array.from(cumulParMachine.values())
    .filter((a) => a.total > seuil)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N);
  return alertes.length ? { critere, seuil, alertes } : { resultat: `Aucune machine au-dessus de ${seuil} pages cumulées dans le périmètre accessible.` };
}

async function executeTool(name: string, input: unknown, user: AuthedUser): Promise<{ result: unknown; isError: boolean }> {
  try {
    const args = (input ?? {}) as Record<string, unknown>;
    switch (name) {
      case 'stats_recouvrement':
        if (!user.accesRecouvrement) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await statsRecouvrement(user, args as { entite?: string }), isError: false };
      case 'chercher_client_recouvrement':
        if (!user.accesRecouvrement) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await chercherClientRecouvrement(user, args as { nom: string; entite?: string }), isError: false };
      case 'stats_planning_coursiers':
        if (!user.accesRecouvrement) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await statsPlanningCoursiers(user, args as { from?: string; to?: string; entite?: string }), isError: false };
      case 'relances_par_agent':
        if (!user.accesRecouvrement) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await relancesParAgent(user, args as { from?: string; to?: string; entite?: string }), isError: false };
      case 'echeances_contrats':
        if (!user.accesRecouvrement) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await echeancesContrats(user, args as { entite?: string; jours_max?: number }), isError: false };
      case 'stats_operations':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await statsOperations(user, args as { entite?: string }), isError: false };
      case 'chercher_client_operations':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await chercherClientOperations(user, args as { nom: string; entite?: string }), isError: false };
      case 'parc_impression_resume':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await parcImpressionResume(user, args as { nom_client: string; entite?: string }), isError: false };
      case 'alertes_parc_impression_portefeuille':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return {
          result: await alertesParcImpressionPortefeuille(user, args as { critere?: string; periode?: string; seuil?: number; entite?: string }),
          isError: false,
        };
      case 'resiliations_stats':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await resiliationsStats(user, args as { mois?: string; entite?: string }), isError: false };
      default:
        return { result: { error: `Outil inconnu : ${name}` }, isError: true };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : 'Erreur inattendue' }, isError: true };
  }
}

export async function resiliationsStats(user: AuthedUser, input: { mois?: string; entite?: string }) {
  const entiteFilter = resolveEntiteScopeOperations(user, input.entite);
  const rows = await prisma.clientOperations.findMany({
    where: { client: entiteWhereOperations(entiteFilter), resilie: true, ...chargeDeCompteWhere(user) },
    select: { dateResiliation: true, motifResiliation: true, client: { select: CLIENT_SELECT_OPERATIONS } },
  });

  const cle = (d: Date) => `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, '0')}`;
  const filtered =
    input.mois && /^\d{4}-\d{2}$/.test(input.mois) ? rows.filter((r) => r.dateResiliation && cle(r.dateResiliation) === input.mois) : rows;

  if (filtered.length === 0) {
    return { resultat: `Aucune résiliation${input.mois ? ` en ${input.mois}` : ''} dans le périmètre accessible.` };
  }

  const parMotif = new Map<string, number>();
  for (const r of filtered) {
    if (!r.motifResiliation) continue;
    parMotif.set(r.motifResiliation, (parMotif.get(r.motifResiliation) ?? 0) + 1);
  }

  return {
    periode: input.mois ?? 'toutes périodes confondues',
    nombreResiliations: filtered.length,
    repartitionParMotif: Object.fromEntries(parMotif),
    clients: filtered.slice(0, 30).map((r) => ({
      nom: r.client.nom,
      entite: r.client.entite,
      dateResiliation: r.dateResiliation,
      motif: r.motifResiliation,
    })),
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TOOL_ROUNDS = 6;

// Boucle tool-use standard : envoie la conversation, exécute les outils
// demandés, renvoie leurs résultats, jusqu'à obtenir une réponse texte
// finale ou atteindre la limite d'itérations (garde-fou contre une boucle
// d'appels d'outils qui ne convergerait jamais).
export async function chatAssistant(user: AuthedUser, messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant côté serveur');

  const anthropic = new Anthropic({ apiKey });
  const tools = getToolsForUser(user);
  const system = buildSystemPrompt(user);
  const model = process.env.ASSISTANT_MODEL || 'claude-sonnet-5';

  let conversation: MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system,
      tools: tools.length ? tools : undefined,
      messages: conversation,
    });

    if (response.stop_reason !== 'tool_use') {
      return response.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }

    conversation = [...conversation, { role: 'assistant', content: response.content }];

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const { result, isError } = await executeTool(block.name, block.input, user);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), is_error: isError });
      }
    }
    conversation = [...conversation, { role: 'user', content: toolResults }];
  }

  return "Je n'arrive pas à obtenir une réponse claire pour cette question -- pouvez-vous reformuler ?";
}
