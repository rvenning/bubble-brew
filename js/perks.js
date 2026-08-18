// Bubble & Brew — the Larder. Permanent perks bought with essence.
//
// Deliberately small, and deliberately not a damage number. Every perk changes
// the SHAPE of a decision rather than the size of a reward: a point of
// headroom, a head start, sight of the next chip, a softer landing, a wider
// choice at the shop.
//
// The hard lesson, found by the bots: HEADROOM IS THE STRONGEST THING IN THE
// GAME and it compounds. Two levels of Cauldron Lid took a fully-kitted
// ordinary player to three stars on the hardest recipe 100% of the time — a
// Larder that had eaten the campaign rather than helped with it. So the raw
// power perks sell exactly one level each, and the Larder is kept interesting
// with perks that widen what you can CHOOSE instead (Shelf Space, Haggler).
//
// `costs` is per level bought, so its length is the maximum level.

const PERKS = [
  {
    id: "lid",
    name: "Cauldron Lid",
    emoji: "🫙",
    blurb: "A heavier lid. The gauge takes one more before it lets go.",
    costs: [90],
    effect: () => "+1 fizz limit in every round",
  },
  {
    id: "apprentice",
    name: "Apprentice",
    emoji: "🧑‍🍳",
    blurb: "Someone else gets the pot going before you even start stirring.",
    costs: [80],
    effect: () => "Start every round one step up",
  },
  {
    id: "spectacles",
    name: "Spectacles",
    emoji: "👓",
    blurb: "Squint into the bag at the start of a round and see what's on top.",
    costs: [110, 300],
    effect: (lvl) => `See the first ${lvl === 1 ? "chip" : lvl + " chips"} of every round`,
  },
  {
    id: "salvage",
    name: "Salvage",
    emoji: "♻️",
    blurb: "Scrape the good bits off the ceiling. A blow-up stops being a nothing.",
    costs: [140, 340],
    effect: (lvl) => `Keep ${lvl === 1 ? "35" : "60"}% of your points when it blows`,
  },
  {
    id: "pockets",
    name: "Deep Pockets",
    emoji: "💰",
    blurb: "Turn up to the cauldron with coins already in hand.",
    costs: [60, 160, 340],
    effect: (lvl) => `+${lvl * 5} coins at the start of every brew`,
  },
  {
    id: "shelf",
    name: "Shelf Space",
    emoji: "🗄️",
    blurb: "A word with the apothecary. More on the counter to choose between.",
    costs: [90, 240],
    effect: (lvl) => `+${lvl} chip${lvl === 1 ? "" : "s"} on offer between rounds`,
  },
  {
    id: "haggle",
    name: "Haggler",
    emoji: "🤝",
    blurb: "You know what these things are worth. So does she, but she likes you.",
    costs: [120, 300],
    effect: (lvl) => `Every chip costs ${lvl} coin${lvl === 1 ? "" : "s"} less`,
  },
];

const SALVAGE_FRACTION = [0, 0.35, 0.6];
const MIN_CHIP_COST = 2;      // a haggler can never get anything for nothing

function perkLevel(progress, id) {
  return (progress && progress.perks && progress.perks[id]) || 0;
}

// The tuning an owned set of perks applies to a brew. Everything the engine
// needs, and nothing the engine has to know about the Larder to use it.
function perkLoadout(progress) {
  return {
    limitBonus: perkLevel(progress, "lid"),
    startPos: perkLevel(progress, "apprentice"),
    freePeek: perkLevel(progress, "spectacles"),
    salvage: SALVAGE_FRACTION[perkLevel(progress, "salvage")] || 0,
    startCoins: perkLevel(progress, "pockets") * 5,
    shopSlots: perkLevel(progress, "shelf"),
    discount: perkLevel(progress, "haggle"),
  };
}

// Essence a finished brew pays. Stars are most of it, so replaying a brew you
// have already three-starred is a poor way to farm — the campaign ahead of you
// always pays better than the one behind. A failed brew still pays a little,
// because a run of bad luck should not leave you with nothing to show.
function essenceFor(result) {
  if (result.mode === "endless" || result.mode === "daily") return 4 + Math.floor(result.score / 150);
  if (!result.win) return 2;
  return 12 + result.stars * 8;
}

if (typeof module !== "undefined") {
  module.exports = { PERKS, SALVAGE_FRACTION, MIN_CHIP_COST, perkLevel, perkLoadout, essenceFor };
}
