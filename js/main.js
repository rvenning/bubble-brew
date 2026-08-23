// App shell: screens, the cellar, the Larder, the apothecary, the leaderboard,
// and all of the cauldron's DOM. Profiles, PINs, family sync and the install
// button come from gamekit; the simulation lives in js/round.js + js/game.js
// and never touches anything here — it only fires the callbacks wired up in
// bindEngine().
//
// The one piece of real machinery in this file is the step pump. A single press
// of Draw can resolve a whole quicksilver chain, and the engine finishes the
// entire chain synchronously before the UI has drawn a single chip. So events
// are buffered and played back one at a time, and every terminal event
// (roundEnd / shopOpen / brewEnd) waits behind the animation rather than
// racing it. Everything the engine decides still happens exactly once,
// immediately — only the telling of it is slowed down.

const AVATARS = ["🧙", "🧪", "🦇", "🐸", "🍄", "🦉", "🐍", "🕷️", "🐈‍⬛", "🌙", "⭐", "🔮"];
const STEP_MS = 340;          // how long one chip takes to land
const ROUND_END_MS = 1100;    // pause on the result before the shop opens

const App = {
  profile: null,
  prog: null,
  busy: false,
  anim: [],                   // step records waiting to be played
  pending: null,              // { roundEnd, shop, brewEnd } held behind the animation
  shown: null,                // the state the HUD is currently showing
  day: null,                  // today's Daily Cauldron key, when playing one

  // Bumped whenever a brew starts or is abandoned. Every delayed transition
  // carries the token it was scheduled under and does nothing if it has moved
  // on: without it, quitting during the pause after a round still fires that
  // round's "open the shop" a second later and yanks the player out of the
  // cellar into a shop for a brew they walked away from.
  token: 0,

  el(id) { return document.getElementById(id); },

  async init() {
    Sfx.enabled = Storage.getSettings().sound;
    GK.UI.bindSoundToggle(Storage);
    // Every menu button clicks; buttons that make their own sound keep it.
    GK.UI.bindMenuClicks();
    GK.UI.onScreenChange = (name) => {
      Render.active = name === "game";
      if (name === "splash") this.refreshSplash();
      if (name === "game") { Render.resize(); setTimeout(() => Render.resize(), 400); }
    };

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) => `⭐ ${Storage.totalScore(prog).toLocaleString()} · 🏅 ${Storage.totalStars(prog)} · 🔮 ${Storage.essence(prog)}`,
      onEnter: (p) => { this.profile = p; this.showMap(); },
      addLabel: "New Brewer",
    });

    GK.initPWA({ appName: "Bubble & Brew" });
    Render.init();
    this.bindEngine();

    // iOS hijacks two-finger pinch and never lets go — block it at the source.
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());

    GK.Debug.init({ storage: Storage, title: "BUBBLE & BREW" })
      .action("draw 5 chips", () => { for (let i = 0; i < 5; i++) this.draw(); })
      .action("bank the round", () => this.bank())
      .action("+200 essence", () => { this.prog = Storage.addEssence(this.profile.id, 200); })
      .jump("brew", BREWS.length, (n) => this.startBrew(n - 1));

    this.showScreen("splash");
    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (!ok) return;
      if (GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (GK.UI.screen === "splash") this.refreshSplash();
      if (GK.UI.screen === "map") this.showMap();
      if (GK.UI.screen === "leaderboard") this.showLeaderboard(true);
    });
  },

  showScreen(name) { GK.UI.showScreen(name); },

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🥄 Continue as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.classList.add("ghost");
      start.textContent = "👥 Switch Player";
    } else {
      cont.style.display = "none";
      start.classList.remove("ghost");
      start.textContent = "🥄 Start Brewing";
    }
  },

  play() {
    Sfx.init(); Sfx.click();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  /* ---------- the cellar ---------- */

  showMap() {
    if (!this.profile) return this.play();
    this.prog = Storage.getProgress(this.profile.id);
    const prog = this.prog;
    const unlocked = Storage.unlockedBrew(prog);
    const won = Storage.brewsWon(prog);

    this.el("map-player").innerHTML = `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>
      <span class="pmeta">⭐ ${Storage.totalScore(prog).toLocaleString()} · 🔮 ${Storage.essence(prog)}</span>`;

    const cont = this.el("btn-continue");
    if (won < BREWS.length) {
      cont.innerHTML = `▶️ ${brewEmoji(unlocked)} ${GK.util.esc(brewTitle(unlocked))}`;
      cont.onclick = () => this.startBrew(unlocked);
    } else {
      cont.innerHTML = "👑 Every recipe brewed — replay any of them";
      cont.onclick = () => Sfx.click();
    }

    const endless = this.el("btn-endless");
    const canEndless = Storage.endlessUnlocked(prog);
    endless.disabled = !canEndless;
    endless.textContent = canEndless
      ? `♾️ Bottomless${prog.endlessBest ? ` · ${prog.endlessBest}` : ""}`
      : `🔒 Bottomless (${ENDLESS_UNLOCK} brews)`;

    const daily = this.el("btn-daily");
    const today = RNG.today();
    daily.disabled = !canEndless;
    daily.textContent = !canEndless ? "🔒 Daily"
      : Storage.dailyDone(prog, today) ? `📅 Daily · ${Storage.dailyScore(prog, today)}`
      : "📅 Daily";

    const wrap = this.el("brew-list");
    wrap.innerHTML = "";
    let chapter = -1;
    BREWS.forEach((brew, i) => {
      if (brew.chapter !== chapter) {
        chapter = brew.chapter;
        const ch = CHAPTERS[chapter];
        const head = document.createElement("div");
        head.className = "chapter-head";
        head.style.setProperty("--grad-a", ch.theme[0]);
        head.style.setProperty("--grad-b", ch.theme[1]);
        head.innerHTML = `<span class="ch-emoji">${ch.emoji}</span>
          <span class="ch-name">${GK.util.esc(ch.name)}</span>
          <span class="ch-intro">${GK.util.esc(ch.intro)}</span>`;
        wrap.appendChild(head);
      }

      const result = prog.brews[i];
      const state = result ? "done" : i <= unlocked ? "open" : "locked";
      const theme = brewTheme(i);
      const card = document.createElement("div");
      card.className = "brew-card " + state;
      card.style.setProperty("--grad-a", theme[0]);
      card.style.setProperty("--grad-b", theme[1]);

      const stars = result
        ? [0, 1, 2].map((s) => `<span class="star ${s < result.stars ? "on" : ""}">★</span>`).join("")
        : "";
      const badge = state === "done" ? stars
        : state === "open" ? `<span class="brew-go">▶</span>`
        : `<span class="brew-lock">🔒</span>`;

      card.innerHTML = `
        <div class="brew-num">${i + 1}</div>
        <div class="brew-emoji">${brewEmoji(i)}</div>
        <div class="brew-info">
          <div class="brew-title">${GK.util.esc(brewTitle(i))}</div>
          <div class="brew-ref">${state === "locked"
            ? "Finish the brew before this one to unlock"
            : `${ROUNDS_PER_BREW} rounds · fizz limit ${brew.fizzLimit} · target ${brew.targets[0]}`}</div>
        </div>
        <div class="brew-badge">${badge}</div>`;

      if (state !== "locked") card.onclick = () => this.startBrew(i);
      wrap.appendChild(card);
    });

    this.showScreen("map");
  },

  showLeaderboard(silent) {
    if (!silent) Sfx.click();
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-brews">🫧 ${Storage.brewsWon(r.progress)}/${BREWS.length}</span>
        <span class="lb-stars">🏅 ${Storage.totalStars(r.progress)}</span>
        <span class="lb-endless">♾️ ${r.progress.endlessBest || 0}</span>
        <span class="lb-score">⭐ ${Storage.totalScore(r.progress).toLocaleString()}</span>`,
      sort: (a, b) => Storage.totalScore(b.progress) - Storage.totalScore(a.progress),
      meId: this.profile?.id,
      empty: "No brewers yet — tap Start Brewing!",
    });
    this.showScreen("leaderboard");
  },

  showHelp() { Sfx.click(); GK.UI.openModal("modal-help"); },

  /* ---------- the Larder ---------- */

  showLarder() {
    Sfx.click();
    this.prog = Storage.getProgress(this.profile.id);
    this.renderLarder();
    this.showScreen("larder");
  },

  renderLarder() {
    const prog = this.prog;
    const essence = Storage.essence(prog);
    this.el("larder-essence").textContent = essence;

    const wrap = this.el("perk-list");
    wrap.innerHTML = "";
    PERKS.forEach((perk) => {
      const lvl = perkLevel(prog, perk.id);
      const maxed = lvl >= perk.costs.length;
      const cost = maxed ? null : perk.costs[lvl];
      const row = document.createElement("div");
      row.className = "shop-row" + (maxed ? " maxed" : cost > essence ? " poor" : "");
      row.innerHTML = `
        <div class="shop-emoji">${perk.emoji}</div>
        <div class="shop-info">
          <div class="shop-name">${perk.name} ${
            perk.costs.map((_, i) => `<span class="pip ${i < lvl ? "on" : ""}"></span>`).join("")}</div>
          <div class="shop-blurb">${GK.util.esc(perk.blurb)}</div>
          <div class="shop-effect">${lvl ? "Now: " + perk.effect(lvl) : "&nbsp;"}</div>
        </div>
        <button class="btn small ${maxed ? "grey" : "green"}" ${maxed || cost > essence ? "disabled" : ""}
          aria-label="Buy ${perk.name}">${maxed ? "MAX" : "🔮 " + cost}</button>`;
      const btn = row.querySelector("button");
      if (!maxed && cost <= essence) btn.onclick = () => this.buyPerk(perk.id);
      wrap.appendChild(row);
    });
  },

  buyPerk(id) {
    const res = Storage.buyPerk(this.profile.id, id);
    if (!res.ok) return GK.UI.toast(res.reason === "essence" ? "Not enough essence yet!" : "Already at its best");
    this.prog = res.progress;
    Sfx.coin();
    const perk = PERKS.find((p) => p.id === id);
    GK.UI.toast(`${perk.emoji} ${perk.name} — ${perk.effect(perkLevel(this.prog, id))}`);
    this.renderLarder();
  },

  /* ---------- starting a brew ---------- */

  startBrew(idx) {
    Sfx.init(); Sfx.click();
    this.prog = Storage.getProgress(this.profile.id);
    this.day = null;
    Render.setTheme(brewTheme(idx));
    this.el("hud-brew").textContent = `${brewEmoji(idx)} ${brewTitle(idx)}`;
    Game.start({
      mode: "campaign", levelIdx: idx,
      seed: RNG.seedFrom(`${idx}:${Date.now()}:${Math.random()}`),
      loadout: perkLoadout(this.prog),
    });
    this.enterGame();
    if (BREWS[idx].hint) GK.UI.toast(`💡 ${BREWS[idx].hint}`);
  },

  startEndless() {
    if (!Storage.endlessUnlocked(Storage.getProgress(this.profile.id)))
      return GK.UI.toast(`Finish ${ENDLESS_UNLOCK} brews to open the Bottomless Cauldron`);
    Sfx.init(); Sfx.click();
    this.prog = Storage.getProgress(this.profile.id);
    this.day = null;
    Render.setTheme(["#2a1030", "#7b2f6b"]);
    this.el("hud-brew").textContent = "♾️ Bottomless";
    Game.start({
      mode: "endless",
      seed: RNG.seedFrom(`endless:${Date.now()}:${Math.random()}`),
      loadout: perkLoadout(this.prog),
    });
    this.enterGame();
  },

  // Same rules as the Bottomless Cauldron, but seeded by the date — so
  // everyone in the family gets the identical bag, the identical shuffle and
  // the identical shop, and the score is a fair comparison.
  startDaily() {
    if (!Storage.endlessUnlocked(Storage.getProgress(this.profile.id)))
      return GK.UI.toast(`Finish ${ENDLESS_UNLOCK} brews to open the Daily Cauldron`);
    Sfx.init(); Sfx.click();
    this.prog = Storage.getProgress(this.profile.id);
    this.day = RNG.today();
    Render.setTheme(["#13324a", "#2f7fa8"]);
    this.el("hud-brew").textContent = `📅 ${this.day}`;
    Game.start({
      mode: "daily",
      seed: RNG.seedFrom(`daily:${this.day}`),
      loadout: perkLoadout(this.prog),
    });
    this.enterGame();
  },

  enterGame() {
    this.busy = false;
    this.token++;
    this.anim.length = 0;
    this.pending = null;
    Render.reset();
    Fx.reset();
    this.showScreen("game");
    Render.sync(Game.round);
    this.syncAll();
  },

  pause() { Sfx.click(); GK.UI.openModal("modal-pause"); },

  quit() {
    GK.UI.closeModal("modal-pause");
    this.busy = false;
    this.token++;                 // strands any transition already in flight
    this.anim.length = 0;
    this.pending = null;
    Game.abandon();
    this.showMap();
  },

  /* ---------- engine -> UI ---------- */

  bindEngine() {
    Game.on = {
      roundStart: () => { this.shown = null; this.syncAll(); },

      // The engine has already resolved the entire chain. Queue it; the pump
      // plays it back one chip at a time.
      drew: ({ steps }) => { for (const s of steps) this.anim.push(s); },

      roundEnd: (data) => { this.pending = Object.assign(this.pending || {}, { roundEnd: data }); },
      shopOpen: (data) => { this.pending = Object.assign(this.pending || {}, { shop: data }); },
      brewEnd: (data) => { this.pending = Object.assign(this.pending || {}, { brewEnd: data }); },
    };
  },

  /* ---------- the step pump ---------- */

  draw() {
    if (this.busy || !Game.canDraw()) return;
    Sfx.init();
    Game.draw();
    this.pump();
  },

  bank() {
    if (this.busy || !Game.canBank()) return;
    Sfx.init(); Sfx.bankIt();
    Game.bank();
    this.pump();
  },

  pump() {
    if (this.anim.length) { this.busy = true; this.refreshActions(); this.playStep(); }
    else this.flush();
  },

  playStep() {
    const step = this.anim.shift();
    if (!step) { this.busy = false; return this.flush(); }

    const chip = CHIP[step.id];
    const depth = step.pos / TRACK_MAX;

    Render.addChip(step.id, { sifted: step.sifted, doubled: step.doubled });
    Render.sync({ pos: step.pos, fizz: step.fizzTotal, limit: step.limit });

    if (step.sifted) {
      Sfx.snatch();
      GK.UI.toast(`🌵 Thornvine catches the ${FAMILIES[chip.family].name.toLowerCase()}!`);
    } else if (chip.effect.fizz) {
      Sfx.fizzle(depth);
    } else {
      Sfx.plop(depth);
    }

    for (const e of step.effects || []) {
      if (e.k === "defuse" && e.n > 0) Sfx.settle();
      if (e.k === "double") Sfx.bell();
      if (e.k === "chain") Sfx.whirr();
      if (e.k === "steady") Sfx.clamp();
      if (e.k === "peek") Sfx.peek();
      if (e.k === "coin") Sfx.coin();
    }

    this.shown = step;
    this.syncAll();
    this.pushRail(step);

    if (step.exploded) {
      Render.boom();
      Sfx.blowUp();
      GK.UI.toast("💥 The lid comes off!");
    }

    setTimeout(() => this.playStep(), STEP_MS);
  },

  // Everything the engine already decided, told once the animation has caught
  // up. Ordered loss-first: a round that both blew up and ended the run must
  // read as the blow-up.
  flush() {
    this.busy = false;
    const p = this.pending;
    this.pending = null;
    this.shown = null;
    this.syncAll();
    if (!p) { this.refreshActions(); return; }

    if (p.roundEnd) {
      const r = p.roundEnd;
      GK.UI.toast(r.exploded
        ? `💥 Round ${r.round + 1} lost — but you keep 🪙 ${r.coins}`
        : `🍯 Bottled ${r.points} points and 🪙 ${r.coins}`);
      if (!r.exploded) Fx.confetti(Render.W, Render.H, ["#8ee6a0", "#ffe08a", "#9fd6ff"], 26);
    }

    const token = this.token;
    const later = (fn) => setTimeout(() => { if (this.token === token) fn(); }, ROUND_END_MS);
    if (p.brewEnd) { later(() => this.finish(p.brewEnd)); return; }
    if (p.shop) { later(() => this.openShop(p.shop)); return; }
    this.refreshActions();
  },

  /* ---------- the cauldron's DOM ---------- */

  syncAll() {
    const g = Game;
    const rd = g.round;
    if (!rd) return;

    // While a chain is playing back, the HUD shows the step being animated, not
    // the finished state — otherwise the first chip of a three-chip chain would
    // reveal how the chain ends.
    const pos = this.shown ? this.shown.pos : rd.pos;
    const fizz = this.shown ? this.shown.fizzTotal : rd.fizz;
    const limit = this.shown ? this.shown.limit : rd.limit;
    const bagLeft = this.shown ? this.shown.bagLeft : rd.bag.length;

    this.el("hud-round").textContent = g.mode === "campaign"
      ? `Round ${g.roundIdx + 1}/${g.roundsTotal}`
      : `Round ${g.roundIdx + 1}`;
    this.el("hud-coins").textContent = g.coins;
    this.el("hud-total").textContent = g.total.toLocaleString();

    const stopValue = rd.exploded ? rd.points() : trackPoints(pos) + rd.refund;
    this.el("stake-points").textContent = stopValue.toLocaleString();
    this.el("bag-count").textContent = bagLeft;

    const risk = this.busy ? null : g.bustChance();
    const riskBox = this.el("risk-box");
    this.el("stake-risk").textContent = risk === null ? "…" : `${Math.round(risk * 100)}%`;
    riskBox.classList.toggle("hot", risk !== null && risk >= 0.34);

    this.renderPeek();
    this.refreshActions();
    if (!this.busy) Render.sync(rd);
    // Keep the gauge honest about a limit that changed mid-round (ironcap).
    Render.limit = limit;
  },

  refreshActions() {
    const drawBtn = this.el("btn-draw"), bankBtn = this.el("btn-bank");
    drawBtn.disabled = this.busy || !Game.canDraw();
    bankBtn.disabled = this.busy || !Game.canBank();
    bankBtn.textContent = Game.round && Game.round.drawn.length === 0
      ? "🍯 Draw one first" : "🍯 Bottle it";
  },

  renderPeek() {
    const wrap = this.el("peek-row");
    const seen = Game.round ? Game.round.visible() : [];
    if (!seen.length) { wrap.innerHTML = ""; wrap.classList.remove("on"); return; }
    wrap.classList.add("on");
    wrap.innerHTML = `<span class="peek-label">👁️ Coming up</span>` +
      seen.map((id) => this.chipHTML(id, "sm")).join("");
  },

  pushRail(step) {
    const rail = this.el("drawn-rail");
    const el = document.createElement("span");
    el.className = "rail-chip" + (step.sifted ? " sifted" : "") + (step.doubled ? " doubled" : "");
    el.style.setProperty("--c", chipColour(step.id));
    el.innerHTML = `<b>${step.sifted ? "✕" : "+" + step.value}</b><i>${chipEmoji(step.id)}</i>`;
    el.title = `${chipFamily(step.id).name} — ${chipLabel(step.id)}`;
    rail.appendChild(el);
    rail.scrollLeft = rail.scrollWidth;
  },

  chipHTML(id, size) {
    return `<span class="chip ${size || ""}" style="--c:${chipColour(id)}">
      <b>${CHIP[id].value}</b><i>${chipEmoji(id)}</i></span>`;
  },

  showBag() {
    Sfx.click();
    const counts = Game.remaining();
    const ids = Object.keys(counts).sort((a, b) =>
      CHIP[a].family.localeCompare(CHIP[b].family) || CHIP[a].value - CHIP[b].value);
    const wrap = this.el("bag-grid");
    wrap.innerHTML = ids.length
      ? ids.map((id) => `<div class="bag-row">
          ${this.chipHTML(id)}
          <span class="bag-name">${chipFamily(id).name}</span>
          <span class="bag-eff">${chipLabel(id)}</span>
          <span class="bag-count">×${counts[id]}</span>
        </div>`).join("")
      : `<p class="bag-empty">The bag is empty — everything you own is in the pot.</p>`;
    GK.UI.openModal("modal-bag");
  },

  /* ---------- the apothecary ---------- */

  openShop(data) {
    const last = Game.rounds[Game.rounds.length - 1];
    this.el("shop-round").textContent = `Round ${data.round + 1} done`;
    this.el("shop-summary").innerHTML = `
      <div class="sum-line ${last.exploded ? "bad" : "good"}">
        ${last.exploded ? "💥 The lid came off" : `🍯 Bottled at ${last.pos} steps`}
      </div>
      <div class="sum-stats">
        <span>⭐ ${last.points} points</span>
        <span>🪙 ${last.coins} coins</span>
        <span>Total ⭐ ${Game.total.toLocaleString()}</span>
      </div>`;
    this.renderStock();
    this.showScreen("shop");
  },

  renderStock() {
    this.el("shop-coins").textContent = Game.coins;
    this.el("btn-next-round").textContent = Game.mode === "campaign"
      ? `Round ${Game.roundIdx + 2} of ${Game.roundsTotal} ➜`
      : `Round ${Game.roundIdx + 2} ➜`;
    this.el("shop-picks").textContent = Game.buysLeft === 1
      ? "1 pick left" : `${Game.buysLeft} picks left`;

    const wrap = this.el("stock-grid");
    wrap.innerHTML = "";
    if (!Game.stock.length || Game.buysLeft <= 0) {
      wrap.innerHTML = `<p class="bag-empty">${Game.buysLeft <= 0
        ? `That's your lot — ${BREW_RULES.BUYS_PER_SHOP} picks a visit.`
        : "Shelves cleared. Nothing left to sell you."}</p>`;
      return;
    }
    Game.stock.forEach((id) => {
      const chip = CHIP[id];
      const fam = FAMILIES[chip.family];
      const price = Game.priceOf(id);
      const poor = price > Game.coins;
      const card = document.createElement("button");
      card.className = "stock-card" + (poor ? " poor" : "");
      card.style.setProperty("--c", fam.colour);
      card.disabled = poor;
      card.setAttribute("aria-label", `Buy ${fam.name} for ${price} coins`);
      card.innerHTML = `
        <span class="stock-chip"><b>${chip.value}</b><i>${fam.emoji}</i></span>
        <span class="stock-body">
          <span class="stock-name">${fam.name}</span>
          <span class="stock-eff">${chipLabel(id)}</span>
          <span class="stock-blurb">${GK.util.esc(fam.blurb)}</span>
        </span>
        <span class="stock-cost">🪙 ${price}${price < chip.cost ? ` <s>${chip.cost}</s>` : ""}</span>`;
      card.onclick = () => this.buyChip(id);
      wrap.appendChild(card);
    });
  },

  buyChip(id) {
    if (!Game.buy(id)) return GK.UI.toast("Not enough coins for that one");
    Sfx.buy();
    GK.UI.toast(`${chipEmoji(id)} ${chipFamily(id).name} goes in the bag`);
    this.renderStock();
  },

  leaveShop() {
    Sfx.click();
    Game.leaveShop();
    this.showScreen("game");
    Render.resize();
    Render.reset();
    Render.sync(Game.round);
    this.syncAll();
  },

  /* ---------- results ---------- */

  finish(result) {
    this.busy = false;
    if (result.mode === "daily") result.day = this.day;

    const essence = essenceFor(result);
    this.prog = Storage.addEssence(this.profile.id, essence);
    this.prog = Storage.recordBrew(this.profile.id, result);

    if (result.win && result.mode === "campaign") { Sfx.brewWin(); this.confetti(); }
    else if (result.mode !== "campaign") Sfx.brewWin();
    else Sfx.brewFail();

    this.showResults(result, essence);
  },

  showResults(result, essence) {
    const campaign = result.mode === "campaign";
    const last = campaign && result.levelIdx >= BREWS.length - 1;
    const allDone = result.win && last;
    const targets = campaign ? BREWS[result.levelIdx].targets : null;

    this.el("res-emoji").textContent = campaign
      ? (result.win ? (result.stars === 3 ? "👑" : "🧪") : "💥")
      : "🫧";
    this.el("res-title").textContent = campaign
      ? (result.win
          ? (result.stars === 3 ? "A perfect bottling!" : "Bottled and sealed.")
          : "Not strong enough to sell…")
      : `The cauldron blew after ${result.roundsPlayed} round${result.roundsPlayed === 1 ? "" : "s"}`;

    this.el("res-stars").innerHTML = campaign
      ? [0, 1, 2].map((i) => `<span class="star ${i < result.stars ? "on" : ""}">★</span>`).join("")
      : "";

    this.el("res-score").textContent = `⭐ ${result.score.toLocaleString()} points`;
    this.el("res-target").textContent = campaign
      ? `Target ${targets[0]} · ${targets[1]} · ${targets[2]}`
      : result.mode === "daily"
      ? `📅 Today's cauldron — everyone gets this exact bag`
      : `♾️ Best so far: ${Math.max(this.prog.endlessBest || 0, result.score).toLocaleString()}`;

    this.el("res-best").textContent = `🍯 Best round: ${result.bestRound} points`;
    this.el("res-blowups").textContent = `💥 Blow-ups: ${result.blowUps}`;
    this.el("res-essence").textContent = `🔮 +${essence} essence`;

    const next = this.el("res-next"), retry = this.el("res-retry"), fin = this.el("res-finished");
    fin.style.display = allDone ? "" : "none";
    next.style.display = "none"; retry.style.display = "none";

    if (!campaign) {
      retry.style.display = ""; retry.textContent = result.mode === "daily" ? "📅 Try again" : "♾️ Again";
      retry.onclick = () => (result.mode === "daily" ? this.startDaily() : this.startEndless());
    } else if (result.win && !last) {
      next.style.display = ""; next.textContent = "Next recipe ➜";
      next.onclick = () => this.startBrew(result.levelIdx + 1);
      retry.style.display = ""; retry.textContent = "🔁 Replay";
      retry.onclick = () => this.startBrew(result.levelIdx);
    } else {
      retry.style.display = ""; retry.textContent = "🔁 Try again";
      retry.onclick = () => this.startBrew(result.levelIdx);
    }

    this.showScreen("results");
  },

  confetti() {
    const canvas = this.el("confetti");
    const ctx = canvas.getContext("2d");
    canvas.width = innerWidth; canvas.height = innerHeight;
    const colors = ["#8ee6a0", "#ffe08a", "#9fd6ff", "#e0574f", "#c9a3ff"];
    const parts = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
      vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI, vr: -0.15 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t - t0 < 3000) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })(t0);
  },
};

// clamp() font sizes resolve against the inherited value on a first render that
// happens before layout settles — so init on DOMContentLoaded, not inline.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
