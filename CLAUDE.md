# Allô Central

Jeu coopératif asymétrique à 2 joueurs (standardiste / archiviste), navigateur, déployé en Docker.

- Le GDD (v2.1) n'est **pas** versionné : ne jamais l'ajouter au dépôt (public). Les issues
  citent ses sections (`§6.4`).
- Architecture : serveur autoritaire (Node + WebSocket) dans `apps/server`, client Vite + PixiJS
  dans `apps/client`, règles partagées dans `packages/shared`. Voix en WebRTC P2P, ouverte ou
  coupée par le serveur. Ceci remplace le choix PeerJS / hôte du GDD §17.
- Pas de Node sur la machine de dev Windows : lancer les commandes npm via
  `docker run --rm -v "<repo>:/app" -w /app node:24-alpine sh -c '…'`.
- Vérifs avant PR : `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`.
- Flux GitHub : issue → branche `feat/<n>-slug` → PR (titre Conventional Commits) → squash merge.
