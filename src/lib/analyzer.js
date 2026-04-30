// Rule-based team analyzer. Produces the same shape the UI expects so we
// can render it through the existing AnalysisView without an LLM call.
//
// Philosophy: conservative heuristics grounded in VGC fundamentals
// (Fake Out / speed control / redirection / type synergy). Every piece of
// output is computed from the actual team, not a fixed template.

import { TYPES, getDefensiveMultiplier } from "./types.js";

// Moves that grant priority or otherwise count as "speed control".
const TAILWIND_MOVES = new Set(["Tailwind"]);
const TRICK_ROOM_MOVES = new Set(["Trick Room"]);
const FAKE_OUT = "Fake Out";
const REDIRECT_MOVES = new Set(["Rage Powder", "Follow Me", "Ally Switch"]);
const PRIORITY_MOVES = new Set([
  "Sucker Punch", "Bullet Punch", "Aqua Jet", "Shadow Sneak",
  "Extreme Speed", "Ice Shard", "Mach Punch", "Quick Attack",
  "Vacuum Wave", "Water Shuriken",
]);
const CHOICE_SCARF = "Choice Scarf";

const INTIMIDATE = "Intimidate";

export function analyzeTeam({ team, format, typeAnalysis }) {
  const mons = team.filter((s) => s.pokemon).map((s) => ({
    name: s.pokemon.name,
    types: s.pokemon.types || [],
    role: s.pokemon.role || "",
    ability: s.ability || "",
    item: s.item || "",
    moves: (s.moves || []).filter(Boolean),
    baseStats: s.pokemon.baseStats || s.detail?.baseStats || null,
    sp: s.sp,
  }));

  if (mons.length === 0) return null;

  const tailwinders = mons.filter((m) => m.moves.some((x) => TAILWIND_MOVES.has(x))).map((m) => m.name);
  const trickRoomers = mons.filter((m) => m.moves.some((x) => TRICK_ROOM_MOVES.has(x))).map((m) => m.name);
  const scarfers = mons.filter((m) => m.item === CHOICE_SCARF).map((m) => m.name);
  const priorityUsers = mons.filter((m) => m.moves.some((x) => PRIORITY_MOVES.has(x))).map((m) => m.name);
  const fakeOutUsers = mons.filter((m) => m.moves.includes(FAKE_OUT)).map((m) => m.name);
  const redirection = mons.filter((m) => m.moves.some((x) => REDIRECT_MOVES.has(x))).map((m) => m.name);
  const intimidators = mons.filter((m) => m.ability === INTIMIDATE).map((m) => m.name);

  const avgSpe = avg(mons.map((m) => m.baseStats?.spe).filter(Boolean));
  const avgHp = avg(mons.map((m) => m.baseStats?.hp).filter(Boolean));

  const allTypes = mons.flatMap((m) => m.types);
  const typeCounts = allTypes.reduce((acc, t) => ((acc[t] = (acc[t] || 0) + 1), acc), {});
  const concentratedTypes = Object.entries(typeCounts).filter(([, n]) => n >= 3);

  const weaknesses = TYPES.map((t) => ({
    type: t,
    weak: typeAnalysis[t].weak,
    resist: typeAnalysis[t].resist + typeAnalysis[t].immune,
  }));
  // A "critical hole" = a type where you'll struggle to bring a resist AND
  // multiple picks are weak. The old `weak >= 3` rule fired on nearly every
  // team; this stricter version only flags real coverage gaps.
  const criticalHoles = weaknesses.filter(
    (w) => (w.weak >= 4) || (w.weak >= 3 && w.resist < 2) || (w.weak >= 2 && w.resist === 0)
  );
  const totalResists = weaknesses.reduce((sum, w) => sum + Math.max(0, w.resist - 1), 0);

  // ---- archetype detection ------------------------------------------------
  let archetype = "Balanced Goodstuffs";
  if (trickRoomers.length >= 1 && avgSpe < 75) archetype = "Trick Room";
  else if (tailwinders.length >= 2) archetype = "Tailwind Offense";
  else if (mons.some((m) => m.ability === "Drizzle")) archetype = "Rain Offense";
  else if (mons.some((m) => m.ability?.startsWith("Drought"))) archetype = "Sun Offense";
  else if (mons.some((m) => m.ability === "Sand Stream")) archetype = "Sand Offense";
  else if (mons.some((m) => m.ability?.startsWith("Snow Warning"))) archetype = "Snow / Veil";
  else if (fakeOutUsers.length >= 2 && intimidators.length >= 1) archetype = "Fake Out Control";
  else if (avgSpe >= 100 && priorityUsers.length >= 2) archetype = "Hyper Offense";

  // ---- speed control ------------------------------------------------------
  const scParts = [];
  if (tailwinders.length) scParts.push(`Tailwind on ${tailwinders.join(", ")}`);
  if (trickRoomers.length) scParts.push(`Trick Room on ${trickRoomers.join(", ")}`);
  if (scarfers.length) scParts.push(`Choice Scarf on ${scarfers.join(", ")}`);
  if (priorityUsers.length) scParts.push(`priority moves on ${priorityUsers.join(", ")}`);
  const speed_control = scParts.length
    ? scParts.join("; ") + "."
    : "No speed control detected — consider adding Tailwind, Trick Room, or a Choice Scarf user.";

  // ---- fake out -----------------------------------------------------------
  let fake_out_users;
  if (fakeOutUsers.length === 0) {
    fake_out_users = format === "doubles"
      ? "No Fake Out user. Most top doubles teams carry at least one to contest tempo on turn 1."
      : "No Fake Out user (fine for Singles).";
  } else if (fakeOutUsers.length > 2) {
    fake_out_users = `${fakeOutUsers.join(", ")} all carry Fake Out — two is usually enough, consider freeing a slot.`;
  } else {
    fake_out_users = `${fakeOutUsers.join(", ")} ${fakeOutUsers.length === 1 ? "carries" : "carry"} Fake Out.`;
  }

  // ---- redirection --------------------------------------------------------
  const redirectionText = redirection.length
    ? `${redirection.join(", ")} provide redirection / ally support.`
    : format === "doubles"
      ? "No Rage Powder, Follow Me, or Ally Switch — setup sweepers will be easier to disrupt."
      : "Redirection not relevant in Singles.";

  // ---- type coverage ------------------------------------------------------
  const coverageParts = [];
  if (criticalHoles.length) {
    coverageParts.push(
      `Critical defensive holes: ${criticalHoles.map((h) => `${h.type} (${h.weak} weak / ${h.resist} resist)`).join(", ")}.`
    );
  }
  if (concentratedTypes.length) {
    coverageParts.push(
      `${concentratedTypes.map(([t, n]) => `${n} ${t}-types`).join(", ")} — spread attacks of those types can hurt.`
    );
  }
  if (totalResists < 6) coverageParts.push("Low overall resist count — consider adding a sturdier pivot.");
  const type_coverage = coverageParts.length ? coverageParts.join(" ") : "Defensive coverage looks balanced.";

  // ---- strengths / weaknesses --------------------------------------------
  const strengths = [];
  if (fakeOutUsers.length >= 1) strengths.push(`${fakeOutUsers.length} Fake Out user${fakeOutUsers.length > 1 ? "s" : ""} for turn-1 tempo.`);
  if (intimidators.length) strengths.push(`${intimidators.join(", ")} ${intimidators.length === 1 ? "brings" : "bring"} Intimidate pressure.`);
  if (tailwinders.length + trickRoomers.length + scarfers.length >= 2) strengths.push("Multiple layers of speed control.");
  if (redirection.length) strengths.push("Has redirection to protect setup / frail threats.");
  if (priorityUsers.length >= 2) strengths.push("Strong priority game to close vs fast teams.");
  if (totalResists >= 10) strengths.push("Wide type resistance profile.");
  if (mons.some((m) => m.ability === "Prankster")) strengths.push("Prankster utility for priority status / screens.");
  if (strengths.length === 0) strengths.push("Pick a cohesive win condition — currently no clear identity.");

  const weaknessesList = [];
  for (const hole of criticalHoles.slice(0, 3)) {
    weaknessesList.push(`${hole.type} spam is a real problem (${hole.weak} weak, ${hole.resist} resist).`);
  }
  if (fakeOutUsers.length === 0 && format === "doubles") weaknessesList.push("No Fake Out disrupter means you lose the turn-1 tempo war.");
  if (!tailwinders.length && !trickRoomers.length && !scarfers.length && !priorityUsers.length) {
    weaknessesList.push("No speed control — fast meta Pokémon (Sneasler, Aerodactyl) outrun you freely.");
  }
  if (redirection.length === 0 && format === "doubles" && mons.some((m) => m.baseStats?.hp && m.baseStats.hp <= 70)) {
    weaknessesList.push("Frail mons with no redirection are easy to double-target.");
  }
  if (concentratedTypes.length) weaknessesList.push(`${concentratedTypes.map(([t]) => t).join("/")} stacking leaves you open to spread moves.`);
  if (weaknessesList.length === 0) weaknessesList.push("No glaring structural weaknesses — execution matters most.");

  // ---- threats ------------------------------------------------------------
  const key_threats = [];
  const hasRockResist = weaknesses.find((w) => w.type === "Rock")?.resist >= 1;
  const hasFairyResist = weaknesses.find((w) => w.type === "Fairy")?.resist >= 1;
  const fightingWeak = weaknesses.find((w) => w.type === "Fighting")?.weak >= 2;
  const fireWeak = weaknesses.find((w) => w.type === "Fire")?.weak >= 2;

  if (fightingWeak) key_threats.push("Sneasler — Fighting/Poison sweeper you likely can't survive without priority.");
  if (!hasRockResist) key_threats.push("Aerodactyl — Tough Claws Rock Slide into an unresisted field is a flinch fest.");
  if (fireWeak) key_threats.push("Charizard Mega-Y — Drought + Heat Wave overwhelms Fire-weak teams.");
  if (!hasFairyResist) key_threats.push("Floette-Eternal — Light of Ruin hits hard with Calm Mind setup.");
  if (criticalHoles.some((h) => h.type === "Water")) key_threats.push("Rain teams (Pelipper + Basculegion / Archaludon) will drown you.");
  if (key_threats.length < 3) {
    key_threats.push("Kingambit — Supreme Overlord Kowtow Cleave late-game cleans if you lose members.");
    key_threats.push("Incineroar — Parting Shot pivot + Intimidate erodes setup attempts.");
  }

  // ---- suggestions --------------------------------------------------------
  const suggestions = [];
  if (fakeOutUsers.length === 0 && format === "doubles") suggestions.push("Add a Fake Out user (Incineroar, Maushold, or Sneasler).");
  if (!tailwinders.length && !trickRoomers.length) suggestions.push("Add speed control: Tailwind (Aerodactyl, Whimsicott, Talonflame) or Trick Room (Sinistcha, Farigiraf).");
  for (const hole of criticalHoles.slice(0, 2)) {
    suggestions.push(`Cover ${hole.type}: a ${resistSuggestion(hole.type)} would patch the hole.`);
  }
  if (redirection.length === 0 && format === "doubles") {
    suggestions.push("Consider Rage Powder (Sinistcha) or Follow Me (Maushold) to enable setup.");
  }
  if (concentratedTypes.length) {
    suggestions.push(`Diversify away from stacking ${concentratedTypes.map(([t]) => t).join("/")} — spread moves punish mono-type cores.`);
  }
  if (suggestions.length === 0) suggestions.push("Team structure is sound — focus on EV tuning and move selection.");

  // ---- grade --------------------------------------------------------------
  // Starting score 85 means a well-rounded 6-mon team with fundamentals
  // reaches A easily; penalties bring real issues down to B/C/D/F.
  let score = 85;
  score -= criticalHoles.length * 6;
  score -= concentratedTypes.length * 4;
  if (fakeOutUsers.length === 0 && format === "doubles") score -= 6;
  if (!tailwinders.length && !trickRoomers.length && !scarfers.length && !priorityUsers.length) score -= 6;
  if (mons.length < 6) score -= (6 - mons.length) * 4;

  // Bonuses — cohesive structure should pull teams to A.
  if (tailwinders.length >= 1 || trickRoomers.length >= 1 || scarfers.length >= 1) score += 3;
  if (fakeOutUsers.length >= 1 && format === "doubles") score += 3;
  if (redirection.length >= 1 && format === "doubles") score += 3;
  if (intimidators.length >= 1) score += 2;
  if (priorityUsers.length >= 2) score += 2;
  if (totalResists >= 12) score += 2;
  // Clear archetype identity (not "Balanced Goodstuffs") shows commitment.
  if (archetype !== "Balanced Goodstuffs") score += 2;

  score = Math.max(40, Math.min(100, score));
  const overall_grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

  return {
    overall_grade,
    archetype,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknessesList.slice(0, 5),
    speed_control,
    fake_out_users,
    redirection: redirectionText,
    type_coverage,
    key_threats: key_threats.slice(0, 5),
    suggestions: suggestions.slice(0, 5),
  };
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Suggest a common meta resist for a given attacking type.
function resistSuggestion(attackingType) {
  const map = {
    Fire: "Water-type like Milotic or Rotom-Wash",
    Water: "Grass / Water-resist like Sinistcha",
    Electric: "Ground-type like Garchomp or Excadrill",
    Grass: "Fire / Steel type like Charizard or Scizor",
    Ice: "Steel-type like Kingambit or Archaludon",
    Fighting: "Ghost / Psychic like Aegislash or Gengar",
    Poison: "Steel-type like Archaludon or Corviknight",
    Ground: "Flying / Levitate Pokémon like Corviknight or Rotom-Wash",
    Flying: "Electric / Rock-type like Aerodactyl or Tyranitar",
    Psychic: "Dark-type like Kingambit or Tyranitar",
    Bug: "Fire / Flying like Charizard or Talonflame",
    Rock: "Steel / Fighting-type like Corviknight or Excadrill",
    Ghost: "Dark-type like Kingambit or Tyranitar",
    Dragon: "Fairy-type like Floette-Eternal or Primarina",
    Dark: "Fairy / Fighting like Primarina or Sneasler",
    Steel: "Fire / Ground like Charizard or Garchomp",
    Fairy: "Steel / Poison like Scizor or Sneasler",
    Normal: "Ghost-type like Aegislash or Froslass",
  };
  return map[attackingType] || "resistant Pokémon";
}
