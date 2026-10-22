# Contribuer

## Flux de travail

1. **Une issue d'abord.** Tout travail part d'une issue, rangée dans le
   [projet](https://github.com/users/alorthios/projects) et rattachée à un jalon (MVP, V1, V2).
2. **Une branche par issue**, depuis `main` : `feat/12-cles-trois-positions`,
   `fix/31-sonnette-cadence`.
3. **Une PR** vers `main`, avec `Closes #12` dans la description. Le CI doit être vert.
4. **Squash merge.** Le titre de la PR devient le commit sur `main` : il suit
   [Conventional Commits](https://www.conventionalcommits.org/fr/).

`main` est protégée : pas de push direct, pas de force push, historique linéaire.

## Titres de PR

```
<type>(<scope optionnel>): <description à l'impératif>
```

- Types : `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`
- Scopes : `shared`, `server`, `client`, `operator`, `archivist`, `docker`, `deps`

Exemples : `feat(operator): lever une clé fait retomber la précédente`,
`fix(server): l'archiviste ne reçoit plus l'état du panneau`.

## Versions

Semver, par tag sur `main` : `git tag v0.1.0 && git push origin v0.1.0`. Le tag crée la release
GitHub (notes générées depuis les PR) et publie l'image `ghcr.io/alorthios/central:0.1.0`.

## Règles du code

- Toutes les valeurs d'équilibrage vivent dans `packages/shared/src/balance.ts`.
- Le hasard passe par `createRng(seed)` : une même graine doit rejouer la même partie.
- Le serveur fait autorité. Un client n'envoie que des intentions (brancher, lever une clé…),
  jamais un état.
- La logique de jeu est testée sans navigateur.
