import { BALANCE, type PlugRefusal, formatGameTime } from '@allo-central/shared';
import { Application, Container } from 'pixi.js';
import { connect } from '../net.ts';
import { CordsView } from './cords.ts';
import { PanelView } from './panel.ts';

const HUD_HEIGHT = 64;

const REFUSALS: Record<PlugRefusal, string> = {
  jackBusy: 'Cette prise est déjà occupée.',
  clientToArchivist: "Impossible : un client ne peut pas être relié à l'étage.",
  unknownLine: 'Cette prise n’existe pas.',
  unknownPair: 'Ce cordon n’existe pas.',
};

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

  const board = new Container();
  const panel = new PanelView();
  const cords = new CordsView(panel, {
    plug: (pair, end, line) => connection.send({ type: 'plug', pair, end, line }),
    unplug: (pair, end) => connection.send({ type: 'unplug', pair, end }),
  });
  board.addChild(panel.container, cords.container, panel.labels);
  app.stage.addChild(board);

  const layout = () => {
    const scale = Math.min(
      (app.screen.width - 32) / panel.width,
      (app.screen.height - HUD_HEIGHT - 32) / cords.height,
      1.4,
    );
    board.scale.set(scale);
    board.position.set(
      (app.screen.width - panel.width * scale) / 2,
      HUD_HEIGHT + (app.screen.height - HUD_HEIGHT - cords.height * scale) / 2,
    );
  };
  app.renderer.on('resize', layout);
  layout();
  app.ticker.add(() => panel.animate(performance.now()));

  let dayStatus = '';
  let notice: ReturnType<typeof setTimeout> | undefined;
  const flash = (text: string) => {
    status.textContent = text;
    clearTimeout(notice);
    notice = setTimeout(() => (status.textContent = dayStatus), 2_500);
  };

  const connection = connect({
    onMessage(message) {
      switch (message.type) {
        case 'welcome':
          status.textContent = 'Le central vous attend.';
          start.disabled = false;
          break;
        case 'dayStarted':
          dayStatus = `${message.dayName} · ville n° ${message.seed}`;
          status.textContent = dayStatus;
          start.textContent = 'Recommencer la journée';
          break;
        case 'operatorView':
          panel.update(message.view);
          cords.update(message.view.pairs);
          clock.textContent = formatGameTime(message.view.elapsedMs);
          break;
        case 'plugRefused':
          flash(REFUSALS[message.reason]);
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
