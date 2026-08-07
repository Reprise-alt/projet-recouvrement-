import pptxgen from 'pptxgenjs';
import { SlaStats } from './parcImpression';

// Palette et typographie reprises telles quelles du gabarit COPIL SEN'EAU/SORAM
// fourni par la direction des opérations (thème Material green sur fond
// charcoal) -- on ne réinvente pas une identité visuelle, on réutilise celle
// déjà présentée et validée par les clients.
const INK = '263238';
const GREEN = '2E7D32';
const GREEN_MID = '4CAF50';
const GREEN_LIGHT = '81C784';
const SLATE = '546E7A';
const CARD_BG = 'ECEFF1';
const LINE = 'DEE2E6';
const TINT = 'F1F8E9';
const WHITE = 'FFFFFF';

const FONT_TITLE = 'Calibri Light';
const FONT_BODY = 'Calibri';

const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.4;

export interface CopilKpiTile {
  label: string;
  value: string;
  sub?: string;
  tone?: 'success' | 'amber' | 'danger';
}

export interface CopilRapportData {
  clientNom: string;
  entiteLabel: string;
  periodeLabel: string;
  dateGenerationLabel: string;
  prochainCopilLabel: string | null;
  contact: { nom: string | null; email: string | null; tel: string | null };

  equipementsActifs: number;
  equipementsIntrouvables: number;
  parModele: { modele: string; qte: number }[];

  interventionsTotal: number;
  interventionsPreventives: number;
  sla: SlaStats;
  parSite: { site: string; clotures: number; enCours: number; total: number }[];
  parMoisInterventions: { mois: string; total: number }[];
  parType: { type: string; total: number }[];

  volumetriePeriodes: { periodeLabel: string; copiesNB: number; copiesCouleur: number }[];
  copiesNBTotal: number;
  copiesCouleurTotal: number;

  consommablesLivres: number;
  referencesDifferentes: number;
  parReference: { reference: string; qte: number }[];
  parMoisConsommables: { mois: string; nbLignes: number }[];

  actions: { priorite: 'p1' | 'p2' | 'p3'; action: string; responsable: string | null; echeance: string | null; statut: string }[];

  alertesVolumetrieMensuelle: { numeroSerie: string; modele: string; site: string; periodeLabel: string; total: number }[];
  alertesCompteurTotal: { numeroSerie: string; modele: string; site: string; total: number }[];
  alertesInterventionsFrequentes: { numeroSerie: string; modele: string; site: string; total: number }[];
  sitesTopInterventions: { site: string; total: number }[];
}

// Les vraies désignations ARTIS (modèles, sites) dépassent largement ce
// qu'une colonne de tableau peut afficher sur une seule ligne (jusqu'à 75
// caractères constatés) -- tronquer plutôt que de laisser le texte déborder
// de sa cellule et gonfler la hauteur de ligne au-delà de ce que la diapo
// peut contenir.
function tronquer(s: string, max = 42): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function toneColor(tone: CopilKpiTile['tone']): string {
  if (tone === 'danger') return 'C62828';
  if (tone === 'amber') return 'F57F17';
  if (tone === 'success') return GREEN;
  return INK;
}

function footer(slide: pptxgen.Slide, data: CopilRapportData, page: number) {
  slide.addText(`COPIL ${data.entiteLabel} — ${data.clientNom}  |  ${data.dateGenerationLabel}  |  Confidentiel`, {
    x: MARGIN,
    y: SLIDE_H - 0.3,
    w: SLIDE_W - MARGIN * 2 - 0.6,
    h: 0.25,
    fontFace: FONT_BODY,
    fontSize: 7.5,
    color: SLATE,
  });
  slide.addText(String(page), {
    x: SLIDE_W - MARGIN - 0.6,
    y: SLIDE_H - 0.3,
    w: 0.6,
    h: 0.25,
    align: 'right',
    fontFace: FONT_BODY,
    fontSize: 7.5,
    color: SLATE,
  });
}

function contentHeader(slide: pptxgen.Slide, sectionLabel: string, title: string, data: CopilRapportData, badge?: string) {
  slide.addShape('rect', { x: 0, y: 0, w: 0.12, h: SLIDE_H, fill: { color: GREEN } });
  const titre = sectionLabel ? `${sectionLabel}. ${title.toUpperCase()}` : title.toUpperCase();
  slide.addText(titre, {
    x: MARGIN,
    y: 0.2,
    w: SLIDE_W - MARGIN * 2 - 1.8,
    h: 0.5,
    fontFace: FONT_TITLE,
    fontSize: titre.length > 42 ? 13.5 : 16,
    bold: true,
    color: INK,
    valign: 'top',
    fit: 'shrink',
  });
  slide.addText(`${data.entiteLabel} • ${data.clientNom}`, {
    x: SLIDE_W - MARGIN - 2.2,
    y: 0.27,
    w: 2.2,
    h: 0.3,
    align: 'right',
    fontFace: FONT_BODY,
    fontSize: 8.5,
    color: SLATE,
  });
  if (badge) {
    slide.addShape('roundRect', { x: SLIDE_W - MARGIN - 1.6, y: 0.62, w: 1.6, h: 0.26, rectRadius: 0.05, fill: { color: GREEN }, line: { type: 'none' } });
    slide.addText(badge.toUpperCase(), {
      x: SLIDE_W - MARGIN - 1.6,
      y: 0.62,
      w: 1.6,
      h: 0.26,
      align: 'center',
      valign: 'middle',
      fontFace: FONT_BODY,
      fontSize: 7.5,
      bold: true,
      color: WHITE,
      charSpacing: 1,
    });
  }
  slide.addShape('line', { x: MARGIN, y: 0.95, w: SLIDE_W - MARGIN * 2, h: 0, line: { color: LINE, width: 0.75 } });
}

function kpiTileRow(slide: pptxgen.Slide, tiles: CopilKpiTile[], y: number, h = 1.0) {
  const gap = 0.18;
  const w = (SLIDE_W - MARGIN * 2 - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((tile, i) => {
    const x = MARGIN + i * (w + gap);
    slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.06, fill: { color: CARD_BG }, line: { type: 'none' } });
    slide.addText(tile.label.toUpperCase(), {
      x: x + 0.12,
      y: y + 0.1,
      w: w - 0.24,
      h: 0.3,
      fontFace: FONT_BODY,
      fontSize: 7.5,
      color: SLATE,
      charSpacing: 0.5,
    });
    // Une valeur numérique courte (KPI classique) reste grande ; un libellé
    // texte plus long (ex. nom d'une référence article) réduit sa taille et
    // passe sur plusieurs lignes plutôt que de déborder de la tuile.
    const longue = tile.value.length > 10;
    slide.addText(tile.value, {
      x: x + 0.12,
      y: y + 0.36,
      w: w - 0.24,
      h: h - (tile.sub ? 0.62 : 0.42),
      fontFace: longue ? FONT_BODY : FONT_TITLE,
      fontSize: longue ? 11 : 22,
      bold: true,
      color: toneColor(tile.tone),
      valign: 'top',
      wrap: true,
      fit: 'shrink',
    });
    if (tile.sub) {
      slide.addText(tile.sub, {
        x: x + 0.12,
        y: y + h - 0.28,
        w: w - 0.24,
        h: 0.22,
        fontFace: FONT_BODY,
        fontSize: 7.5,
        color: SLATE,
      });
    }
  });
}

function dataTable(
  slide: pptxgen.Slide,
  headers: string[],
  rows: (string | number)[][],
  opts: { x: number; y: number; w: number; h: number; colW?: number[]; align?: ('left' | 'right')[] }
) {
  const align = opts.align ?? headers.map((_, ci) => (ci === 0 ? 'left' : 'right'));
  const headerRow: pptxgen.TableRow = headers.map((h, ci) => ({
    text: h.toUpperCase(),
    options: { fill: { color: INK }, color: WHITE, bold: true, fontSize: 8.5, fontFace: FONT_BODY, align: align[ci] ?? 'left' },
  }));
  const bodyRows: pptxgen.TableRow[] = rows.map((row, i) =>
    row.map((cell, ci) => ({
      text: String(cell),
      options: {
        fill: { color: i % 2 === 0 ? WHITE : TINT },
        color: INK,
        fontSize: 9,
        fontFace: FONT_BODY,
        align: align[ci] ?? 'left',
      },
    }))
  );
  // Une hauteur de ligne proportionnée au nombre de lignes réelles évite
  // qu'un tableau court (3-4 lignes) ne s'étire artificiellement pour
  // remplir tout l'espace réservé -- capée à opts.h, l'espace disponible.
  const rowH = Math.min(0.42, opts.h / (rows.length + 1));
  const h = Math.min(opts.h, rowH * (rows.length + 1));
  slide.addTable([headerRow, ...bodyRows], {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h,
    colW: opts.colW,
    border: { type: 'solid', color: LINE, pt: 0.5 },
    autoPage: false,
  });
}

function sectionDivider(pres: pptxgen, data: CopilRapportData, numero: string, titre: string, sousTitre: string) {
  const slide = pres.addSlide();
  slide.background = { color: INK };
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: SLIDE_H, fill: { color: GREEN } });
  slide.addText(numero, { x: 0.7, y: 1.05, w: 3, h: 1.3, fontFace: FONT_TITLE, fontSize: 60, bold: true, color: GREEN_MID });
  slide.addText(titre.toUpperCase(), { x: 0.72, y: 2.35, w: SLIDE_W - 1.4, h: 0.55, fontFace: FONT_TITLE, fontSize: 24, bold: true, color: WHITE });
  slide.addText(sousTitre, { x: 0.72, y: 2.92, w: SLIDE_W - 1.4, h: 0.4, fontFace: FONT_BODY, fontSize: 12, color: GREEN_LIGHT });
  slide.addText(`${data.entiteLabel} • ${data.clientNom}`, { x: 0.72, y: SLIDE_H - 0.5, w: 6, h: 0.3, fontFace: FONT_BODY, fontSize: 9, color: GREEN_LIGHT });
  return slide;
}

export async function generateCopilRapportPptx(data: CopilRapportData): Promise<Buffer> {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = data.entiteLabel;
  pres.title = `COPIL ${data.clientNom} — ${data.periodeLabel}`;

  let page = 0;

  /* ---------- 1. Titre ---------- */
  {
    const slide = pres.addSlide();
    slide.background = { color: INK };
    slide.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 0.14, fill: { color: GREEN } });
    slide.addShape('rect', { x: 0, y: SLIDE_H - 0.14, w: SLIDE_W, h: 0.14, fill: { color: GREEN } });
    slide.addText(data.entiteLabel, { x: 0.7, y: 1.1, w: 6, h: 0.4, fontFace: FONT_BODY, fontSize: 14, color: GREEN_LIGHT, charSpacing: 1 });
    slide.addText('COMITÉ DE PILOTAGE', { x: 0.7, y: 1.55, w: 8, h: 0.6, fontFace: FONT_TITLE, fontSize: 30, bold: true, color: WHITE });
    slide.addText(`Gestion du Parc d'impression – ${data.clientNom}`, { x: 0.7, y: 2.2, w: 8, h: 0.45, fontFace: FONT_BODY, fontSize: 15, color: 'CFD8DC' });
    slide.addShape('line', { x: 0.7, y: 2.85, w: 3.2, h: 0, line: { color: GREEN_MID, width: 1.5 } });
    slide.addText(`${data.dateGenerationLabel}  ·  Période : ${data.periodeLabel}`, {
      x: 0.7,
      y: 3.05,
      w: 8,
      h: 0.35,
      fontFace: FONT_BODY,
      fontSize: 11,
      color: 'B0BEC5',
    });
    slide.addText('Confidentiel — document interne SORAM Afrique', {
      x: 0.7,
      y: SLIDE_H - 0.55,
      w: 6,
      h: 0.3,
      fontFace: FONT_BODY,
      fontSize: 9,
      color: SLATE,
    });
    page++;
  }

  /* ---------- 2. Synthèse exécutive ---------- */
  {
    const slide = pres.addSlide();
    contentHeader(slide, '', 'Synthèse exécutive', data, 'Vue d\'ensemble');
    slide.addText(`Tableau de bord — ${data.periodeLabel}`, { x: MARGIN, y: 1.05, w: 6, h: 0.3, fontFace: FONT_BODY, fontSize: 9, color: SLATE });

    kpiTileRow(
      slide,
      [
        { label: 'Imprimantes actives', value: String(data.equipementsActifs) },
        { label: 'Interventions', value: String(data.interventionsTotal), sub: `dont ${data.interventionsPreventives} préventives` },
        { label: 'Taux de clôture SLA', value: `${data.sla.tauxCloture}%`, tone: data.sla.tauxCloture >= 90 ? 'success' : data.sla.tauxCloture >= 75 ? 'amber' : 'danger' },
        { label: 'Consommables livrés', value: String(data.consommablesLivres) },
      ],
      1.45
    );
    kpiTileRow(
      slide,
      [
        { label: 'Copies N&B', value: data.copiesNBTotal.toLocaleString('fr-FR') },
        { label: 'Copies couleur', value: data.copiesCouleurTotal.toLocaleString('fr-FR') },
        { label: 'Tickets ouverts', value: String(data.sla.ouverts), tone: data.sla.ouverts > 0 ? 'amber' : 'success' },
      ],
      2.65
    );
    footer(slide, data, ++page);
  }

  /* ---------- 01. Inventaire du parc ---------- */
  sectionDivider(pres, data, '01', "Inventaire du parc", `${data.equipementsActifs} équipement(s) actif(s) suivis`);
  page++;
  {
    const slide = pres.addSlide();
    contentHeader(slide, '1', `Inventaire du parc — ${data.equipementsActifs} équipements`, data);
    const rows = data.parModele.map((r) => [tronquer(r.modele, 44), r.qte]);
    const totalRow: (string | number)[] = ['TOTAL', data.parModele.reduce((s, r) => s + r.qte, 0)];
    dataTable(slide, ['Modèle', 'Qté'], [...rows, totalRow], { x: MARGIN, y: 1.15, w: 5.4, h: 3.7, colW: [4, 1.4] });
    if (data.parModele.length > 0) {
      slide.addChart(
        pres.ChartType.doughnut,
        [{ name: 'Équipements', labels: data.parModele.map((r) => tronquer(r.modele, 22)), values: data.parModele.map((r) => r.qte) }],
        {
          x: 5.95,
          y: 1.15,
          w: 3.65,
          h: 3.4,
          showLegend: true,
          legendPos: 'b',
          legendFontSize: 8,
          legendColor: INK,
          chartColors: [GREEN, GREEN_MID, GREEN_LIGHT, 'A5D6A7', 'C8E6C9', SLATE, '90A4AE', 'CFD8DC'],
          dataLabelColor: WHITE,
          showValue: false,
        }
      );
    }
    footer(slide, data, ++page);
  }

  /* ---------- 02. Suivi des interventions ---------- */
  sectionDivider(pres, data, '02', 'Suivi des interventions', `${data.interventionsTotal} ticket(s) — ${data.sla.tauxCloture}% de taux de clôture`);
  page++;
  {
    const slide = pres.addSlide();
    contentHeader(slide, '2', 'Suivi des interventions par site', data);
    const rows = data.parSite.map((r) => [tronquer(r.site, 26), r.clotures, r.enCours, r.total]);
    const totaux = data.parSite.reduce((acc, r) => ({ clotures: acc.clotures + r.clotures, enCours: acc.enCours + r.enCours, total: acc.total + r.total }), {
      clotures: 0,
      enCours: 0,
      total: 0,
    });
    dataTable(slide, ['Site', 'Clôturées', 'En cours', 'Total'], [...rows, ['TOTAL', totaux.clotures, totaux.enCours, totaux.total]], {
      x: MARGIN,
      y: 1.15,
      w: 5.4,
      h: 3.7,
      colW: [2.6, 0.9, 0.9, 1],
    });
    if (data.parSite.length > 0) {
      const topSites = data.parSite.slice(0, 8);
      slide.addChart(
        pres.ChartType.bar,
        [{ name: 'Interventions', labels: topSites.map((r) => tronquer(r.site, 18)), values: topSites.map((r) => r.total) }],
        {
          x: 5.95,
          y: 1.15,
          w: 3.65,
          h: 3.7,
          barDir: 'bar',
          chartColors: [GREEN],
          showLegend: false,
          showValue: true,
          dataLabelColor: INK,
          dataLabelFontSize: 7,
          catAxisLabelFontSize: 7,
          valAxisLabelFontSize: 7,
          catAxisLabelColor: SLATE,
          valAxisLabelColor: SLATE,
          valGridLine: { color: LINE, size: 0.5 },
          catGridLine: { style: 'none' },
        }
      );
    }
    footer(slide, data, ++page);
  }
  {
    const slide = pres.addSlide();
    contentHeader(slide, '2', 'Bilan interventions — indicateurs clés', data);
    kpiTileRow(
      slide,
      [
        { label: 'Total interventions', value: String(data.sla.total) },
        { label: 'Clôturées', value: String(data.sla.clotures) },
        { label: 'Ouvertes', value: String(data.sla.ouverts), tone: data.sla.ouverts > 0 ? 'amber' : 'success' },
        { label: 'Taux de clôture', value: `${data.sla.tauxCloture}%`, tone: data.sla.tauxCloture >= 90 ? 'success' : 'amber' },
      ],
      1.15
    );
    if (data.parMoisInterventions.length > 0) {
      dataTable(
        slide,
        ['Mois', 'Nombre de tickets'],
        [...data.parMoisInterventions.map((r) => [r.mois, r.total]), ['TOTAL', data.parMoisInterventions.reduce((s, r) => s + r.total, 0)]],
        { x: MARGIN, y: 2.35, w: 4.4, h: 2.5, colW: [2.8, 1.6] }
      );
    }
    slide.addChart(
      pres.ChartType.bar,
      [{ name: 'Type', labels: data.parType.map((r) => r.type), values: data.parType.map((r) => r.total) }],
      {
        x: 5.1,
        y: 2.35,
        w: 4.5,
        h: 2.5,
        chartColors: [GREEN],
        showLegend: false,
        showValue: true,
        dataLabelColor: INK,
        dataLabelFontSize: 8,
        catAxisLabelFontSize: 8,
        valAxisLabelFontSize: 8,
        catAxisLabelColor: SLATE,
        valAxisLabelColor: SLATE,
        valGridLine: { color: LINE, size: 0.5 },
        catGridLine: { style: 'none' },
      }
    );
    slide.addText('Répartition par type d\'intervention', { x: 5.1, y: 2.05, w: 4.5, h: 0.25, fontFace: FONT_BODY, fontSize: 8.5, bold: true, color: SLATE });
    footer(slide, data, ++page);
  }

  /* ---------- 03. Volumétrie ---------- */
  sectionDivider(pres, data, '03', "Volumétrie d'impression", `${data.copiesNBTotal.toLocaleString('fr-FR')} copies N&B sur la période`);
  page++;
  {
    const slide = pres.addSlide();
    contentHeader(slide, '3', "Volumétrie d'impression", data);
    const rows = data.volumetriePeriodes.map((r) => [r.periodeLabel, r.copiesNB.toLocaleString('fr-FR'), r.copiesCouleur.toLocaleString('fr-FR')]);
    const totaux = ['TOTAL', data.copiesNBTotal.toLocaleString('fr-FR'), data.copiesCouleurTotal.toLocaleString('fr-FR')];
    dataTable(slide, ['Période', 'Copies N&B', 'Copies couleur'], [...rows, totaux], { x: MARGIN, y: 1.15, w: 4.6, h: 3.4, colW: [1.8, 1.4, 1.4] });
    if (data.volumetriePeriodes.length > 0) {
      slide.addChart(
        pres.ChartType.bar,
        [
          { name: 'N&B', labels: data.volumetriePeriodes.map((r) => r.periodeLabel), values: data.volumetriePeriodes.map((r) => r.copiesNB) },
          { name: 'Couleur', labels: data.volumetriePeriodes.map((r) => r.periodeLabel), values: data.volumetriePeriodes.map((r) => r.copiesCouleur) },
        ],
        {
          x: 5.35,
          y: 1.15,
          w: 4.25,
          h: 3.4,
          barDir: 'col',
          chartColors: [GREEN, GREEN_LIGHT],
          showLegend: true,
          legendPos: 'b',
          legendFontSize: 8,
          legendColor: INK,
          showValue: false,
          catAxisLabelFontSize: 8,
          valAxisLabelFontSize: 8,
          catAxisLabelColor: SLATE,
          valAxisLabelColor: SLATE,
          valGridLine: { color: LINE, size: 0.5 },
          catGridLine: { style: 'none' },
        }
      );
    }
    footer(slide, data, ++page);
  }

  /* ---------- 04. Consommables ---------- */
  sectionDivider(pres, data, '04', 'Consommables & livraisons', `${data.consommablesLivres} unité(s) livrée(s) — ${data.referencesDifferentes} référence(s)`);
  page++;
  {
    const slide = pres.addSlide();
    contentHeader(slide, '4', 'Synthèse des consommables', data);
    kpiTileRow(
      slide,
      [
        { label: 'Total consommables livrés', value: String(data.consommablesLivres) },
        { label: 'Références différentes', value: String(data.referencesDifferentes) },
        { label: 'Référence la plus livrée', value: data.parReference[0]?.reference ?? '—', sub: data.parReference[0] ? `${data.parReference[0].qte} unité(s)` : undefined },
      ],
      1.15,
      1.15
    );
    dataTable(slide, ['Référence', 'Qté'], data.parReference.map((r) => [r.reference, r.qte]), { x: MARGIN, y: 2.55, w: SLIDE_W - MARGIN * 2, h: 2.3, colW: [7.2, 1.6] });
    footer(slide, data, ++page);
  }
  {
    const slide = pres.addSlide();
    contentHeader(slide, '4', 'Récapitulatif des livraisons', data);
    if (data.parMoisConsommables.length > 0) {
      kpiTileRow(
        slide,
        data.parMoisConsommables.slice(0, 4).map((r) => ({ label: r.mois, value: String(r.nbLignes) })),
        1.15
      );
      slide.addChart(
        pres.ChartType.pie,
        [{ name: 'Livraisons', labels: data.parMoisConsommables.map((r) => r.mois), values: data.parMoisConsommables.map((r) => r.nbLignes) }],
        {
          x: 2.3,
          y: 2.5,
          w: 5.4,
          h: 2.8,
          showLegend: true,
          legendPos: 'r',
          legendFontSize: 8,
          legendColor: INK,
          chartColors: [GREEN, GREEN_MID, GREEN_LIGHT, 'A5D6A7', 'C8E6C9', SLATE],
          showValue: true,
          dataLabelColor: WHITE,
          dataLabelFontSize: 8,
        }
      );
    } else {
      slide.addText('Aucune livraison enregistrée sur la période.', { x: MARGIN, y: 1.4, w: 6, h: 0.4, fontFace: FONT_BODY, fontSize: 11, color: SLATE });
    }
    footer(slide, data, ++page);
  }

  /* ---------- 05. SLA ---------- */
  sectionDivider(pres, data, '05', "Délais d'intervention — SLA", `Performance contractuelle · ${data.periodeLabel}`);
  page++;
  {
    const slide = pres.addSlide();
    contentHeader(slide, '5', 'Délais d\'intervention — performance SLA', data);
    const heures = (h: number | null) => (h == null ? '—' : `${Math.round(h)} h`);
    // Volontairement limité aux deux dates contractuelles du SLA (D :
    // déclaration, DF : prise en charge) -- ni le taux de clôture ni les
    // tickets ouverts n'entrent ici, ce sont des indicateurs de clôture
    // (déjà sur la diapo Synthèse), pas de délai de réponse.
    kpiTileRow(
      slide,
      [
        { label: 'Délai moyen — urgentes', value: heures(data.sla.delaiMoyenUrgenteHeures) },
        { label: 'Délai moyen — standard', value: heures(data.sla.delaiMoyenStandardHeures) },
        { label: 'Prise en charge mesurée', value: `${data.sla.priseEnChargeMesuree}/${data.sla.total}` },
      ],
      1.3,
      1.15
    );
    slide.addText(
      'Délai mesuré : déclaration du ticket (D) → prise en charge (DF) — délai de réponse uniquement, pas de résolution. Objectifs contractuels : 4h Dakar/Grand Dakar, 24 à 48h Régions.',
      { x: MARGIN, y: 2.75, w: SLIDE_W - MARGIN * 2, h: 0.6, fontFace: FONT_BODY, fontSize: 9.5, italic: true, color: SLATE }
    );
    footer(slide, data, ++page);
  }

  /* ---------- Alertes ---------- */
  {
    const slide = pres.addSlide();
    contentHeader(slide, '', 'Alertes', data);

    const topSitesLabel =
      data.sitesTopInterventions.length === 0
        ? 'Aucune donnée'
        : data.sitesTopInterventions.map((s) => `${tronquer(s.site, 24)} (${s.total})`).join(' · ');
    slide.addShape('roundRect', { x: MARGIN, y: 1.1, w: SLIDE_W - MARGIN * 2, h: 0.45, rectRadius: 0.05, fill: { color: TINT }, line: { type: 'none' } });
    slide.addText([{ text: 'SITE(S) AVEC LE PLUS D\'INTERVENTIONS  ', options: { bold: true, color: SLATE } }, { text: topSitesLabel, options: { color: INK } }], {
      x: MARGIN + 0.15,
      y: 1.1,
      w: SLIDE_W - MARGIN * 2 - 0.3,
      h: 0.45,
      valign: 'middle',
      fontFace: FONT_BODY,
      fontSize: 9.5,
    });

    const colW = (SLIDE_W - MARGIN * 2 - 0.3) / 3;
    const alerteColonne = (
      x: number,
      titre: string,
      lignes: string[],
      vide: string
    ) => {
      slide.addShape('rect', { x, y: 1.75, w: colW, h: 0.32, fill: { color: INK }, line: { type: 'none' } });
      slide.addText(titre.toUpperCase(), {
        x: x + 0.08,
        y: 1.75,
        w: colW - 0.16,
        h: 0.32,
        valign: 'middle',
        fontFace: FONT_BODY,
        fontSize: 7.5,
        bold: true,
        color: WHITE,
        fit: 'shrink',
      });
      if (lignes.length === 0) {
        slide.addText(vide, { x: x + 0.08, y: 2.15, w: colW - 0.16, h: 0.4, fontFace: FONT_BODY, fontSize: 8.5, italic: true, color: SLATE });
        return;
      }
      const affichees = lignes.slice(0, 7);
      const reste = lignes.length - affichees.length;
      slide.addText(
        affichees.map((l, i) => ({ text: l, options: { breakLine: i < affichees.length - 1 } })),
        {
          x: x + 0.08,
          y: 2.12,
          w: colW - 0.16,
          h: 2.9,
          fontFace: FONT_BODY,
          fontSize: 8,
          color: INK,
          valign: 'top',
          paraSpaceAfter: 5,
        }
      );
      if (reste > 0) {
        slide.addText(`+ ${reste} autre(s)`, { x: x + 0.08, y: 5.05, w: colW - 0.16, h: 0.2, fontFace: FONT_BODY, fontSize: 7.5, italic: true, color: SLATE });
      }
    };

    alerteColonne(
      MARGIN,
      '> 10 000 pages / mois',
      data.alertesVolumetrieMensuelle.map((a) => `${tronquer(a.modele, 20)} — ${tronquer(a.site, 16)} (${a.periodeLabel}) : ${a.total.toLocaleString('fr-FR')} p.`),
      'Aucune machine au-dessus du seuil.'
    );
    alerteColonne(
      MARGIN + colW + 0.15,
      '> 700 000 pages (compteur total)',
      data.alertesCompteurTotal.map((a) => `${tronquer(a.modele, 20)} — ${tronquer(a.site, 16)} : ${a.total.toLocaleString('fr-FR')} p.`),
      'Aucune machine au-dessus du seuil.'
    );
    alerteColonne(
      MARGIN + (colW + 0.15) * 2,
      '> 4 interventions / période',
      data.alertesInterventionsFrequentes.map((a) => `${tronquer(a.modele, 20)} — ${tronquer(a.site, 16)} : ${a.total} intervention(s)`),
      'Aucune machine au-dessus du seuil.'
    );

    footer(slide, data, ++page);
  }

  /* ---------- Plan d'action ---------- */
  {
    const slide = pres.addSlide();
    contentHeader(slide, '', `Plan d'action — prochaines étapes`, data);
    if (data.actions.length > 0) {
      const rows = data.actions.map((a) => [a.priorite.toUpperCase(), a.action, a.responsable ?? '—', a.echeance ?? '—', a.statut]);
      dataTable(slide, ['Priorité', 'Action', 'Responsable', 'Échéance', 'Statut'], rows, {
        x: MARGIN,
        y: 1.15,
        w: SLIDE_W - MARGIN * 2,
        h: 3.7,
        colW: [0.85, 3.55, 1.7, 1.1, 1],
        align: ['left', 'left', 'left', 'left', 'left'],
      });
    } else {
      slide.addText('Aucune action planifiée sur la période.', { x: MARGIN, y: 1.4, w: 6, h: 0.4, fontFace: FONT_BODY, fontSize: 11, color: SLATE });
    }
    footer(slide, data, ++page);
  }

  /* ---------- Clôture ---------- */
  {
    const slide = pres.addSlide();
    slide.background = { color: INK };
    slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: SLIDE_H, fill: { color: GREEN } });
    slide.addText('MERCI DE VOTRE CONFIANCE', { x: 0.72, y: 1.5, w: SLIDE_W - 1.4, h: 0.6, fontFace: FONT_TITLE, fontSize: 26, bold: true, color: WHITE });
    if (data.prochainCopilLabel) {
      slide.addText(`Prochain COPIL : ${data.prochainCopilLabel}`, { x: 0.72, y: 2.2, w: SLIDE_W - 1.4, h: 0.35, fontFace: FONT_BODY, fontSize: 12, color: GREEN_LIGHT });
    }
    const contactLines: string[] = [`Contact ${data.entiteLabel}`];
    if (data.contact.nom) contactLines.push(data.contact.nom);
    if (data.contact.tel) contactLines.push(data.contact.tel);
    if (data.contact.email) contactLines.push(data.contact.email);
    slide.addShape('roundRect', { x: 0.72, y: 3.0, w: 4.2, h: 0.25 + contactLines.length * 0.3, rectRadius: 0.06, fill: { color: '2F3D42' }, line: { type: 'none' } });
    contactLines.forEach((line, i) => {
      slide.addText(line, {
        x: 0.92,
        y: 3.15 + i * 0.3,
        w: 3.8,
        h: 0.3,
        fontFace: FONT_BODY,
        fontSize: i === 0 ? 9 : 11,
        bold: i === 0,
        color: i === 0 ? GREEN_LIGHT : WHITE,
      });
    });
    page++;
  }

  const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  return buffer;
}
