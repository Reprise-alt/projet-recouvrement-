import { AgentStat, ReportingSummary } from './reporting';

// Seuils au-delà desquels une variation est jugée "réelle" plutôt que du
// bruit statistique sur peu de factures — volontairement prudents, à
// ajuster avec l'usage. Rien ici ne doit produire un point sur une
// variation qui pourrait aussi bien être due au hasard d'un mois calme.
const SEUIL_DELAI_JOURS = 3; // jours de variation du délai moyen pondéré
const SEUIL_MONTANT_POURCENT = 10; // % de variation du montant encaissé
const SEUIL_ECART_ENTITE_JOURS = 5; // écart entre la meilleure et la pire entité

export interface AnalyseInput {
  // Bornes de la période analysée, pour des phrases qui restent lisibles
  // hors contexte (un export PDF/Excel se relit sans l'écran d'origine).
  periodeLabel: string;
  actuel: ReportingSummary;
  // null si aucune période de comparaison de longueur équivalente n'est
  // disponible (ex: tout début d'utilisation de la plateforme) — les
  // règles de tendance sont alors simplement sautées, jamais approximées.
  precedent: ReportingSummary | null;
  clientsEnContentieux: { nombre: number; montant: number };
  clientsRetardInhabituel: number;
  // Statistiques agent déjà bornées à la période et aux comptes marqués
  // "agent de recouvrement" (cf. Utilisateur.estAgentRecouvrement).
  agents: AgentStat[];
}

export type CategoriePoint = 'pointFort' | 'actionPositive' | 'vigilance' | 'amelioration';

export interface Point {
  categorie: CategoriePoint;
  texte: string;
}

export interface AnalyseResult {
  pointsForts: string[];
  actionsPositives: string[];
  pointsVigilance: string[];
  axesAmelioration: string[];
  // Une recommandation synthétique par point de vigilance déclenché plutôt
  // qu'un paragraphe généré librement -- chaque ligne reste traçable à la
  // règle qui l'a produite.
  recommandations: string[];
}

function round(n: number): number {
  return Math.round(n);
}

// Construit l'analyse à partir de données déjà calculées (jamais de calcul
// de dates/montants ici) -- chaque point produit doit pouvoir être relu et
// vérifié contre un chiffre réel affiché ailleurs dans le même rapport.
// Cette fonction ne fait que déclencher des phrases sur des seuils; le
// contenu final reste éditable par l'utilisateur avant export (cf. README
// de la route /reporting/analyse).
export function buildAnalyse(input: AnalyseInput): AnalyseResult {
  const pointsForts: string[] = [];
  const actionsPositives: string[] = [];
  const pointsVigilance: string[] = [];
  const axesAmelioration: string[] = [];
  const recommandations: string[] = [];

  const { actuel, precedent } = input;

  // --- Tendance du délai moyen d'encaissement pondéré ---
  if (precedent && actuel.delaiEncaissement.global !== null && precedent.delaiEncaissement.global !== null) {
    const delta = actuel.delaiEncaissement.global - precedent.delaiEncaissement.global;
    if (delta <= -SEUIL_DELAI_JOURS) {
      pointsForts.push(
        `Le délai moyen d'encaissement pondéré a baissé de ${round(-delta)} j sur la période (${round(precedent.delaiEncaissement.global)} j → ${round(actuel.delaiEncaissement.global)} j).`,
      );
    } else if (delta >= SEUIL_DELAI_JOURS) {
      pointsVigilance.push(
        `Le délai moyen d'encaissement pondéré a augmenté de ${round(delta)} j sur la période (${round(precedent.delaiEncaissement.global)} j → ${round(actuel.delaiEncaissement.global)} j).`,
      );
      recommandations.push('Prioriser le traitement des dossiers aux paliers intermédiaires (Relance 2/3) avant qu\'ils ne progressent vers le contentieux.');
    }
  }

  // --- Tendance du montant encaissé ---
  if (precedent && precedent.facturesPayees.montantTotal > 0) {
    const variation = ((actuel.facturesPayees.montantTotal - precedent.facturesPayees.montantTotal) / precedent.facturesPayees.montantTotal) * 100;
    if (variation >= SEUIL_MONTANT_POURCENT) {
      pointsForts.push(`Le montant encaissé a progressé de ${round(variation)} % par rapport à la période précédente.`);
    } else if (variation <= -SEUIL_MONTANT_POURCENT) {
      pointsVigilance.push(`Le montant encaissé a reculé de ${round(-variation)} % par rapport à la période précédente.`);
      recommandations.push('Identifier si le recul du montant encaissé vient d\'un volume de facturation plus faible ou d\'un allongement des délais de paiement, avant de décider d\'une action.');
    }
  }

  // --- Écart de délai entre entités ---
  if (actuel.delaiEncaissement.parEntite.length > 1) {
    const avecDelai = actuel.delaiEncaissement.parEntite.filter((r) => r.delaiJours !== null);
    if (avecDelai.length > 1) {
      const meilleure = avecDelai.reduce((a, b) => (a.delaiJours! < b.delaiJours! ? a : b));
      const pire = avecDelai.reduce((a, b) => (a.delaiJours! > b.delaiJours! ? a : b));
      if (pire.delaiJours! - meilleure.delaiJours! >= SEUIL_ECART_ENTITE_JOURS) {
        pointsForts.push(`${meilleure.entite} a le délai d'encaissement le plus court du groupe (${round(meilleure.delaiJours!)} j).`);
        axesAmelioration.push(
          `${pire.entite} a le délai d'encaissement le plus long du groupe (${round(pire.delaiJours!)} j, contre ${round(meilleure.delaiJours!)} j pour ${meilleure.entite}).`,
        );
      }
    }
  }

  // --- Contentieux et retards inhabituels (état actuel, pas un flux sur la période) ---
  if (input.clientsEnContentieux.nombre > 0) {
    pointsVigilance.push(
      `${input.clientsEnContentieux.nombre} client${input.clientsEnContentieux.nombre > 1 ? 's' : ''} actuellement en contentieux (palier ≥ 6), représentant ${input.clientsEnContentieux.montant.toLocaleString('fr-FR')} FCFA d'encours.`,
    );
    recommandations.push(
      `Statuer sur les dossiers en contentieux (relance judiciaire, échéancier négocié ou provision) plutôt que de les laisser en l'état — ${input.clientsEnContentieux.montant.toLocaleString('fr-FR')} FCFA d'encours immobilisé.`,
    );
  }
  if (input.clientsRetardInhabituel > 0) {
    pointsVigilance.push(
      `${input.clientsRetardInhabituel} client${input.clientsRetardInhabituel > 1 ? 's' : ''} avec un retard nettement supérieur à leur propre historique de paiement.`,
    );
    recommandations.push(
      `Contacter en priorité les clients au retard inhabituel — un écart avec leur propre historique signale souvent une difficulté ponctuelle qu'un contact rapide permet de désamorcer.`,
    );
  }

  // --- Performance par agent ---
  const agentsActifs = input.agents.filter((a) => a.actions > 0 || a.montantRecouvre > 0);
  if (agentsActifs.length > 0) {
    const meilleur = agentsActifs.reduce((a, b) => (a.montantRecouvre > b.montantRecouvre ? a : b));
    if (meilleur.montantRecouvre > 0) {
      actionsPositives.push(
        `${meilleur.nom} a le montant recouvré le plus élevé de la période (${meilleur.montantRecouvre.toLocaleString('fr-FR')} FCFA sur ${meilleur.nombreFactures} facture${meilleur.nombreFactures > 1 ? 's' : ''}).`,
      );
    }
  }
  const agentsInactifs = input.agents.filter((a) => a.actions === 0);
  if (agentsInactifs.length > 0) {
    axesAmelioration.push(
      `${agentsInactifs.map((a) => a.nom).join(', ')} n'${agentsInactifs.length > 1 ? 'ont' : 'a'} enregistré aucune relance sur la période.`,
    );
    recommandations.push(
      `Vérifier la charge de ${agentsInactifs.map((a) => a.nom).join(', ')} sur la période — absence de relance enregistrée ne veut pas dire absence de travail, mais mérite d'être clarifié.`,
    );
  }

  if (recommandations.length === 0 && pointsVigilance.length === 0) {
    recommandations.push('Aucun signal de dégradation sur la période — maintenir le rythme de relance actuel.');
  }

  return { pointsForts, actionsPositives, pointsVigilance, axesAmelioration, recommandations };
}
