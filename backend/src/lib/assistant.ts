import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import { prisma } from '../db';
import { AuthedUser } from '../middleware/auth';
import { Entite, resolveEntiteScope } from './entites';
import { chargeDeCompteWhere, resolveEntiteScopeOperations } from './operationsAuth';
import { clientEncours, clientJoursRetard, clientPalier, PALIERS } from './paliers';
import { computeParcSynthese, computeSlaStats } from './parcImpression';
import { getConfig } from '../services/configService';

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
          "Synthèse du parc d'impression d'un client (équipements actifs, nombre d'interventions, délais médians SLA, volumétrie de copies, consommables livrés). Utiliser pour toute question sur les imprimantes, interventions techniques ou copies d'un client précis.",
        input_schema: {
          type: 'object',
          properties: {
            nom_client: { type: 'string', description: 'Nom ou fragment de nom du client' },
            entite: { type: 'string', description: 'Code entité pour restreindre la recherche (optionnel)' },
          },
          required: ['nom_client'],
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
      case 'stats_operations':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await statsOperations(user, args as { entite?: string }), isError: false };
      case 'chercher_client_operations':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await chercherClientOperations(user, args as { nom: string; entite?: string }), isError: false };
      case 'parc_impression_resume':
        if (!user.roleOperations) return { result: { error: 'Accès refusé' }, isError: true };
        return { result: await parcImpressionResume(user, args as { nom_client: string; entite?: string }), isError: false };
      default:
        return { result: { error: `Outil inconnu : ${name}` }, isError: true };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : 'Erreur inattendue' }, isError: true };
  }
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
