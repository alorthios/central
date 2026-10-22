import { MAX_SAY_LENGTH, type Role, formatGameTime } from '@allo-central/shared';
import type { Connection } from './net.ts';
import { voiceLink } from './voice.ts';

const SPEAKER: Record<Role, string> = { operator: 'Standardiste', archivist: 'Archiviste' };

export interface LineChat {
  element: HTMLElement;
  /** La ligne s'ouvre ou se ferme : la saisie suit, l'historique reste lisible. */
  setOpen(open: boolean): void;
}

/**
 * La ligne 100 : la voix (§8.1) et son mode texte (§8.5), une zone de saisie des deux côtés
 * aux mêmes conditions. Le serveur ne relaie un message que si la ligne est ouverte.
 */
export function lineChat(connection: Connection, me: Role): LineChat {
  const element = document.createElement('section');
  element.className = 'line100';
  element.setAttribute('aria-label', 'Ligne 100');
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = 'Ligne 100';
  const state = document.createElement('span');
  state.className = 'line-state';
  header.append(title, state);

  const log = document.createElement('ol');
  log.setAttribute('aria-live', 'polite');
  const form = document.createElement('form');
  const input = Object.assign(document.createElement('input'), {
    type: 'text',
    maxLength: MAX_SAY_LENGTH,
    autocomplete: 'off',
  });
  input.setAttribute('aria-label', 'Message sur la ligne 100');
  const send = Object.assign(document.createElement('button'), { type: 'submit' });
  send.textContent = 'Dire';
  form.append(input, send);
  const voice = voiceLink(connection, me);
  element.append(header, voice.element, log, form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    connection.send({ type: 'say', text });
    input.value = '';
  });

  connection.listen((message) => {
    if (message.type === 'dayStarted') log.replaceChildren();
    if (message.type !== 'line100Message') return;
    const item = document.createElement('li');
    item.className = message.from === me ? 'mine' : 'theirs';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${formatGameTime(message.at)} · ${message.from === me ? 'Vous' : SPEAKER[message.from]}`;
    const text = document.createElement('span');
    text.textContent = message.text;
    item.append(who, text);
    log.append(item);
    log.scrollTop = log.scrollHeight;
  });

  const setOpen = (open: boolean) => {
    voice.setOpen(open);
    if (element.classList.contains('open') === open) return;
    element.classList.toggle('open', open);
    state.textContent = open ? 'ouverte' : 'fermée';
    input.disabled = !open;
    send.disabled = !open;
    input.placeholder = open ? 'Écrivez, l’autre lit aussitôt' : 'Ligne fermée';
    if (open) input.focus();
  };
  element.classList.add('open');
  setOpen(false);
  return { element, setOpen };
}
