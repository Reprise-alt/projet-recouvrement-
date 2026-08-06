import { ScoresAxes } from '../api/types';
import { toneColor } from '../lib/operationsConstants';

// Jauge à 4 barres (cahier §6, écran Portefeuille) -- chaque axe coloré et
// dimensionné selon son propre score, dans l'ordre Échanges/Climat/
// Problèmes/Engagements, pour voir OÙ un compte se dégrade, pas seulement
// QU'IL se dégrade.
const AXES: { key: keyof ScoresAxes; label: string }[] = [
  { key: 'contact', label: 'Échanges' },
  { key: 'climat', label: 'Climat' },
  { key: 'problemes', label: 'Problèmes' },
  { key: 'engagements', label: 'Engagements' },
];

function toneOf(score: number): 'success' | 'amber' | 'danger' {
  return score >= 70 ? 'success' : score >= 45 ? 'amber' : 'danger';
}

export function ScoreGauge({ scores, size = 'sm' }: { scores: ScoresAxes; size?: 'sm' | 'lg' }) {
  const barWidth = size === 'lg' ? 10 : 6;
  const height = size === 'lg' ? 40 : 24;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }} title={AXES.map((a) => `${a.label} : ${Math.round(scores[a.key])}`).join(' · ')}>
      {AXES.map((a) => {
        const v = Math.round(scores[a.key]);
        return (
          <div
            key={a.key}
            style={{
              width: barWidth,
              height: `${Math.max(6, v)}%`,
              minHeight: 3,
              borderRadius: 2,
              background: toneColor(toneOf(v)),
              alignSelf: 'flex-end',
            }}
          />
        );
      })}
    </div>
  );
}
