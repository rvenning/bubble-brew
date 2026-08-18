// WebAudio sound effects — gamekit's synth core (lib/gk-audio.js) plus Bubble
// & Brew's own noises. Everything is synthesized; there are no audio files.
// click/coin/win/lose/wrong come from the kit defaults.
//
// The important one is `plop`: it rises with the stirring rod, so a long
// greedy run of draws climbs an audible scale and the player HEARS themselves
// getting deeper in. Stopping in time should feel like getting away with it.
const Sfx = GK.Sfx;

Object.assign(Sfx, {
  // A chip going in. `depth` is 0..1 up the cauldron — the pitch climbs with it.
  plop(depth = 0) {
    const f = 240 + depth * 520;
    this.tone({ freq: f, type: "sine", dur: 0.11, vol: 0.2, slide: 90 });
    this.tone({ freq: f * 1.98, type: "sine", dur: 0.07, vol: 0.07, when: 0.03 });
  },

  // A fizzroot landing: the same plop with a hiss of gas underneath it.
  fizzle(depth = 0) {
    this.plop(depth);
    this.noise({ dur: 0.22, vol: 0.13 });
    this.tone({ freq: 900, type: "sawtooth", dur: 0.2, vol: 0.06, slide: 260 });
  },

  // Calmwort settling the gauge — a soft falling sigh.
  settle() {
    this.tone({ freq: 620, type: "sine", dur: 0.24, vol: 0.16, slide: -280 });
  },

  // Thornvine catching a fizzroot: a clean snatch, then relief.
  snatch() {
    this.noise({ dur: 0.05, vol: 0.18 });
    this.tone({ freq: 1180, type: "triangle", dur: 0.09, vol: 0.16, slide: 240 });
    this.tone({ freq: 780, type: "sine", dur: 0.16, vol: 0.12, when: 0.08 });
  },

  // Echobell arming itself.
  bell() {
    [1320, 1980].forEach((f, i) =>
      this.tone({ freq: f, type: "sine", dur: 0.5, vol: 0.13 - i * 0.05, when: i * 0.02 }));
  },

  // Quicksilver dragging you into another draw whether you liked it or not.
  whirr() {
    [700, 880, 1100, 1400].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.05, vol: 0.11, when: i * 0.035 }));
  },

  // Ironcap: the lid thumping down.
  clamp() {
    this.tone({ freq: 150, type: "square", dur: 0.14, vol: 0.18, slide: -50 });
    this.noise({ dur: 0.08, vol: 0.12 });
  },

  // Banking a round — coins on the counter and a satisfied hum.
  bankIt() {
    [660, 880, 1100].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.14, vol: 0.19, when: i * 0.07 }));
  },

  // The lid coming off. The one sound in the game that is genuinely nasty.
  blowUp() {
    this.noise({ dur: 0.7, vol: 0.34 });
    [300, 210, 140].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.45, vol: 0.17, slide: -110, when: i * 0.09 }));
    this.tone({ freq: 60, type: "sine", dur: 0.8, vol: 0.2, when: 0.05 });
  },

  // A brew finished and bottled.
  brewWin() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.22, vol: 0.21, when: i * 0.1 }));
  },

  // Target missed — disappointed, never scolding.
  brewFail() {
    [392, 330, 262].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.3, vol: 0.17, when: i * 0.13 }));
  },

  // Something bought at the apothecary.
  buy() {
    this.tone({ freq: 880, type: "square", dur: 0.06, vol: 0.13 });
    this.tone({ freq: 1320, type: "square", dur: 0.09, vol: 0.11, when: 0.05 });
  },

  // Owl's Eye opening / a peek.
  peek() {
    [1000, 1500, 1250].forEach((f, i) =>
      this.tone({ freq: f, type: "sine", dur: 0.08, vol: 0.12, when: i * 0.05 }));
  },
});
