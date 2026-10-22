/**
 * Le bandeau peut passer sur deux lignes (fenêtre étroite, mode développeur) : on suit sa
 * hauteur réelle, publiée dans `--hud-height` pour la feuille de style, et transmise à qui
 * doit placer quelque chose dessous.
 */
export function trackHudHeight(hud: HTMLElement, onChange: (height: number) => void = () => {}) {
  const publish = () => {
    const height = hud.offsetHeight;
    document.documentElement.style.setProperty('--hud-height', `${height}px`);
    onChange(height);
  };
  new ResizeObserver(publish).observe(hud);
  publish();
}
