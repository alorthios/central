/**
 * Le thème graphique, choisi par `?theme=vintage` : le rendu « vintage réaliste » (#53) se
 * compare ainsi au rendu actuel, qui reste celui par défaut.
 */
export type ThemeName = 'flat' | 'vintage';

export const theme: ThemeName =
  new URLSearchParams(location.search).get('theme') === 'vintage' ? 'vintage' : 'flat';

/**
 * Les feuilles de style suivent le thème via `:root[data-theme]`. Celle du thème vintage
 * n'est chargée que s'il est demandé.
 */
export function applyTheme(): void {
  document.documentElement.dataset.theme = theme;
  if (theme === 'vintage') void import('./theme-vintage.css');
}
