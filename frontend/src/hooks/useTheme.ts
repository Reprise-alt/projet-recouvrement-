import { useLayoutEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'recouvrement:theme';

function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Appliqué via un attribut sur <html> plutôt qu'une classe locale : les
// variables CSS du thème doivent être visibles de tout l'arbre (modales,
// drawers en portail, etc.), pas seulement du sous-arbre de l'app.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  return { theme, toggle };
}
