# Allô Central

[![CI](https://github.com/alorthios/central/actions/workflows/ci.yml/badge.svg)](https://github.com/alorthios/central/actions/workflows/ci.yml)

Jeu coopératif asymétrique à deux joueurs, dans le navigateur. L'un tient le standard
téléphonique d'une petite ville en 1953, l'autre connaît les habitants. Ils ne se voient pas
et chaque échange entre eux coûte.

## Lancer le jeu (Docker)

```sh
docker compose up -d --build
```

Le jeu est servi sur <http://localhost:8053> (port modifiable avec `APP_PORT=xxxx`).
L'image publiée par le CI est disponible sur `ghcr.io/alorthios/central`.

> Le micro du navigateur n'est accessible qu'en HTTPS ou sur `localhost`. Pour jouer à
> distance, il faudra un reverse proxy avec TLS devant le conteneur.

## Développer

Prérequis : Node 24 (voir `.nvmrc`).

```sh
npm ci
npm run dev:server   # serveur de jeu sur :3000, rechargé à chaud
npm run dev:client   # client Vite sur :5173, relaie /ws vers le serveur
```

Pour tester seul, ouvrir <http://localhost:5173/?dev> dans deux onglets : le premier prend le
standard, le second l'étage (ou `?dev&role=archivist`). L'écran d'accueil est sauté, les deux
onglets rejoignent la salle de test `TEST` (`?dev=ABCD` pour une autre), et le bandeau permet
de régler la graine de la ville et la vitesse de l'horloge. Ces salles sont refusées quand
`NODE_ENV=production`, sauf avec `DEV_ROOMS=1`.

| Commande            | Rôle                              |
| ------------------- | --------------------------------- |
| `npm test`          | tests (Vitest)                    |
| `npm run lint`      | ESLint                            |
| `npm run typecheck` | TypeScript, tous les workspaces   |
| `npm run format`    | Prettier                          |
| `npm run build`     | build du client et bundle serveur |

## Organisation

```
packages/shared   règles, équilibrage, protocole, génération de la ville (graine)
apps/server       serveur de jeu autoritaire (HTTP + WebSocket), sert aussi le client
apps/client       client Vite + PixiJS
```

Le serveur fait tourner la simulation ; chaque joueur ne reçoit que ce que son rôle a le droit
de voir. La voix entre joueurs passe en WebRTC pair à pair, ouverte ou coupée par le serveur
selon l'état de la ligne 100.

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour le flux de travail.
