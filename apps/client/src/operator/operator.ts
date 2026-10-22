import { BALANCE, formatGameTime } from '@allo-central/shared';
import { Application } from 'pixi.js';
import { connect } from '../net.ts';
import { PanelView } from './panel.ts';

const HUD_HEIGHT = 64;

/** L'écran du standardiste. En solo pour l'instant : on prend son service sur une journée. */
export async function mountOperator(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const daySelect = document.createElement('select');
  daySelect.id = 'day';
  BALANCE.week.forEach((day, i) => daySelect.add(new Option(day.name, String(i))));
  daySelect.value = params.get('day') ?? '1';

  const hud = document.createElement('header');
  hud.className = 'hud';
  const clock = Object.assign(document.createElement('output'), { className: 'clock' });
  clock.textContent = '9 h 00';
  const status = Object.assign(document.createElement('p'), { className: 'status' });
  status.setAttribute('role', 'status');
  status.textContent = 'Connexion au central…';
  const start = Object.assign(document.createElement('button'), { type: 'button' });
  start.textContent = 'Prendre son service';
  start.disabled = true;
  const label = Object.assign(document.createElement('label'), { htmlFor: 'day' });
  label.textContent = 'Journée';
  hud.append(clock, label, daySelect, start, status);

  const app = new Application();
  await app.init({ resizeTo: window, background: '#17110d', antialias: true });
  root.replaceChildren(hud, app.canvas);

  const panel = new PanelView();
  app.stage.addChild(panel.container);
  const layout = () => {
    const scale = Math.min(
      (app.screen.width - 32) / panel.width,
      (app.screen.height - HUD_HEIGHT - 32) / panel.height,
      1.4,
    );
    panel.container.scale.set(scale);
    panel.container.position.set(
      (app.screen.width - panel.width * scale) / 2,
      HUD_HEIGHT + (app.screen.height - HUD_HEIGHT - panel.height * scale) / 2,
    );
  };
  app.renderer.on('resize', layout);
  layout();
  app.ticker.add(() => panel.animate(performance.now()));

  const connection = connect({
    onMessage(message) {
      switch (message.type) {
        case 'welcome':
          status.textContent = 'Le central vous attend.';
          start.disabled = false;
          break;
        case 'dayStarted':
          status.textContent = `${message.dayName} · ville n° ${message.seed}`;
          start.textContent = 'Recommencer la journée';
          break;
        case 'operatorView':
          panel.update(message.view);
          clock.textContent = formatGameTime(message.view.elapsedMs);
          break;
        case 'dayEnded':
          status.textContent = 'Fin de journée : 18 h, le central ferme.';
          start.textContent = 'Reprendre son service';
          break;
      }
    },
    onClose() {
      status.textContent = 'Déconnecté du central.';
      start.disabled = true;
    },
  });

  start.addEventListener('click', () => {
    const seed = Number.parseInt(params.get('seed') ?? '', 10);
    connection.send({
      type: 'startDay',
      seed: Number.isSafeInteger(seed) ? seed : Math.floor(Math.random() * 1_000_000),
      dayIndex: Number(daySelect.value),
    });
  });
}
