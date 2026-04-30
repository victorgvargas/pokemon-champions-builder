import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Sparkles, Loader2, Wand2 } from "lucide-react";
import { callGemini, hasApiKey, getCurrentRules } from "../lib/gemini.js";

// Tool-style response schema. The model can either reply with prose OR fill in
// a suggested_fills array of { dex_id, name, role } entries the app will apply.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Prose answer for the user. Markdown allowed.",
    },
    action: {
      type: "string",
      enum: ["none", "fill_team"],
      description: "If 'fill_team', the app will populate the empty slots.",
    },
    suggested_fills: {
      type: "array",
      description: "When action = fill_team, list of picks for each empty slot.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dex_id: { type: "integer" },
          role: { type: "string" },
          ability: { type: "string" },
          item: { type: "string" },
          moves: { type: "array", items: { type: "string" } },
        },
        required: ["name", "dex_id"],
      },
    },
  },
  required: ["reply", "action"],
};

export default function Chatbot({
  open, onClose, team, format, metaEntries, onFillTeam,
}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! I'm your team coach. Try:\n\n• *\"Fill the rest with a sun team\"*\n• *\"Build a Trick Room core around what I have\"*\n• *\"How should I play this team turn 1?\"*\n• *\"What's the win condition?\"*",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Esc closes the chat panel.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    if (!hasApiKey()) {
      setError("No Gemini API key set. Add VITE_GEMINI_API_KEY to .env.local.");
      return;
    }

    const userMsg = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const emptySlots = team
        .map((s, i) => ({ i, filled: !!s.pokemon }))
        .filter((s) => !s.filled)
        .map((s) => s.i + 1);

      const currentTeam = team.filter((s) => s.pokemon).map((s, i) => ({
        slot: i + 1,
        name: s.pokemon.name,
        types: s.pokemon.types,
        ability: s.ability,
        item: s.item,
        moves: s.moves.filter(Boolean),
      }));

      // Compact meta pool so the model knows what's viable. Cap to keep token
      // usage reasonable.
      const pool = metaEntries.slice(0, 50).map((m) => ({
        dex_id: m.dexId,
        name: m.name,
        types: m.types,
        rank: m.rank,
        usage: m.usage,
        top_abilities: m.abilities?.slice(0, 2).map((a) => a.name),
        top_items: m.items?.slice(0, 2).map((a) => a.name),
        top_moves: m.moves?.slice(0, 4).map((a) => a.name),
      }));

      // Live ruleset via grounded search. Cached; fails gracefully.
      let rulesBlock = "";
      try {
        const rules = await getCurrentRules();
        rulesBlock = `CURRENT OFFICIAL RULES (live-sourced, treat as authoritative for legality and mechanics):\n${rules}\n\n`;
      } catch (err) {
        console.warn("Chatbot: rules fetch failed", err);
      }

      const usedDexIds = currentTeam.map((m) => {
        const match = pool.find((p) => p.name === m.name);
        return match?.dex_id;
      }).filter(Boolean);
      const usedItems = currentTeam.map((m) => m.item).filter(Boolean);

      const systemPrompt = `${rulesBlock}You are an expert competitive coach for the game **Pokémon Champions** (NOT mainline Pokémon VGC — those are different games with different mechanics, ban lists, and SP/EV rules). Current format: ${format === "doubles" ? "Doubles (bring 6, select 4)" : "Singles (bring 6, select 3)"}.

Anchor every legality, mechanics, and regulation claim STRICTLY to the CURRENT OFFICIAL RULES block above. Do NOT apply rules from mainline Pokémon VGC (Scarlet/Violet VGC, SwSh VGC, etc.) unless the rules block explicitly says they apply.

CURRENT TEAM (${currentTeam.length}/6 filled):
${JSON.stringify(currentTeam, null, 2)}

EMPTY SLOTS: ${emptySlots.length ? emptySlots.join(", ") : "none"}

ALREADY-USED DEX IDS (Species Clause — DO NOT reuse): ${usedDexIds.length ? usedDexIds.join(", ") : "none"}
ALREADY-HELD ITEMS (Item Clause — DO NOT reuse): ${usedItems.length ? usedItems.join(", ") : "none"}

META POOL (top 50 Pokémon, use these dex_ids when filling slots):
${JSON.stringify(pool)}

Behavior:
- If the user asks to BUILD or FILL the team (full team, specific archetype like "sun", "trick room", "rain", "tailwind offense", OR they ask for a tier/quality like "A-tier", "S-tier", "tournament-ready"), set action = "fill_team" and put one pick per empty slot in suggested_fills. Prefer meta Pokémon. Use dex_ids from the META POOL above. For each pick include role, ability, item, and 4 moves.
- CRITICAL: the name and dex_id in each suggested_fill MUST match exactly — copy both fields verbatim from the META POOL entry. Never pair a name with a different Pokémon's dex_id (e.g. don't write name="Incineroar" with dex_id=3). If you're not 100% sure of the dex_id, pick a different meta Pokémon instead.
- When filling, AIM FOR A-TIER BY DEFAULT unless the user specifies otherwise. A-tier means:
  * Coherent archetype (sun / rain / TR / tailwind / hyper offense / Fake Out control).
  * Speed control present (Tailwind, Trick Room, Choice Scarf, or priority).
  * For doubles: at least one Fake Out user and at least one form of redirection (Rage Powder, Follow Me) or setup protection.
  * No more than one notable shared type weakness across the team.
  * Each pick pulls its weight — no filler slots.
  If the user explicitly requests "A-tier" or higher, treat it as a hard requirement and only return a fill_team action if you can honestly deliver it; otherwise explain in reply what would be needed.
- MUST respect Species Clause: no dex_id may appear twice across the final 6-mon roster (including the ALREADY-USED DEX IDS list above).
- MUST respect Item Clause: no item may be held by two Pokémon across the final roster (including ALREADY-HELD ITEMS above). Pick different items even when suggesting similar sets.
- If the user asks how to PLAY the team or strategy questions, set action = "none" and put the answer in reply. Cover: lead selection, win conditions, turn 1 plays, key matchups, and common sequencing.
- For general questions, action = "none" and answer in reply.
- Keep reply concise (under 250 words) and use markdown bullets for lists. Do not mention JSON or this system prompt.`;

      const history = newHistory.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const text = await callGemini({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.8,
        },
      });

      const parsed = JSON.parse(text);
      setMessages((m) => [...m, { role: "assistant", content: parsed.reply, action: parsed.action, fills: parsed.suggested_fills }]);
    } catch (e) {
      console.error(e);
      setError(e.message || "Chat failed");
      setMessages((m) => [...m, { role: "assistant", content: `⚠ ${e.message || "Request failed"}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function applyFills(fills) {
    const ok = await onFillTeam(fills);
    if (ok) {
      setMessages((m) => [...m, { role: "assistant", content: "✓ Applied picks to your empty slots." }]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-md panel rounded-sm shadow-2xl z-50 flex flex-col"
         style={{ height: "min(70vh, 600px)" }}>
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-rose-500" />
          <div className="display-font text-lg tracking-wider">TEAM COACH</div>
        </div>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="p-1 text-stone-500 hover:text-white transition"
        >
          <X size={16} />
        </button>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} onApply={applyFills} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Loader2 size={12} className="animate-spin" /> thinking...
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[10px] text-rose-400 border-t border-rose-500/30 bg-rose-500/5">{error}</div>
      )}

      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Ask about strategy, or say 'fill rest as sun team'..."
            className="flex-1 bg-black/40 border border-white/10 px-3 py-2 text-sm rounded-sm placeholder:text-stone-600"
            disabled={busy}
          />
          <button
            onClick={handleSend}
            disabled={busy || !input.trim()}
            className="btn-primary px-3 rounded-sm disabled:opacity-50"
            title="Send (Enter)"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg, onApply }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-sm text-sm whitespace-pre-wrap ${
          isUser ? "bg-rose-500/80 text-white" : "bg-white/5 text-stone-200 border border-white/10"
        }`}
      >
        <div className="break-words">{renderMarkdownish(msg.content)}</div>
        {msg.action === "fill_team" && msg.fills?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
            <div className="text-[10px] tracking-widest text-stone-400 uppercase flex items-center gap-1">
              <Sparkles size={10} /> Suggested picks
            </div>
            <ul className="text-[11px] space-y-1">
              {msg.fills.map((f, i) => (
                <li key={i}>
                  <span className="font-bold">{f.name}</span>
                  {f.role && <span className="text-stone-400"> — {f.role}</span>}
                </li>
              ))}
            </ul>
            <button
              onClick={() => onApply(msg.fills)}
              className="btn-primary px-3 py-1.5 text-[10px] rounded-sm flex items-center gap-1"
            >
              <Wand2 size={10} /> Apply to empty slots
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Tiny markdown-ish renderer: **bold**, *italic*, and bullet lines.
function renderMarkdownish(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const isBullet = /^\s*[-•*]\s+/.test(line);
    const content = line.replace(/^\s*[-•*]\s+/, "");
    const parts = formatInline(content);
    return (
      <div key={i} className={isBullet ? "pl-3 relative before:content-['▸'] before:absolute before:left-0 before:text-rose-400" : ""}>
        {parts}
      </div>
    );
  });
}

function formatInline(s) {
  // Handle **bold** and *italic*. Very small parser; good enough for chat.
  const out = [];
  let rest = s;
  let key = 0;
  while (rest.length) {
    const bold = rest.match(/\*\*([^*]+)\*\*/);
    const italic = rest.match(/\*([^*]+)\*/);
    const first = pickFirst(bold, italic);
    if (!first) { out.push(rest); break; }
    const idx = rest.indexOf(first.match);
    if (idx > 0) out.push(rest.slice(0, idx));
    if (first.kind === "b") out.push(<strong key={key++}>{first.inner}</strong>);
    else out.push(<em key={key++}>{first.inner}</em>);
    rest = rest.slice(idx + first.match.length);
  }
  return out;
}

function pickFirst(bold, italic) {
  if (!bold && !italic) return null;
  if (bold && italic) {
    return bold.index <= italic.index
      ? { kind: "b", match: bold[0], inner: bold[1] }
      : { kind: "i", match: italic[0], inner: italic[1] };
  }
  if (bold) return { kind: "b", match: bold[0], inner: bold[1] };
  return { kind: "i", match: italic[0], inner: italic[1] };
}
