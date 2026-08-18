// One place that knows how to load Bubble & Brew into Node.
//
// The game ships as plain <script> files with top-level `const` and no module
// system, so the suites run them through gamekit's vm harness. Concatenation
// order here must match index.html's — round.js reads CHIP and TRACK_MAX from
// ingredients.js at call time, and game.js reads BREWS and ROUNDS_PER_BREW, so
// a swapped pair is an immediate crash rather than a subtle bug.

const path = require("node:path");
const fs = require("node:fs");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

// The simulation and everything it is made of. No browser globals needed:
// round.js and game.js touch neither window nor document, which is the whole
// point of keeping them that way.
const ENGINE_FILES = [
  "tests/seed.js",
  "js/rng.js",
  "js/ingredients.js",
  "js/brews.js",
  "js/perks.js",
  "js/round.js",
  "js/game.js",
];

const ENGINE_EXPORTS = [
  "RNG",
  "EFFECT_KEYS", "FAMILIES", "INGREDIENTS", "CHIP", "TRACK_MAX", "RINGS",
  "chipLabel", "chipFamily", "trackPoints", "trackCoins", "ringAt",
  "BREWS", "CHAPTERS", "ROUNDS_PER_BREW", "ENDLESS_UNLOCK", "pack",
  "SHELF_1", "SHELF_2", "SHELF_3", "SHELF_4", "SHELF_5",
  "PERKS", "SALVAGE_FRACTION", "MIN_CHIP_COST", "perkLevel", "perkLoadout", "essenceFor",
  "makeRound", "Game", "BREW_RULES",
  "__rand", "__reseed",
];

function loadEngine() {
  return loadScripts({ baseDir: ROOT, files: ENGINE_FILES, exports: ENGINE_EXPORTS });
}

// The save layer needs the kit, and the kit needs a browser.
function loadStorage() {
  return loadScripts({
    baseDir: ROOT,
    files: ["lib/gk-util.js", "lib/gk-storage.js",
            "js/ingredients.js", "js/brews.js", "js/perks.js", "js/storage.js"],
    exports: ["Storage", "PROGRESS", "PERKS", "BREWS", "ENDLESS_UNLOCK", "perkLevel"],
    browser: true,
  });
}

function readSource(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

module.exports = { ROOT, loadEngine, loadStorage, readSource, ENGINE_FILES };
