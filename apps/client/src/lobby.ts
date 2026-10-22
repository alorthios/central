import type { JoinRefusal, Role } from '@allo-central/shared';
import type { Connection } from './net.ts';

export interface Joined {
  code: string;
  role: Role;
}

const REFUSALS: Record<JoinRefusal, string> = {
  unknownRoom: 'Aucune partie ne porte ce code.',
  roomFull: 'Cette partie a déjà ses deux joueurs.',
};

/** Le jeton de chaque salle, gardé par onglet : recharger la page rend sa place. */
const tokenKey = (code: string) => `allo-central:token:${code}`;

function readToken(code: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}

function saveToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(code), token);
  } catch {
    // Sans stockage, on rejoindra comme un nouveau joueur : la salle reste jouable.
  }
}

/**
 * L'écran d'accueil (§8.6) : créer une partie en choisissant son rôle, ou en rejoindre une
 * avec son code. `?room=ABCD` rejoint directement, et reprend sa place si on l'avait déjà.
 */
export function mountLobby(
  root: HTMLElement,
  connection: Connection,
  onJoined: (joined: Joined) => void,
): void {
  const params = new URLSearchParams(location.search);
  const wantedRoom = params.get('room')?.toUpperCase() ?? null;

  const main = document.createElement('main');
  main.className = 'lobby';
  main.innerHTML = `
    <h1>Allô Central</h1>
    <p class="tagline">Un standard téléphonique, une petite ville, 1953. Deux joueurs, deux étages.</p>
    <p class="warning"><strong>Chacun dans sa pièce.</strong> Ne vous parlez qu'à travers le jeu : tout l'intérêt est là.</p>
    <section aria-labelledby="create-title">
      <h2 id="create-title">Créer une partie</h2>
      <fieldset>
        <legend>Votre rôle</legend>
        <label><input type="radio" name="role" value="operator" checked /> Standardiste <small>rez-de-chaussée : le panneau, les cordons</small></label>
        <label><input type="radio" name="role" value="archivist" /> Archiviste <small>étage : l'annuaire, les fichiers, le plan</small></label>
      </fieldset>
      <button type="button" class="primary" id="create">Créer la partie</button>
    </section>
    <section aria-labelledby="join-title">
      <h2 id="join-title">Rejoindre une partie</h2>
      <label for="code">Code à quatre lettres</label>
      <div class="join">
        <input id="code" maxlength="4" autocomplete="off" spellcheck="false" />
        <button type="button" id="join">Rejoindre</button>
      </div>
    </section>
    <p class="error" role="status"></p>`;
  root.replaceChildren(main);

  const $ = <T extends HTMLElement>(selector: string) => main.querySelector(selector) as T;
  const error = $<HTMLParagraphElement>('.error');
  const codeInput = $<HTMLInputElement>('#code');
  const buttons = [$<HTMLButtonElement>('#create'), $<HTMLButtonElement>('#join')];
  const setReady = (ready: boolean) => buttons.forEach((b) => (b.disabled = !ready));
  setReady(false);
  if (wantedRoom) codeInput.value = wantedRoom;

  const join = (code: string) => {
    error.textContent = '';
    connection.send({ type: 'joinRoom', code, token: readToken(code.toUpperCase()) });
  };

  $<HTMLButtonElement>('#create').addEventListener('click', () => {
    const role = (main.querySelector('input[name="role"]:checked') as HTMLInputElement).value;
    error.textContent = '';
    connection.send({ type: 'createRoom', role: role as Role });
  });
  $<HTMLButtonElement>('#join').addEventListener('click', () => join(codeInput.value));
  codeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') join(codeInput.value);
  });

  const stop = connection.listen((message) => {
    switch (message.type) {
      case 'welcome':
        setReady(true);
        if (wantedRoom) join(wantedRoom);
        break;
      case 'joinRefused':
        error.textContent = REFUSALS[message.reason];
        break;
      case 'roomJoined': {
        saveToken(message.code, message.token);
        const url = new URL(location.href);
        url.searchParams.set('room', message.code);
        history.replaceState(null, '', url);
        stop();
        onJoined({ code: message.code, role: message.role });
        break;
      }
    }
  });
  connection.onClose(() => {
    setReady(false);
    error.textContent = 'Le central ne répond pas. Rechargez la page.';
  });
}
