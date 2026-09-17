import { prisma } from '../db';
import { ModeleRelance } from '../lib/modelesRelance';

// Charge les modèles de relance personnalisés de l'organisation COURANTE (scopé
// par le contexte tenant / la RLS). Clé = palier. Un palier absent → modèle par
// défaut (lib/modelesRelance). Appelée sous withTenant / tenantScope.
export async function chargerModelesOrg(): Promise<Map<number, ModeleRelance>> {
  const rows = await prisma.modeleRelanceOrg.findMany({ select: { palier: true, sujet: true, corps: true } });
  return new Map(rows.map((r) => [r.palier, { sujet: r.sujet, corps: r.corps }]));
}
