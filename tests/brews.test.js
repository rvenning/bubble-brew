// Content linter for the campaign and the Larder.
//
// These are the faults that ship a broken recipe without anything complaining:
// a shop shelf naming a chip id that no longer exists, a target that can't be
// beaten by a full pot in every round, a chapter whose shelf forgot the safety
// valve, a perk whose effect text disagrees with the number the engine reads.

const test = require("node:test");
const assert = require("node:assert");
const { loadEngine, readSource } = require("./load.js");

const S = loadEngine();
const GAME_SRC = readSource("js/game.js");
const ROUND_SRC = readSource("js/round.js");

test("every id in every starting bag and shop shelf is a real chip", () => {
  const fails = [];
  S.BREWS.forEach((brew, i) => {
    for (const id of brew.bag) if (!S.CHIP[id]) fails.push(`brew ${i} bag has unknown chip ${id}`);
    for (const id of brew.shop) if (!S.CHIP[id]) fails.push(`brew ${i} shop has unknown chip ${id}`);
  });
  assert.deepEqual(fails, []);
});

test("nothing on a shop shelf is unbuyable", () => {
  const fails = [];
  S.BREWS.forEach((brew, i) => {
    for (const id of brew.shop) if (S.CHIP[id].cost === null) fails.push(`brew ${i} sells ${id}`);
  });
  assert.deepEqual(fails, []);
});

test("every shelf stocks a calmwort — the safety valve is always available", () => {
  // js/game.js guarantees the cheapest calmwort a shelf has is always in the
  // offer. That guarantee is worth nothing if a shelf has none.
  const fails = [];
  S.BREWS.forEach((brew, i) => {
    if (!brew.shop.some((id) => S.CHIP[id].family === "calmwort")) fails.push(`brew ${i} has no calmwort`);
  });
  assert.deepEqual(fails, []);
  assert.ok(GAME_SRC.includes(`=== "calmwort"`), "the guarantee must still be implemented");
});

test("every starting bag contains fizzroot — no brew is risk-free", () => {
  const fails = [];
  S.BREWS.forEach((brew, i) => {
    if (!brew.bag.some((id) => S.CHIP[id].family === "fizzroot")) fails.push(`brew ${i} cannot blow up`);
  });
  assert.deepEqual(fails, []);
});

test("no starting bag can be drawn out entirely without exceeding the limit", () => {
  // If the whole bag is survivable, the brew has no decision in it: drawing
  // everything is strictly correct and the game is over before it starts.
  const fails = [];
  S.BREWS.forEach((brew, i) => {
    const totalFizz = brew.bag.reduce((s, id) => s + (S.CHIP[id].effect.fizz || 0), 0);
    if (totalFizz <= brew.fizzLimit) fails.push(`brew ${i}: whole bag fizzes ${totalFizz} vs limit ${brew.fizzLimit}`);
  });
  assert.deepEqual(fails, []);
});

test("star targets rise, and are reachable within the rounds available", () => {
  const fails = [];
  const ceiling = S.trackPoints(S.TRACK_MAX) * S.ROUNDS_PER_BREW;
  S.BREWS.forEach((brew, i) => {
    const [a, b, c] = brew.targets;
    if (!(a < b && b < c)) fails.push(`brew ${i} targets are not increasing: ${brew.targets}`);
    if (c > ceiling) fails.push(`brew ${i} three-star target ${c} is above the theoretical maximum ${ceiling}`);
    // A three-star target that a perfect pot every round would only just reach
    // is not a stretch goal, it is a wall. Leave real headroom.
    if (c > ceiling * 0.95) fails.push(`brew ${i} three-star target ${c} needs a full pot five times`);
  });
  assert.deepEqual(fails, []);
});

test("pressure only ever rises within a chapter", () => {
  // Deliberately NOT "the target number goes up". A later recipe carries more
  // fizzroot, so a good player stops sooner and scores less — the raw targets
  // genuinely fall as the book gets harder, and an earlier version of this test
  // insisted otherwise and was simply wrong. What must hold here is the
  // physical pressure; whether the targets are actually demanding is a question
  // only the bots can answer, and tests/bot.test.js asks it.
  const fails = [];
  for (let i = 1; i < S.BREWS.length; i++) {
    const prev = S.BREWS[i - 1], cur = S.BREWS[i];
    if (cur.chapter !== prev.chapter) continue;      // a new chapter opens gently, on purpose
    if (cur.fizzLimit > prev.fizzLimit) fails.push(`brew ${i} raises the fizz limit mid-chapter`);
    const fizzOf = (b) => b.bag.reduce((s, id) => s + (S.CHIP[id].effect.fizz || 0), 0);
    if (fizzOf(cur) < fizzOf(prev)) fails.push(`brew ${i} carries less fizzroot than brew ${i - 1}`);
  }
  assert.deepEqual(fails, []);
});

test("chapters are contiguous, in order, and every one is used", () => {
  const seen = [];
  for (const brew of S.BREWS) if (seen[seen.length - 1] !== brew.chapter) seen.push(brew.chapter);
  assert.deepEqual(seen, S.CHAPTERS.map((_, i) => i));
});

test("each chapter's shelf is a superset of the one before it", () => {
  const fails = [];
  for (let c = 1; c < S.CHAPTERS.length; c++) {
    const before = new Set(S.BREWS.filter((b) => b.chapter === c - 1)[0].shop);
    const now = new Set(S.BREWS.filter((b) => b.chapter === c)[0].shop);
    for (const id of before) if (!now.has(id)) fails.push(`chapter ${c} lost ${id}`);
    if (now.size <= before.size) fails.push(`chapter ${c} introduces nothing new`);
  }
  assert.deepEqual(fails, []);
});

test("every brew has a hint, a name and an emoji", () => {
  const fails = [];
  S.BREWS.forEach((brew, i) => {
    if (!brew.name || !brew.emoji) fails.push(`brew ${i} is missing a name or emoji`);
    if (!brew.hint) fails.push(`brew ${i} has no hint`);
  });
  assert.deepEqual(fails, []);
  const names = S.BREWS.map((b) => b.name);
  assert.equal(new Set(names).size, names.length, "two brews share a name");
});

test("Endless unlocks inside the campaign, not past the end of it", () => {
  assert.ok(S.ENDLESS_UNLOCK > 0 && S.ENDLESS_UNLOCK < S.BREWS.length);
});

/* ---------- the Larder ---------- */

test("every perk's loadout field is actually read by the engine", () => {
  // The mirror of the chip-effect lint: a perk writing a loadout key nothing
  // reads is bought with real essence and does nothing at all.
  const loadout = S.perkLoadout({ perks: Object.fromEntries(S.PERKS.map((p) => [p.id, 1])) });
  const fails = [];
  const src = GAME_SRC + ROUND_SRC;
  for (const key of Object.keys(loadout)) {
    if (!src.includes(`loadout.${key}`) && !src.includes(`cfg.${key}`)) {
      fails.push(`nothing reads loadout.${key}`);
    }
  }
  assert.deepEqual(fails, []);
});

test("every perk actually changes the loadout at every level it sells", () => {
  const fails = [];
  for (const perk of S.PERKS) {
    let prev = JSON.stringify(S.perkLoadout({ perks: { [perk.id]: 0 } }));
    for (let lvl = 1; lvl <= perk.costs.length; lvl++) {
      const now = JSON.stringify(S.perkLoadout({ perks: { [perk.id]: lvl } }));
      if (now === prev) fails.push(`${perk.id} level ${lvl} changes nothing`);
      prev = now;
    }
  }
  assert.deepEqual(fails, []);
});

test("perk costs rise with each level and every perk has a real effect string", () => {
  const fails = [];
  for (const perk of S.PERKS) {
    for (let i = 1; i < perk.costs.length; i++) {
      if (perk.costs[i] <= perk.costs[i - 1]) fails.push(`${perk.id} level ${i + 1} is not dearer`);
    }
    for (let lvl = 1; lvl <= perk.costs.length; lvl++) {
      if (!perk.effect(lvl)) fails.push(`${perk.id} level ${lvl} has no effect text`);
    }
    if (!perk.blurb || !perk.emoji || !perk.name) fails.push(`${perk.id} is missing display data`);
  }
  assert.deepEqual(fails, []);
});

test("Salvage forgives but never pays in full", () => {
  // An "I'm stuck" rescue has to forgive, not skip. A blow-up that kept
  // everything would delete the game's only real punishment.
  const fails = [];
  S.SALVAGE_FRACTION.forEach((f, i) => {
    if (f < 0 || f >= 1) fails.push(`salvage level ${i} is ${f}`);
  });
  assert.equal(S.SALVAGE_FRACTION[0], 0, "unbought Salvage must rescue nothing");
  assert.equal(S.SALVAGE_FRACTION.length, S.PERKS.find((p) => p.id === "salvage").costs.length + 1);
  assert.deepEqual(fails, []);
});

test("essence pays more for a better result and something for a failure", () => {
  const base = { mode: "campaign", win: true, stars: 0, score: 0 };
  const lose = S.essenceFor({ ...base, win: false });
  assert.ok(lose > 0, "a failed brew still teaches you something");
  let prev = lose;
  for (let s = 1; s <= 3; s++) {
    const got = S.essenceFor({ ...base, stars: s });
    assert.ok(got > prev, `${s} stars must pay more than ${s - 1}`);
    prev = got;
  }
});
