import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, AlertTriangle, RefreshCw, Database, Trash2, MessageCircle } from "lucide-react";
import {
  getResolvedMeta, getAllPokemonList, getPokemonDetail, refreshMeta, clearAllCaches,
} from "./lib/data.js";
import {
  TYPES, TYPE_COLORS, getDefensiveMultiplier,
} from "./lib/types.js";
import { analyzeTeam } from "./lib/analyzer.js";
import { callGemini, hasApiKey } from "./lib/gemini.js";
import SlotCard from "./components/SlotCard.jsx";
import TypeCoveragePanel from "./components/TypeCoveragePanel.jsx";
import AnalysisView from "./components/AnalysisView.jsx";
import PokemonBrowser from "./components/PokemonBrowser.jsx";
import Chatbot from "./components/Chatbot.jsx";

// Empty slot factory.
function createSlot() {
  return {
    id: Math.random().toString(36).slice(2),
    pokemon: null,
    detail: null,
    ability: null,
    item: null,
    moves: [null, null, null, null],
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    nature: "Adamant",
  };
}

export default function App() {
  const [format, setFormat] = useState("doubles");
  const [team, setTeam] = useState(() => Array(6).fill(null).map(createSlot));
  const [activeSlotIdx, setActiveSlotIdx] = useState(null);
  const [view, setView] = useState("builder");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Data state
  const [meta, setMeta] = useState(null);
  const [allPokemon, setAllPokemon] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async (force = false) => {
    setDataError(null);
    try {
      const [resolved, list] = await Promise.all([
        getResolvedMeta({ force }),
        getAllPokemonList(),
      ]);
      setMeta(resolved);
      setAllPokemon(list);
    } catch (e) {
      console.error(e);
      setDataError(e.message || "Failed to load data");
    }
  }, []);

  useEffect(() => {
    setLoadingData(true);
    loadAll().finally(() => setLoadingData(false));
  }, [loadAll]);

  // Pull base stats/types for each meta entry once, so the browser & slot
  // display have types / sprites even before a slot is expanded.
  const [metaDetails, setMetaDetails] = useState({}); // dexId -> detail
  useEffect(() => {
    if (!meta?.entries) return;
    let cancelled = false;
    (async () => {
      // prefetch top ~60 to keep it quick; the rest are lazy-loaded on pick
      const batch = meta.entries.slice(0, 60);
      for (const entry of batch) {
        if (cancelled) return;
        try {
          const d = await getPokemonDetail(entry.dexId);
          if (cancelled) return;
          setMetaDetails((prev) => ({ ...prev, [entry.dexId]: d }));
        } catch {
          // ignore, detail will be fetched on demand
        }
      }
    })();
    return () => { cancelled = true; };
  }, [meta]);

  // Merge resolved meta entries with their PokéAPI base stats/types.
  const metaEntriesWithTypes = useMemo(() => {
    if (!meta?.entries) return [];
    return meta.entries.map((e) => {
      const d = metaDetails[e.dexId];
      return {
        ...e,
        types: d?.types || [],
        baseStats: d?.baseStats || null,
        role: buildRole(e),
      };
    });
  }, [meta, metaDetails]);

  const teamSize = team.filter((s) => s.pokemon).length;

  // Global Esc: deselect the active slot. Ignore when the user is typing in
  // an input/select/textarea — those components handle Esc themselves.
  useEffect(() => {
    if (activeSlotIdx === null) return;
    function onKey(e) {
      if (e.key !== "Escape") return;
      const t = e.target;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      setActiveSlotIdx(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSlotIdx]);

  async function handleSelectPokemon(pkm) {
    if (activeSlotIdx === null) return;

    // Ensure we have detail (types, stats, learnset).
    let detail;
    try {
      detail = await getPokemonDetail(pkm.dexId);
    } catch (e) {
      console.error(e);
      setDataError("Failed to load Pokémon detail from PokéAPI");
      return;
    }

    setTeam((prev) => {
      const next = [...prev];
      const mergedPokemon = {
        dexId: pkm.dexId,
        name: pkm.name || detail.name,
        types: pkm.types?.length ? pkm.types : detail.types,
        baseStats: detail.baseStats,
        role: pkm.role || null,
        rank: pkm.rank || null,
        usage: pkm.usage || null,
        abilities: pkm.abilities || [],
        items: pkm.items || [],
        moves: pkm.moves || [],
      };
      next[activeSlotIdx] = {
        ...next[activeSlotIdx],
        pokemon: mergedPokemon,
        detail,
        ability: pkm.abilities?.[0]?.name || detail.abilities?.[0]?.name || null,
        item: pkm.items?.[0]?.name || null,
        moves: (pkm.moves || []).slice(0, 4).map((m) => m.name).concat([null, null, null, null]).slice(0, 4),
      };
      return next;
    });
    setActiveSlotIdx(null);
  }

  function clearSlot(idx) {
    setTeam((prev) => {
      const next = [...prev];
      next[idx] = createSlot();
      return next;
    });
  }

  function clearTeam() {
    if (!confirm("Clear all 6 slots?")) return;
    setTeam(Array(6).fill(null).map(createSlot));
    setActiveSlotIdx(null);
    setAnalysis(null);
    setAnalysisError(null);
  }

  // Called by the chatbot when the user applies its suggested picks.
  // fills: [{ dex_id, name, ability, item, moves[], role }]
  // Maps picks onto empty slots in order. Returns true if anything was placed.
  async function applyChatbotFills(fills) {
    if (!Array.isArray(fills) || fills.length === 0) return false;

    const emptyIdxs = team.map((s, i) => (s.pokemon ? null : i)).filter((i) => i !== null);
    if (emptyIdxs.length === 0) return false;

    // Fetch PokéAPI detail for each pick in parallel.
    const picks = fills.slice(0, emptyIdxs.length);
    const details = await Promise.all(
      picks.map(async (f) => {
        try { return { f, detail: await getPokemonDetail(f.dex_id) }; }
        catch { return { f, detail: null }; }
      })
    );

    setTeam((prev) => {
      const next = [...prev];
      details.forEach(({ f, detail }, i) => {
        const slotIdx = emptyIdxs[i];
        if (!detail) return;
        // If the pick is in the meta pool we have rich usage data; otherwise
        // use the AI-provided ability/item/moves directly.
        const metaEntry = metaEntriesWithTypes.find((m) => m.dexId === f.dex_id);
        const pokemon = {
          dexId: f.dex_id,
          name: f.name || detail.name,
          types: metaEntry?.types?.length ? metaEntry.types : detail.types,
          baseStats: detail.baseStats,
          role: f.role || metaEntry?.role || null,
          rank: metaEntry?.rank || null,
          usage: metaEntry?.usage || null,
          abilities: metaEntry?.abilities || [],
          items: metaEntry?.items || [],
          moves: metaEntry?.moves || [],
        };
        const moves = (f.moves && f.moves.length ? f.moves : (metaEntry?.moves || []).slice(0, 4).map((m) => m.name))
          .concat([null, null, null, null]).slice(0, 4);
        next[slotIdx] = {
          ...next[slotIdx],
          pokemon,
          detail,
          ability: f.ability || metaEntry?.abilities?.[0]?.name || detail.abilities?.[0]?.name || null,
          item: f.item || metaEntry?.items?.[0]?.name || null,
          moves,
        };
      });
      return next;
    });
    return true;
  }

  function updateSlot(idx, patch) {
    setTeam((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  function updateMove(slotIdx, moveIdx, value) {
    setTeam((prev) => {
      const next = [...prev];
      const moves = [...next[slotIdx].moves];
      moves[moveIdx] = value;
      next[slotIdx] = { ...next[slotIdx], moves };
      return next;
    });
  }

  function updateSp(slotIdx, stat, value) {
    setTeam((prev) => {
      const next = [...prev];
      const sp = { ...next[slotIdx].sp };
      const v = Math.max(0, Math.min(32, parseInt(value) || 0));
      sp[stat] = v;
      next[slotIdx] = { ...next[slotIdx], sp };
      return next;
    });
  }

  const typeAnalysis = useMemo(() => {
    const result = {};
    TYPES.forEach((atkType) => {
      const counts = { weak: 0, neutral: 0, resist: 0, immune: 0 };
      team.forEach((slot) => {
        if (!slot.pokemon || !slot.pokemon.types?.length) return;
        const m = getDefensiveMultiplier(slot.pokemon.types, atkType);
        if (m === 0) counts.immune++;
        else if (m < 1) counts.resist++;
        else if (m > 1) counts.weak++;
        else counts.neutral++;
      });
      result[atkType] = counts;
    });
    return result;
  }, [team]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshMeta();
      await loadAll(true);
    } catch (e) {
      setDataError(e.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleHardRefresh() {
    if (!confirm("Clear all cached data (meta + PokéAPI) and refetch?")) return;
    setRefreshing(true);
    clearAllCaches();
    setMetaDetails({});
    try {
      await loadAll(true);
    } catch (e) {
      setDataError(e.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function runAIAnalysis() {
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);

    const filled = team.filter((s) => s.pokemon);
    if (filled.length === 0) {
      setAnalysisError("Add at least one Pokémon before running analysis.");
      setAnalyzing(false);
      return;
    }

    // Always compute the local analysis as a baseline / fallback.
    const localResult = analyzeTeam({ team, format, typeAnalysis });

    if (!hasApiKey()) {
      setAnalysis(localResult);
      setView("analysis");
      setAnalyzing(false);
      return;
    }

    try {
      const teamSummary = filled.map((s, i) => ({
        slot: i + 1,
        name: s.pokemon.name,
        types: s.pokemon.types,
        role: s.pokemon.role,
        ability: s.ability,
        item: s.item,
        moves: s.moves.filter(Boolean),
        sp: s.sp,
        nature: s.nature,
      }));

      const weaknessSummary = TYPES
        .map((t) => ({ type: t, weak: typeAnalysis[t].weak, resist: typeAnalysis[t].resist + typeAnalysis[t].immune }))
        .filter((w) => w.weak >= 3 || (w.weak >= 2 && w.resist === 0));

      const prompt = `You are a Pokémon Champions VGC expert analyzing a competitive team for ${format === "doubles" ? "Doubles (VGC, bring 6 pick 4)" : "Singles (bring 6 pick 3)"} format under Regulation Set M-A (Mega Evolutions allowed, SP system: 66 SP total, max 32 per stat).

The team:
${JSON.stringify(teamSummary, null, 2)}

Team-wide defensive concerns (3+ Pokémon weak, OR 2 weak with 0 resists):
${JSON.stringify(weaknessSummary, null, 2)}

Respond with JSON only.`;

      const schema = {
        type: "object",
        properties: {
          overall_grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
          archetype: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          speed_control: { type: "string" },
          fake_out_users: { type: "string" },
          redirection: { type: "string" },
          type_coverage: { type: "string" },
          key_threats: { type: "array", items: { type: "string" } },
          suggestions: { type: "array", items: { type: "string" } },
        },
        required: [
          "overall_grade", "archetype", "strengths", "weaknesses",
          "speed_control", "fake_out_users", "redirection",
          "type_coverage", "key_threats", "suggestions",
        ],
      };

      const text = await callGemini({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.7,
        },
      });

      setAnalysis(JSON.parse(text));
      setView("analysis");
    } catch (e) {
      console.error(e);
      setAnalysis(localResult);
      setAnalysisError(`AI call failed (${e.message}) — showing local analysis.`);
      setView("analysis");
    } finally {
      setAnalyzing(false);
    }
  }

  const pickInBattle = format === "doubles" ? 4 : 3;

  return (
    <div className="min-h-screen text-stone-100" style={{
      background: "radial-gradient(ellipse at top, #1a1f2e 0%, #0a0d14 70%)",
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    }}>
      <GlobalStyles />
      <div className="grid-bg min-h-screen">
        <header className="border-b border-white/10 px-6 py-4 sticky top-0 z-30 backdrop-blur-md bg-[#0a0d14]/80">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="relative">
                <h1 className="display-font text-3xl text-rose-500 glow-text" style={{ color: "#ff3860" }}>
                  CHAMPIONS<span className="text-stone-100">/BUILDER</span>
                </h1>
                <div className="text-[10px] tracking-[0.3em] text-stone-500 uppercase">
                  {meta ? `${meta.source} · ${formatDate(meta.updatedAt)}` : "Loading meta..."}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loadingData}
                title="Refetch battle_meta.json from scraper"
                className="flex items-center gap-2 px-3 py-2 border border-white/15 hover:border-rose-500/60 text-xs tracking-widest uppercase font-bold transition disabled:opacity-50"
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Syncing..." : "Refresh Meta"}
              </button>
              <button
                onClick={handleHardRefresh}
                disabled={refreshing || loadingData}
                title="Clear ALL caches (meta + PokéAPI) and refetch"
                className="flex items-center gap-2 px-3 py-2 border border-white/15 hover:border-amber-500/60 text-xs tracking-widest uppercase font-bold transition disabled:opacity-50"
              >
                <Database size={12} />
                Reset Cache
              </button>

              <div className="flex border border-white/15 rounded-sm overflow-hidden">
                <button
                  onClick={() => setFormat("singles")}
                  className={`px-4 py-2 text-xs tracking-widest uppercase font-bold transition ${
                    format === "singles" ? "bg-rose-500 text-white" : "text-stone-400 hover:text-white"
                  }`}
                >Singles 6→3</button>
                <button
                  onClick={() => setFormat("doubles")}
                  className={`px-4 py-2 text-xs tracking-widest uppercase font-bold transition ${
                    format === "doubles" ? "bg-rose-500 text-white" : "text-stone-400 hover:text-white"
                  }`}
                >Doubles 6→4</button>
              </div>

              <div className="flex border border-white/15 rounded-sm overflow-hidden">
                <button
                  onClick={() => setView("builder")}
                  className={`px-3 py-2 text-xs tracking-widest uppercase font-bold transition ${
                    view === "builder" ? "bg-white/10 text-white" : "text-stone-400 hover:text-white"
                  }`}
                >Builder</button>
                <button
                  onClick={() => setView("analysis")}
                  className={`px-3 py-2 text-xs tracking-widest uppercase font-bold transition flex items-center gap-1 ${
                    view === "analysis" ? "bg-white/10 text-white" : "text-stone-400 hover:text-white"
                  }`}
                >
                  <Sparkles size={12} /> Analysis
                </button>
              </div>

              <button
                onClick={() => setChatOpen((o) => !o)}
                title="Team Coach chat"
                className={`flex items-center gap-2 px-3 py-2 border text-xs tracking-widest uppercase font-bold transition ${
                  chatOpen
                    ? "border-rose-500/60 bg-rose-500/10 text-white"
                    : "border-white/15 hover:border-rose-500/60"
                }`}
              >
                <MessageCircle size={12} /> Coach
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-6">
          {dataError && (
            <div className="panel p-3 mb-4 text-xs text-rose-400 flex items-center gap-2 panel-accent">
              <AlertTriangle size={14} /> Data error: {dataError}
            </div>
          )}

          {loadingData && !meta ? (
            <div className="panel p-12 rounded-sm text-center">
              <div className="display-font text-3xl text-rose-500 glow-text mb-4 animate-pulse">LOADING META...</div>
              <div className="text-xs text-stone-500 tracking-widest">Fetching battle meta and PokéAPI index</div>
            </div>
          ) : view === "builder" ? (
            <div className="grid lg:grid-cols-[1fr_360px] gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="display-font text-2xl tracking-wider">SQUAD ROSTER</div>
                    <div className="text-xs text-stone-500 tracking-wider">
                      {teamSize}/6 PICKED · BRING 6, SELECT {pickInBattle} IN-BATTLE
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearTeam}
                      disabled={teamSize === 0}
                      title="Clear all 6 slots"
                      className="flex items-center gap-1 px-3 py-2 border border-white/15 hover:border-rose-500/60 hover:text-rose-400 text-xs tracking-widest uppercase font-bold transition disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:text-stone-400"
                    >
                      <Trash2 size={12} /> Clear
                    </button>
                    <button
                      onClick={runAIAnalysis}
                      disabled={analyzing || teamSize === 0}
                      className="btn-primary px-4 py-2 text-xs flex items-center gap-2 rounded-sm"
                    >
                      <Sparkles size={14} />
                      {analyzing ? "ANALYZING..." : "AI ANALYZE TEAM"}
                    </button>
                  </div>
                </div>

                {analysisError && (
                  <div className="panel p-3 text-xs text-rose-400 flex items-center gap-2 panel-accent">
                    <AlertTriangle size={14} /> {analysisError}
                  </div>
                )}

                <div className="space-y-3">
                  {team.map((slot, idx) => (
                    <SlotCard
                      key={slot.id}
                      slot={slot}
                      idx={idx}
                      isActive={activeSlotIdx === idx}
                      onActivate={() => setActiveSlotIdx(idx)}
                      onClear={() => clearSlot(idx)}
                      onUpdate={(p) => updateSlot(idx, p)}
                      onUpdateMove={(mi, v) => updateMove(idx, mi, v)}
                      onUpdateSp={(stat, v) => updateSp(idx, stat, v)}
                    />
                  ))}
                </div>

                {teamSize > 0 && <TypeCoveragePanel typeAnalysis={typeAnalysis} />}
              </div>

              <PokemonBrowser
                metaEntries={metaEntriesWithTypes}
                allPokemon={allPokemon}
                activeSlotIdx={activeSlotIdx}
                onSelect={handleSelectPokemon}
              />
            </div>
          ) : (
            <AnalysisView
              analysis={analysis}
              analyzing={analyzing}
              analysisError={analysisError}
              runAIAnalysis={runAIAnalysis}
              team={team}
              format={format}
              setView={setView}
            />
          )}
        </main>

        <footer className="border-t border-white/5 mt-12 py-6 text-center text-[10px] tracking-widest text-stone-600 uppercase">
          Data: {meta?.source || "Pikalytics"} via eurekaffeine/pokemon-champions-scraper · PokéAPI ·{" "}
          Updated {meta ? formatDate(meta.updatedAt) : "—"}
        </footer>
      </div>

      <Chatbot
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        team={team}
        format={format}
        metaEntries={metaEntriesWithTypes}
        onFillTeam={applyChatbotFills}
      />
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

// Build a one-line role blurb from scraper entry — used when no curated role is
// available. Heuristic: top move + top ability.
function buildRole(entry) {
  const topMove = entry.moves?.[0]?.name;
  const topAbility = entry.abilities?.[0]?.name;
  if (topMove && topAbility) return `${topAbility} · ${topMove}`;
  if (topMove) return topMove;
  return "";
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Bebas+Neue&display=swap');
      body { background: #0a0d14; }
      .display-font { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }
      .glow-text { text-shadow: 0 0 20px currentColor; }
      .panel {
        background: linear-gradient(180deg, rgba(20,25,40,0.9) 0%, rgba(15,18,28,0.95) 100%);
        border: 1px solid rgba(255,255,255,0.08);
        backdrop-filter: blur(8px);
      }
      .panel-accent { border-left: 3px solid var(--accent, #ff3860); }
      .btn-primary {
        background: linear-gradient(135deg, #ff3860 0%, #ff6b3d 100%);
        color: white; font-weight: 700; letter-spacing: 0.08em;
        transition: transform 120ms, box-shadow 120ms;
      }
      .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(255,56,96,0.4); }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
      .stat-bar { height: 6px; background: rgba(255,255,255,0.08); position: relative; overflow: hidden; }
      .stat-bar-fill {
        position: absolute; inset: 0; transform-origin: left;
        background: linear-gradient(90deg, #ff3860, #ff6b3d, #ffaa00);
      }
      .type-chip {
        font-size: 10px; font-weight: 700; padding: 2px 8px;
        letter-spacing: 0.1em; text-transform: uppercase;
        border: 1px solid rgba(255,255,255,0.2);
      }
      .corner-bracket::before, .corner-bracket::after {
        content: ""; position: absolute; width: 12px; height: 12px;
        border: 2px solid #ff3860;
      }
      .corner-bracket::before { top: -2px; left: -2px; border-right: none; border-bottom: none; }
      .corner-bracket::after { bottom: -2px; right: -2px; border-left: none; border-top: none; }
      .grid-bg {
        background-image:
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
        background-size: 40px 40px;
      }
      select, input { font-family: inherit; }
      select:focus, input:focus { outline: 2px solid #ff3860; outline-offset: -1px; }
      @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,56,96,0.5); }
        50% { box-shadow: 0 0 0 8px rgba(255,56,96,0); }
      }
      .pulse { animation: pulse-glow 2s infinite; }
    `}</style>
  );
}
