import React, { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { TYPE_COLORS, NATURES } from "../lib/types.js";

export default function SlotCard({
  slot, idx, isActive, onActivate, onClear, onUpdate, onUpdateMove, onUpdateSp,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!slot.pokemon) {
    return (
      <button
        onClick={onActivate}
        className={`relative w-full panel p-4 text-left rounded-sm transition ${
          isActive ? "panel-accent pulse" : "hover:border-white/20"
        }`}
        style={isActive ? { "--accent": "#ff3860" } : {}}
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 border-2 border-dashed border-white/10 flex items-center justify-center text-stone-600">+</div>
          <div>
            <div className="text-xs tracking-widest text-stone-500 uppercase">Slot {idx + 1}</div>
            <div className="text-sm text-stone-400">
              {isActive ? "Choose a Pokémon →" : "Empty — click to fill"}
            </div>
          </div>
        </div>
      </button>
    );
  }

  const p = slot.pokemon;
  const detail = slot.detail; // lazily loaded PokéAPI detail
  const spTotal = Object.values(slot.sp).reduce((a, b) => a + b, 0);
  const spOver = spTotal > 66;

  // Build dropdown choices — prefer learnset/abilities from PokéAPI, overlay
  // with usage when we have a meta entry.
  const metaMoves = new Map((p.moves || []).map((m) => [m.name.toLowerCase(), m.usage]));
  const metaAbilities = new Map((p.abilities || []).map((a) => [a.name.toLowerCase(), a.usage]));
  const allMoves = detail?.learnset?.length
    ? detail.learnset.map((m) => ({ name: m.name, usage: metaMoves.get(m.name.toLowerCase()) }))
    : (p.moves || []).map((m) => ({ name: m.name, usage: m.usage }));
  const allAbilities = detail?.abilities?.length
    ? detail.abilities.map((a) => ({ name: a.name, usage: metaAbilities.get(a.name.toLowerCase()), hidden: a.hidden }))
    : (p.abilities || []).map((a) => ({ name: a.name, usage: a.usage }));

  const stats = detail?.baseStats || p.baseStats;
  const types = p.types?.length ? p.types : (detail?.types || []);

  return (
    <div className="panel p-4 rounded-sm" style={{ "--accent": TYPE_COLORS[types[0]] || "#ff3860" }}>
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div
            className="w-14 h-14 flex items-center justify-center font-bold text-lg corner-bracket overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${TYPE_COLORS[types[0]] || "#333"}40, ${TYPE_COLORS[types[1] || types[0]] || "#333"}40)`,
            }}
          >
            {detail?.sprite ? (
              <img src={detail.sprite} alt={p.name} className="w-full h-full object-contain" />
            ) : (
              p.name.slice(0, 2).toUpperCase()
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-stone-600">SLOT {idx + 1}</span>
              <span className="text-base font-bold truncate">{p.name}</span>
              {p.rank && <span className="text-[10px] text-stone-500">#{p.rank} · {p.usage?.toFixed(1)}%</span>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setExpanded(!expanded)} className="p-1 text-stone-500 hover:text-white transition" title="Edit details">
                <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              <button onClick={onClear} className="p-1 text-stone-500 hover:text-rose-400 transition" title="Clear slot">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {types.map((t) => (
              <span key={t} className="type-chip" style={{ background: TYPE_COLORS[t], color: "#000" }}>{t}</span>
            ))}
            {p.role && <span className="text-[10px] text-stone-500 ml-1">{p.role}</span>}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div><span className="text-stone-500">ABL </span><span className="text-stone-200">{slot.ability || "—"}</span></div>
            <div><span className="text-stone-500">ITM </span><span className="text-stone-200">{slot.item || "—"}</span></div>
            <div className="col-span-2 truncate">
              <span className="text-stone-500">MV </span>
              <span className="text-stone-200">{slot.moves.filter(Boolean).join(" / ") || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
          {stats && (
            <div>
              <div className="text-[10px] tracking-widest text-stone-500 uppercase mb-2">Base Stats</div>
              <div className="grid grid-cols-6 gap-2">
                {["hp", "atk", "def", "spa", "spd", "spe"].map((stat) => {
                  const value = stats[stat] ?? 0;
                  const pct = Math.min(100, (value / 200) * 100);
                  return (
                    <div key={stat} className="text-center">
                      <div className="text-[9px] text-stone-500 uppercase">{stat}</div>
                      <div className="text-sm font-bold">{value}</div>
                      <div className="stat-bar mt-1">
                        <div className="stat-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] tracking-widest text-stone-500 uppercase">Ability</label>
              <select
                value={slot.ability || ""}
                onChange={(e) => onUpdate({ ability: e.target.value })}
                className="w-full bg-black/40 border border-white/10 px-2 py-1 text-xs mt-1"
              >
                <option value="">—</option>
                {allAbilities.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}{a.usage != null ? ` (${a.usage}%)` : a.hidden ? " (Hidden)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] tracking-widest text-stone-500 uppercase">Held Item</label>
              {p.items?.length ? (
                <select
                  value={slot.item || ""}
                  onChange={(e) => onUpdate({ item: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 px-2 py-1 text-xs mt-1"
                >
                  <option value="">—</option>
                  {p.items.map((it) => (
                    <option key={it.name} value={it.name}>{it.name} ({it.usage}%)</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={slot.item || ""}
                  onChange={(e) => onUpdate({ item: e.target.value })}
                  placeholder="Enter item name"
                  className="w-full bg-black/40 border border-white/10 px-2 py-1 text-xs mt-1"
                />
              )}
            </div>
            <div>
              <label className="text-[10px] tracking-widest text-stone-500 uppercase">Nature</label>
              <select
                value={slot.nature}
                onChange={(e) => onUpdate({ nature: e.target.value })}
                className="w-full bg-black/40 border border-white/10 px-2 py-1 text-xs mt-1"
              >
                {NATURES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="text-[10px] tracking-widest text-stone-500 uppercase mb-2">
              Moves {detail?.learnset ? `· Learnset (${detail.learnset.length})` : ""}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((mi) => (
                <select
                  key={mi}
                  value={slot.moves[mi] || ""}
                  onChange={(e) => onUpdateMove(mi, e.target.value || null)}
                  className="bg-black/40 border border-white/10 px-2 py-1 text-xs"
                >
                  <option value="">— Move {mi + 1} —</option>
                  {allMoves.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}{m.usage != null ? ` (${m.usage}%)` : ""}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest text-stone-500 uppercase">SP Training (max 32 / stat)</div>
              <div className={`text-[10px] tracking-widest font-bold ${spOver ? "text-rose-500" : spTotal === 66 ? "text-emerald-400" : "text-stone-400"}`}>
                {spTotal}/66
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {["hp", "atk", "def", "spa", "spd", "spe"].map((stat) => (
                <div key={stat}>
                  <label className="text-[9px] text-stone-500 uppercase block text-center">{stat}</label>
                  <input
                    type="number" min="0" max="32"
                    value={slot.sp[stat]}
                    onChange={(e) => onUpdateSp(stat, e.target.value)}
                    className="w-full bg-black/40 border border-white/10 px-1 py-1 text-xs text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
