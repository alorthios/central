import type { ArchivistView, PhoneState } from '@allo-central/shared';
import type { Connection } from '../net.ts';
import { sounds } from '../sounds.ts';

const RING_EVERY_MS = 2_000;

const STATES: Record<PhoneState, string> = {
  idle: 'Combiné raccroché.',
  ringing: 'Le téléphone sonne : le rez-de-chaussée vous appelle !',
  offHook: 'Combiné décroché.',
};

/**
 * La sonnette (§8.4) : le seul canal gratuit vers le rez-de-chaussée. Un coup au plus toutes
 * les 0,6 s (le serveur ignore les coups trop rapprochés) : aux joueurs d'inventer leur code.
 * La touche S la fait aussi sonner, sauf pendant la saisie d'un texte.
 */
export function bellButton(connection: Connection): HTMLElement {
  const button = Object.assign(document.createElement('button'), { type: 'button' });
  button.className = 'bell';
  button.textContent = 'Agiter la sonnette';
  button.title = 'Touche S';
  const ring = () => {
    connection.send({ type: 'bell' });
    button.classList.remove('struck');
    void button.offsetWidth;
    button.classList.add('struck');
  };
  button.addEventListener('click', ring);
  document.addEventListener('keydown', (event) => {
    const typing =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (!typing && !event.repeat && event.key.toLowerCase() === 's') ring();
  });
  return button;
}

export interface Phone {
  element: HTMLElement;
  update(view: ArchivistView): void;
}

/**
 * Le téléphone de l'archiviste (§7.2, §8.1, §8.2) : décrocher pour répondre au
 * rez-de-chaussée, ou pour l'appeler (l'ampoule 100 clignote en bas), raccrocher ensuite.
 */
export function phone(connection: Connection): Phone {
  const element = document.createElement('section');
  element.className = 'phone';
  element.setAttribute('aria-label', 'Téléphone');
  const state = document.createElement('p');
  state.setAttribute('role', 'status');
  state.textContent = STATES.idle;
  const handset = Object.assign(document.createElement('button'), { type: 'button' });
  handset.className = 'primary';
  handset.textContent = 'Décrocher';
  element.append(state, handset);

  let current: PhoneState = 'idle';
  let open = false;
  let lastRing = 0;
  handset.addEventListener('click', () => {
    connection.send({ type: 'handset', offHook: current !== 'offHook' });
  });

  return {
    element,
    update(view) {
      if (view.phone === 'ringing' && performance.now() - lastRing > RING_EVERY_MS) {
        lastRing = performance.now();
        sounds.ring();
      }
      if (view.phone === current && view.line100Open === open) return;
      current = view.phone;
      open = view.line100Open;
      element.dataset.state = current;
      handset.textContent = current === 'offHook' ? 'Raccrocher' : 'Décrocher';
      state.textContent =
        current === 'offHook'
          ? open
            ? 'En ligne avec le standardiste.'
            : 'Combiné décroché : le rez-de-chaussée voit votre appel sur la ligne 100.'
          : STATES[current];
    },
  };
}
