import type { Role, ServerMessage } from '@allo-central/shared';
import type { Joined } from './lobby.ts';
import type { Connection } from './net.ts';

type RoomState = Extract<ServerMessage, { type: 'roomState' }>;

const NAMES: Record<Role, string> = { operator: 'le standardiste', archivist: "l'archiviste" };
const AWAITED: Record<Role, string> = {
  operator: 'du standardiste',
  archivist: "de l'archiviste",
};

function partnerText(state: RoomState, me: Role): string {
  const partner: Role = me === 'operator' ? 'archivist' : 'operator';
  const name = NAMES[partner];
  switch (state.players[partner]) {
    case 'connected':
      return `Avec ${name}.`;
    case 'away':
      return `${name.charAt(0).toUpperCase()}${name.slice(1)} s'est déconnecté : la journée est en pause.`;
    case 'empty':
      return `En attente ${AWAITED[partner]} : donnez-lui le code ${state.code}.`;
  }
}

/**
 * Le badge de la salle, dans le bandeau : son code, un lien à partager, et où en est
 * l'autre joueur.
 */
export function roomBadge(connection: Connection, joined: Joined): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'room';
  const code = document.createElement('strong');
  code.textContent = `Salle ${joined.code}`;
  const copy = Object.assign(document.createElement('button'), { type: 'button' });
  copy.textContent = 'Copier le lien';
  copy.title = "Lien à envoyer à l'autre joueur";
  copy.addEventListener('click', () => {
    const url = new URL(location.href);
    url.search = `?room=${joined.code}`;
    void navigator.clipboard?.writeText(url.toString()).then(() => {
      copy.textContent = 'Lien copié';
      setTimeout(() => (copy.textContent = 'Copier le lien'), 1_500);
    });
  });
  const partner = document.createElement('span');
  partner.className = 'partner';
  partner.setAttribute('role', 'status');
  badge.append(code, copy, partner);

  const update = (state: RoomState | undefined) => {
    if (!state) return;
    partner.textContent = partnerText(state, joined.role);
    badge.classList.toggle('paused', state.paused);
  };
  update(connection.last('roomState'));
  connection.listen((message) => {
    if (message.type === 'roomState') update(message);
  });
  return badge;
}
