// The balance bots, in one place so both tests/bot.test.js and any throwaway
// measurement script drive exactly the same players.
//
// The cast, and why each earns its place:
//
//   perfect     Guardrail. Nothing in the campaign may be unwinnable by it.
//   ordinary    The tuning target. Must sometimes fall short.
//   timid       The control. Draws the one chip the rules demand and stops.
//               "Doing nothing" is not idling here — you MUST put something in
//               the pot — so this is the honest floor, and it must score
//               almost nothing.
//   reckless    The other guardrail: never stops. Proves greed is charged for.

const assert = require("node:assert");
const { loadEngine } = require("./load.js");

const S = loadEngine();
const SEEDS = [11, 97, 404, 1234, 2718, 3141, 5150, 6060, 7777, 8123, 9001, 24601];

// A shuffle drawn from the SANDBOX's seeded Math.random, so the bots' own
// randomness is reseeded per run along with the engine's. The test file runs in
// Node's own realm with a different, unseeded generator.
function botShuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(S.__rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// What carrying on is actually worth, by playing it out.
//
// The obvious implementation is one-ply expected value: compare stopping now
// against the average of "draw one chip, then stop". I built that first and it
// reported the entire campaign as unwinnable. The flaw was in the bot: a
// one-ply bot values a safe draw at what STOPPING right after it would pay, but
// the track accelerates, so most of a safe draw's worth is the draws it lets
// you make afterwards. Rolling the round out to its end prices that in.
//
// The clone reshuffles what is left in the bag, so a rollout never sees an
// order the player could not have known.
function rolloutValue(round, samples, threshold) {
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const c = round.clone(botShuffle);
    c.draw();                                  // the draw being considered
    while (!c.over && c.bustChance() < threshold) c.draw();
    if (!c.over) c.bank();
    total += c.points();
  }
  return total / samples;
}

// Rollout thresholds the guardrail bot considers. One fixed threshold is not
// enough: a rollout played out under a single cautious policy UNDERVALUES
// carrying on, and the first version of this bot duly lost brews the noisy
// ordinary bot won — which is the standard tell that the bot is the problem,
// not the game. Trying several and drawing if ANY of them beats standing is a
// proper lower bound on what playing on is worth.
const ROLLOUT_POLICIES = [0.2, 0.3, 0.42, 0.55];

const BRAINS = {
  perfect(round) {
    const stand = round.points();
    for (const threshold of ROLLOUT_POLICIES) {
      if (rolloutValue(round, 16, threshold) > stand) return true;
    }
    return false;
  },

  // The same judgement made by a person: fewer samples in their head, a wobbly
  // sense of what those told them, and the occasional "oh go on then" that
  // overrides a perfectly correct stop.
  ordinary(round) {
    const value = rolloutValue(round, 8, 0.3);
    const wobble = 0.84 + S.__rand() * 0.34;
    if (value * wobble > round.points()) return true;
    return round.bustChance() < 0.22 && S.__rand() < 0.2;
  },

  timid(round) { return round.drawn.length === 0; },

  reckless() { return true; },
};

// Rough worth of a chip, used only to decide what to buy. It deliberately
// prices safety above raw steps, because that is what a bag-builder rewards.
function chipWorth(chip) {
  const e = chip.effect;
  return chip.value
    + (e.defuse || 0) * 1.6
    + (e.coin || 0) * 0.5
    + (e.refund || 0) * 0.3
    + (e.peek || 0) * 1.2
    + (e.sift || 0) * 3.0
    + (e.steady || 0) * 2.2
    + (e.chain || 0) * 1.4
    + (e.double || 0) * 1.0
    + (e.bloom || 0) * 1.4;
}

const SHOPPERS = {
  // Best value per coin it can afford. Not optimal — it never plans a
  // combination — but it is the shape of what a thoughtful player does.
  sensible(game) {
    while (game.buysLeft > 0) {
      const options = game.stock.filter((id) => game.canAfford(id));
      if (!options.length) break;
      options.sort((a, b) =>
        chipWorth(S.CHIP[b]) / game.priceOf(b) - chipWorth(S.CHIP[a]) / game.priceOf(a));
      game.buy(options[0]);
    }
  },

  // The pessimistic shopper: buys the cheapest thing on the shelf, every time.
  cheap(game) {
    while (game.buysLeft > 0) {
      const options = game.stock.filter((id) => game.canAfford(id));
      if (!options.length) break;
      options.sort((a, b) => game.priceOf(a) - game.priceOf(b));
      game.buy(options[0]);
    }
  },

  none() {},
};

function playBrew({ levelIdx, seed, brain, shopper = "sensible", loadout, mode = "campaign" }) {
  // Reseed the bot's OWN noise per run, or a configuration measured second
  // consumes different mistakes from one measured first, and the table is
  // really reporting execution order.
  S.__reseed(seed);
  const G = S.Game;
  G.start({ mode, levelIdx, seed, loadout });

  let guard = 4000;
  while (G.running && guard-- > 0) {
    if (G.phase === "brew") {
      if (G.canDraw() && BRAINS[brain](G.round)) G.draw();
      else if (G.canBank()) G.bank();
      else G.draw();                       // must put something in the pot
    } else if (G.phase === "shop") {
      SHOPPERS[shopper](G);
      G.leaveShop();
    }
  }
  assert.ok(guard > 0, `brew ${levelIdx} never finished (${brain}/${shopper})`);
  return G.result;
}

function sweep(levelIdx, brain, opts = {}) {
  const runs = SEEDS.map((seed) => playBrew({ levelIdx, seed, brain, ...opts }));
  const n = runs.length;
  const scores = runs.map((r) => r.score).sort((a, b) => a - b);
  return {
    passRate: runs.filter((r) => r.win).length / n,
    threeRate: runs.filter((r) => r.stars === 3).length / n,
    meanStars: runs.reduce((s, r) => s + r.stars, 0) / n,
    meanScore: Math.round(runs.reduce((s, r) => s + r.score, 0) / n),
    minScore: scores[0],
    medScore: scores[Math.floor(n / 2)],
    maxScore: scores[n - 1],
    meanBlowUps: runs.reduce((s, r) => s + r.blowUps, 0) / n,
    runs,
  };
}

module.exports = { S, SEEDS, BRAINS, SHOPPERS, chipWorth, botShuffle, playBrew, sweep };
