# Champions / Builder

Standalone Vite + React team builder for Pokémon Champions VGC.

## Data sources

- **Meta usage**: [`eurekaffeine/pokemon-champions-scraper`](https://eurekaffeine.github.io/pokemon-champions-scraper/battle_meta.json) (Pikalytics mirror).
- **Base stats, types, learnsets, names, sprites**: [PokéAPI](https://pokeapi.co).

Both are cached to `localStorage`. The header has two refresh controls:

- **Refresh Meta** — re-fetch `battle_meta.json` only (fast).
- **Reset Cache** — nuke every cached blob (meta + PokéAPI index + per-Pokémon detail) and refetch.

## Run

```bash
npm install
npm run dev
```

## Team analysis

Rule-based analyzer that runs entirely client-side — no API, no key, works offline. Scores archetype, speed control, redirection, Fake Out presence, type holes, threats, and suggestions directly from the team.
