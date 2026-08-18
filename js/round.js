// Bubble & Brew — one round in the cauldron.
//
// This is the push-your-luck core, and it is deliberately the smallest thing in
// the game: a bag of chips, a stirring rod that only ever goes forward, a fizz
// gauge that only ever fills, and exactly one decision — draw again, or stop.
//
// No DOM, no canvas, no audio, no Math.random. Every shuffle comes from the
// caller's seeded generator, so main.js and tests/bot.test.js drive the
// identical engine and a changed balance number is a changed DESIGN, never a
// bad deal.
//
// draw() returns the whole CHAIN it resolved, not a single chip, because
// quicksilver can pull three chips off the back of one press and the player
// never got to stop in between. The UI animates the steps; the engine has
// already finished.

function makeRound(cfg) {
  const rng = cfg.rng;
  const salvage = cfg.salvage || 0;         // fraction of points kept on a blow-up

  const r = {
    bag: rng.shuffle(cfg.bag),              // draw from the END
    drawn: [],                              // chip ids brewed, in order
    aside: [],                              // fizzroots caught by a thornvine
    peekDepth: 0,                           // how many chips ahead the player can see

    pos: Math.min(TRACK_MAX, cfg.startPos || 0),
    fizz: 0,
    limit: cfg.fizzLimit,
    baseLimit: cfg.fizzLimit,

    coins: 0,                               // paid by glimmercaps, kept regardless
    refund: 0,                              // emberbark bonus, only if you stop

    doubleNext: false,
    siftCharges: 0,
    chainQueue: 0,

    over: false,
    exploded: false,
    banked: false,
  };

  // How many of this chip's own family are already in the pot — what `bloom`
  // counts. Chips set aside by a thornvine never made it in, so they don't.
  function familyCount(family) {
    return r.drawn.filter((id) => CHIP[id].family === family).length;
  }

  // Sight is stored as a DEPTH, never as a snapshot list. A list would have to
  // be invalidated as chips leave the bag, and the obvious way to do that —
  // "drop the head if it matches the chip just drawn" — is wrong the moment the
  // bag holds two identical chips, which it almost always does.
  function reveal(n) { r.peekDepth = Math.max(r.peekDepth, n); }

  // Resolve exactly one chip. Returns the step record the UI animates.
  function step() {
    const id = r.bag.pop();
    r.peekDepth = Math.max(0, r.peekDepth - 1);   // one chip of foresight spent
    const chip = CHIP[id];
    const e = chip.effect;
    const rec = { id, sifted: false, doubled: false, value: 0, fizz: 0, effects: [] };

    // A thornvine's catch happens BEFORE anything else touches the chip: the
    // fizzroot is lifted straight back out, so it never fizzes, never moves the
    // rod, and never burns a pending echobell. Catching a bomb should feel like
    // a clean save, not like a wasted double.
    if (e.fizz && r.siftCharges > 0) {
      r.siftCharges--;
      r.aside.push(id);
      rec.sifted = true;
      return snapshot(rec);
    }

    let value = chip.value + (e.bloom ? e.bloom * familyCount(chip.family) : 0);
    let fizz = e.fizz || 0;

    if (r.doubleNext) {
      value *= 2;
      fizz *= 2;
      r.doubleNext = false;
      rec.doubled = true;
    }

    r.drawn.push(id);
    r.pos = Math.min(TRACK_MAX, r.pos + value);
    r.fizz += fizz;
    rec.value = value;
    rec.fizz = fizz;

    if (e.defuse)  { const was = r.fizz; r.fizz = Math.max(0, r.fizz - e.defuse); rec.effects.push({ k: "defuse", n: was - r.fizz }); }
    if (e.coin)    { r.coins += e.coin;        rec.effects.push({ k: "coin",   n: e.coin }); }
    if (e.refund)  { r.refund += e.refund;     rec.effects.push({ k: "refund", n: e.refund }); }
    if (e.steady)  { r.limit += e.steady;      rec.effects.push({ k: "steady", n: e.steady }); }
    if (e.sift)    { r.siftCharges += e.sift;  rec.effects.push({ k: "sift",   n: e.sift }); }
    if (e.chain)   { r.chainQueue += e.chain;  rec.effects.push({ k: "chain",  n: e.chain }); }
    if (e.double)  { r.doubleNext = true;      rec.effects.push({ k: "double", n: 1 }); }
    if (e.peek)    { reveal(e.peek);           rec.effects.push({ k: "peek",   n: e.peek }); }

    return snapshot(rec);
  }

  // Each step carries the state AS OF that step, not just what the chip did.
  // The UI plays a quicksilver chain back one chip at a time, and without this
  // it would have to show the finished total against the first chip — telling
  // the player how the chain ends before they have watched it happen.
  function snapshot(rec) {
    rec.pos = r.pos;
    rec.fizzTotal = r.fizz;
    rec.limit = r.limit;
    rec.bagLeft = r.bag.length;
    return rec;
  }

  /* ---------- the two things a player can do ---------- */

  r.canDraw = function () { return !r.over && r.bag.length > 0; };

  // Draw one chip, then keep drawing while quicksilver owes free draws.
  r.draw = function () {
    if (!r.canDraw()) return { steps: [], over: r.over, exploded: r.exploded };

    const steps = [];
    let guard = 40;                          // a chain cannot outlive the bag
    for (;;) {
      const rec = step();
      steps.push(rec);

      // Losing is checked before anything else can be true of this step.
      if (r.fizz > r.limit) {
        r.exploded = true;
        r.over = true;
        rec.exploded = true;
        break;
      }
      if (r.chainQueue > 0 && r.bag.length > 0 && guard-- > 0) { r.chainQueue--; continue; }
      r.chainQueue = 0;
      break;
    }

    // An empty bag ends the round on the spot — everything you own is in the
    // pot, so there is nothing left to be brave about.
    if (!r.over && r.bag.length === 0) { r.banked = true; r.over = true; }

    return { steps, over: r.over, exploded: r.exploded };
  };

  r.bank = function () {
    if (r.over) return false;
    r.banked = true;
    r.over = true;
    return true;
  };

  /* ---------- what the round was worth ---------- */

  // Points are lost in a blow-up (bar whatever Salvage rescues); coins are
  // never lost. That single rule is what makes an early round's explosion a
  // shopping trip and the last round's a disaster.
  r.points = function () {
    const base = trackPoints(r.pos);
    if (r.exploded) return Math.floor(base * salvage);
    return base + r.refund;
  };

  r.coinsWon = function () { return trackCoins(r.pos) + r.coins; };

  // What the player is risking by pressing Draw once more, in the currency the
  // decision is actually made in.
  r.atStake = function () { return r.points(); };

  r.headroom = function () { return r.limit - r.fizz; };

  // The chance the very next chip takes the lid off, computed from the chips
  // genuinely left in the bag rather than estimated. This is the number the
  // whole game is about, so the player is shown it — a push-your-luck game
  // that hides its odds is just an arbitrary one.
  r.bustChance = function () {
    if (r.over || !r.bag.length) return 0;
    if (r.siftCharges > 0) return 0;              // a thornvine catches it first
    const mult = r.doubleNext ? 2 : 1;            // a pending echobell doubles the fizz
    const head = r.headroom();
    let bust = 0;
    for (const id of r.bag) if ((CHIP[id].effect.fizz || 0) * mult > head) bust++;
    return bust / r.bag.length;
  };

  // A copy of this round with the REMAINING bag reshuffled, for anything that
  // wants to ask "what would happen if I kept going" — the balance bots roll
  // this out. Reshuffling is the point: a clone that kept the real order would
  // be able to see the future, and a bot that can see the future measures a
  // different game from the one anyone plays.
  r.clone = function (shuffle) {
    const c = makeRound({
      rng: { shuffle: shuffle || ((a) => [...a]) },
      bag: r.bag, fizzLimit: r.baseLimit, salvage,
    });
    c.limit = r.limit; c.pos = r.pos; c.fizz = r.fizz;
    c.drawn = [...r.drawn]; c.aside = [...r.aside];
    c.coins = r.coins; c.refund = r.refund; c.peekDepth = r.peekDepth;
    c.doubleNext = r.doubleNext; c.siftCharges = r.siftCharges; c.chainQueue = r.chainQueue;
    return c;
  };

  // The chips the player can currently see waiting, nearest first.
  r.visible = function () {
    const take = Math.min(r.peekDepth, r.bag.length);
    return take ? r.bag.slice(r.bag.length - take).reverse() : [];
  };

  if (cfg.freePeek) reveal(cfg.freePeek);

  return r;
}

if (typeof module !== "undefined") module.exports = { makeRound };
