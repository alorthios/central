import type { ServerMessage } from '@allo-central/shared';
import { Application, Graphics } from 'pixi.js';

const COLUMNS = 10;
const ROWS = 8;
const SPACING = 56;

async function drawPanel(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#17110d', antialias: true });
  document.body.appendChild(app.canvas);

  const panel = new Graphics();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const x = SPACING + col * SPACING;
      const y = SPACING + row * SPACING;
      panel.circle(x, y, 10).fill('#4a423a');
      panel.circle(x, y + 20, 5).stroke({ width: 2, color: '#c9a44c' });
    }
  }
  app.stage.addChild(panel);
}

function connect(): void {
  const status = document.querySelector<HTMLDivElement>('#status');
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    if (message.type === 'welcome' && status) {
      status.textContent = `Connecté au central (protocole v${message.protocolVersion})`;
    }
  });
  socket.addEventListener('close', () => {
    if (status) status.textContent = 'Déconnecté du central';
  });
}

if (new URLSearchParams(location.search).has('debug')) {
  // Chargée à part : le code de debug ne pèse pas sur la page de jeu.
  void import('./debug/debug.ts').then(({ mountDebug }) => mountDebug(document.body));
} else {
  void drawPanel();
  connect();
}
