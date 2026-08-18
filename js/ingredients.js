// Bubble & Brew — the ingredient chips.
//
// Every chip in the game is one entry here. A chip does exactly two things:
// it pushes the stirring rod `value` steps up the cauldron, and it applies at
// most one EFFECT. That "one effect, one number" shape is deliberate — a
// push-your-luck game lives or dies on whether the player can hold the whole
// bag in their head while deciding to draw again.
//
// The effect vocabulary is a CLOSED list, and tests/ingredients.test.js checks
// it both ways: no chip may invent a key outside EFFECT_KEYS, and every key in
// EFFECT_KEYS must actually be read by js/round.js. A chip naming an effect the
// engine ignores looks completely normal, costs the player real coins, and does
// nothing at all — there is no other way to catch that.

const EFFECT_KEYS = [
  "fizz",    // adds to the fizz gauge — go over the limit and the cauldron blows
  "defuse",  // takes fizz back off the gauge
  "coin",    // pays coins the instant it is drawn (survives an explosion)
  "double",  // the NEXT chip drawn counts double — its value AND its fizz
  "bloom",   // worth more for each chip of its own family already drawn
  "peek",    // reveals the next chip(s) waiting in the bag
  "refund",  // bonus points, but only if you bank; worth nothing if you blow up
  "sift",    // sets the next fizzroot aside instead of letting it fizz
  "chain",   // draw again immediately, free, with no chance to stop in between
  "steady",  // raises the fizz limit for the rest of this round
];

// Families group the chips you can buy into a recognisable shelf in the shop,
// and give `bloom` something to count.
const FAMILIES = {
  fizzroot:    { name: "Fizzroot",    emoji: "🫧", colour: "#e0574f", blurb: "Bubbles beautifully. Blows the lid off." },
  moonleaf:    { name: "Moonleaf",    emoji: "🌿", colour: "#79c76a", blurb: "Plain, steady, safe. Just stirs." },
  calmwort:    { name: "Calmwort",    emoji: "💧", colour: "#4aa8d8", blurb: "Settles the fizz back down." },
  glimmercap:  { name: "Glimmercap",  emoji: "✨", colour: "#e8b93c", blurb: "Pays coins the moment it lands." },
  owlseye:     { name: "Owl's Eye",   emoji: "👁️", colour: "#3fb9a3", blurb: "Shows you what's coming next." },
  emberbark:   { name: "Emberbark",   emoji: "🔥", colour: "#ef8244", blurb: "Big bonus — but only if you stop in time." },
  echobell:    { name: "Echobell",    emoji: "🔔", colour: "#a97ce0", blurb: "Doubles the next chip's steps — and its fizz." },
  spiderlily:  { name: "Spiderlily",  emoji: "🕸️", colour: "#8f92ad", blurb: "Grows with every other lily already out." },
  thornvine:   { name: "Thornvine",   emoji: "🌵", colour: "#dc6ba0", blurb: "Catches a fizzroot and sets it aside." },
  quicksilver: { name: "Quicksilver", emoji: "⚗️", colour: "#b9c6db", blurb: "Free draw. No stopping to think." },
  ironcap:     { name: "Ironcap",     emoji: "🛡️", colour: "#93a0b5", blurb: "Raises the limit. The lid holds longer." },
};

// value  — steps up the cauldron
// effect — one entry from EFFECT_KEYS (fizzroot is the only chip with `fizz`)
// cost   — coins in the apothecary; null means it is never for sale
const INGREDIENTS = [
  // ---- Fizzroot. Never bought: it is what the recipe gives you and what the
  // endless cauldron adds as it sours. It DOES push you up the track, which is
  // the whole trap — the dangerous chip is also progress.
  { id: "fizz1", family: "fizzroot", value: 1, effect: { fizz: 1 }, cost: null },
  { id: "fizz2", family: "fizzroot", value: 2, effect: { fizz: 2 }, cost: null },
  { id: "fizz3", family: "fizzroot", value: 3, effect: { fizz: 3 }, cost: null },

  // ---- Moonleaf. The bread and butter: no effect, no risk, no excitement.
  { id: "leaf1", family: "moonleaf", value: 1, effect: {}, cost: 3 },
  { id: "leaf2", family: "moonleaf", value: 2, effect: {}, cost: 8 },
  { id: "leaf4", family: "moonleaf", value: 4, effect: {}, cost: 19 },

  // ---- Calmwort. The safety valve. Cheap insurance that dilutes your bag.
  { id: "calm1", family: "calmwort", value: 1, effect: { defuse: 1 }, cost: 6 },
  { id: "calm2", family: "calmwort", value: 1, effect: { defuse: 2 }, cost: 14 },
  { id: "calm3", family: "calmwort", value: 2, effect: { defuse: 3 }, cost: 27 },

  // ---- Glimmercap. Coins paid on the draw survive an explosion, so a bag
  // full of these turns a reckless round into a shopping trip.
  { id: "glim1", family: "glimmercap", value: 1, effect: { coin: 2 }, cost: 5 },
  { id: "glim2", family: "glimmercap", value: 2, effect: { coin: 3 }, cost: 12 },
  { id: "glim3", family: "glimmercap", value: 2, effect: { coin: 5 }, cost: 23 },

  // ---- Owl's Eye. Information is the purest upgrade in a push-your-luck
  // game: it doesn't make the round safer, it makes YOU better at it.
  { id: "owl1", family: "owlseye", value: 1, effect: { peek: 1 }, cost: 7 },
  { id: "owl2", family: "owlseye", value: 2, effect: { peek: 2 }, cost: 17 },

  // ---- Emberbark. Pays only if you stop. The anti-greed chip.
  { id: "ember1", family: "emberbark", value: 1, effect: { refund: 4 }, cost: 8 },
  { id: "ember2", family: "emberbark", value: 2, effect: { refund: 9 }, cost: 18 },
  { id: "ember3", family: "emberbark", value: 3, effect: { refund: 15 }, cost: 32 },

  // ---- Echobell. Doubles the next chip's value AND its fizz, so it is a
  // gamble on your own bag rather than a straight bonus.
  { id: "bell1", family: "echobell", value: 1, effect: { double: 1 }, cost: 10 },
  { id: "bell2", family: "echobell", value: 2, effect: { double: 1 }, cost: 21 },

  // ---- Spiderlily. Worthless alone, an engine in a handful.
  { id: "lily1", family: "spiderlily", value: 1, effect: { bloom: 1 }, cost: 7 },
  { id: "lily2", family: "spiderlily", value: 1, effect: { bloom: 2 }, cost: 18 },

  // ---- Thornvine. Eats a fizzroot outright — the strongest defence there is,
  // and priced like it.
  { id: "thorn1", family: "thornvine", value: 1, effect: { sift: 1 }, cost: 13 },
  { id: "thorn2", family: "thornvine", value: 2, effect: { sift: 2 }, cost: 27 },

  // ---- Quicksilver. A free draw is a draw you never got to refuse, which is
  // exactly why it is exciting and exactly why it can kill you.
  { id: "quick1", family: "quicksilver", value: 0, effect: { chain: 1 }, cost: 9 },
  { id: "quick2", family: "quicksilver", value: 1, effect: { chain: 1 }, cost: 17 },
  { id: "quick3", family: "quicksilver", value: 2, effect: { chain: 2 }, cost: 33 },

  // ---- Ironcap. Raises the ceiling instead of lowering the pressure.
  { id: "iron1", family: "ironcap", value: 1, effect: { steady: 1 }, cost: 11 },
  { id: "iron2", family: "ironcap", value: 2, effect: { steady: 2 }, cost: 25 },
];

const CHIP = {};
INGREDIENTS.forEach((c) => { CHIP[c.id] = c; });

// Display helpers. A chip's name is its family plus what it does, built from
// the data so a retuned number can never disagree with its own label.
function chipFamily(id) { return FAMILIES[CHIP[id].family]; }
function chipEmoji(id) { return chipFamily(id).emoji; }
function chipColour(id) { return chipFamily(id).colour; }

function chipLabel(id) {
  const c = CHIP[id];
  const e = c.effect;
  const bits = [];
  if (c.value) bits.push(`+${c.value}`);
  if (e.fizz) bits.push(`${e.fizz} fizz`);
  if (e.defuse) bits.push(`−${e.defuse} fizz`);
  if (e.coin) bits.push(`🪙${e.coin}`);
  if (e.double) bits.push("×2 next");
  if (e.bloom) bits.push(`+${e.bloom} per lily`);
  if (e.peek) bits.push(`see ${e.peek}`);
  if (e.refund) bits.push(`+${e.refund} if you stop`);
  if (e.sift) bits.push(`catch ${e.sift}`);
  if (e.chain) bits.push(`draw ${e.chain} free`);
  if (e.steady) bits.push(`limit +${e.steady}`);
  return bits.join(" · ") || "+0";
}

// The stirring rod's track, and the rule that makes the whole game work:
//
//   EVERY RING YOU CLIMB, EVERY FURTHER STEP IS WORTH ONE MORE POINT.
//
// So a step in the Dregs pays 1 and a step in Radiance pays 6, and a full pot
// is about three and a half times a half-full one. That acceleration is the
// only reason to keep drawing once you are already in profit — a linear track
// would make stopping early always correct and there would be no game.
//
// It is a precomputed TABLE rather than a formula because a floored quadratic
// makes the per-step payoff jitter (1, 3, 1, 3...), so "one more step" would
// sometimes be worth three times what the last one was for no visible reason.
// The bands the player can see are the bands that pay.
// TRACK_MAX and RING_SIZE are set from what a bag can ACTUALLY do, not from
// how tall a cauldron looks. A starting bag totals ~15 steps and can never be
// drawn out, so a round lands somewhere around 8; a late round with a bought-up
// bag reaches the low twenties. An earlier draft ran the track to 52 and the
// bots duly reported the whole campaign as unplayable — every recipe's paying
// end was simply out of reach. Six rings of four covers the real range with the
// top of the pot as a genuine, rare achievement.
const TRACK_MAX = 24;
const RING_SIZE = 4;
const RING_NAMES = ["Dregs", "Simmer", "Bubble", "Froth", "Shimmer", "Radiance"];

const RINGS = RING_NAMES.map((name, i) => ({ at: i * RING_SIZE, name, perStep: i + 1 }));

const TRACK_POINTS = (() => {
  const out = [0];
  for (let i = 1; i <= TRACK_MAX; i++) out[i] = out[i - 1] + 1 + Math.floor((i - 1) / RING_SIZE);
  return out;
})();

function trackPoints(pos) {
  return TRACK_POINTS[Math.max(0, Math.min(TRACK_MAX, Math.round(pos)))];
}
// Coins are the shop's fuel, so the rate is set by what a round needs to buy:
// a mid-round stop pays for one decent chip, a deep one pays for two.
function trackCoins(pos) {
  return Math.floor(Math.max(0, Math.min(TRACK_MAX, pos)) * 1.3);
}

function ringAt(pos) {
  let r = RINGS[0];
  for (const ring of RINGS) if (pos >= ring.at) r = ring;
  return r;
}

if (typeof module !== "undefined") {
  module.exports = { EFFECT_KEYS, FAMILIES, INGREDIENTS, CHIP, TRACK_MAX, RINGS };
}
