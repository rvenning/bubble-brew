// Generates Bubble & Brew's PWA icons with the kit's PNG painter.
// A dark cauldron on a plum field, brimming with luminous green brew, with
// bubbles rising out of it — the pot, the potion and the risk in one mark.
// Run: node tools/make-icons.js   (from the game folder)
const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const NIGHT = "#1b1626";
const NIGHT_DK = "#120e1a";
const IRON = "#3a3149";
const IRON_DK = "#282133";
const BREW = "#4fd08a";
const BREW_DK = "#238a5a";
const BREW_LT = "#a9f5c8";
const BRASS = "#d9a441";

// `scale` shrinks the motif toward the centre (maskable keeps its art ~72%).
function drawIcon(size, scale) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);

  cv.fillRoundRect(0, 0, big, big, big * 0.22, NIGHT);

  const cx = big / 2;
  const u = big * 0.085 * scale;      // one unit of cauldron
  const potTop = big * 0.5 - u * 0.4;
  const potW = u * 4.4;
  const potH = u * 3.3;

  // Lamplight behind the pot, so the brew reads as the light source.
  cv.fillCircle(cx, potTop + potH * 0.35, u * 3.5, BREW_DK, 0.16);

  // Shadow.
  cv.fillEllipse(cx, potTop + potH + u * 0.25, potW * 0.52, u * 0.4, NIGHT_DK, 0.85);

  // Three legs, planted below the belly's lowest point.
  [-1, 0, 1].forEach((k) => {
    cv.fillRect(cx + k * u * 1.45 - u * 0.18, potTop + potH * 1.02, u * 0.36, u * 0.7, IRON_DK);
  });

  // Pot body: a squat oval belly with the top half squared off, so the mouth
  // is a clean opening rather than a dome. Two ellipses beat a stack of rows —
  // the rasterizer has no arc primitive, and stacked rows leave visible steps.
  cv.fillEllipse(cx, potTop + potH * 0.52, potW * 0.5, potH * 0.62, IRON);
  cv.fillRect(cx - potW * 0.5, potTop, potW, potH * 0.5, IRON);

  // The mouth: a wide iron rim, then the brew sitting well inside it, so the
  // pot visibly CONTAINS the potion rather than being capped by it.
  cv.fillEllipse(cx, potTop, potW * 0.5, u * 0.76, IRON_DK);
  cv.fillEllipse(cx, potTop + u * 0.04, potW * 0.37, u * 0.52, BREW_DK);
  cv.fillEllipse(cx, potTop - u * 0.02, potW * 0.35, u * 0.46, BREW);
  cv.fillEllipse(cx - potW * 0.1, potTop - u * 0.1, potW * 0.12, u * 0.15, BREW_LT, 0.85);

  // Bubbles escaping, largest lowest — the shape of a brew about to go wrong.
  [[0.0, 1.30, 0.30], [-0.9, 1.95, 0.22], [0.85, 2.25, 0.17], [-0.2, 2.75, 0.12]]
    .forEach(([dx, dy, r]) => {
      cv.fillCircle(cx + dx * u, potTop - dy * u, u * r, BREW_LT, 0.9);
      cv.fillCircle(cx + dx * u - u * r * 0.3, potTop - dy * u - u * r * 0.3, u * r * 0.3, "#ffffff", 0.85);
    });

  // A brass band round the belly, for a little apothecary polish.
  cv.fillRect(cx - potW * 0.47, potTop + potH * 0.42, potW * 0.94, u * 0.16, BRASS, 0.85);

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-512.png"), drawIcon(512, 1.0));
fs.writeFileSync(path.join(out, "icon-192.png"), drawIcon(192, 1.0));
fs.writeFileSync(path.join(out, "maskable-512.png"), drawIcon(512, 0.76));
console.log("Bubble & Brew icons written");
