import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const server = createApp({ clientDist: process.env.CLIENT_DIST });

server.listen(port, () => {
  console.log(`Allô Central : serveur à l'écoute sur le port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
