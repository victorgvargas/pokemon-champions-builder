// Shared Gemini API wrapper with retry + model fallback.
//
// Gemini 2.5 Flash periodically returns 503 UNAVAILABLE during demand spikes.
// We retry transient errors with backoff, then fall back to lighter models
// before giving up. Non-transient 4xx errors skip retries and move on so a
// bad key doesn't stall.

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

export function getApiKey() {
  return import.meta.env.VITE_GEMINI_API_KEY || null;
}

export function hasApiKey() {
  return !!getApiKey();
}

// Cache the current-rules summary for one session. Grounded Google Search
// can't be combined with responseMimeType=json, so we call it separately.
let rulesCache = null;
let rulesPromise = null;

const RULES_CACHE_KEY = "pc_rules_v1";
const RULES_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

function loadRulesFromStorage() {
  try {
    const raw = localStorage.getItem(RULES_CACHE_KEY);
    if (!raw) return null;
    const { rules, at } = JSON.parse(raw);
    if (Date.now() - at > RULES_TTL_MS) return null;
    return rules;
  } catch { return null; }
}

function saveRulesToStorage(rules) {
  try { localStorage.setItem(RULES_CACHE_KEY, JSON.stringify({ rules, at: Date.now() })); }
  catch { /* quota */ }
}

// Fetch the current Pokémon Champions competitive ruleset using Gemini's
// Google Search grounding. Returns a plaintext summary the caller can splice
// into a system prompt. Cached for 24h.
export async function getCurrentRules({ force = false } = {}) {
  if (!force) {
    if (rulesCache) return rulesCache;
    const stored = loadRulesFromStorage();
    if (stored) { rulesCache = stored; return stored; }
  }
  if (rulesPromise) return rulesPromise;

  const prompt = `Search for the CURRENT competitive rules for Pokémon Champions (the official VGC-style ranked battle game). As of ${new Date().toISOString().slice(0, 10)}, report:
- The active Regulation Set (letter/name) and its start/end dates.
- Whether Mega Evolutions, Z-Moves, Terastallization, or Dynamax are allowed.
- SP / EV system limits (total SP, per-stat cap).
- Level cap and battle format (singles / doubles).
- Species Clause / Item Clause status.
- Any currently banned or disallowed Pokémon categories (Legendaries, Paradox, Restricted, Mythicals).
- Any very recent rule changes in the last 30 days.

Reply as a concise plaintext bulleted summary (no markdown headers, no JSON, no preamble). 200 words max.`;

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured");

  rulesPromise = (async () => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
        }),
      });
      if (!res.ok) throw new Error(`Rules fetch ${res.status}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") || "";
      if (!text) throw new Error("Empty rules response");
      rulesCache = text;
      saveRulesToStorage(text);
      return text;
    } finally {
      rulesPromise = null;
    }
  })();

  return rulesPromise;
}

// Call Gemini with { contents, generationConfig }-style body. Returns the
// text from the first candidate, or throws if every attempt fails.
export async function callGemini(body, { retries = 3, signal } = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured");

  let lastErr = null;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < retries; attempt++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });
      } catch (netErr) {
        lastErr = netErr;
        continue;
      }

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
        lastErr = new Error(`${model}: empty response`);
        continue;
      }

      const errText = await response.text();
      console.warn(`Gemini ${model} attempt ${attempt + 1} → ${response.status}`, errText);
      lastErr = new Error(`${model} ${response.status}`);

      // Only transient errors are worth retrying; 4xx means try the next model.
      if (response.status !== 429 && response.status !== 503 && response.status !== 500) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }

  throw lastErr || new Error("All Gemini models unavailable");
}
