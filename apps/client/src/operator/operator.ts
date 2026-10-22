import {
  type Hearing,
  type Notice,
  type OperatorView,
  type PlugRefusal,
  formatGameTime,
} from '@allo-central/shared';
import { Application, Container } from 'pixi.js';
import { dayControls } from '../day.ts';
import type { Joined } from '../lobby.ts';
import { lineChat } from '../line100.ts';
import type { Connection } from '../net.ts';
import { memoButton } from '../help.ts';
import { roomBadge } from '../room.ts';
import { CordsView } from './cords.ts';
import { PanelView } from './panel.ts';
import { sounds } from '../sounds.ts';

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
    case 'archivist':
      return 'Ligne 100 ouverte : vous êtes en ligne avec l’étage.';
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

/** L'écran du standardiste : le panneau, les cordons, les clés et le casque. */
export async function mountOperator(
  root: HTMLElement,
  connection: Connection,
  joined: Joined,
): Promise<void> {
  const hud = document.createElement('header');
  hud.className = 'hud';
  const clock = Object.assign(document.createElement('output'), { className: 'clock' });
  clock.textContent = '9 h 00';
  const status = Object.assign(document.createElement('p'), { className: 'status' });
  status.setAttribute('role', 'status');
  status.textContent = 'Le central est fermé.';
  // La sonnette se voit aussi : chaque coup allume ce voyant le temps de sa résonance.
  const bell = Object.assign(document.createElement('span'), { className: 'bell-light' });
  bell.textContent = 'Sonnette';
  bell.setAttribute('aria-hidden', 'true');
  hud.append(
    clock,
    ...dayControls(connection),
    status,
    bell,
    voiceToggle(),
    memoButton('operator'),
    roomBadge(connection, joined),
  );

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
  const chat = lineChat(connection, 'operator');
  root.replaceChildren(hud, headset, app.canvas, chat.element);

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

  let dayStatus = 'Le central est fermé.';
  let notice: ReturnType<typeof setTimeout> | undefined;
  const flash = (text: string) => {
    status.textContent = text;
    clearTimeout(notice);
    notice = setTimeout(() => (status.textContent = dayStatus), 2_500);
  };

  const onDayStarted = (message: { dayName: string; seed: number }) => {
    dayStatus = `${message.dayName} · ville n° ${message.seed}`;
    status.textContent = dayStatus;
  };
  const started = connection.last('dayStarted');
  if (started) onDayStarted(started);

  connection.listen((message) => {
    switch (message.type) {
      case 'dayStarted':
        onDayStarted(message);
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
        speak(message.view.headset.hearing);
        chat.setOpen(message.view.line100Open);
        break;
      case 'notice':
        if (message.notice === 'busy') sounds.busy();
        else sounds.error();
        flash(NOTICES[message.notice]);
        break;
      case 'bell':
        sounds.bell();
        bell.classList.remove('ringing');
        void bell.offsetWidth;
        bell.classList.add('ringing');
        break;
      case 'plugRefused':
        sounds.error();
        flash(REFUSALS[message.reason]);
        break;
      case 'dayEnded':
        dayStatus = 'Fin de journée : 18 h, le central ferme.';
        status.textContent = dayStatus;
        break;
    }
  });
  connection.onClose(() => (status.textContent = 'Déconnecté du central. Rechargez la page.'));
}

const VOICES_KEY = 'allo-central:voices';
let voicesOn = true;
try {
  voicesOn = localStorage.getItem(VOICES_KEY) !== 'off';
} catch {
  // Sans stockage, les voix restent actives.
}

/** La case « Voix des clients » : le charabia est désactivable (§9.4). */
function voiceToggle(): HTMLElement {
  const label = document.createElement('label');
  label.className = 'toggle';
  const box = Object.assign(document.createElement('input'), {
    type: 'checkbox',
    checked: voicesOn,
  });
  box.addEventListener('change', () => {
    voicesOn = box.checked;
    try {
      localStorage.setItem(VOICES_KEY, voicesOn ? 'on' : 'off');
    } catch {
      // Le réglage vaut pour la page.
    }
  });
  label.append(box, ' Voix des clients');
  return label;
}

let spoken: { voice: number; lines: string[] } | null = null;

/**
 * Le client parle quand on l'entend de nouveau : à la clé levée, puis seulement ce qu'il
 * ajoute (la précision de « Lequel ? »).
 */
function speak(hearing: Hearing): void {
  if (hearing.kind !== 'client') {
    spoken = null;
    return;
  }
  const previous = spoken;
  spoken = { voice: hearing.voice, lines: hearing.lines };
  if (!voicesOn) return;
  const continues =
    previous?.voice === hearing.voice &&
    previous.lines.every((line, i) => hearing.lines[i] === line);
  const fresh = continues ? hearing.lines.slice(previous.lines.length) : hearing.lines;
  if (fresh.length > 0) sounds.babble(fresh.join(' '), hearing.voice);
}
