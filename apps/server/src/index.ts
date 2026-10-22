import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
// Les salles de test (`?dev`) sont ouvertes hors production, ou sur demande explicite.
const devRooms = process.env.DEV_ROOMS
  ? process.env.DEV_ROOMS === '1'
  : process.env.NODE_ENV !== 'production';
const server = createApp({ clientDist: process.env.CLIENT_DIST, devRooms });

server.listen(port, () => {
  console.log(`Allô Central : serveur à l'écoute sur le port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
