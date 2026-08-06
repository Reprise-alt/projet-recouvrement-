// Mini-courbe de tendance du score (colonne "Tendance" du portefeuille) --
// simple polyline SVG, pas de librairie de graphe pour un si petit besoin.
export function Sparkline({ values, width = 90, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <div style={{ width, height, display: 'flex', alignItems: 'center', color: 'var(--ink-soft)', fontSize: 11 }}>—</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trend = values[values.length - 1] - values[0];
  const color = trend > 2 ? 'var(--success)' : trend < -2 ? 'var(--danger)' : 'var(--ink-soft)';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
