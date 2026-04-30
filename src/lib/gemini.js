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
