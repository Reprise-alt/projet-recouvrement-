// Petit jeu d'icônes trait (style Feather) pour la page vitrine publique —
// en SVG inline plutôt qu'une dépendance supplémentaire (react-icons n'est
// utilisé nulle part ailleurs dans le frontend).
type IconName =
  | 'fileText'
  | 'alertTriangle'
  | 'clock'
  | 'layers'
  | 'mail'
  | 'barChart'
  | 'users'
  | 'shield'
  | 'creditCard'
  | 'globe'
  | 'refresh'
  | 'link'
  | 'checkCircle'
  | 'rocket'
  | 'target';

const PATHS: Record<IconName, JSX.Element> = {
  fileText: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </>
  ),
  alertTriangle: (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </>
  ),
  barChart: (
    <>
      <path d="M4 19h16" />
      <path d="M8 19V9M13 19V5M18 19v-7" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  shield: (
    <path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3Z" />
  ),
  creditCard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 2v6h-6M3 22v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m8.5 12.5 2.5 2.5 5-5" />
    </>
  ),
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.8-.8.8-2.2 0-3a2.1 2.1 0 0 0-3 0Z" />
      <path d="M12 15l-3-3a22 22 0 0 1 8-9c2-.5 4-.5 5 .5s1 3 .5 5a22 22 0 0 1-9 8Z" />
      <path d="M9 12c-2 0-4 1-5 4M12 15c0 2-1 4-4 5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}
