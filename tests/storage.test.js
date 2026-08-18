// The save layer, and in particular mergeProgress — the one function in the
// game that can permanently destroy a family's progress. Two devices sync,
// their records are merged field-wise, and a wrong rule silently reverts
// something with nothing in any UI to say so.
//
// PROGRESS is exported as a named object precisely so this file can call the
// merge; createStorage keeps its copy in a closure where no test could reach it.

const test = require("node:test");
const assert = require("node:assert");
const { loadStorage } = require("./load.js");

const { Storage, PROGRESS, PERKS } = loadStorage();

const blank = () => PROGRESS.blank();

test("a blank save has every field the game reads", () => {
  const p = blank();
  for (const k of ["essenceEarned", "essenceSpent", "brews", "perks", "endlessBest", "endlessRounds", "daily"]) {
    assert.ok(k in p, `blank progress is missing ${k}`);
  }
  assert.equal(Storage.essence(p), 0);
  assert.equal(Storage.totalScore(p), 0);
  assert.equal(Storage.totalStars(p), 0);
});

test("essence is a ledger, so a sync cannot resurrect what was spent", () => {
  // The bug this prevents: store a BALANCE and max()-merge it, and a stale
  // device that still remembers 300 essence hands it all back after you have
  // spent it. Both counters only ever grow, and the balance is derived.
  const phone = { ...blank(), essenceEarned: 300, essenceSpent: 0 };
  const spent = { ...blank(), essenceEarned: 300, essenceSpent: 250 };
  const merged = PROGRESS.merge(phone, spent);
  assert.equal(Storage.essence(merged), 50);
  assert.equal(Storage.essence(PROGRESS.merge(spent, phone)), 50, "and it must not depend on who syncs first");
});

test("merging keeps the best score AND the best stars per brew, independently", () => {
  const a = { ...blank(), brews: { 0: { score: 200, stars: 1 }, 1: { score: 50, stars: 1 } } };
  const b = { ...blank(), brews: { 0: { score: 120, stars: 3 }, 2: { score: 90, stars: 2 } } };
  const m = PROGRESS.merge(a, b);
  assert.deepEqual(m.brews[0], { score: 200, stars: 3 }, "a high score on one device and 3 stars on another keeps both");
  assert.deepEqual(m.brews[1], { score: 50, stars: 1 });
  assert.deepEqual(m.brews[2], { score: 90, stars: 2 });
});

test("the merge is symmetric — whoever syncs first must not matter", () => {
  const a = {
    ...blank(), essenceEarned: 120, essenceSpent: 60, endlessBest: 400, endlessRounds: 7,
    brews: { 0: { score: 200, stars: 1 } }, perks: { lid: 1, pockets: 2 },
    daily: { "2026-08-17": 300 },
  };
  const b = {
    ...blank(), essenceEarned: 90, essenceSpent: 80, endlessBest: 610, endlessRounds: 5,
    brews: { 0: { score: 150, stars: 3 }, 4: { score: 70, stars: 2 } }, perks: { lid: 1, salvage: 1 },
    daily: { "2026-08-18": 250 },
  };
  assert.deepEqual(PROGRESS.merge(a, b), PROGRESS.merge(b, a));
});

test("perk levels never go backwards", () => {
  const bought = { ...blank(), perks: { lid: 1, spectacles: 2 } };
  const stale = { ...blank(), perks: { spectacles: 1 } };
  const m = PROGRESS.merge(bought, stale);
  assert.deepEqual(m.perks, { lid: 1, spectacles: 2 });
});

test("the Daily Cauldron merges per DAY, and history is bounded", () => {
  // Today's score is not "better than" yesterday's, it is a different question
  // — so a single dailyBest field would be wrong. Keyed by day, each key is
  // monotonic and the same max() merge is correct.
  const a = { ...blank(), daily: { "2026-08-17": 300, "2026-08-18": 120 } };
  const b = { ...blank(), daily: { "2026-08-18": 260, "2026-08-19": 90 } };
  const m = PROGRESS.merge(a, b);
  assert.deepEqual(m.daily, { "2026-08-17": 300, "2026-08-18": 260, "2026-08-19": 90 });

  const many = { ...blank(), daily: {} };
  for (let d = 1; d <= 40; d++) many.daily[`2026-06-${String(d).padStart(2, "0")}`] = d;
  const trimmed = PROGRESS.merge(many, blank());
  assert.ok(Object.keys(trimmed.daily).length <= 14, "daily history must not grow without bound");
  assert.ok("2026-06-40" in trimmed.daily, "and it must keep the MOST RECENT days");
});

test("a field a newer build added survives an older client's merge", () => {
  const newer = { ...blank(), somethingNew: 42 };
  assert.equal(PROGRESS.merge(blank(), newer).somethingNew, 42);
  assert.equal(PROGRESS.merge(newer, blank()).somethingNew, 42);
});

test("brews unlock in order, and only a win unlocks the next", () => {
  const p = blank();
  assert.equal(Storage.unlockedBrew(p), 0);
  p.brews = { 0: { score: 200, stars: 2 } };
  assert.equal(Storage.unlockedBrew(p), 1);
  p.brews = { 0: { score: 200, stars: 2 }, 1: { score: 90, stars: 1 } };
  assert.equal(Storage.unlockedBrew(p), 2);
});

test("unlockedBrew never runs off the end of the book", () => {
  const p = blank();
  p.brews = {};
  for (let i = 0; i < 60; i++) p.brews[i] = { score: 10, stars: 1 };
  assert.ok(Storage.unlockedBrew(p) >= 0);
  assert.ok(Storage.unlockedBrew(p) < 60);
});

test("recording an endless run keeps the best, never the latest", () => {
  const store = { getProgress: () => rec, saveProgress: (_, p) => { rec = p; } };
  let rec = blank();
  const record = Storage.recordBrew.bind(Object.assign(Object.create(Storage), store));
  record("me", { mode: "endless", score: 500, roundsPlayed: 9 });
  record("me", { mode: "endless", score: 200, roundsPlayed: 4 });
  assert.equal(rec.endlessBest, 500);
  assert.equal(rec.endlessRounds, 9);
});

test("a lost campaign brew is not recorded, so it cannot unlock the next one", () => {
  const store = { getProgress: () => rec, saveProgress: (_, p) => { rec = p; } };
  let rec = blank();
  const record = Storage.recordBrew.bind(Object.assign(Object.create(Storage), store));
  record("me", { mode: "campaign", win: false, levelIdx: 0, score: 40, stars: 0 });
  assert.deepEqual(rec.brews, {});
  assert.equal(Storage.unlockedBrew(rec), 0);
});

test("every perk the Larder sells can actually be bought and levelled", () => {
  // Guards against a perk whose id in PERKS drifts from the one the save uses:
  // it would look normal, take the essence, and never apply.
  const store = { getProgress: () => rec, saveProgress: (_, p) => { rec = p; } };
  let rec = { ...blank(), essenceEarned: 100000 };
  const self = Object.assign(Object.create(Storage), store);
  for (const perk of PERKS) {
    for (let lvl = 1; lvl <= perk.costs.length; lvl++) {
      const res = self.buyPerk("me", perk.id);
      assert.ok(res.ok, `could not buy ${perk.id} level ${lvl}: ${res.reason}`);
      assert.equal(rec.perks[perk.id], lvl);
    }
    assert.equal(self.buyPerk("me", perk.id).reason, "maxed", `${perk.id} sold past its last level`);
  }
});

test("a perk cannot be bought without the essence for it", () => {
  const store = { getProgress: () => rec, saveProgress: (_, p) => { rec = p; } };
  let rec = blank();
  const self = Object.assign(Object.create(Storage), store);
  const res = self.buyPerk("me", PERKS[0].id);
  assert.equal(res.ok, false);
  assert.equal(res.reason, "essence");
  assert.deepEqual(rec.perks, {});
});
