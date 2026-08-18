// Headless balance bots. These drive the real engine — the same js/round.js
// and js/game.js the browser runs — so a number that moves here is a design
// change, never a lucky shuffle. The cast lives in tests/bots.js.
//
// One thing shapes every assertion in this file: THIS IS A GAME OF CHANCE ON
// PURPOSE. In a platformer a perfect bot must clear every level, and a failure
// means the level is broken. Here a perfect player can be handed three
// fizzroots off the top of the bag and lose a brew they played faultlessly —
// that is not a bug, it is the whole entertainment. So nothing below asserts a
// 100% pass rate. What it asserts instead is that skill pays, that no recipe is
// a wall, and that a player working through the book always gets through it.
//
// Every brew is replayed on a dozen fixed seeds and the assertions are made on
// AGGREGATES. A single-seed table measures the shuffle, not the recipe.

const test = require("node:test");
const assert = require("node:assert");
const { S, SEEDS, BRAINS, SHOPPERS, playBrew, sweep } = require("./bots.js");

function campaign(brain, opts = {}) {
  const rows = S.BREWS.map((_, i) => sweep(i, brain, opts));
  const mean = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  return {
    rows,
    minPass: Math.min(...rows.map((r) => r.passRate)),
    meanPass: mean((r) => r.passRate),
    meanThree: mean((r) => r.threeRate),
    meanScore: mean((r) => r.meanScore),
    meanBlowUps: mean((r) => r.meanBlowUps),
  };
}

test("no recipe is a wall for a brewer who judges the odds well", () => {
  const c = campaign("perfect");
  const fails = c.rows
    .map((r, i) => (r.passRate < 0.6 ? `${i + 1} ${S.BREWS[i].name}: ${(r.passRate * 100).toFixed(0)}%` : null))
    .filter(Boolean);
  assert.deepEqual(fails, [], "a recipe a good player fails most of the time is a wall, not a challenge");
  assert.ok(c.meanPass >= 0.85,
    `a good brewer clears only ${(c.meanPass * 100).toFixed(0)}% of deals across the book`);
});

test("an ordinary brewer gets through the book but does not walk it", () => {
  const c = campaign("ordinary");
  const rows = c.rows.map((r, i) =>
    `${String(i + 1).padStart(2)} ${S.BREWS[i].name.padEnd(20)} ` +
    `pass ${(r.passRate * 100).toFixed(0).padStart(3)}%  ` +
    `3★ ${(r.threeRate * 100).toFixed(0).padStart(3)}%  ` +
    `stars ${r.meanStars.toFixed(2)}  score ${String(r.meanScore).padStart(3)}  ` +
    `blowups ${r.meanBlowUps.toFixed(2)}  target ${S.BREWS[i].targets.join("/")}`);
  console.log("\n  ordinary brewer, 12 seeds per recipe\n  " + rows.join("\n  ") + "\n");

  const hard = c.rows
    .map((r, i) => (r.passRate < 0.6 ? `${i + 1} ${S.BREWS[i].name}: ${(r.passRate * 100).toFixed(0)}%` : null))
    .filter(Boolean);
  assert.deepEqual(hard, []);
  assert.ok(c.meanPass >= 0.85, `ordinary clears ${(c.meanPass * 100).toFixed(0)}% of deals`);

  const easy = c.rows
    .map((r, i) => (r.threeRate > 0.6 ? `${i + 1} ${S.BREWS[i].name}: 3★ ${(r.threeRate * 100).toFixed(0)}%` : null))
    .filter(Boolean);
  assert.deepEqual(easy, [], "three stars must mean something");
  assert.ok(c.meanThree <= 0.35, `three stars come up ${(c.meanThree * 100).toFixed(0)}% of the time`);
});

test("the book gets harder: later recipes demand more of what they can reach", () => {
  // The raw target CANNOT rise across the campaign, and an earlier draft of
  // this suite wrongly insisted it did. A later recipe is riskier, so a good
  // player stops sooner and scores less — the numbers genuinely go down.
  // Difficulty is the fraction of a recipe's own ceiling that its target asks
  // for, and that is what has to climb.
  const demand = S.BREWS.map((brew, i) => brew.targets[0] / sweep(i, "perfect").medScore);
  const first = demand.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
  const last = demand.slice(-4).reduce((a, b) => a + b, 0) / 4;
  console.log(`\n  demand ratio: chapter 1 ${first.toFixed(2)} -> chapter 5 ${last.toFixed(2)}\n`);
  assert.ok(last > first * 1.15,
    `the last chapter asks ${last.toFixed(2)} of what it can reach and the first asks ${first.toFixed(2)} — that is not a ramp`);
});

test("a player working through the book in order always gets through it", () => {
  // "Every recipe with no perks" is a situation nobody meets — by the time you
  // unlock brew 15 you have finished fourteen and been paid essence for all of
  // them. And a brew you fail is a brew you retry, so the guarantee that
  // matters is not "wins first time" but "never gets STUCK".
  const MAX_ATTEMPTS = 6;
  const report = [], attemptCounts = [];
  for (const seed of SEEDS.slice(0, 6)) {
    const prog = { perks: {} };
    let essence = 0, worst = 0, total = 0;
    for (let i = 0; i < S.BREWS.length; i++) {
      let attempts = 0, won = false;
      while (attempts < MAX_ATTEMPTS && !won) {
        const r = playBrew({ levelIdx: i, seed: seed + i * 31 + attempts * 7, brain: "ordinary", loadout: S.perkLoadout(prog) });
        attempts++;
        essence += S.essenceFor(r);
        won = r.win;
        // A pessimistic shopper: buys the cheapest perk it can, never saves up.
        for (;;) {
          const buyable = S.PERKS
            .map((p) => ({ p, lvl: S.perkLevel(prog, p.id) }))
            .filter(({ p, lvl }) => lvl < p.costs.length && p.costs[lvl] <= essence)
            .sort((a, b) => a.p.costs[a.lvl] - b.p.costs[b.lvl]);
          if (!buyable.length) break;
          essence -= buyable[0].p.costs[buyable[0].lvl];
          prog.perks[buyable[0].p.id] = buyable[0].lvl + 1;
        }
      }
      assert.ok(won, `stuck on brew ${i + 1} (${S.BREWS[i].name}) after ${MAX_ATTEMPTS} attempts`);
      worst = Math.max(worst, attempts);
      total += attempts;
    }
    attemptCounts.push(total / S.BREWS.length);
    report.push(`seed ${seed}: finished the book, worst recipe took ${worst} attempts, ` +
      `${(total / S.BREWS.length).toFixed(2)} on average, perks ${JSON.stringify(prog.perks)}`);
  }
  console.log("\n  progression runs\n  " + report.join("\n  ") + "\n");
  const mean = attemptCounts.reduce((a, b) => a + b, 0) / attemptCounts.length;
  assert.ok(mean < 1.7, `the average recipe takes ${mean.toFixed(2)} attempts — that is a grind, not a game`);
});

test("doing the minimum scores almost nothing", () => {
  // You cannot idle here — the rules make you put one chip in the pot — so the
  // honest control is a player who draws that one chip and stops. It must never
  // earn a result, or stopping immediately would be a strategy.
  const c = campaign("timid", { shopper: "none" });
  const fails = c.rows
    .map((r, i) => (r.passRate > 0 ? `${i + 1} ${S.BREWS[i].name}` : null))
    .filter(Boolean);
  assert.deepEqual(fails, [], "one chip and out must never pass a recipe");
  const ordinary = campaign("ordinary").meanScore;
  assert.ok(c.meanScore < ordinary * 0.15,
    `the minimum scores ${c.meanScore.toFixed(0)} against an ordinary ${ordinary.toFixed(0)}`);
});

test("never stopping is punished, hard", () => {
  // A punishment the rest of the system quietly pays back is not a punishment.
  // If greed scored near careful play, the decision at the heart of the game
  // would be worth nothing.
  const greedy = campaign("reckless");
  const careful = campaign("perfect");
  assert.ok(greedy.meanBlowUps > 3,
    `reckless play only blew up ${greedy.meanBlowUps.toFixed(1)} times in 5 rounds`);
  assert.ok(greedy.meanScore < careful.meanScore * 0.25,
    `reckless scores ${greedy.meanScore.toFixed(0)} vs careful ${careful.meanScore.toFixed(0)}`);
  // Not zero: a bot that keeps buying calmwort can eventually defuse its way
  // through a whole bag, and the round then ends safely because the bag ran
  // out. That is a real (and expensive) strategy rather than a leak, so the
  // bar is "almost never" rather than "never".
  assert.ok(greedy.meanPass < 0.1,
    `reckless passes ${(greedy.meanPass * 100).toFixed(0)}% of recipes`);
});

test("judging the odds well beats guessing", () => {
  // Compared across the whole book, not per recipe: on twelve deals a single
  // run swings a per-recipe pass rate by 8 points, and a table read that
  // closely is measuring noise.
  const good = campaign("perfect");
  const rough = campaign("ordinary");
  assert.ok(good.meanScore > rough.meanScore,
    `skill scores ${good.meanScore.toFixed(0)} vs guessing ${rough.meanScore.toFixed(0)}`);
  assert.ok(good.meanThree > rough.meanThree,
    `skill three-stars ${(good.meanThree * 100).toFixed(0)}% vs ${(rough.meanThree * 100).toFixed(0)}%`);
});

test("the apothecary is worth visiting", () => {
  // If buying nothing did as well as buying sensibly, the economy would be
  // decoration and every brew would collapse to one repeated round.
  let shopping = 0, barren = 0;
  for (const i of [3, 7, 11, 15, 19]) {
    shopping += sweep(i, "perfect", { shopper: "sensible" }).meanScore;
    barren += sweep(i, "perfect", { shopper: "none" }).meanScore;
  }
  assert.ok(shopping > barren * 1.12,
    `shopping scores ${shopping} vs ${barren} — the apothecary is not earning its screen`);
});

test("the Larder helps without erasing the game", () => {
  // Built from the data, never hardcoded: a perk that loses a level would
  // otherwise silently be measured at a level it no longer sells.
  const maxed = Object.fromEntries(S.PERKS.map((p) => [p.id, p.costs.length]));
  const bare = sweep(19, "ordinary", { loadout: S.perkLoadout({ perks: {} }) });
  const kitted = sweep(19, "ordinary", { loadout: S.perkLoadout({ perks: maxed }) });
  assert.ok(kitted.meanScore > bare.meanScore * 1.1,
    `a full Larder scores ${kitted.meanScore} vs ${bare.meanScore} — not worth the essence`);
  assert.ok(kitted.threeRate < 1,
    "a fully-kitted player still must not three-star the last recipe every single time");
});

test("the Bottomless Cauldron always ends, even for a perfect brewer", () => {
  // The fizz limit falls with NO floor and the bag sours every round, so an
  // unbeatable player still runs out of cauldron. A mode bounded only by
  // mistakes never ends for someone who does not make any.
  const lengths = [];
  for (const seed of SEEDS) {
    const r = playBrew({ levelIdx: 0, seed, brain: "perfect", mode: "endless" });
    assert.ok(r.roundsPlayed < 60, `endless ran ${r.roundsPlayed} rounds — it is not closing`);
    assert.ok(r.blowUps >= 1, "the bottomless cauldron ends in a blow-up, always");
    lengths.push(r.roundsPlayed);
  }
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  console.log(`\n  bottomless cauldron: ${Math.min(...lengths)}-${Math.max(...lengths)} rounds, mean ${mean.toFixed(1)}\n`);
  assert.ok(mean >= 5, `a perfect run only lasts ${mean.toFixed(1)} rounds — too short to be a score`);
});

test("the Daily Cauldron is the same brew for everyone", () => {
  const a = playBrew({ levelIdx: 0, seed: S.RNG.seedFrom("daily:2026-08-18"), brain: "perfect", mode: "daily" });
  const b = playBrew({ levelIdx: 0, seed: S.RNG.seedFrom("daily:2026-08-18"), brain: "perfect", mode: "daily" });
  assert.equal(a.score, b.score);
  assert.equal(a.roundsPlayed, b.roundsPlayed);

  const other = playBrew({ levelIdx: 0, seed: S.RNG.seedFrom("daily:2026-08-19"), brain: "perfect", mode: "daily" });
  assert.notEqual(other.score, a.score, "two different days must not be the same cauldron");
});

test("a brew replays identically from its seed, whatever was played before it", () => {
  // Coordinate-derived generators, not a running stream: this is what makes a
  // brew resumable, a daily challenge shared, and these bot reports meaningful.
  const first = playBrew({ levelIdx: 8, seed: 4242, brain: "perfect" });
  playBrew({ levelIdx: 3, seed: 999, brain: "reckless" });        // churn
  playBrew({ levelIdx: 14, seed: 111, brain: "ordinary" });
  const again = playBrew({ levelIdx: 8, seed: 4242, brain: "perfect" });
  assert.equal(again.score, first.score);
  assert.equal(again.blowUps, first.blowUps);
});

test("two picks a visit is a real cap, and it is reached", () => {
  // A cap nothing ever hits is doing nothing; an uncapped shop lets one good
  // round buy the shelf, flooding the bag and converging every brew.
  S.__reseed(7);
  const G = S.Game;
  G.start({ mode: "campaign", levelIdx: 19, seed: 555, loadout: S.perkLoadout({ perks: { pockets: 3 } }) });
  let hitTheCap = false, guard = 400;
  while (G.running && guard-- > 0) {
    if (G.phase === "brew") {
      if (G.canDraw() && BRAINS.perfect(G.round)) G.draw();
      else if (G.canBank()) G.bank();
      else G.draw();
    } else {
      const before = G.bag.length;
      for (let i = 0; i < 6; i++) {
        const options = G.stock.filter((id) => G.canAfford(id));
        if (options.length) G.buy(options[0]);
      }
      const bought = G.bag.length - before;
      assert.ok(bought <= S.BREW_RULES.BUYS_PER_SHOP, `bought ${bought} chips in one visit`);
      if (bought === S.BREW_RULES.BUYS_PER_SHOP) hitTheCap = true;
      G.leaveShop();
    }
  }
  assert.ok(hitTheCap, "nobody ever reaches the buy cap — it is not doing anything");
});

test("the safety valve is always on the shelf", () => {
  // js/game.js promises the cheapest calmwort a recipe stocks is always in the
  // offer, so a player drowning in fizz can always buy some air. Checked
  // through the real shop rather than by reading the code.
  const fails = [];
  for (const i of [0, 5, 10, 15, 19]) {
    const G = S.Game;
    G.start({ mode: "campaign", levelIdx: i, seed: 31337 + i });
    let guard = 400;
    while (G.running && guard-- > 0) {
      if (G.phase === "brew") { G.canBank() ? G.bank() : G.draw(); }
      else {
        if (!G.stock.some((id) => S.CHIP[id].family === "calmwort")) {
          fails.push(`brew ${i + 1} round ${G.roundIdx + 1} offered no calmwort`);
        }
        G.leaveShop();
      }
    }
  }
  assert.deepEqual(fails, []);
});
