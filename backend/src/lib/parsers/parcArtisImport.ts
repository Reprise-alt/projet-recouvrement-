import * as XLSX from 'xlsx';

// Les 4 exports ARTIS (biensDsSol, ResultatRequete, 2x ResultatEtatVente)
// couvrent presque 1:1 le schéma Parc d'impression déjà construit à la main
// pour le COPIL. Point non négociable : on ne lit jamais les colonnes
// montant (Total HT/TTC, PU, Coût MO/Dépl/Pièce/Conso...) qui pullulent
// dans ResultatEtatVente -- seules les colonnes listées ci-dessous sont
// jamais accédées.

export type ArtisFileType = 'biens' | 'interventions' | 'etatvente' | 'inconnu';

export interface ArtisEquipementRow {
  site: string;
  modele: string;
  numeroSerie: string;
}

export interface ArtisInterventionRow {
  referenceExterne: string;
  site: string;
  type: 'preventive' | 'curative';
  urgence: 'urgente' | 'standard';
  dateDeclaration: Date;
  datePriseEnCharge: Date | null;
  dateCloture: Date | null;
  numeroSerieEquipement: string | null;
}

export interface ArtisConsommableRow {
  referenceExterne: string;
  date: Date;
  reference: string;
  quantite: number;
}

export interface ArtisVolumetriePeriode {
  periode: string;
  copiesNB: number;
  copiesCouleur: number;
}

function normaliserTexte(v: unknown): string {
  return String(v ?? '')
    .replace(/ /g, ' ') // espace insécable
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliserPourComparaison(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const PAYS_CONNUS = new Set(['SENEGAL', 'FRANCE', 'COTEDIVOIRE']);

// "SEN EAU - Centre de Hann - Route du Front de Terre 4945 Dakar - SENEGAL"
// -> "Centre de Hann - Route du Front de Terre 4945 Dakar". On retire
// uniquement le préfixe raison sociale (si reconnaissable) et le suffixe
// pays -- pas d'extraction de ville, trop de variantes de ponctuation
// observées pour être fiable.
export function nettoyerSiteArtis(raw: unknown, clientNom?: string): string {
  const brut = normaliserTexte(raw);
  if (!brut) return brut;
  const parts = brut.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return brut;

  if (clientNom) {
    const cible = normaliserPourComparaison(clientNom);
    const premier = normaliserPourComparaison(parts[0]);
    if (cible && premier && (cible.includes(premier) || premier.includes(cible))) {
      parts.shift();
    }
  }
  if (parts.length > 1 && PAYS_CONNUS.has(normaliserPourComparaison(parts[parts.length - 1]))) {
    parts.pop();
  }
  return parts.join(' - ') || brut;
}

function headerIndex(headers: string[]): (nom: string) => number {
  return (nom: string) => headers.indexOf(nom);
}

function firstSheetRows(wb: XLSX.WorkBook): unknown[][] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
}

export function detectArtisFileType(wb: XLSX.WorkBook): ArtisFileType {
  const rows = firstSheetRows(wb);
  const headers = new Set((rows[0] ?? []).map((h) => normaliserTexte(h)));
  if (headers.has('DIT no interne') && headers.has('DIT Etat')) return 'interventions';
  if (headers.has('Identifiant fabricant') && headers.has('Libellé') && headers.has('Site')) return 'biens';
  if (headers.has('Origine') && headers.has('Code art.') && headers.has('Qté livrée')) return 'etatvente';
  return 'inconnu';
}

export function parseBiensArtis(wb: XLSX.WorkBook, clientNom?: string): ArtisEquipementRow[] {
  const rows = firstSheetRows(wb);
  if (rows.length < 2) return [];
  const headers = (rows[0] ?? []).map((h) => normaliserTexte(h));
  const idx = headerIndex(headers);
  const iIdent = idx('Identifiant fabricant');
  const iLibelle = idx('Libellé');
  const iSite = idx('Site');
  if (iIdent < 0 || iLibelle < 0 || iSite < 0) return [];

  const out: ArtisEquipementRow[] = [];
  const vus = new Set<string>();
  for (const row of rows.slice(1)) {
    const numeroSerie = normaliserTexte(row[iIdent]);
    if (!numeroSerie || vus.has(numeroSerie)) continue;
    vus.add(numeroSerie);
    out.push({
      numeroSerie,
      modele: normaliserTexte(row[iLibelle]) || 'Modèle inconnu',
      site: nettoyerSiteArtis(row[iSite], clientNom) || 'Site inconnu',
    });
  }
  return out;
}

export function parseInterventionsArtis(wb: XLSX.WorkBook): ArtisInterventionRow[] {
  const rows = firstSheetRows(wb);
  if (rows.length < 2) return [];
  const headers = (rows[0] ?? []).map((h) => normaliserTexte(h));
  const idx = headerIndex(headers);
  const iRef = idx('DIT no interne');
  const iDateDecl = idx('DIT Date/Heure');
  const iEtat = idx('DIT Etat');
  const iSite = idx('IT Adresse 1');
  const iNumSerie = idx('IT Id fabricant du bien');
  const iNature = idx('DIT Nature');
  const iDebut = idx('IT D/H début');
  const iFin = idx('IT D/H fin');
  const iPriorite = idx('IT Libellé de la priorité');
  if (iRef < 0 || iDateDecl < 0) return [];

  const out: ArtisInterventionRow[] = [];
  for (const row of rows.slice(1)) {
    const ref = normaliserTexte(row[iRef]);
    const dateDeclaration = row[iDateDecl];
    if (!ref || !(dateDeclaration instanceof Date)) continue;
    const etat = normaliserTexte(row[iEtat]);
    const nature = normaliserTexte(row[iNature]);
    const priorite = normaliserTexte(row[iPriorite]);
    const debut = row[iDebut];
    const fin = row[iFin];
    const numeroSerieEquipement = normaliserTexte(row[iNumSerie]);
    out.push({
      referenceExterne: ref,
      site: normaliserTexte(row[iSite]) || 'Site inconnu',
      type: /pr[ée]ventive/i.test(nature) ? 'preventive' : 'curative',
      urgence: /urgent/i.test(priorite) ? 'urgente' : 'standard',
      dateDeclaration,
      datePriseEnCharge: debut instanceof Date ? debut : null,
      dateCloture: etat === 'Clôturée' && fin instanceof Date ? fin : null,
      numeroSerieEquipement: numeroSerieEquipement || null,
    });
  }
  return out;
}

export interface ArtisEtatVenteResult {
  consommables: ArtisConsommableRow[];
  volumetrie: ArtisVolumetriePeriode[];
}

// Les deux exports "ResultatEtatVente" partagent la même entête -- ils ne se
// distinguent que par le contenu de la colonne Origine (Livraison vs SSC).
// On les traite donc de façon unifiée en filtrant ligne à ligne sur cette
// colonne plutôt que sur le fichier d'origine, ce qui rend l'import robuste
// même si un futur export mélange les deux.
export function parseEtatVenteArtis(wb: XLSX.WorkBook): ArtisEtatVenteResult {
  const rows = firstSheetRows(wb);
  if (rows.length < 2) return { consommables: [], volumetrie: [] };
  const headers = (rows[0] ?? []).map((h) => normaliserTexte(h));
  const idx = headerIndex(headers);
  const iOrigine = idx('Origine');
  const iDateLivraison = idx('Date livraison');
  const iBL = idx('N° BL');
  const iMoisFacture = idx('Mois-année facture');
  const iCodeArt = idx('Code art.');
  const iDesignation = idx('Désignation');
  const iQteLivree = idx('Qté livrée');
  const iQteFacturee = idx('Qté facturée');
  if (iOrigine < 0 || iCodeArt < 0) return { consommables: [], volumetrie: [] };

  // Une même paire (N° BL, Code art.) peut apparaître deux fois sur le même
  // bordereau (deux machines de destination différentes livrées par la même
  // ligne d'article) -- comme LivraisonConsommable ne suit pas la machine de
  // destination, on agrège les quantités par referenceExterne plutôt que de
  // silencieusement perdre la deuxième ligne au moment de l'upsert.
  const consommablesParReference = new Map<string, ArtisConsommableRow>();
  const volumetrieParPeriode = new Map<string, { copiesNB: number; copiesCouleur: number }>();

  for (const row of rows.slice(1)) {
    const origine = normaliserTexte(row[iOrigine]);
    const codeArt = normaliserTexte(row[iCodeArt]);

    if (origine === 'Livraison') {
      const date = row[iDateLivraison];
      if (!(date instanceof Date)) continue;
      const quantite = Number(row[iQteLivree]) || 0;
      if (quantite <= 0) continue;
      const bl = normaliserTexte(row[iBL]);
      const referenceExterne = `${bl}|${codeArt}`;
      const existante = consommablesParReference.get(referenceExterne);
      if (existante) existante.quantite += quantite;
      else {
        consommablesParReference.set(referenceExterne, {
          referenceExterne,
          date,
          reference: normaliserTexte(row[iDesignation]) || codeArt,
          quantite,
        });
      }
    } else if (origine === 'SSC') {
      if (codeArt !== 'RCN' && codeArt !== 'RCC') continue; // LOCI = location interne, ignoré
      const moisDate = row[iMoisFacture];
      if (!(moisDate instanceof Date)) continue;
      const periode = `${moisDate.getUTCFullYear()}-${String(moisDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const quantite = Number(row[iQteFacturee]) || 0;
      const acc = volumetrieParPeriode.get(periode) ?? { copiesNB: 0, copiesCouleur: 0 };
      if (codeArt === 'RCN') acc.copiesNB += quantite;
      else acc.copiesCouleur += quantite;
      volumetrieParPeriode.set(periode, acc);
    }
  }

  const consommables = Array.from(consommablesParReference.values());
  const volumetrie = Array.from(volumetrieParPeriode.entries()).map(([periode, v]) => ({ periode, ...v }));
  return { consommables, volumetrie };
}
