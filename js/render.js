// Bubble & Brew — the cauldron on canvas.
//
// A fixed 320x420 logical stage scaled to whatever the device gives us, so the
// pot is the same shape on a phone, an iPad and a desktop and a score means the
// same thing everywhere. Portrait, because that is how this family holds a
// device (see lessons.md).
//
// The renderer owns NO game state. Everything it draws is a smoothed copy of
// what js/game.js says, and `sync()` re-points those smoothed values at the
// truth after every single engine call. Animation supplies the punch; if a tab
// is hidden, a frame is dropped or three chips resolve in one chain, the
// display still lands on exactly what the engine believes.

const LW = 320, LH = 420;

// The pot, in logical coordinates.
const POT = { x: 44, y: 104, w: 232, h: 246, lip: 16 };
const GAUGE = { x: 30, y: 22, w: 260, h: 26 };

const Render = {
  cv: null, ctx: null,
  W: LW, H: LH, scale: 1, ox: 0, oy: 0,
  active: false,
  theme: ["#1f3d2b", "#4e8a52"],
  brewColour: "#4e8a52",

  level: 0, levelTo: 0,          // 0..1 up the pot
  fizz: 0, fizzTo: 0, limit: 8,
  flying: [],                    // chips still dropping toward the surface
  bubbles: [],
  surge: 0,                      // ripple when a chip lands
  boomT: 0,
  t: 0,
  _last: 0,

  init() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    addEventListener("resize", () => this.resize());
    addEventListener("orientationchange", () => setTimeout(() => this.resize(), 350));
    if (window.visualViewport) visualViewport.addEventListener("resize", () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  },

  // Display size comes from the STYLESHEET (width/height 100%); only the
  // backing store is set here. Setting cv.style.width instead pins a stale
  // snapshot the moment anything reflows the stage.
  resize() {
    const stage = document.querySelector(".brew-stage");
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    if (box.width < 50 || box.height < 50) return;      // hidden screen: keep the last good layout

    const dpr = window.devicePixelRatio || 1;
    this.W = box.width; this.H = box.height;
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.scale = Math.min(this.W / LW, this.H / LH);
    this.ox = (this.W - LW * this.scale) / 2;
    // Spare vertical space goes mostly ABOVE the pot rather than being split
    // evenly: centring puts the cauldron in the middle of a tall phone, well
    // away from the thumb that is about to press Draw. Costs nothing where
    // there is no spare space.
    this.oy = (this.H - LH * this.scale) * 0.66;
  },

  setTheme(theme) {
    this.theme = theme || this.theme;
    this.brewColour = this.theme[1];
  },

  reset() {
    this.level = this.levelTo = 0;
    this.fizz = this.fizzTo = 0;
    this.flying.length = 0;
    this.bubbles.length = 0;
    this.surge = 0;
    this.boomT = 0;
  },

  // Point every smoothed value at what the engine actually says. Called after
  // every draw, bank and round start — never inside the animation.
  sync(round) {
    if (!round) return;
    this.levelTo = Math.max(0, Math.min(1, round.pos / TRACK_MAX));
    this.fizzTo = round.fizz;
    this.limit = round.limit;
  },

  // A chip has been drawn: send it falling into the pot.
  addChip(id, opts = {}) {
    this.flying.push({
      id, t: 0, dur: 0.42,
      x: LW / 2 + (Math.random() - 0.5) * 60,
      spin: (Math.random() - 0.5) * 3,
      sifted: !!opts.sifted,
      doubled: !!opts.doubled,
    });
  },

  boom() { this.boomT = 1.4; Fx.addShake(11); Fx.addFlash(0.75, "#ff9a5a"); },

  /* ---------- the loop ---------- */

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    if (!this._last) this._last = now;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (!this.active) return;

    // Notice the stage changing size without a resize event — a HUD row
    // appearing or the web font landing both do it silently.
    const stage = document.querySelector(".brew-stage");
    if (stage) {
      const b = stage.getBoundingClientRect();
      if (b.width > 50 && b.height > 50 && (Math.abs(b.width - this.W) > 1 || Math.abs(b.height - this.H) > 1)) this.resize();
    }

    this.update(dt);
    Fx.update(dt);
    this.render(dt);
  },

  update(dt) {
    this.t += dt;
    this.boomT = Math.max(0, this.boomT - dt);
    this.surge = Math.max(0, this.surge - dt * 2.2);

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      if (f.t >= f.dur) {
        this.flying.splice(i, 1);
        if (!f.sifted) {
          this.surge = 1;
          for (let k = 0; k < 7; k++) this.bubbles.push(this.makeBubble(f.x));
        }
      }
    }

    // With nothing in flight the display must be ON the truth, not merely
    // heading toward it — a paused tab or a fast chain must never strand it.
    const rate = this.flying.length ? 6 : 12;
    this.level += (this.levelTo - this.level) * Math.min(1, dt * rate);
    this.fizz += (this.fizzTo - this.fizz) * Math.min(1, dt * rate);
    if (!this.flying.length) {
      if (Math.abs(this.levelTo - this.level) < 0.002) this.level = this.levelTo;
      if (Math.abs(this.fizzTo - this.fizz) < 0.02) this.fizz = this.fizzTo;
    }

    if (this.bubbles.length < 26 && Math.random() < dt * 22) this.bubbles.push(this.makeBubble());
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.depth -= b.v * dt;                 // rising toward the surface
      b.x += Math.sin(this.t * b.wob + b.ph) * 6 * dt;
      if (b.depth <= 2) this.bubbles.splice(i, 1);
    }
  },

  // `depth` is measured DOWN from the liquid surface rather than in stage
  // coordinates, so a bubble stays inside the brew when the level moves
  // instead of being left hanging in the air above it.
  makeBubble(x) {
    return {
      x: x !== undefined ? x : POT.x + 14 + Math.random() * (POT.w - 28),
      r: 1.4 + Math.random() * 3.4,
      v: 16 + Math.random() * 34,
      depth: 14 + Math.random() * 80,
      wob: 3 + Math.random() * 4, ph: Math.random() * 6.3,
    };
  },

  /* ---------- painting ---------- */

  surfaceY() { return POT.y + POT.h - this.level * (POT.h - POT.lip); },

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

    // The cellar wall, painted past the logical stage so a tall phone shows a
    // room rather than a letterbox.
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, this.theme[0]);
    g.addColorStop(1, GK.util.shade(this.theme[0], -18));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);

    const [shx, shy] = Fx.shakeOffset();
    ctx.translate(this.ox + shx * this.scale, this.oy + shy * this.scale);
    ctx.scale(this.scale, this.scale);

    this.drawGauge(ctx);
    this.drawPot(ctx);
    this.drawFlying(ctx);

    Fx.render(ctx);
    ctx.restore();
  },

  // The fizz gauge: one cell per point of headroom, so "how many more can I
  // take" is something you count rather than estimate.
  drawGauge(ctx) {
    const cells = Math.max(1, this.limit);
    const gap = 3;
    const cw = (GAUGE.w - gap * (cells - 1)) / cells;
    const filled = this.fizz;

    ctx.save();
    for (let i = 0; i < cells; i++) {
      const x = GAUGE.x + i * (cw + gap);
      const amount = Math.max(0, Math.min(1, filled - i));
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      this.roundRect(ctx, x, GAUGE.y, cw, GAUGE.h, 5);
      ctx.fill();
      if (amount > 0) {
        const hot = i / cells;
        ctx.fillStyle = `rgb(${Math.round(214 + hot * 34)},${Math.round(126 - hot * 66)},${Math.round(74 - hot * 40)})`;
        this.roundRect(ctx, x, GAUGE.y + GAUGE.h * (1 - amount), cw, GAUGE.h * amount, 5);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      this.roundRect(ctx, x, GAUGE.y, cw, GAUGE.h, 5);
      ctx.stroke();
    }

    // The last cell is the one that ends you — mark it.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 12px 'Baloo 2',sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("FIZZ", GAUGE.x, GAUGE.y - 6);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(this.fizzTo)} / ${this.limit}`, GAUGE.x + GAUGE.w, GAUGE.y - 6);
    ctx.restore();
  },

  drawPot(ctx) {
    const surf = this.surfaceY();
    const wobble = Math.sin(this.t * 3.1) * (1.2 + this.surge * 5);

    ctx.save();

    // Pot body.
    ctx.fillStyle = "#241f2e";
    this.potPath(ctx, 0);
    ctx.fill();
    ctx.fillStyle = "#332b41";
    this.potPath(ctx, 4);
    ctx.fill();

    // Liquid, clipped to the inside of the pot.
    ctx.save();
    this.potPath(ctx, 6);
    ctx.clip();

    const lg = ctx.createLinearGradient(0, surf, 0, POT.y + POT.h);
    lg.addColorStop(0, GK.util.shade(this.brewColour, 34));
    lg.addColorStop(1, GK.util.shade(this.brewColour, -34));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(POT.x, surf + wobble);
    for (let x = POT.x; x <= POT.x + POT.w; x += 8) {
      ctx.lineTo(x, surf + Math.sin(this.t * 3.1 + x * 0.06) * (1.2 + this.surge * 5));
    }
    ctx.lineTo(POT.x + POT.w, POT.y + POT.h + 20);
    ctx.lineTo(POT.x, POT.y + POT.h + 20);
    ctx.closePath();
    ctx.fill();

    // Bubbles, positioned relative to the surface so they ride the level.
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (const b of this.bubbles) {
      const by = surf + b.depth;
      if (by > POT.y + POT.h) continue;
      ctx.globalAlpha = Math.min(1, b.depth / 40) * 0.6;
      ctx.beginPath();
      ctx.arc(b.x, by, b.r, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Surface sheen.
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = POT.x + 4; x <= POT.x + POT.w - 4; x += 8) {
      const y = surf + Math.sin(this.t * 3.1 + x * 0.06) * (1.2 + this.surge * 5);
      x === POT.x + 4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Ring marks up the inside wall — the bands worth pushing for.
    ctx.font = "700 10px 'Baloo 2',sans-serif";
    ctx.textAlign = "left";
    for (const ring of RINGS) {
      if (!ring.at) continue;
      const y = POT.y + POT.h - (ring.at / TRACK_MAX) * (POT.h - POT.lip);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(POT.x + 8, y);
      ctx.lineTo(POT.x + POT.w - 8, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(ring.name, POT.x + 12, y - 4);
    }

    // Rim.
    ctx.strokeStyle = "#4b4160";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(POT.x + POT.w / 2, POT.y + 3, POT.w / 2 + 6, POT.lip * 0.62, 0, 0, 6.284);
    ctx.stroke();

    if (this.boomT > 0) {
      ctx.globalAlpha = Math.min(1, this.boomT);
      ctx.fillStyle = "#ffd08a";
      ctx.beginPath();
      ctx.ellipse(POT.x + POT.w / 2, POT.y + 4, POT.w / 2 * (1 + (1.4 - this.boomT)), 26, 0, 0, 6.284);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  },

  potPath(ctx, inset) {
    const x = POT.x + inset, y = POT.y + inset;
    const w = POT.w - inset * 2, h = POT.h - inset * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - 6, y + h - 44);
    ctx.quadraticCurveTo(x + w - 14, y + h, x + w / 2, y + h);
    ctx.quadraticCurveTo(x + 14, y + h, x + 6, y + h - 44);
    ctx.closePath();
  },

  drawFlying(ctx) {
    const surf = this.surfaceY();
    for (const f of this.flying) {
      const p = Math.min(1, f.t / f.dur);
      const y = -30 + (surf + 6 + 30) * p;
      const chip = CHIP[f.id];
      ctx.save();
      ctx.translate(f.x, y);
      ctx.rotate(f.spin * p);
      ctx.globalAlpha = f.sifted ? 0.5 : 1;
      const r = 15;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.arc(1.5, 2.5, r, 0, 6.284); ctx.fill();
      ctx.fillStyle = FAMILIES[chip.family].colour;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.284); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, 6.284); ctx.stroke();
      ctx.fillStyle = "#1d1a26";
      ctx.font = "800 15px 'Baloo 2',sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(chip.value), 0, 1);
      ctx.restore();
    }
    ctx.textBaseline = "alphabetic";
  },

  roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  },
};
