// Exécution des relances automatiques (addendum §5) — couche IO du moteur.
// À partir des relances dues (lib/moteurRelances), construit le message (réutilise
// letters.ts), l'envoie via l'émetteur configuré et enregistre l'action. Le
// mode dry-run (par défaut) calcule ce qui PARTIRAIT sans rien envoyer ni écrire.
import { prisma, currentOrganisationId } from '../db';
import { getEmailProvider } from './email/provider';
import { getConfig, getPaliersActifs } from '../services/configService';
import { generateLetter, LetterClient } from './letters';
import { PALIERS } from './paliers';
import { ClientRelance, dansFenetreEnvoi, relancesDues } from './moteurRelances';
import { construireRelanceMarque, OrgIdentite } from './modelesRelance';
import { chargerModelesOrg } from '../services/modeleRelanceService';

// Au-delà de ce palier, la relance n'est jamais envoyée automatiquement :
// pénalités, commandement de payer et contentieux (§5.1) impliquent une action
// formelle/juridique (mise en demeure, passage en contentieux) qui reste
// délibérément manuelle. L'envoi auto couvre l'amiable : avis d'échéance →
// arrêt de service (paliers 1 à 5).
export const PALIER_MAX_AUTO = 5;

export type RaisonIgnore = 'email_manquant' | 'palier_manuel';

// Destinataires d'une relance : le contact principal en « À », les autres
// contacts de la fiche (avec email) en copie. Dédoublonné (insensible à la
// casse). Repli utile : si le principal n'a pas d'email mais qu'un contact en a,
// ce contact devient le destinataire principal. null = aucun email exploitable.
export function destinatairesRelance(
  principal: string | null | undefined,
  contacts: { email: string | null }[],
): { to: string; cc: string[] } | null {
  const emails: string[] = [];
  const seen = new Set<string>();
  const add = (e?: string | null) => {
    const t = (e ?? '').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    emails.push(t);
  };
  add(principal);
  for (const c of contacts) add(c.email);
  if (!emails.length) return null;
  return { to: emails[0], cc: emails.slice(1) };
}

export interface MessageRelance {
  sujet: string;
  corps: string;
}

// Construit le message à partir du courrier existant (letters.ts) : la première
// ligne « Objet : … » devient le sujet, le reste le corps ; on ajoute les
// modalités de paiement de l'organisation si renseignées (§5.3, §7.1). Pur.
export function construireMessage(
  client: LetterClient,
  palier: number,
  instructionsPaiement?: string | null,
): MessageRelance {
  const texte = generateLetter(client, palier);
  const lignes = texte.split('\n');
  let sujet = `${PALIERS[palier]?.label ?? 'Relance'} — ${client.nom}`;
  let corps = texte;
  // Le courrier est « en-tête + corps + signature » : la ligne « Objet : … »
  // n'est pas forcément la première. On la cherche, on l'utilise comme sujet
  // d'email et on la retire du corps (l'objet ne se répète pas dans le message).
  const idx = lignes.findIndex((l) => /^Objet\s*:\s*.+$/.test(l.trim()));
  if (idx >= 0) {
    sujet = lignes[idx].trim().replace(/^Objet\s*:\s*/, '');
    lignes.splice(idx, 1);
    corps = lignes.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  if (instructionsPaiement && instructionsPaiement.trim()) {
    corps += `\n\nModalités de paiement\n\n${instructionsPaiement.trim()}`;
  }
  return { sujet, corps };
}

export interface RelanceEnvoyee {
  clientId: string;
  nom: string;
  palier: number;
  palierLabel: string;
  email: string;
  sujet: string;
}

export interface RelanceIgnoree {
  clientId: string;
  nom: string;
  palier: number;
  raison: RaisonIgnore;
}

export interface RapportExecution {
  dryRun: boolean;
  fenetreOuverte: boolean;
  // Vrai seulement si on a réellement envoyé (dry-run désactivé ET fenêtre
  // ouverte, ou envoi forcé). Sinon, `envoyees` liste ce qui PARTIRAIT.
  envoiEffectif: boolean;
  envoyees: RelanceEnvoyee[];
  ignorees: RelanceIgnoree[];
}

export interface OptionsExecution {
  dryRun?: boolean;
  now?: Date;
  forcerHorsFenetre?: boolean;
}

// Exécute (ou simule) les relances dues pour le tenant courant. Toujours appelée
// dans un contexte tenant (withTenant / middleware tenantScope) : la sélection
// des clients et l'organisation lue sont donc scopées.
export async function executerRelancesTenant(opts: OptionsExecution = {}): Promise<RapportExecution> {
  const dryRun = opts.dryRun ?? true;
  const now = opts.now ?? new Date();
  const forcer = opts.forcerHorsFenetre ?? false;
  const fenetreOuverte = dansFenetreEnvoi(now);
  const envoiEffectif = !dryRun && (fenetreOuverte || forcer);

  const config = await getConfig();
  const paliersActifs = await getPaliersActifs();
  const clients = await prisma.client.findMany({
    include: {
      factures: true,
      actions: { select: { palier: true, date: true } },
      echeanciers: { select: { tranches: { select: { dateEcheance: true, statut: true } } } },
      // Contacts supplémentaires : mis en copie (CC) de la relance.
      contacts: { select: { email: true } },
    },
  });
  const byId = new Map(clients.map((c) => [c.id, c]));
  const entree: ClientRelance[] = clients.map((c) => ({
    id: c.id,
    nom: c.nom,
    factures: c.factures,
    frequenceFacturation: c.frequenceFacturation,
    actions: c.actions,
    echeanciers: c.echeanciers,
  }));
  const dues = relancesDues(entree, config, now, paliersActifs);

  const orgId = currentOrganisationId();
  const org = orgId
    ? await prisma.organisation.findUnique({
        where: { id: orgId },
        select: {
          instructionsPaiement: true,
          raisonSociale: true,
          emailReponse: true,
          logoUrl: true,
          adresse: true,
          identifiantFiscal: true,
          rccm: true,
          formeJuridique: true,
          capitalSocial: true,
          contactRecouvrement: true,
          pays: true,
        },
      })
    : null;
  // Identité d'expéditeur du tenant (§6) : nom affiché = raison sociale, réponses
  // renvoyées à l'adresse de l'organisation. L'adresse d'envoi reste mutualisée.
  const fromName = org?.raisonSociale ?? undefined;
  const replyTo = org?.emailReponse ?? undefined;
  // Identité de marque pour l'email (logo + coordonnées) — §5.3.
  const orgIdentite: OrgIdentite | null = org
    ? {
        raisonSociale: org.raisonSociale,
        logoUrl: org.logoUrl,
        adresse: org.adresse,
        identifiantFiscal: org.identifiantFiscal,
        rccm: org.rccm,
        formeJuridique: org.formeJuridique,
        capitalSocial: org.capitalSocial,
        contactRecouvrement: org.contactRecouvrement,
        instructionsPaiement: org.instructionsPaiement,
        pays: org.pays,
      }
    : null;

  // Modèles personnalisés du tenant (§5.3) — surchargent les modèles par défaut.
  const modelesOrg = orgIdentite ? await chargerModelesOrg() : null;

  const provider = getEmailProvider();
  const envoyees: RelanceEnvoyee[] = [];
  const ignorees: RelanceIgnoree[] = [];

  for (const d of dues) {
    const c = byId.get(d.clientId)!;
    const base = { clientId: c.id, nom: c.nom, palier: d.palier };
    // Paliers formels/juridiques : jamais d'envoi automatique.
    if (d.palier > PALIER_MAX_AUTO) {
      ignorees.push({ ...base, raison: 'palier_manuel' });
      continue;
    }
    const dest = destinatairesRelance(c.email, c.contacts);
    if (!dest) {
      ignorees.push({ ...base, raison: 'email_manquant' });
      continue;
    }
    // Tenant SaaS : message NEUTRE au nom du client + email de marque (logo,
    // coordonnées) — §5.3. Sans contexte d'organisation (groupe, mode legacy),
    // on garde les courriers historiques (letters.ts), en texte seul.
    let sujet: string;
    let texte: string;
    let html: string | undefined;
    if (orgIdentite) {
      const r = construireRelanceMarque(
        { nom: c.nom, factures: c.factures, frequenceFacturation: c.frequenceFacturation },
        orgIdentite,
        d.palier,
        modelesOrg?.get(d.palier),
      );
      sujet = r.sujet;
      texte = r.texte;
      html = r.html;
    } else {
      const letterClient: LetterClient = {
        nom: c.nom,
        entite: c.entite as LetterClient['entite'],
        contact: c.contact ?? '',
        factures: c.factures,
        frequenceFacturation: c.frequenceFacturation,
        actions: c.actions,
      };
      const msg = construireMessage(letterClient, d.palier, org?.instructionsPaiement);
      sujet = msg.sujet;
      texte = msg.corps;
    }
    if (envoiEffectif) {
      // Envoi réel puis trace — l'action n'est enregistrée que si l'envoi a
      // réussi (une exception interrompt et remonte, rien n'est marqué envoyé).
      await provider.send({ to: dest.to, cc: dest.cc.length ? dest.cc : undefined, subject: sujet, text: texte, html, fromName, replyTo });
      await prisma.actionRecouvrement.create({
        data: {
          clientId: c.id,
          palier: d.palier,
          label: PALIERS[d.palier].label,
          note: `Relance automatique par email à ${dest.to}${dest.cc.length ? ` (+${dest.cc.length} en copie)` : ''}`,
          // Archive du message exact envoyé (relecture par l'agent + preuve
          // amiable pour le contentieux).
          emailSujet: sujet,
          emailTo: dest.to,
          emailCc: dest.cc.length ? dest.cc.join(', ') : null,
          emailHtml: html ?? null,
          emailTexte: texte,
        },
      });
    }
    envoyees.push({
      clientId: c.id,
      nom: c.nom,
      palier: d.palier,
      palierLabel: PALIERS[d.palier].label,
      email: dest.to,
      sujet,
    });
  }

  return { dryRun, fenetreOuverte, envoiEffectif, envoyees, ignorees };
}
