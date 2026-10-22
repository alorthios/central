import { formatGameTime } from '@allo-central/shared';
import { dayControls } from '../day.ts';
import type { Joined } from '../lobby.ts';
import { lineChat } from '../line100.ts';
import type { Connection } from '../net.ts';
import { roomBadge } from '../room.ts';
import { renderDesk } from './desk.ts';
import { phone } from './phone.ts';

/**
 * L'écran de l'archiviste, à l'étage : son bureau et ses documents. Il ne voit rien du
 * panneau (§4) ; seule l'heure lui parvient du rez-de-chaussée.
 */
export function mountArchivist(root: HTMLElement, connection: Connection, joined: Joined): void {
  const hud = document.createElement('header');
  hud.className = 'hud';
  const clock = Object.assign(document.createElement('output'), { className: 'clock' });
  clock.textContent = '9 h 00';
  const status = Object.assign(document.createElement('p'), { className: 'status' });
  status.setAttribute('role', 'status');
  status.textContent = 'Les archives sont fermées.';
  hud.append(clock, ...dayControls(connection), status, roomBadge(connection, joined));

  const desk = document.createElement('main');
  desk.className = 'desk';
  const welcome = document.createElement('p');
  welcome.className = 'desk-empty';
  welcome.textContent =
    'Le bureau des archives, à l’étage. Vos documents arrivent avec la journée.';
  desk.append(welcome);
  // Le téléphone et la ligne 100, à portée de main sur le côté du bureau.
  const handset = phone(connection);
  const chat = lineChat(connection, 'archivist');
  const side = document.createElement('aside');
  side.className = 'side';
  side.append(handset.element, chat.element);
  root.replaceChildren(hud, desk, side);

  const onDayStarted = (message: { dayName: string; seed: number }) => {
    status.textContent = `${message.dayName} · ville n° ${message.seed}`;
  };
  const started = connection.last('dayStarted');
  if (started) onDayStarted(started);
  const documents = connection.last('archivistDesk');
  if (documents) renderDesk(desk, documents.desk);

  connection.listen((message) => {
    switch (message.type) {
      case 'dayStarted':
        onDayStarted(message);
        break;
      case 'archivistView':
        clock.textContent = formatGameTime(message.view.elapsedMs);
        handset.update(message.view);
        chat.setOpen(message.view.line100Open);
        break;
      case 'archivistDesk':
        renderDesk(desk, message.desk);
        break;
      case 'dayEnded':
        status.textContent = 'Fin de journée : 18 h, les archives ferment.';
        break;
    }
  });
  connection.onClose(() => (status.textContent = 'Déconnecté du central. Rechargez la page.'));
}
