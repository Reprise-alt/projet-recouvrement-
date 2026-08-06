// Revue trimestrielle du portefeuille non-VIP (SORAM/IRIS) -- objectif du
// dir des opérations : voir 100% du parc non-VIP en un trimestre, sans
// repasser deux fois par le même compte avant d'avoir fait le tour. Les VIP
// suivent leur propre cycle COPIL mensuel, hors de ce mécanisme.
//
// Le découpage est en semaines calendaires (lundi à lundi), pas en semaines
// ISO : l'arithmétique sur un numéro de semaine ISO casse au changement
// d'année (semaine 52/53 -> 1), alors que compter des lundis par différence
// de jours reste correct en toutes circonstances.

function lundiDeLaSemaine(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const jour = x.getDay(); // 0=dimanche .. 6=samedi
  const decalage = (jour === 0 ? -6 : 1) - jour;
  x.setDate(x.getDate() + decalage);
  return x;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

export interface TrimestreInfo {
  cle: string; // "2026-Q3"
  semaine: number; // 1-based, semaine calendaire en cours dans le trimestre
  totalSemaines: number;
  debut: Date;
}

export function trimestreInfo(d: Date = new Date()): TrimestreInfo {
  const q = Math.floor(d.getMonth() / 3);
  const debutTrimestre = new Date(d.getFullYear(), q * 3, 1);
  const finTrimestre = new Date(d.getFullYear(), q * 3 + 3, 0); // dernier jour du trimestre
  const lundiDebut = lundiDeLaSemaine(debutTrimestre);
  const lundiFin = lundiDeLaSemaine(finTrimestre);
  const totalSemaines = Math.round((lundiFin.getTime() - lundiDebut.getTime()) / (7 * JOUR_MS)) + 1;
  const lundiActuel = lundiDeLaSemaine(d);
  const semaineBrute = Math.round((lundiActuel.getTime() - lundiDebut.getTime()) / (7 * JOUR_MS)) + 1;
  const semaine = Math.min(totalSemaines, Math.max(1, semaineBrute));
  return { cle: `${d.getFullYear()}-Q${q + 1}`, semaine, totalSemaines, debut: debutTrimestre };
}

// Mélange Fisher-Yates -- juste pour que l'ordre de répartition ne suive pas
// l'ordre de création en base (sinon les plus vieux comptes tombent toujours
// dans les premières semaines).
export function melanger<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Répartit des ids non encore affectés sur les semaines restantes du
// trimestre (semaine courante -> fin), en tournant sur les semaines plutôt
// qu'en les remplissant une par une -- pour qu'un ajout en cours de
// trimestre (nouveau compte, VIP repassé standard) rejoigne un tirage
// équilibré plutôt que de tomber tout entier sur la semaine en cours.
export function repartir(ids: string[], info: TrimestreInfo): Map<string, number> {
  const semainesRestantes: number[] = [];
  for (let s = info.semaine; s <= info.totalSemaines; s++) semainesRestantes.push(s);
  const melanges = melanger(ids);
  const affectation = new Map<string, number>();
  melanges.forEach((id, i) => affectation.set(id, semainesRestantes[i % semainesRestantes.length]));
  return affectation;
}
