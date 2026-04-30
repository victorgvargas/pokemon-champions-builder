// Data layer: PokéAPI + Pokémon Champions scraper battle meta.
//
// Exports async getters that cache both in-memory and in localStorage, plus
// refreshMeta() to force-refetch the scraper JSON.

const META_URL = "https://eurekaffeine.github.io/pokemon-champions-scraper/battle_meta.json";
const POKEAPI = "https://pokeapi.co/api/v2";

const LS_META = "pc_meta_v1";
const LS_INDEX = "pc_index_v1"; // pokemon / move / item / ability name tables
const LS_POKE_PREFIX = "pc_poke_v1_"; // per-pokemon detail cache

// --- storage helpers -------------------------------------------------------

function lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — ignore, we'll re-fetch next time
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Simple promise-memoizer so concurrent callers share one in-flight request.
function memo(fn) {
  let pending = null;
  let resolved = null;
  return (...args) => {
    if (resolved) return Promise.resolve(resolved);
    if (pending) return pending;
    pending = fn(...args)
      .then((v) => {
        resolved = v;
        pending = null;
        return v;
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
    return pending;
  };
}

// --- scraper meta ----------------------------------------------------------

let metaCache = lsGet(LS_META);

export async function getMeta({ force = false } = {}) {
  if (metaCache && !force) return metaCache;
  const data = await fetchJSON(META_URL);
  metaCache = data;
  lsSet(LS_META, data);
  return data;
}

export async function refreshMeta() {
  return getMeta({ force: true });
}

// --- index tables (id → name) ---------------------------------------------

let indexCache = lsGet(LS_INDEX);

async function fetchIndex(resource, limit) {
  const data = await fetchJSON(`${POKEAPI}/${resource}?limit=${limit}`);
  const out = {};
  for (const r of data.results) {
    // url ends with .../<id>/
    const m = r.url.match(/\/(\d+)\/?$/);
    if (m) out[m[1]] = r.name;
  }
  return out;
}

export const loadIndex = memo(async () => {
  if (indexCache) return indexCache;
  const [pokemon, move, item, ability] = await Promise.all([
    fetchIndex("pokemon", 2000),
    fetchIndex("move", 1000),
    fetchIndex("item", 3000),
    fetchIndex("ability", 400),
  ]);
  indexCache = { pokemon, move, item, ability };
  lsSet(LS_INDEX, indexCache);
  return indexCache;
});

// --- per-pokemon detail ----------------------------------------------------

function prettifyName(slug) {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function mapType(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const STAT_MAP = {
  hp: "hp",
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
};

// In-memory cache — localStorage reads are also checked.
const pokeMem = new Map();

export async function getPokemonDetail(dexId) {
  if (pokeMem.has(dexId)) return pokeMem.get(dexId);
  const ls = lsGet(LS_POKE_PREFIX + dexId);
  if (ls) {
    pokeMem.set(dexId, ls);
    return ls;
  }
  const raw = await fetchJSON(`${POKEAPI}/pokemon/${dexId}`);
  const baseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const s of raw.stats) baseStats[STAT_MAP[s.stat.name]] = s.base_stat;

  const detail = {
    dexId,
    name: prettifyName(raw.name),
    slug: raw.name,
    types: raw.types.map((t) => mapType(t.type.name)),
    baseStats,
    abilities: raw.abilities.map((a) => ({
      slug: a.ability.name,
      name: prettifyName(a.ability.name),
      hidden: a.is_hidden,
    })),
    learnset: raw.moves.map((m) => ({
      slug: m.move.name,
      name: prettifyName(m.move.name),
    })),
    sprite:
      raw.sprites?.other?.["official-artwork"]?.front_default ||
      raw.sprites?.front_default ||
      null,
  };
  pokeMem.set(dexId, detail);
  lsSet(LS_POKE_PREFIX + dexId, detail);
  return detail;
}

// --- combined view used by the UI -----------------------------------------

// Resolve a scraper usage entry (top_moves/top_items/top_abilities) into
// { name, usage } pairs using the index tables.
function resolveUsageList(entries, table) {
  if (!entries) return [];
  return entries.map((e) => ({
    id: e.id,
    name: table[e.id] ? prettifyName(table[e.id]) : `#${e.id}`,
    usage: +(e.usage * 100).toFixed(1),
  }));
}

// Convert one scraper pokemon_usage row into the shape the UI consumes.
export function resolveMetaEntry(row, index) {
  return {
    dexId: row.dex_id,
    name: row.name,
    form: row.form,
    rank: row.rank,
    usage: +(row.usage_rate * 100).toFixed(1),
    winRate: row.win_rate,
    abilities: resolveUsageList(row.top_abilities, index.ability),
    items: resolveUsageList(row.top_items, index.item),
    moves: resolveUsageList(row.top_moves, index.move),
    teammates: (row.top_teammates || []).map((t) => t.id),
  };
}

// Full meta pool resolved to UI-friendly shape.
export async function getResolvedMeta({ force = false } = {}) {
  const [meta, index] = await Promise.all([
    getMeta({ force }),
    loadIndex(),
  ]);
  return {
    updatedAt: meta.updated_at,
    season: meta.season,
    source: meta.sources?.[0]?.name || "Pikalytics",
    entries: meta.pokemon_usage.map((row) => resolveMetaEntry(row, index)),
  };
}

// Full pokemon roster ({id, name}) for the browser.
export async function getAllPokemonList() {
  const index = await loadIndex();
  return Object.entries(index.pokemon)
    .map(([id, name]) => ({ dexId: +id, name: prettifyName(name), slug: name }))
    .sort((a, b) => a.dexId - b.dexId);
}

// Nukes all caches so the next call refetches everything.
export function clearAllCaches() {
  metaCache = null;
  indexCache = null;
  pokeMem.clear();
  for (const key of Object.keys(localStorage)) {
    if (
      key === LS_META ||
      key === LS_INDEX ||
      key.startsWith(LS_POKE_PREFIX)
    ) {
      localStorage.removeItem(key);
    }
  }
}
