/**
 * Le thème graphique, choisi par `?theme=` :
 * - par défaut, aplats de couleur ;
 * - `vintage` : matières calculées, bois, bakélite, laiton (#53) ;
 * - `photo` : le thème vintage, ses grandes surfaces habillées de textures photographiques
 *   CC0 (bois, cuir, papier, liège ; #55).
 */
export type ThemeName = 'flat' | 'vintage';

const requested = new URLSearchParams(location.search).get('theme');

export const theme: ThemeName =
  requested === 'vintage' || requested === 'photo' ? 'vintage' : 'flat';

/** Les grandes surfaces du thème vintage prennent des textures photographiques. */
export const photoTextures = requested === 'photo';

/**
 * Les feuilles de style suivent le thème via `:root[data-theme]` et `:root[data-textures]`.
 * Celles des thèmes vintage et photo ne sont chargées que si on les demande.
 */
export function applyTheme(): void {
  document.documentElement.dataset.theme = theme;
  if (theme === 'vintage') void import('./theme-vintage.css');
  if (photoTextures) {
    document.documentElement.dataset.textures = 'photo';
    void import('./theme-photo.css');
  }
}
