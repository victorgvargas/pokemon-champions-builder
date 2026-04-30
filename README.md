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

## AI analysis

Uses [Pollinations.ai](https://pollinations.ai) — free, keyless, public. No setup required.
