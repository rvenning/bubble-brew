// Bubble & Brew — deterministic randomness.
//
// A brew is a SEED. Which chips come out of the bag in round 3, what the
// apothecary stocks between rounds, the order of the endless cauldron's
// souring — all of it is derived from that one number, so:
//
//   * a brew can be replayed exactly (the bots measure design, not luck),
//   * "close the tab mid-brew" resumes without storing a shuffled bag,
//   * the Daily Cauldron is genuinely the same brew for everyone.
//
// The rule that makes that work: NEVER draw from a running stream. Derive a
// fresh generator from COORDINATES — RNG.sub(seed, "bag", round) — so what a
// round produces depends only on WHERE it is, never on how many chips were
// drawn before it or which shop the player visited first.

const RNG = {
  // FNV-1a: any string -> a 32-bit seed. "2026-08-18" -> a day's cauldron.
  seedFrom(str) {
    const s = String(str);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },

  // mulberry32, with the conveniences hung off the callable.
  make(seed = 0) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    return next;
  },

  // The whole point of the file: a generator identified by where it is used.
  sub(seed, ...parts) {
    return RNG.make((seed ^ RNG.seedFrom(parts.join("|"))) >>> 0);
  },

  // Today's Daily Cauldron seed, in the player's own timezone — the date on
  // their calendar is the date they play.
  today(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },
};

if (typeof module !== "undefined") module.exports = { RNG };
