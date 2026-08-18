// Data linter for the chips themselves.
//
// The failure this file exists to catch has NO symptom: a chip naming an effect
// the engine never reads looks completely normal in the shop, costs the player
// real coins, and does nothing at all. Nothing in the game will ever complain,
// and no amount of playing will reliably reveal it. So the effect vocabulary is
// checked in BOTH directions — no chip may invent a key, and no key may sit in
// the list without js/round.js actually reading it.

const test = require("node:test");
const assert = require("node:assert");
const { loadEngine, readSource } = require("./load.js");

const S = loadEngine();
const ROUND_SRC = readSource("js/round.js");

test("every chip's effect keys come from the closed vocabulary", () => {
  const fails = [];
  for (const chip of S.INGREDIENTS) {
    for (const key of Object.keys(chip.effect || {})) {
      if (!S.EFFECT_KEYS.includes(key)) fails.push(`${chip.id} invents "${key}"`);
    }
  }
  assert.deepEqual(fails, []);
});

test("every effect key in the vocabulary is actually read by the engine", () => {
  // Both directions matter. A key nobody implements is a dead chip; this is the
  // half that a "does the data parse" check can never find.
  const fails = [];
  for (const key of S.EFFECT_KEYS) {
    if (!ROUND_SRC.includes(`e.${key}`)) fails.push(`round.js never reads e.${key}`);
  }
  assert.deepEqual(fails, []);
});

test("every effect key in the vocabulary is used by at least one chip", () => {
  const used = new Set();
  for (const chip of S.INGREDIENTS) for (const k of Object.keys(chip.effect || {})) used.add(k);
  assert.deepEqual(S.EFFECT_KEYS.filter((k) => !used.has(k)), []);
});

test("chip ids are unique and every family is declared", () => {
  const seen = new Set(), fails = [];
  for (const chip of S.INGREDIENTS) {
    if (seen.has(chip.id)) fails.push(`duplicate id ${chip.id}`);
    seen.add(chip.id);
    if (!S.FAMILIES[chip.family]) fails.push(`${chip.id} has unknown family ${chip.family}`);
    if (typeof chip.value !== "number" || chip.value < 0) fails.push(`${chip.id} has a bad value`);
    if (chip.cost !== null && !(chip.cost > 0)) fails.push(`${chip.id} has a bad cost`);
  }
  assert.deepEqual(fails, []);
});

test("only fizzroot carries fizz, and every fizzroot does", () => {
  const fails = [];
  for (const chip of S.INGREDIENTS) {
    const isRoot = chip.family === "fizzroot";
    const hasFizz = !!chip.effect.fizz;
    if (isRoot !== hasFizz) fails.push(`${chip.id}: family=${chip.family} fizz=${chip.effect.fizz}`);
  }
  assert.deepEqual(fails, []);
});

test("fizzroot is never for sale — it is what the recipe gives you", () => {
  const buyable = S.INGREDIENTS.filter((c) => c.family === "fizzroot" && c.cost !== null);
  assert.deepEqual(buyable.map((c) => c.id), []);
});

test("no chip is strictly dominated by a cheaper one in its own family", () => {
  // Two tiers of the same family where the dearer one is not better at anything
  // is a trap: the shop shows a real price for no gain.
  const fails = [];
  const byFamily = {};
  for (const c of S.INGREDIENTS) (byFamily[c.family] = byFamily[c.family] || []).push(c);
  for (const list of Object.values(byFamily)) {
    for (const a of list) for (const b of list) {
      if (a === b || a.cost === null || b.cost === null || b.cost <= a.cost) continue;
      const better = b.value > a.value ||
        S.EFFECT_KEYS.some((k) => (b.effect[k] || 0) > (a.effect[k] || 0));
      if (!better) fails.push(`${b.id} costs more than ${a.id} and does no more`);
    }
  }
  assert.deepEqual(fails, []);
});

test("the track pays more for every extra step, and accelerates", () => {
  const fails = [];
  let lastGain = 0;
  for (let p = 1; p <= S.TRACK_MAX; p++) {
    const gain = S.trackPoints(p) - S.trackPoints(p - 1);
    if (gain <= 0) fails.push(`step ${p} is worth nothing`);
    if (gain < lastGain) fails.push(`step ${p} pays less than step ${p - 1}`);
    lastGain = gain;
  }
  // The whole design rests on the top of the pot being worth pushing for: if a
  // full pot were merely twice a half-full one, stopping early would always be
  // correct and there would be no game. Currently 156 vs 52, a ratio of 3.0.
  const ratio = S.trackPoints(S.TRACK_MAX) / S.trackPoints(S.TRACK_MAX / 2);
  assert.ok(ratio >= 2.5, `full pot is only ${ratio.toFixed(2)}x a half pot — too flat to push for`);
  assert.deepEqual(fails, []);
});

test("track values are clamped, never negative or runaway", () => {
  assert.equal(S.trackPoints(-5), 0);
  assert.equal(S.trackPoints(999), S.trackPoints(S.TRACK_MAX));
  assert.equal(S.trackCoins(-5), 0);
  assert.equal(S.trackCoins(999), S.trackCoins(S.TRACK_MAX));
});

test("rings are ordered and start at the bottom of the pot", () => {
  assert.equal(S.RINGS[0].at, 0);
  for (let i = 1; i < S.RINGS.length; i++) assert.ok(S.RINGS[i].at > S.RINGS[i - 1].at);
  assert.ok(S.RINGS[S.RINGS.length - 1].at < S.TRACK_MAX);
});

test("every chip's label mentions everything it does", () => {
  // The label is built from the data, so this catches a new effect key added to
  // the vocabulary and to a chip but never given a way to describe itself.
  const fails = [];
  for (const chip of S.INGREDIENTS) {
    const label = S.chipLabel(chip.id);
    if (!label || label === "+0" && (chip.value || Object.keys(chip.effect).length)) {
      fails.push(`${chip.id} has an empty label`);
    }
    for (const k of Object.keys(chip.effect)) {
      // Every effect must move the label somehow — compare against a chip with
      // that key stripped out.
      const stripped = { ...chip.effect }; delete stripped[k];
      const before = S.chipLabel(chip.id);
      const saved = chip.effect;
      chip.effect = stripped;
      const after = S.chipLabel(chip.id);
      chip.effect = saved;
      if (before === after) fails.push(`${chip.id}: "${k}" is invisible in the label`);
    }
  }
  assert.deepEqual(fails, []);
});
