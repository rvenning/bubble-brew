// Bubble & Brew — a whole brew: five rounds at the cauldron with the apothecary
// in between, or an endless one that sours until it kills you.
//
// js/round.js owns the push-your-luck decision; this file owns everything that
// makes a sequence of those decisions into a game — the bag you keep buying
// into, the coins, the shop, the star targets, and the terminal check.
//
// DOM-free, canvas-free, Math.random-free, exactly like round.js: main.js and
// tests/bot.test.js drive this same object. Everything the UI needs to react to
// leaves through the `on` callbacks.

const BREW_RULES = {
  SHOP_SLOTS: 6,          // chips offered between rounds
  BUYS_PER_SHOP: 2,       // how many of them you may actually take
  ENDLESS_LIMIT: 7,       // starting fizz limit in the bottomless cauldron
  ENDLESS_SOUR_EVERY: 3,  // rounds between the limit dropping by one
  ENDLESS_COINS: 8,       // coins the bottomless cauldron starts you with
};

const Game = {
  running: false,
  phase: "done",          // "brew" (drawing) | "shop" (buying) | "done"
  mode: "campaign",       // "campaign" | "endless" | "daily"
  levelIdx: 0,
  seed: 0,
  level: null,
  loadout: null,

  bag: [],                // the player's whole bag; every round shuffles a copy
  roundIdx: 0,
  roundsTotal: 0,
  round: null,            // the live makeRound()
  stock: [],              // what the apothecary is offering right now

  coins: 0,
  total: 0,               // points banked across the brew
  rounds: [],             // per-round { pos, points, coins, exploded }
  blowUps: 0,

  result: null,
  on: {},

  emit(name, data) { const fn = this.on[name]; if (fn) fn(data || {}); },

  /* ---------- setup ---------- */

  // cfg: { mode, levelIdx, seed, loadout }
  start(cfg = {}) {
    this.mode = cfg.mode || "campaign";
    this.levelIdx = cfg.levelIdx || 0;
    this.loadout = Object.assign(
      { limitBonus: 0, startPos: 0, freePeek: 0, salvage: 0, startCoins: 0, shopSlots: 0, discount: 0 },
      cfg.loadout || {}
    );
    this.seed = cfg.seed >>> 0;
    this.level = this.mode === "campaign" ? BREWS[this.levelIdx] : null;

    this.bag = (this.level ? this.level.bag : pack({ fizz1: 4, fizz2: 2, fizz3: 1, leaf1: 3 })).slice();
    this.roundsTotal = this.mode === "campaign" ? ROUNDS_PER_BREW : Infinity;
    this.coins = (this.level ? this.level.startCoins : BREW_RULES.ENDLESS_COINS) + this.loadout.startCoins;

    this.roundIdx = -1;
    this.total = 0;
    this.rounds = [];
    this.blowUps = 0;
    this.result = null;
    this.running = true;

    this.beginRound();
  },

  /* ---------- a round ---------- */

  // Fizz limit for the round about to start. The campaign's is fixed by the
  // recipe; the bottomless cauldron's falls forever with NO floor, which is
  // what guarantees even a perfect player eventually blows up.
  limitFor(roundIdx) {
    const base = this.mode === "campaign"
      ? this.level.fizzLimit
      : BREW_RULES.ENDLESS_LIMIT - Math.floor(roundIdx / BREW_RULES.ENDLESS_SOUR_EVERY);
    return base + this.loadout.limitBonus;
  },

  // The bottomless cauldron sours: every round after the first drops another
  // fizzroot in the bag, and they get bigger the deeper you go.
  sourChip(roundIdx) {
    return roundIdx >= 10 ? "fizz3" : roundIdx >= 5 ? "fizz2" : "fizz1";
  },

  beginRound() {
    this.roundIdx++;
    if (this.mode !== "campaign" && this.roundIdx > 0) this.bag.push(this.sourChip(this.roundIdx));

    this.round = makeRound({
      rng: RNG.sub(this.seed, "bag", this.roundIdx),
      bag: this.bag,
      fizzLimit: this.limitFor(this.roundIdx),
      startPos: this.loadout.startPos,
      freePeek: this.loadout.freePeek,
      salvage: this.loadout.salvage,
    });

    this.phase = "brew";
    this.emit("roundStart", {
      round: this.roundIdx, total: this.roundsTotal, limit: this.round.limit,
    });
  },

  // You always have to put something in the pot. Beyond making the first draw
  // a formality rather than a decision, this is what stops "never draw" being a
  // strategy — and it is what makes the bottomless cauldron terminate.
  canBank() { return this.phase === "brew" && !this.round.over && this.round.drawn.length > 0; },
  canDraw() { return this.phase === "brew" && this.round.canDraw(); },

  draw() {
    if (!this.canDraw()) return null;
    const res = this.round.draw();
    this.emit("drew", res);
    if (res.over) this.endRound();
    return res;
  },

  bank() {
    if (!this.canBank()) return false;
    this.round.bank();
    this.endRound();
    return true;
  },

  // The one place a round can finish, so both the UI and the bot pass through
  // it. Putting this inside bank() alone would let a bot that only ever draws
  // finish a brew that never scored.
  endRound() {
    const rd = this.round;
    const points = rd.points();
    const coins = rd.coinsWon();

    this.total += points;
    this.coins += coins;
    if (rd.exploded) this.blowUps++;
    this.rounds.push({ pos: rd.pos, points, coins, exploded: rd.exploded, drawn: rd.drawn.length });

    this.emit("roundEnd", {
      round: this.roundIdx, pos: rd.pos, points, coins,
      exploded: rd.exploded, total: this.total, purse: this.coins,
    });

    // A blow-up in the bottomless cauldron is the end of the run — one life is
    // the whole point of the mode.
    if (this.mode !== "campaign" && rd.exploded) return this.finish();
    if (this.mode === "campaign" && this.roundIdx >= this.roundsTotal - 1) return this.finish();

    this.openShop();
  },

  /* ---------- the apothecary ---------- */

  // Six chips, drawn from this chapter's shelf. Two rules make the offer fair
  // rather than merely random: the cheapest calmwort in the pool is ALWAYS on
  // the shelf, so a player drowning in fizz can always buy their way to some
  // air; and nothing is offered that this round's purse could never reach even
  // if every coin went on it.
  openShop() {
    const rng = RNG.sub(this.seed, "shop", this.roundIdx);
    const pool = (this.mode === "campaign" ? this.level.shop : INGREDIENTS
      .filter((c) => c.cost !== null).map((c) => c.id)).slice();

    const guaranteed = pool
      .filter((id) => CHIP[id].family === "calmwort")
      .sort((a, b) => CHIP[a].cost - CHIP[b].cost)[0];

    const rest = rng.shuffle(pool.filter((id) => id !== guaranteed));
    const slots = BREW_RULES.SHOP_SLOTS + this.loadout.shopSlots;
    const picked = (guaranteed ? [guaranteed] : []).concat(rest).slice(0, slots);

    this.stock = picked.sort((a, b) => this.priceOf(a) - this.priceOf(b));
    // Two picks a visit, not a spree. An uncapped shop lets a good round buy
    // the whole shelf, which both floods the bag (diluting the very chips just
    // bought) and makes every brew converge on the same pile of everything.
    this.buysLeft = BREW_RULES.BUYS_PER_SHOP;
    this.phase = "shop";
    this.emit("shopOpen", {
      stock: this.stock, coins: this.coins, round: this.roundIdx, buysLeft: this.buysLeft,
    });
  },

  // What a chip costs THIS player — the Haggler perk shaves coins off, but
  // never all the way to free.
  priceOf(id) {
    const chip = CHIP[id];
    if (!chip || chip.cost === null) return Infinity;
    return Math.max(MIN_CHIP_COST, chip.cost - this.loadout.discount);
  },

  canAfford(id) { return this.priceOf(id) <= this.coins; },

  // Buying is diluting: the chip goes into the bag you draw from for the rest
  // of the brew, so every purchase makes everything else slightly rarer. That
  // tension is the whole reason there is a shop at all.
  buy(id) {
    if (this.phase !== "shop" || this.buysLeft <= 0) return false;
    if (!this.stock.includes(id) || !this.canAfford(id)) return false;
    this.coins -= this.priceOf(id);
    this.buysLeft--;
    this.bag.push(id);
    this.stock.splice(this.stock.indexOf(id), 1);
    this.emit("bought", { id, coins: this.coins, bag: this.bag.length, buysLeft: this.buysLeft });
    return true;
  },

  leaveShop() {
    if (this.phase !== "shop") return false;
    this.beginRound();
    return true;
  },

  /* ---------- the end ---------- */

  finish() {
    if (!this.running) return this.result;
    this.running = false;
    this.phase = "done";

    const targets = this.level ? this.level.targets : null;
    let stars = 0;
    let win = true;
    if (this.mode === "campaign") {
      win = this.total >= targets[0];
      if (win) {
        stars = 1;
        if (this.total >= targets[1]) stars = 2;
        if (this.total >= targets[2]) stars = 3;
      }
    }

    this.result = {
      win, stars,
      score: this.total,
      coins: this.coins,
      roundsPlayed: this.rounds.length,
      blowUps: this.blowUps,
      bestRound: this.rounds.reduce((m, r) => Math.max(m, r.points), 0),
      bagSize: this.bag.length,
      levelIdx: this.levelIdx,
      mode: this.mode,
      seed: this.seed,
    };
    this.emit("brewEnd", this.result);
    return this.result;
  },

  // Walk away without recording anything (the quit button).
  abandon() { this.running = false; this.phase = "done"; this.result = null; },

  /* ---------- read-only views for the UI and the bots ---------- */

  // How many of each chip are still in the bag this round, for the "what's
  // left" panel. Knowing the odds is most of the skill in a bag-builder, and
  // hiding them just makes the game feel arbitrary.
  remaining() {
    const counts = {};
    for (const id of this.round ? this.round.bag : this.bag) counts[id] = (counts[id] || 0) + 1;
    return counts;
  },

  // Chance the very next chip takes the lid off. Lives on the round, since
  // that is where the bag is; the UI reads it from here.
  bustChance() { return this.round ? this.round.bustChance() : 0; },
};

if (typeof module !== "undefined") module.exports = { Game, BREW_RULES };
