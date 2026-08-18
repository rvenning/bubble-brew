// Bubble & Brew — the campaign: 20 brews across 5 chapters.
//
// Every brew is a self-contained little bag-builder. You get the recipe's
// starting bag, five rounds at the cauldron, and an apothecary that stocks only
// what that chapter has unlocked — so a brew is a designed puzzle rather than a
// consequence of how the last one went. Nothing carries over but Larder perks,
// which is what keeps the whole campaign winnable no matter what order it is
// played in, and what lets tests/bot.test.js assert that honestly.
//
//   bag       — the chips you start every round with (they all go back in)
//   shop      — what the apothecary can offer between rounds
//   fizzLimit — fizz you can take before the lid comes off
//   targets   — total points for 1, 2 and 3 stars
//
// Difficulty moves on four dials and never on "the numbers got bigger": more
// fizzroot in the bag, a lower limit, a shop that offers temptation instead of
// safety, and targets that can only be reached by pushing past a comfortable
// stop. Change a number here and let the bot tell you what it did.

// { chipId: count } -> a flat bag array. Keeps a recipe readable as a recipe.
function pack(spec) {
  const out = [];
  for (const id of Object.keys(spec)) for (let i = 0; i < spec[id]; i++) out.push(id);
  return out;
}

const CHAPTERS = [
  { name: "The Kitchen Garden",   emoji: "🌱", theme: ["#1f3d2b", "#44794a"],
    intro: "Moonleaf and calmwort. Learn what a fizzroot does before it does it to you." },
  { name: "The Glimmer Grove",    emoji: "✨", theme: ["#2b3358", "#5468ac"],
    intro: "Coins that land the moment they're drawn, and an eye that sees what's coming." },
  { name: "The Ember Hollow",     emoji: "🔥", theme: ["#4a2418", "#b1552b"],
    intro: "Emberbark pays you for stopping. Echobell dares you not to." },
  { name: "The Spider Vault",     emoji: "🕸️", theme: ["#2d2a3d", "#6b6486"],
    intro: "Lilies that grow on each other, and a thorn that eats a fizzroot whole." },
  { name: "The Quicksilver Deep", emoji: "⚗️", theme: ["#123540", "#297687"],
    intro: "Free draws you never agreed to, and a lid that holds a little longer." },
];

// Shop shelves, cumulative — each chapter keeps everything before it.
const SHELF_1 = ["leaf1", "leaf2", "leaf4", "calm1", "calm2", "calm3"];
const SHELF_2 = SHELF_1.concat(["glim1", "glim2", "glim3", "owl1", "owl2"]);
const SHELF_3 = SHELF_2.concat(["ember1", "ember2", "ember3", "bell1", "bell2"]);
const SHELF_4 = SHELF_3.concat(["lily1", "lily2", "thorn1", "thorn2"]);
const SHELF_5 = SHELF_4.concat(["quick1", "quick2", "quick3", "iron1", "iron2"]);

const BREWS = [
  /* ---- Chapter 1: The Kitchen Garden ---------------------------------- */
  { chapter: 0, name: "Bubblewater", emoji: "🫧",
    bag: pack({ fizz1: 4, fizz2: 2, fizz3: 1, leaf1: 5 }),
    shop: SHELF_1, fizzLimit: 8, startCoins: 6, targets: [80, 145, 195],
    hint: "Every chip pushes the rod up. Only fizzroot fills the gauge." },

  { chapter: 0, name: "Frog's Breath", emoji: "🐸",
    bag: pack({ fizz1: 4, fizz2: 2, fizz3: 1, leaf1: 4 }),
    shop: SHELF_1, fizzLimit: 7, startCoins: 7, targets: [45, 85, 110],
    hint: "Calmwort takes fizz back off the gauge. Cheap, and it dilutes your bag." },

  { chapter: 0, name: "Dozy Draught", emoji: "😴",
    bag: pack({ fizz1: 5, fizz2: 2, fizz3: 1, leaf1: 4 }),
    shop: SHELF_1, fizzLimit: 7, startCoins: 8, targets: [50, 90, 120],
    hint: "A big moonleaf moves you four steps for no risk at all — if you can draw it." },

  { chapter: 0, name: "Green Fizzle", emoji: "🌿",
    bag: pack({ fizz1: 4, fizz2: 3, fizz3: 1, leaf1: 4 }),
    shop: SHELF_1, fizzLimit: 7, startCoins: 9, targets: [45, 85, 110],
    hint: "Points rise faster the further up you get. The last few steps are the ones worth having." },

  /* ---- Chapter 2: The Glimmer Grove ------------------------------------ */
  { chapter: 1, name: "Coin-Bright Cordial", emoji: "🪙",
    bag: pack({ fizz1: 4, fizz2: 3, fizz3: 1, leaf1: 4, leaf2: 2 }),
    shop: SHELF_2, fizzLimit: 8, startCoins: 7, targets: [85, 150, 200],
    hint: "Glimmercap coins are paid on the draw — a blow-up can't take them back." },

  { chapter: 1, name: "Owl's Tonic", emoji: "👁️",
    bag: pack({ fizz1: 4, fizz2: 3, fizz3: 1, leaf1: 3, leaf2: 2 }),
    shop: SHELF_2, fizzLimit: 7, startCoins: 8, targets: [65, 120, 160],
    hint: "Owl's Eye doesn't make the round safer. It makes you better at it." },

  { chapter: 1, name: "Glimmerbroth", emoji: "🌟",
    bag: pack({ fizz1: 5, fizz2: 3, fizz3: 1, leaf1: 3, leaf2: 2 }),
    shop: SHELF_2, fizzLimit: 7, startCoins: 9, targets: [60, 110, 150],
    hint: "Buying is diluting. Ten chips you love beat twenty you half-want." },

  { chapter: 1, name: "Moonwake", emoji: "🌙",
    bag: pack({ fizz1: 4, fizz2: 4, fizz3: 1, leaf1: 3, leaf2: 2 }),
    shop: SHELF_2, fizzLimit: 7, startCoins: 10, targets: [55, 100, 135],
    hint: "Explode early and you keep the coins. Explode in round five and you keep nothing." },

  /* ---- Chapter 3: The Ember Hollow ------------------------------------- */
  { chapter: 2, name: "Emberwine", emoji: "🔥",
    bag: pack({ fizz1: 5, fizz2: 3, fizz3: 1, leaf1: 4, leaf2: 2 }),
    shop: SHELF_3, fizzLimit: 8, startCoins: 8, targets: [90, 165, 220],
    hint: "Emberbark pays a bonus only if you stop. It is worth nothing to a wreck." },

  { chapter: 2, name: "Bellringer", emoji: "🔔",
    bag: pack({ fizz1: 5, fizz2: 3, fizz3: 1, leaf1: 3, leaf2: 2 }),
    shop: SHELF_3, fizzLimit: 7, startCoins: 9, targets: [65, 115, 155],
    hint: "Echobell doubles the next chip — including a fizzroot's fizz." },

  { chapter: 2, name: "Hearthfire Philtre", emoji: "🏺",
    bag: pack({ fizz1: 6, fizz2: 3, fizz3: 1, leaf1: 3, leaf2: 2 }),
    shop: SHELF_3, fizzLimit: 7, startCoins: 10, targets: [60, 110, 145],
    hint: "A bell straight after a calmwort is a plan. A bell on a full gauge is a prayer." },

  { chapter: 2, name: "Ashcap Elixir", emoji: "🌋",
    bag: pack({ fizz1: 5, fizz2: 4, fizz3: 1, leaf1: 3, leaf2: 2 }),
    shop: SHELF_3, fizzLimit: 7, startCoins: 11, targets: [60, 110, 145],
    hint: "Three fizzroots in a row is not bad luck. It is a bag with too many fizzroots." },

  /* ---- Chapter 4: The Spider Vault ------------------------------------- */
  { chapter: 3, name: "Webspun Syrup", emoji: "🕸️",
    bag: pack({ fizz1: 5, fizz2: 3, fizz3: 2, leaf1: 3, leaf2: 3 }),
    shop: SHELF_4, fizzLimit: 8, startCoins: 9, targets: [65, 115, 155],
    hint: "One spiderlily is worth nothing. Five are worth more than a moonleaf each." },

  { chapter: 3, name: "Thornmilk", emoji: "🌵",
    bag: pack({ fizz1: 5, fizz2: 3, fizz3: 2, leaf1: 2, leaf2: 3 }),
    shop: SHELF_4, fizzLimit: 7, startCoins: 10, targets: [55, 100, 135],
    hint: "Thornvine lifts a fizzroot straight back out. The safest chip in the game." },

  { chapter: 3, name: "Spiderwine", emoji: "🍷",
    bag: pack({ fizz1: 6, fizz2: 3, fizz3: 2, leaf1: 2, leaf2: 3 }),
    shop: SHELF_4, fizzLimit: 7, startCoins: 11, targets: [60, 105, 140],
    hint: "A thorn in the bag is only a thorn if you draw it before the root." },

  { chapter: 3, name: "Nightlace", emoji: "🌑",
    bag: pack({ fizz1: 5, fizz2: 4, fizz3: 2, leaf1: 2, leaf2: 3 }),
    shop: SHELF_4, fizzLimit: 7, startCoins: 12, targets: [55, 90, 125],
    hint: "You cannot buy your way out of this one. You have to know when to stop." },

  /* ---- Chapter 5: The Quicksilver Deep --------------------------------- */
  { chapter: 4, name: "Quickfoot Draught", emoji: "⚗️",
    bag: pack({ fizz1: 5, fizz2: 4, fizz3: 2, leaf1: 3, leaf2: 3, leaf4: 1 }),
    shop: SHELF_5, fizzLimit: 8, startCoins: 10, targets: [95, 165, 220],
    hint: "Quicksilver draws again for free. You don't get asked whether you wanted to." },

  { chapter: 4, name: "Ironbelly Brew", emoji: "🛡️",
    bag: pack({ fizz1: 5, fizz2: 4, fizz3: 2, leaf1: 2, leaf2: 3, leaf4: 1 }),
    shop: SHELF_5, fizzLimit: 7, startCoins: 11, targets: [75, 135, 175],
    hint: "Ironcap raises the ceiling for the rest of the round. Early is worth far more than late." },

  { chapter: 4, name: "Silverstorm", emoji: "🌩️",
    bag: pack({ fizz1: 6, fizz2: 4, fizz3: 2, leaf1: 2, leaf2: 3, leaf4: 1 }),
    shop: SHELF_5, fizzLimit: 7, startCoins: 12, targets: [70, 120, 160],
    hint: "Chain into a thorn and it's a party. Chain into a doubled root and it's over." },

  { chapter: 4, name: "The Grand Ferment", emoji: "👑",
    bag: pack({ fizz1: 5, fizz2: 5, fizz3: 2, leaf1: 2, leaf2: 3, leaf4: 1 }),
    shop: SHELF_5, fizzLimit: 7, startCoins: 13, targets: [60, 105, 145],
    hint: "Everything the cellar knows, all at once. Brew it properly." },
];

const ROUNDS_PER_BREW = 5;

// Endless unlocks once the third chapter is done — by then every family has
// been met and there are perks worth having in the Larder.
const ENDLESS_UNLOCK = 12;

function brewTitle(idx) { return BREWS[idx].name; }
function brewEmoji(idx) { return BREWS[idx].emoji; }
function brewChapter(idx) { return CHAPTERS[BREWS[idx].chapter]; }
function brewTheme(idx) { return brewChapter(idx).theme; }

if (typeof module !== "undefined") {
  module.exports = { BREWS, CHAPTERS, ROUNDS_PER_BREW, ENDLESS_UNLOCK, pack,
                     SHELF_1, SHELF_2, SHELF_3, SHELF_4, SHELF_5 };
}
