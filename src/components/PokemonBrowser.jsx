import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { TYPE_COLORS } from "../lib/types.js";

// Renders the right-hand pool. Shows meta pokemon with usage/rank up top, then
// a "+ all other pokemon" list below filtered by the same query.
export default function PokemonBrowser({
  metaEntries, allPokemon, activeSlotIdx, onSelect,
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("meta"); // "meta" | "all"

  const filteredMeta = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return metaEntries;
    return metaEntries.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.role || "").toLowerCase().includes(q) ||
      (p.types || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [metaEntries, query]);

  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPokemon.slice(0, 200);
    return allPokemon
      .filter((p) => p.name.toLowerCase().includes(q) || String(p.dexId) === q)
      .slice(0, 200);
  }, [allPokemon, query]);

  const visibleList = tab === "meta" ? filteredMeta : filteredAll;

  // Wrap onSelect so selecting a Pokémon also clears the search — keeps the
  // list ready for the next slot pick without manual reset.
  function handleSelect(p) {
    onSelect(p);
    setQuery("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && activeSlotIdx !== null && visibleList.length > 0) {
      e.preventDefault();
      handleSelect(visibleList[0]);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  }

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start panel rounded-sm">
      <div className="p-4 border-b border-white/5">
        <div className="display-font text-xl tracking-wider mb-2">POKÉMON POOL</div>
        <div className="text-[10px] text-stone-500 tracking-widest uppercase mb-3">
          {activeSlotIdx !== null ? `Slot ${activeSlotIdx + 1} → Enter to pick first` : "Select a slot, then a Pokémon"}
        </div>

        <div className="flex border border-white/15 rounded-sm overflow-hidden mb-3 text-[10px] tracking-widest uppercase font-bold">
          <button
            onClick={() => setTab("meta")}
            className={`flex-1 py-1.5 transition ${tab === "meta" ? "bg-rose-500 text-white" : "text-stone-400 hover:text-white"}`}
          >
            Meta ({metaEntries.length})
          </button>
          <button
            onClick={() => setTab("all")}
            className={`flex-1 py-1.5 transition ${tab === "all" ? "bg-rose-500 text-white" : "text-stone-400 hover:text-white"}`}
          >
            All ({allPokemon.length})
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tab === "meta" ? "Search name, type, role..." : "Search name or dex id..."}
            className="w-full bg-black/40 border border-white/10 pl-9 pr-9 py-2 text-sm rounded-sm placeholder:text-stone-600"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              title="Clear search (Esc)"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 hover:text-rose-400 transition"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[calc(100vh-280px)] overflow-y-auto p-3 space-y-2">
        {tab === "meta" ? (
          <>
            {filteredMeta.map((p, i) => (
              <MetaRow
                key={p.dexId}
                p={p}
                first={i === 0 && activeSlotIdx !== null && !!query}
                disabled={activeSlotIdx === null}
                onClick={() => handleSelect(p)}
              />
            ))}
            {filteredMeta.length === 0 && (
              <div className="text-center text-stone-500 text-xs py-8">No meta Pokémon matched</div>
            )}
          </>
        ) : (
          <>
            {filteredAll.map((p, i) => (
              <AllRow
                key={p.dexId}
                p={p}
                first={i === 0 && activeSlotIdx !== null && !!query}
                disabled={activeSlotIdx === null}
                onClick={() => handleSelect(p)}
              />
            ))}
            {filteredAll.length === 0 && (
              <div className="text-center text-stone-500 text-xs py-8">No Pokémon found</div>
            )}
            {!query && allPokemon.length > 200 && (
              <div className="text-center text-stone-600 text-[10px] py-2 tracking-widest uppercase">
                Showing first 200 · type to search all {allPokemon.length}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function MetaRow({ p, disabled, onClick, first }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-3 border hover:border-rose-500/50 hover:bg-white/5 disabled:opacity-50 disabled:hover:border-white/5 disabled:hover:bg-transparent transition group ${
        first ? "border-rose-500/60 bg-rose-500/5" : "border-white/5"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-stone-600 font-bold">#{String(p.rank).padStart(2, "0")}</span>
          <span className="text-sm font-bold tracking-wide group-hover:text-rose-400 transition">{p.name}</span>
          {first && <span className="text-[9px] tracking-widest text-rose-400 uppercase">↵ Enter</span>}
        </div>
        <span className="text-[10px] text-stone-500">{p.usage?.toFixed(1)}%</span>
      </div>
      {p.types?.length ? (
        <div className="flex items-center gap-1 mb-1">
          {p.types.map((t) => (
            <span key={t} className="type-chip" style={{ background: TYPE_COLORS[t], color: "#000" }}>{t}</span>
          ))}
        </div>
      ) : null}
      {p.role && <div className="text-[10px] text-stone-500 truncate">{p.role}</div>}
    </button>
  );
}

function AllRow({ p, disabled, onClick, first }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-2 border hover:border-rose-500/50 hover:bg-white/5 disabled:opacity-50 disabled:hover:border-white/5 disabled:hover:bg-transparent transition flex items-center justify-between ${
        first ? "border-rose-500/60 bg-rose-500/5" : "border-white/5"
      }`}
    >
      <span className="text-sm flex items-center gap-2">
        {p.name}
        {first && <span className="text-[9px] tracking-widest text-rose-400 uppercase">↵ Enter</span>}
      </span>
      <span className="text-[10px] text-stone-600">#{p.dexId}</span>
    </button>
  );
}
