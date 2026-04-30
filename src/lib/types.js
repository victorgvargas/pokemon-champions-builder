// Type chart + color palette (defender perspective).

export const TYPES = [
  "Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison","Ground",
  "Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy",
];

export const TYPE_CHART = {
  Normal:   { Rock:0.5, Ghost:0, Steel:0.5 },
  Fire:     { Fire:0.5, Water:0.5, Grass:2, Ice:2, Bug:2, Rock:0.5, Dragon:0.5, Steel:2 },
  Water:    { Fire:2, Water:0.5, Grass:0.5, Ground:2, Rock:2, Dragon:0.5 },
  Electric: { Water:2, Electric:0.5, Grass:0.5, Ground:0, Flying:2, Dragon:0.5 },
  Grass:    { Fire:0.5, Water:2, Grass:0.5, Poison:0.5, Ground:2, Flying:0.5, Bug:0.5, Rock:2, Dragon:0.5, Steel:0.5 },
  Ice:      { Fire:0.5, Water:0.5, Grass:2, Ice:0.5, Ground:2, Flying:2, Dragon:2, Steel:0.5 },
  Fighting: { Normal:2, Ice:2, Poison:0.5, Flying:0.5, Psychic:0.5, Bug:0.5, Rock:2, Ghost:0, Dark:2, Steel:2, Fairy:0.5 },
  Poison:   { Grass:2, Poison:0.5, Ground:0.5, Rock:0.5, Ghost:0.5, Steel:0, Fairy:2 },
  Ground:   { Fire:2, Electric:2, Grass:0.5, Poison:2, Flying:0, Bug:0.5, Rock:2, Steel:2 },
  Flying:   { Electric:0.5, Grass:2, Fighting:2, Bug:2, Rock:0.5, Steel:0.5 },
  Psychic:  { Fighting:2, Poison:2, Psychic:0.5, Dark:0, Steel:0.5 },
  Bug:      { Fire:0.5, Grass:2, Fighting:0.5, Poison:0.5, Flying:0.5, Psychic:2, Ghost:0.5, Dark:2, Steel:0.5, Fairy:0.5 },
  Rock:     { Fire:2, Ice:2, Fighting:0.5, Ground:0.5, Flying:2, Bug:2, Steel:0.5 },
  Ghost:    { Normal:0, Psychic:2, Ghost:2, Dark:0.5 },
  Dragon:   { Dragon:2, Steel:0.5, Fairy:0 },
  Dark:     { Fighting:0.5, Psychic:2, Ghost:2, Dark:0.5, Fairy:0.5 },
  Steel:    { Fire:0.5, Water:0.5, Electric:0.5, Ice:2, Rock:2, Steel:0.5, Fairy:2 },
  Fairy:    { Fire:0.5, Fighting:2, Poison:0.5, Dragon:2, Dark:2, Steel:0.5 },
};

export const TYPE_COLORS = {
  Normal: "#a8a878", Fire: "#f08030", Water: "#6890f0", Electric: "#f8d030",
  Grass: "#78c850", Ice: "#98d8d8", Fighting: "#c03028", Poison: "#a040a0",
  Ground: "#e0c068", Flying: "#a890f0", Psychic: "#f85888", Bug: "#a8b820",
  Rock: "#b8a038", Ghost: "#705898", Dragon: "#7038f8", Dark: "#705848",
  Steel: "#b8b8d0", Fairy: "#ee99ac",
};

export function getDefensiveMultiplier(defenderTypes, attackingType) {
  let mult = 1;
  defenderTypes.forEach((dt) => {
    const eff = TYPE_CHART[attackingType]?.[dt];
    if (eff !== undefined) mult *= eff;
  });
  return mult;
}

export const NATURES = [
  "Hardy","Lonely","Brave","Adamant","Naughty",
  "Bold","Docile","Relaxed","Impish","Lax",
  "Timid","Hasty","Serious","Jolly","Naive",
  "Modest","Mild","Quiet","Bashful","Rash",
  "Calm","Gentle","Sassy","Careful","Quirky",
];
