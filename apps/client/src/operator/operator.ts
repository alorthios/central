import {
  BALANCE,
  MAX_SPEED,
  type Hearing,
  type Notice,
  type OperatorView,
  type PlugRefusal,
  formatGameTime,
} from '@allo-central/shared';
import { Application, Container } from 'pixi.js';
import { connect } from '../net.ts';
import { CordsView } from './cords.ts';
import { PanelView } from './panel.ts';
import { showReport } from './report.ts';
import { sounds } from './sounds.ts';

/** Hauteur réservée en haut de l'écran : le bandeau et le casque. */
const HUD_HEIGHT = 112;

const UNREACHABLE = { busy: 'occupé', absent: 'absent' } as const;

function hearingText(hearing: Hearing): string {
  switch (hearing.kind) {
    case 'client':
      return `« ${hearing.lines.join(' … ')} »`;
    case 'ringback':
      return 'Ça sonne chez le correspondant…';
    case 'conversation':
      return 'Ils se parlent. Vous pouvez rabaisser la clé.';
    case 'informed':
      return `Vous prévenez le client (${UNREACHABLE[hearing.reason]}) : « Bon, je rappellerai. »`;
    case 'silence':
      return 'Silence sur la ligne.';
  }
}

const NOTICES: Record<Notice, string> = {
  busy: 'Tonalité d’occupation : levez la clé pour prévenir le client.',
  absent: 'Personne ne répond : levez la clé pour prévenir le client, ou sonnez encore.',
  wrongNumber: 'Le client proteste : ce n’est pas la bonne personne !',
};

function canAskWhichOne({ headset }: OperatorView): boolean {
  return headset.hearing.kind === 'client' && !headset.hearing.askedWhichOne;
}

function headsetText({ headset }: OperatorView): string {
  if (headset.pair === null) return 'Casque : levez une clé pour écouter une paire.';
  return `Casque, paire ${headset.pair + 1} : ${hearingText(headset.hearing)}`;
}

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
  const headset = Object.assign(document.createElement('div'), { className: 'headset' });
  const heard = document.createElement('p');
  heard.setAttribute('aria-live', 'polite');
  heard.textContent = 'Casque : levez une clé pour écouter une paire.';
  // « Lequel ? » (§6.5) : une précision du client, contre un peu de sa patience.
  const whichOne = Object.assign(document.createElement('button'), { type: 'button' });
  whichOne.textContent = 'Lequel ?';
  whichOne.title = 'Demander une précision au client (il perd 10 s de patience)';
  whichOne.hidden = true;
  whichOne.addEventListener('click', () => connection.send({ type: 'whichOne' }));
  headset.append(heard, whichOne);

  const app = new Application();
  await app.init({ resizeTo: window, background: '#17110d', antialias: true });
  root.replaceChildren(hud, headset, app.canvas);

  const board = new Container();
  const panel = new PanelView();
  const cords = new CordsView(panel, {
    plug(pair, end, line) {
      sounds.plug();
      connection.send({ type: 'plug', pair, end, line });
    },
    unplug(pair, end) {
      sounds.unplug();
      connection.send({ type: 'unplug', pair, end });
    },
    key(pair, action) {
      sounds.clac();
      if (action === 'ring') sounds.ring();
      connection.send({ type: 'key', pair, action });
    },
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
          // Le casque est annoncé aux lecteurs d'écran : ne le réécrire que s'il change.
          if (heard.textContent !== headsetText(message.view)) {
            heard.textContent = headsetText(message.view);
          }
          whichOne.hidden = !canAskWhichOne(message.view);
          break;
        case 'notice':
          if (message.notice === 'busy') sounds.busy();
          else sounds.error();
          flash(NOTICES[message.notice]);
          break;
        case 'plugRefused':
          sounds.error();
          flash(REFUSALS[message.reason]);
          break;
        case 'dayEnded': {
          status.textContent = 'Fin de journée : 18 h, le central ferme.';
          start.textContent = 'Reprendre son service';
          const dayIndex = Number(daySelect.value);
          const hasNext = !message.report.replay && dayIndex < BALANCE.week.length - 1;
          showReport(message.report, {
            replay: () => startDay(dayIndex),
            // La ville reste la même toute la semaine (§5.3) : même graine.
            next: hasNext ? () => startDay(dayIndex + 1) : null,
          });
          break;
        }
      }
    },
    onClose() {
      status.textContent = 'Déconnecté du central.';
      start.disabled = true;
    },
  });

  // La graine fixe la ville ; sans `?seed`, une ville au hasard pour toute la session.
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isSafeInteger(seedParam) ? seedParam : Math.floor(Math.random() * 1_000_000);
  // `?speed=10` accélère le temps pour tester une journée en une minute.
  const speedParam = Number.parseInt(params.get('speed') ?? '1', 10);
  const speed = Math.min(Math.max(Number.isInteger(speedParam) ? speedParam : 1, 1), MAX_SPEED);

  function startDay(dayIndex: number): void {
    daySelect.value = String(dayIndex);
    connection.send({ type: 'startDay', seed, dayIndex, speed });
  }

  start.addEventListener('click', () => startDay(Number(daySelect.value)));
}
