// The push-your-luck core, mechanic by mechanic.
//
// Every test here stacks the bag deliberately and uses a stub generator that
// does not shuffle, so a chip's behaviour is asserted in isolation rather than
// hoped for across a hundred random rounds.

const test = require("node:test");
const assert = require("node:assert");
const { loadEngine } = require("./load.js");

const S = loadEngine();

// A generator that leaves the bag exactly as given. makeRound draws from the
// END, so `stack([...])` lists chips in the order they will come out.
const noShuffle = { shuffle: (a) => [...a].reverse() };
function stack(ids, cfg = {}) {
  return S.makeRound(Object.assign({ rng: noShuffle, bag: ids, fizzLimit: 7 }, cfg));
}

test("a plain chip advances the rod and nothing else", () => {
  const r = stack(["leaf2"]);
  r.draw();
  assert.equal(r.pos, 2);
  assert.equal(r.fizz, 0);
  assert.equal(r.exploded, false);
});

test("fizzroot advances AND fizzes — the trap is that it is also progress", () => {
  const r = stack(["fizz3", "leaf1"]);
  r.draw();
  assert.equal(r.pos, 3);
  assert.equal(r.fizz, 3);
});

test("going over the limit explodes; landing exactly on it does not", () => {
  const exact = stack(["fizz3", "fizz3", "fizz1"], { fizzLimit: 7 });
  exact.draw(); exact.draw(); exact.draw();
  assert.equal(exact.fizz, 7);
  assert.equal(exact.exploded, false, "fizz == limit is survivable");

  const over = stack(["fizz3", "fizz3", "fizz2"], { fizzLimit: 7 });
  over.draw(); over.draw(); over.draw();
  assert.equal(over.exploded, true);
  assert.equal(over.over, true);
});

test("an explosion loses the points and keeps the coins", () => {
  const r = stack(["glim3", "fizz3", "fizz3", "fizz3"], { fizzLimit: 7 });
  r.draw(); r.draw(); r.draw(); r.draw();
  assert.equal(r.exploded, true);
  assert.equal(r.points(), 0, "no salvage bought, so no points survive");
  assert.ok(r.coinsWon() >= 5, "the glimmercap's coins are already banked");
});

test("Salvage rescues a fraction of the points and nothing more", () => {
  const r = stack(["leaf4", "leaf4", "leaf4", "fizz3", "fizz3", "fizz3"], { fizzLimit: 5, salvage: 0.5 });
  for (let i = 0; i < 6 && !r.over; i++) r.draw();
  assert.equal(r.exploded, true);
  assert.equal(r.points(), Math.floor(S.trackPoints(r.pos) * 0.5));
});

test("calmwort takes fizz back off the gauge and cannot go below zero", () => {
  const r = stack(["calm3", "fizz2", "calm3"], { fizzLimit: 7 });
  r.draw();
  assert.equal(r.fizz, 0, "defusing an empty gauge is not negative fizz");
  r.draw();
  assert.equal(r.fizz, 2);
  r.draw();
  assert.equal(r.fizz, 0);
});

test("echobell doubles the next chip's value AND its fizz", () => {
  const safe = stack(["bell1", "leaf4"]);
  safe.draw(); safe.draw();
  assert.equal(safe.pos, 1 + 8, "the leaf is worth double");

  const nasty = stack(["bell1", "fizz3"], { fizzLimit: 7 });
  nasty.draw(); nasty.draw();
  assert.equal(nasty.fizz, 6, "so is the fizzroot — that is the gamble");
});

test("a doubled draw can be exactly what kills you", () => {
  const r = stack(["fizz2", "bell1", "fizz3"], { fizzLimit: 7 });
  r.draw(); r.draw();
  assert.equal(r.exploded, false, "2 fizz, well inside the limit");
  r.draw();
  assert.equal(r.fizz, 8);
  assert.equal(r.exploded, true);
});

test("thornvine lifts a fizzroot out before it fizzes or moves the rod", () => {
  const r = stack(["thorn1", "fizz3", "leaf1"], { fizzLimit: 7 });
  r.draw();
  const posAfterThorn = r.pos;
  const res = r.draw();
  assert.equal(res.steps[0].sifted, true);
  assert.equal(r.fizz, 0);
  assert.equal(r.pos, posAfterThorn, "a caught root does not advance you either");
  assert.deepEqual(r.aside, ["fizz3"]);
});

test("a caught fizzroot does not burn a pending echobell", () => {
  // Catching a bomb should feel like a clean save, not like a wasted double.
  const r = stack(["thorn1", "bell1", "fizz3", "leaf4"], { fizzLimit: 7 });
  r.draw(); r.draw(); r.draw();
  assert.equal(r.doubleNext, true, "the bell is still armed after the catch");
  r.draw();
  assert.equal(r.pos, 1 + 1 + 8);
});

test("quicksilver keeps drawing without giving the player a chance to stop", () => {
  const r = stack(["quick3", "leaf1", "leaf2", "leaf4"]);
  const res = r.draw();
  assert.equal(res.steps.length, 3, "one press, the quicksilver plus its two free draws");
  assert.equal(r.pos, 2 + 1 + 2);
  assert.equal(r.bag.length, 1);
});

test("a chain that blows up stops there rather than drawing on", () => {
  const r = stack(["quick3", "fizz3", "fizz3", "fizz3", "leaf1"], { fizzLimit: 4 });
  const res = r.draw();
  assert.equal(r.exploded, true);
  assert.equal(res.steps[res.steps.length - 1].exploded, true);
  assert.ok(r.bag.length >= 2, "the rest of the chain was never drawn");
});

test("ironcap raises the limit for the rest of the round", () => {
  const r = stack(["iron2", "fizz3", "fizz3", "fizz3"], { fizzLimit: 7 });
  r.draw();
  assert.equal(r.limit, 9);
  r.draw(); r.draw(); r.draw();
  assert.equal(r.fizz, 9);
  assert.equal(r.exploded, false, "the raised lid is what saved it");
});

test("spiderlily is worth nothing alone and grows on its own kind", () => {
  const r = stack(["lily2", "lily2", "lily2"]);
  r.draw(); assert.equal(r.pos, 1);       // 1 + 2*0
  r.draw(); assert.equal(r.pos, 4);       // 1 + 2*1
  r.draw(); assert.equal(r.pos, 9);       // 1 + 2*2
});

test("emberbark pays only if you bottle it", () => {
  const kept = stack(["ember3", "leaf1"]);
  kept.draw();
  kept.bank();
  assert.equal(kept.points(), S.trackPoints(kept.pos) + 15);

  const lost = stack(["ember3", "fizz3", "fizz3", "fizz3"], { fizzLimit: 5 });
  for (let i = 0; i < 4 && !lost.over; i++) lost.draw();
  assert.equal(lost.exploded, true);
  assert.equal(lost.points(), 0, "the refund is worth nothing to a wreck");
});

test("owl's eye shows what is coming, and sight is spent as chips are drawn", () => {
  const r = stack(["owl2", "leaf1", "leaf2", "leaf4"]);
  assert.deepEqual(r.visible(), []);
  r.draw();
  assert.deepEqual(r.visible(), ["leaf1", "leaf2"]);
  r.draw();
  assert.deepEqual(r.visible(), ["leaf2"], "one chip of foresight is used up per draw");
  r.draw();
  assert.deepEqual(r.visible(), []);
});

test("sight is a depth, so duplicate chips cannot confuse it", () => {
  // The obvious implementation — remember the list, drop the head when it
  // matches the chip just drawn — is wrong exactly when the bag holds two
  // identical chips, which it almost always does.
  const r = stack(["owl2", "leaf1", "leaf1", "leaf1"]);
  r.draw();
  assert.deepEqual(r.visible(), ["leaf1", "leaf1"]);
  r.draw();
  assert.deepEqual(r.visible(), ["leaf1"]);
});

test("Spectacles reveal the first chip before a single draw", () => {
  const r = stack(["leaf4", "leaf1"], { freePeek: 1 });
  assert.deepEqual(r.visible(), ["leaf4"]);
});

test("an empty bag ends the round safely — nothing left to be brave about", () => {
  const r = stack(["leaf1", "leaf2"]);
  r.draw(); r.draw();
  assert.equal(r.over, true);
  assert.equal(r.banked, true);
  assert.equal(r.exploded, false);
  assert.equal(r.draw().steps.length, 0, "a finished round refuses further draws");
});

test("banking is final and a banked round cannot be drawn from", () => {
  const r = stack(["leaf1", "leaf2", "leaf4"]);
  r.draw();
  assert.equal(r.bank(), true);
  assert.equal(r.bank(), false);
  assert.equal(r.canDraw(), false);
  assert.equal(r.pos, 1);
});

test("the Apprentice head start counts toward the score", () => {
  const r = stack(["leaf1"], { startPos: 4 });
  r.draw();
  assert.equal(r.pos, 5);
  r.bank();
  assert.equal(r.points(), S.trackPoints(5));
});

test("every step carries the state as of that step, not the finished total", () => {
  // The UI plays a chain back one chip at a time; without per-step snapshots it
  // would have to show how the chain ends against its first chip.
  const r = stack(["quick3", "leaf1", "leaf2", "leaf4"]);
  const { steps } = r.draw();
  assert.deepEqual(steps.map((s) => s.pos), [2, 3, 5]);
  assert.deepEqual(steps.map((s) => s.bagLeft), [3, 2, 1]);
});

test("the rod never runs off the end of the track", () => {
  const r = stack(Array.from({ length: 30 }, () => "leaf4"));
  while (r.canDraw()) r.draw();
  assert.equal(r.pos, S.TRACK_MAX);
});
