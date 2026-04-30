// SP (= EV) spread heuristic for Pokémon Champions.
//
// Rules: 66 total SP, max 32 per stat (vs the main-series 508/252). We invest
// in at most 3 stats and distribute 32/32/2 when the budget allows, which is
// how most top spreads on Pikalytics look.
//
// Strategy: pick an offensive stat based on the Pokémon's higher attacking
// stat (atk vs spa), then pick one or two bulk stats based on role / base
// stats / nature. Returns { hp, atk, def, spa, spd, spe } summing to <= 66.

const MAX_PER_STAT = 32;
const TOTAL = 66;

// Suggest a spread from base stats + role + ability + nature.
// `base` is { hp, atk, def, spa, spd, spe } base stats. `ability` and
// `nature` are reserved for future refinement (e.g. Marvel Scale wants HP,
// Stamina wants Def) but aren't currently consulted — passing them keeps
// callers forward-compatible.
export function suggestSpread({ base, role = "", ability: _a = "", nature: _n = "Adamant", moves = [] }) {
  if (!base) return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  void _a; void _n;

  const rl = role.toLowerCase();

  // Offensive stat — whichever is higher, unless the role clearly names one.
  let atkStat;
  if (/physical|attacker|sweeper|closer/.test(rl) && base.atk >= base.spa) atkStat = "atk";
  else if (/special/.test(rl)) atkStat = "spa";
  else atkStat = base.atk >= base.spa ? "atk" : "spa";

  // Speed tier decision. Skip speed investment on:
  //   - Trick Room setters / users (want to be slow)
  //   - Intimidate / Prankster / setup-heavy bulky pivots
  //   - Pokémon with very low base Spe (<60) where investment is wasted
  const isTRMon = /trick room/i.test(role) || moves.includes("Trick Room");
  const isSlowPivot = /support|bulky|pivot|setter|redirect/.test(rl) && base.spe < 75;
  const wantsSpeed = !isTRMon && !isSlowPivot && base.spe >= 70;

  const invest = {};
  const order = [];

  // 1. Offensive stat always gets max.
  invest[atkStat] = MAX_PER_STAT;
  order.push(atkStat);

  // 2. Speed vs bulk.
  if (wantsSpeed) {
    invest.spe = MAX_PER_STAT;
    order.push("spe");
    // Remaining 2 → the bulk stat that most helps this Pokémon.
    const leftover = TOTAL - MAX_PER_STAT * 2;
    if (leftover > 0) {
      const bulk = pickBulkStat(base);
      invest[bulk] = (invest[bulk] || 0) + leftover;
      order.push(bulk);
    }
  } else {
    // No speed investment → two bulk stats. Pick one physical, one special
    // if possible; otherwise stack the weaker defensive stat.
    const bulk1 = pickBulkStat(base);
    invest[bulk1] = MAX_PER_STAT;
    order.push(bulk1);
    const bulk2 = pickBulkStat(base, bulk1);
    const leftover = TOTAL - MAX_PER_STAT * 2;
    if (leftover > 0) {
      invest[bulk2] = (invest[bulk2] || 0) + leftover;
      order.push(bulk2);
    }
  }

  // Priority-abilities/items hint: pure walls (e.g. Leftovers + recovery) want
  // HP first. Override if we detected low Spe + HP-scaling role.
  if (/wall|bulk|tank/.test(rl) && invest.hp === undefined && base.hp >= 80) {
    // Swap the lowest-priority investment for HP.
    const last = order[order.length - 1];
    const moved = invest[last];
    delete invest[last];
    invest.hp = moved;
  }

  const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const [k, v] of Object.entries(invest)) out[k] = v;
  return out;
}

function pickBulkStat(base, exclude) {
  // Prefer HP when it's high (scales both defenses). Otherwise pick the
  // weaker of Def / SpD to round out the bulk.
  const candidates = [];
  if ("hp" !== exclude) candidates.push({ stat: "hp", score: base.hp * 1.2 });
  if ("def" !== exclude) candidates.push({ stat: "def", score: base.def });
  if ("spd" !== exclude) candidates.push({ stat: "spd", score: base.spd });
  // Higher score = more value per SP. But to patch weaknesses we want the
  // LOWER defensive stat when HP is already decent. Simple rule: pick HP if
  // it's highest, else pick the lower of Def/SpD.
  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0].stat === "hp") return "hp";
  // hp not picked — choose lower defense so we're balanced.
  const defs = candidates.filter((c) => c.stat !== "hp").sort((a, b) => a.score - b.score);
  return defs[0]?.stat || "hp";
}

// Pick a nature that complements the suggested spread — ensures the +stat
// matches the offensive investment and -stat drops an unused attacking stat.
export function suggestNature({ base, moves = [], role = "" }) {
  const prefersPhysical = base.atk >= base.spa;
  const needsSpeed = !/trick room/i.test(role) && !moves.includes("Trick Room") && base.spe >= 70;

  if (prefersPhysical && needsSpeed) return "Jolly";
  if (prefersPhysical && !needsSpeed) return "Adamant";
  if (!prefersPhysical && needsSpeed) return "Timid";
  return "Modest";
}
