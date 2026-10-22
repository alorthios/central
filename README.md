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
> distance, voir ci-dessous.

## Jouer à distance (HTTPS et TURN)

La voix passe en pair à pair, et le micro exige HTTPS. Le profil `remote` de `compose.yaml`
ajoute :

- **Caddy**, reverse proxy TLS : certificat Let's Encrypt automatique pour `DOMAIN`
  (ports 80 et 443) ;
- **coturn**, relais TURN pour les réseaux qui bloquent le pair à pair (port 3478 en UDP et
  TCP, relais sur les ports UDP 49160 à 49200, réseau de l'hôte : serveur Linux).

Prérequis : un nom de domaine qui pointe vers le serveur, et ces ports ouverts dans le
pare-feu. Créer un fichier `.env` à côté de `compose.yaml` :

```sh
DOMAIN=central.example.org
TURN_SECRET=<longue chaîne aléatoire, par exemple : openssl rand -hex 32>
STUN_URLS=stun:central.example.org:3478
TURN_URLS=turn:central.example.org:3478?transport=udp,turn:central.example.org:3478?transport=tcp
DEV_ROOMS=0
```

puis :

```sh
docker compose --profile remote up -d --build
```

Le jeu est servi sur `https://<DOMAIN>`. Le secret TURN reste sur le serveur : chaque joueur
reçoit à la connexion des identifiants TURN signés, valables 12 heures (API REST de coturn).
Sans `TURN_URLS` ni `TURN_SECRET`, la voix ne passe qu'entre machines qui se joignent
directement ; la ligne 100 reste toujours utilisable par écrit.

## Installer l'application

Allô Central s'installe comme une application (plein écran, icône sur l'écran d'accueil) :

- **Ordinateur** (Chrome, Edge) : l'icône d'installation dans la barre d'adresse.
- **iPad** (Safari) : bouton Partager, puis « Sur l'écran d'accueil ». Le jeu se joue en
  paysage ; les cordons se manipulent au doigt.

L'installation et le micro exigent **HTTPS** (ou `localhost`). Depuis une tablette sur le réseau
local en `http://`, le jeu fonctionne dans le navigateur, mais sans installation ni voix : passer
par le profil `remote` ci-dessus. L'interface est gardée en cache pour démarrer vite ; une
partie a toujours besoin du serveur.

## Thèmes graphiques

Le rendu se choisit dans l'adresse :

| Paramètre        | Rendu                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| _(aucun)_        | Aplats de couleur                                                                                |
| `?theme=vintage` | Matières calculées : bois verni, bakélite, laiton, verre, ivoire                                 |
| `?theme=photo`   | Le thème vintage, avec des textures photographiques pour le bois, le cuir, le papier et le liège |

### Crédits des textures

Toutes sous licence [CC0](https://creativecommons.org/publicdomain/zero/1.0/), dans
`apps/client/public/textures/` :

- Bois `dark_wood` et `wood_table_001`, cuir `brown_leather` : [Poly Haven](https://polyhaven.com)
- Papier `Paper003`, liège `Cork003` : [ambientCG](https://ambientcg.com)

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
