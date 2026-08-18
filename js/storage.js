// Persistence: gamekit storage (lib/gk-storage.js) configured for Bubble & Brew.
// bnb_* localStorage keys, "bubblebrew" Firestore collection.
//
// Essence is SPENT in the Larder, so a plain max() merge of a balance would
// resurrect spent essence every time two devices sync. Both sides of the ledger
// are monotonic counters instead — essenceEarned and essenceSpent only ever
// grow — and the balance is derived, which makes max() always safe.
//
// The Daily Cauldron is the one thing here that is not monotonic: today's score
// is not "better than" yesterday's, it is a different question. It is stored as
// a date -> score map so each KEY is monotonic, which is what lets the same
// max() merge be correct for it too.

const DAILY_KEEP = 14;      // days of Daily Cauldron history worth carrying

const PROGRESS = {
  blank: () => ({
    essenceEarned: 0, essenceSpent: 0,
    brews: {},           // { [idx]: { score, stars } } best result per brew
    perks: {},           // { [perkId]: level }
    endlessBest: 0,      // best score in the bottomless cauldron
    endlessRounds: 0,    // deepest round survived
    daily: {},           // { "YYYY-MM-DD": score }
    updated: 0,
  }),

  merge: (a, b) => {
    const brews = { ...(a.brews || {}) };
    for (const idx of Object.keys(b.brews || {})) {
      const cur = brews[idx], next = b.brews[idx];
      brews[idx] = cur
        ? { score: Math.max(cur.score || 0, next.score || 0), stars: Math.max(cur.stars || 0, next.stars || 0) }
        : next;
    }

    const perks = { ...(a.perks || {}) };
    for (const id of Object.keys(b.perks || {})) perks[id] = Math.max(perks[id] || 0, b.perks[id]);

    // Union of both devices' days, best score kept per day, then trimmed to the
    // most recent DAILY_KEEP so the record can't grow without bound.
    const daily = { ...(a.daily || {}) };
    for (const day of Object.keys(b.daily || {})) daily[day] = Math.max(daily[day] || 0, b.daily[day]);
    const trimmed = {};
    Object.keys(daily).sort().slice(-DAILY_KEEP).forEach((day) => { trimmed[day] = daily[day]; });

    return {
      // Spread first so a field a newer build added survives an older client's merge.
      ...a, ...b,
      essenceEarned: Math.max(a.essenceEarned || 0, b.essenceEarned || 0),
      essenceSpent: Math.max(a.essenceSpent || 0, b.essenceSpent || 0),
      endlessBest: Math.max(a.endlessBest || 0, b.endlessBest || 0),
      endlessRounds: Math.max(a.endlessRounds || 0, b.endlessRounds || 0),
      brews, perks, daily: trimmed,
    };
  },
};

const Storage = GK.createStorage({
  prefix: "bnb",
  collection: "bubblebrew",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

/* ----- Bubble & Brew helpers on top of the kit storage ----- */
Object.assign(Storage, {
  essence(prog) { return Math.max(0, (prog.essenceEarned || 0) - (prog.essenceSpent || 0)); },

  totalScore(prog) {
    return Object.values(prog.brews || {}).reduce((s, b) => s + (b.score || 0), 0);
  },

  totalStars(prog) {
    return Object.values(prog.brews || {}).reduce((s, b) => s + (b.stars || 0), 0);
  },

  brewsWon(prog) { return Object.keys(prog.brews || {}).length; },

  // Brews unlock in order: the one after the highest you've finished.
  unlockedBrew(prog) {
    let max = -1;
    for (const k of Object.keys(prog.brews || {})) max = Math.max(max, Number(k));
    return Math.min(max + 1, BREWS.length - 1);
  },

  endlessUnlocked(prog) { return this.brewsWon(prog) >= ENDLESS_UNLOCK; },

  dailyScore(prog, day) { return (prog.daily || {})[day] || 0; },
  dailyDone(prog, day) { return Object.prototype.hasOwnProperty.call(prog.daily || {}, day); },

  addEssence(profileId, amount) {
    if (!amount) return this.getProgress(profileId);
    const prog = this.getProgress(profileId);
    prog.essenceEarned = (prog.essenceEarned || 0) + amount;
    this.saveProgress(profileId, prog);
    return prog;
  },

  // Record a finished brew. Only a WIN records a campaign brew, because
  // recording a loss would unlock the next one.
  recordBrew(profileId, result) {
    const prog = this.getProgress(profileId);

    if (result.mode === "endless") {
      prog.endlessBest = Math.max(prog.endlessBest || 0, result.score || 0);
      prog.endlessRounds = Math.max(prog.endlessRounds || 0, result.roundsPlayed || 0);
    } else if (result.mode === "daily") {
      prog.daily = prog.daily || {};
      const day = result.day;
      prog.daily[day] = Math.max(prog.daily[day] || 0, result.score || 0);
      const keep = {};
      Object.keys(prog.daily).sort().slice(-DAILY_KEEP).forEach((d) => { keep[d] = prog.daily[d]; });
      prog.daily = keep;
    } else if (result.win) {
      const cur = prog.brews[result.levelIdx];
      prog.brews[result.levelIdx] = {
        score: Math.max((cur && cur.score) || 0, result.score || 0),
        stars: Math.max((cur && cur.stars) || 0, result.stars || 0),
      };
    }

    this.saveProgress(profileId, prog);
    return prog;
  },

  buyPerk(profileId, id) {
    const prog = this.getProgress(profileId);
    const def = PERKS.find((p) => p.id === id);
    const lvl = perkLevel(prog, id);
    if (!def || lvl >= def.costs.length) return { ok: false, reason: "maxed" };
    const cost = def.costs[lvl];
    if (this.essence(prog) < cost) return { ok: false, reason: "essence" };
    prog.essenceSpent = (prog.essenceSpent || 0) + cost;
    prog.perks = prog.perks || {};
    prog.perks[id] = lvl + 1;
    this.saveProgress(profileId, prog);
    return { ok: true, progress: prog, cost };
  },
});
