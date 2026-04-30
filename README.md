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

Uses **Gemini 2.5 Flash** (free tier) for LLM-powered team analysis — archetype, strengths, weaknesses, speed control, threats, suggestions.

1. Get a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
2. Copy `.env.example` → `.env.local` and set `VITE_GEMINI_API_KEY`.
3. Restart `npm run dev`.

If the key is missing or the API fails, the app automatically falls back to a local rule-based analyzer so the feature always works.

> ⚠️ Gemini enforces a daily free-tier quota. If you deploy this publicly, put the key behind a serverless proxy instead of shipping it in `VITE_*` env vars (bundled keys are visible to every user).
