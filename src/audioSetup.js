// audioSetup.js — SFX, crowd ambient, and leader chime initialization

import * as THREE from "three";
import * as GameState from "./gameState.js";
import * as Netcode from "./netcode.js";
import { CONFIG } from "./config.js";
import { clamp } from "./utils.js";

/**
 * Creates procedural crowd ambient noise (looping filtered noise with bump bursts).
 *
 * @param {THREE.AudioListener} audioListener
 * @param {() => number} getSfxVolume
 * @param {() => boolean} getIsMuted
 */
function initCrowdSfx(audioListener, getSfxVolume, getIsMuted) {
  /** @type {null | { ctx: AudioContext; src: AudioBufferSourceNode; lp: BiquadFilterNode; bp: BiquadFilterNode; g: GainNode }} */
  let nodes = null;
  let started = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let bumpTimeoutId = null;

  const ensureNodes = () => {
    const ctx = audioListener.context;
    if (ctx.state !== "running") return null;
    if (nodes) return nodes;

    const len = 1.0;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 0.4;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 320;
    bp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.value = 0.0001;

    src.connect(lp);
    lp.connect(bp);
    bp.connect(g);
    g.connect(audioListener.gain);

    nodes = { ctx, src, lp, bp, g };
    return nodes;
  };

  const applyAmbient = () => {
    const n = ensureNodes();
    if (!n) return;
    const { ctx, lp, bp, g } = n;
    const now = ctx.currentTime;
    const base = 0.012 * 1.2 * getSfxVolume();
    const target = getIsMuted() ? 0.0001 : base;
    g.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.25);
    lp.frequency.setTargetAtTime(900, now, 0.25);
    bp.frequency.setTargetAtTime(320, now, 0.25);
    bp.Q.setTargetAtTime(0.7, now, 0.25);
  };

  const ensureStarted = () => {
    if (started) return;
    const n = ensureNodes();
    if (!n) return;
    try { n.src.start(); } catch {}
    started = true;
    applyAmbient();
  };

  const bump = () => {
    ensureStarted();
    if (getIsMuted() || getSfxVolume() <= 0) return;
    const n = ensureNodes();
    if (!n) return;
    const { ctx, lp, bp, g } = n;
    const now = ctx.currentTime;
    const ambient = 0.012 * 1.2 * getSfxVolume();
    const peak = 0.028 * 1.2 * getSfxVolume();
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(Math.max(0.0001, peak), now, 0.04);
    lp.frequency.setTargetAtTime(1400, now, 0.05);
    bp.frequency.setTargetAtTime(520, now, 0.05);
    bp.Q.setTargetAtTime(1.2, now, 0.05);

    if (bumpTimeoutId) clearTimeout(bumpTimeoutId);
    bumpTimeoutId = setTimeout(() => {
      bumpTimeoutId = null;
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(Math.max(0.0001, ambient), t, 0.35);
      lp.frequency.setTargetAtTime(900, t, 0.35);
      bp.frequency.setTargetAtTime(320, t, 0.35);
      bp.Q.setTargetAtTime(0.7, t, 0.35);
    }, 1500);
  };

  return { ensureStarted, applyAmbient, bump };
}

/**
 * Creates leader-change chime SFX (plays when local player becomes leader).
 *
 * @param {THREE.AudioListener} audioListener
 * @param {() => number} getSfxVolume
 * @param {() => boolean} getIsMuted
 */
function initLeaderHumSfx(audioListener, getSfxVolume, getIsMuted) {
  /** @type {null|number} */
  let currentLeaderSlot = null;

  const playLeadChime = () => {
    if (getIsMuted() || getSfxVolume() <= 0) return;
    const ctx = audioListener.context;
    if (ctx.state !== "running") return;
    const now = ctx.currentTime;

    const out = ctx.createGain();
    const g = 0.15 * getSfxVolume();
    out.gain.setValueAtTime(Math.max(0.0001, g), now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    out.connect(audioListener.gain);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(660, now);
    o1.connect(out);
    o1.start(now);
    o1.stop(now + 0.075);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(880, now + 0.075);
    o2.connect(out);
    o2.start(now + 0.075);
    o2.stop(now + 0.15);

    o2.onended = () => {
      try { o1.disconnect(); } catch {}
      try { o2.disconnect(); } catch {}
      try { out.disconnect(); } catch {}
    };
  };

  const setLeader = (slotIndex) => {
    const wants = Number.isFinite(slotIndex) ? slotIndex : null;
    if (wants === currentLeaderSlot) return;

    const localIdx = Netcode.strictSlotIndexForConn(Netcode.getYouConnId());
    const wasLocalLeader = currentLeaderSlot !== null && currentLeaderSlot === localIdx;
    const isLocalLeader = wants !== null && wants === localIdx;

    currentLeaderSlot = wants;
    if (!wasLocalLeader && isLocalLeader) {
      playLeadChime();
    }
  };

  const updatePositionFromCart = (cart) => {
    // Non-spatial: no-op.
    void cart;
  };

  const resyncVolume = () => {
    // One-shot: no continuous volume to resync.
  };

  return { setLeader, updatePositionFromCart, resyncVolume };
}

/**
 * Creates the main SFX object with impact limiting and shared noise buffers.
 *
 * @param {THREE.AudioListener} audioListener
 * @param {{
 *   getSfxVolume: () => number,
 *   getIsMuted: () => boolean,
 *   onCollisionShake?: (intensity: number) => void,
 * }} deps
 */
function createSfxSystem(audioListener, { getSfxVolume, getIsMuted }) {
  /** @type {{ intensity: number; stop: () => void }[]} */
  const activeImpactSfx = [];
  const MAX_ACTIVE_IMPACTS = 3;
  /** @type {AudioBuffer | null} */
  let cartCrashBuffer = null;
  let cartCrashBufferLoadInFlight = false;
  /** @type {AudioBuffer | null} */
  let sharedNoiseBuffer = null;

  function ensureSharedNoiseBuffer(ctx) {
    if (sharedNoiseBuffer) return sharedNoiseBuffer;
    const len = 2.0;
    sharedNoiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = sharedNoiseBuffer.getChannelData(0);
    for (let j = 0; j < d.length; j += 1) d[j] = Math.random() * 2 - 1;
    return sharedNoiseBuffer;
  }

  /** @param {AudioContext} ctx @param {number} now @param {number} peak @param {number} attack @param {number} hold @param {number} release */
  function scheduleImpactEnvelope(gainNode, ctx, now, peak, attack, hold, release) {
    const g = getIsMuted() ? 0.0001 : Math.max(0.0001, peak * getSfxVolume());
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(g, now + attack);
    gainNode.gain.setValueAtTime(g, now + attack + hold);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);
  }

  const ensureCartCrashBufferLoaded = () => {
    const ctx = audioListener.context;
    if (ctx.state !== "running") return;
    if (cartCrashBuffer || cartCrashBufferLoadInFlight) return;
    cartCrashBufferLoadInFlight = true;

    const url = new URL("sounds/cart-crash.wav", window.location.href).toString();
    void fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then(
        (buf) => {
          cartCrashBuffer = buf;
          cartCrashBufferLoadInFlight = false;
        },
        () => {
          cartCrashBufferLoadInFlight = false;
        },
      );
  };

  const sfx = {
    _muted: getIsMuted(),
    playFloorImpact(intensity) {
      const i = clamp(intensity, 0, 1);
      if (i <= 0.05) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      const thump = ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(85 + Math.random() * 15, now);
      thump.frequency.exponentialRampToValueAtTime(40, now + 0.2);

      const noiseLen = 0.18;
      const buf = ensureSharedNoiseBuffer(ctx);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.playbackRate.setValueAtTime(0.8 + Math.random() * 0.4, now);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(180, now);

      const gainThump = ctx.createGain();
      const gThump = 0.45 * i * getSfxVolume();
      gainThump.gain.setValueAtTime(Math.max(0.0001, getIsMuted() ? 0.0001 : gThump), now);
      gainThump.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      const gainNoise = ctx.createGain();
      const gNoise = 0.3 * i * getSfxVolume();
      gainNoise.gain.setValueAtTime(Math.max(0.0001, getIsMuted() ? 0.0001 : gNoise), now);
      gainNoise.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      thump.connect(gainThump);
      gainThump.connect(audioListener.gain);

      noise.connect(lp);
      lp.connect(gainNoise);
      gainNoise.connect(audioListener.gain);

      try {
        thump.start(now);
        thump.stop(now + 0.2);
        noise.start(now);
        noise.stop(now + noiseLen);
      } catch {}
    },
    playEdgeImpact(intensity) {
      const i = clamp(intensity, 0, 1);
      if (i <= 0.05) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      const ring = ctx.createOscillator();
      ring.type = "triangle";
      ring.frequency.setValueAtTime(400 + Math.random() * 100, now);
      ring.frequency.exponentialRampToValueAtTime(200, now + 0.25);

      const noiseLen = 0.1;
      const buf = ensureSharedNoiseBuffer(ctx);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.playbackRate.setValueAtTime(0.8 + Math.random() * 0.4, now);

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(900, now);

      const gainRing = ctx.createGain();
      const gRing = 0.4 * i * getSfxVolume();
      gainRing.gain.setValueAtTime(Math.max(0.0001, getIsMuted() ? 0.0001 : gRing), now);
      gainRing.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      const gainNoise = ctx.createGain();
      const gNoise = 0.25 * i * getSfxVolume();
      gainNoise.gain.setValueAtTime(Math.max(0.0001, getIsMuted() ? 0.0001 : gNoise), now);
      gainNoise.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

      ring.connect(gainRing);
      gainRing.connect(audioListener.gain);

      noise.connect(hp);
      hp.connect(gainNoise);
      gainNoise.connect(audioListener.gain);

      try {
        ring.start(now);
        ring.stop(now + 0.25);
        noise.start(now);
        noise.stop(now + noiseLen);
      } catch {}
    },
    playCollision(intensity, opts = {}) {
      const isBoosting = Boolean(opts.isBoosting);
      const rawI = clamp(intensity, 0, 1.35);
      const i = Math.min(1, rawI);
      if (i <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      // Drop the quietest active impact if too many overlap.
      if (activeImpactSfx.length >= MAX_ACTIVE_IMPACTS) {
        let quietestIdx = 0;
        let quietestI = activeImpactSfx[0]?.intensity ?? Infinity;
        for (let k = 1; k < activeImpactSfx.length; k += 1) {
          const ki = activeImpactSfx[k]?.intensity ?? Infinity;
          if (ki < quietestI) { quietestI = ki; quietestIdx = k; }
        }
        try { activeImpactSfx[quietestIdx]?.stop?.(); } catch {}
        activeImpactSfx.splice(quietestIdx, 1);
      }

      ensureCartCrashBufferLoaded();
      if (!cartCrashBuffer) return;

      const src = ctx.createBufferSource();
      src.buffer = cartCrashBuffer;
      src.playbackRate.setValueAtTime(0.6 + Math.random() * 0.4 + rawI * 0.55 + (isBoosting ? 0.12 : 0), now);

      const out = ctx.createGain();
      const boostGain = isBoosting ? (CONFIG?.ramming?.fx?.audioBoostGain ?? 1.35) : 1;
      const g = (0.22 + rawI * 0.88) * getSfxVolume() * 0.85 * boostGain;
      out.gain.setValueAtTime(Math.max(0.0001, getIsMuted() ? 0.0001 : g), now);

      src.connect(out);
      out.connect(audioListener.gain);

      const entry = {
        intensity: i,
        stop: () => {
          const t = ctx.currentTime;
          try { out.gain.setTargetAtTime(0.0001, t, 0.01); } catch {}
          try { src.stop(t + 0.01); } catch {}
          try { src.disconnect(); } catch {}
          try { out.disconnect(); } catch {}
        },
      };
      src.onended = () => {
        const idx = activeImpactSfx.indexOf(entry);
        if (idx >= 0) activeImpactSfx.splice(idx, 1);
        try { src.disconnect(); } catch {}
        try { out.disconnect(); } catch {}
      };

      activeImpactSfx.push(entry);
      try { src.start(0); } catch {}
    },
    playNitro() {
      if (getIsMuted() || getSfxVolume() <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      // * Sub punch
      const punch = ctx.createOscillator();
      punch.type = "sine";
      punch.frequency.setValueAtTime(58, now);
      punch.frequency.exponentialRampToValueAtTime(32, now + 0.09);
      const punchG = ctx.createGain();
      scheduleImpactEnvelope(punchG, ctx, now, 0.42, 0.003, 0.02, 0.07);
      punch.connect(punchG);
      punchG.connect(audioListener.gain);

      // * Engine growl — filtered triangle sweep reads as motor strain, not a toy laser.
      const growl = ctx.createOscillator();
      growl.type = "triangle";
      growl.frequency.setValueAtTime(72 + Math.random() * 8, now);
      growl.frequency.exponentialRampToValueAtTime(195, now + 0.38);
      const growlLp = ctx.createBiquadFilter();
      growlLp.type = "lowpass";
      growlLp.frequency.setValueAtTime(280, now);
      growlLp.frequency.exponentialRampToValueAtTime(520, now + 0.2);
      growlLp.Q.value = 0.9;
      const growlG = ctx.createGain();
      scheduleImpactEnvelope(growlG, ctx, now, 0.34, 0.008, 0.12, 0.28);
      growl.connect(growlLp);
      growlLp.connect(growlG);
      growlG.connect(audioListener.gain);

      // * Turbulence whoosh — dual-band noise sweep for weight + air release.
      const whooshLen = 0.42;
      const buf = ensureSharedNoiseBuffer(ctx);
      const turb = ctx.createBufferSource();
      turb.buffer = buf;
      turb.playbackRate.setValueAtTime(0.75 + Math.random() * 0.1, now);
      const turbBp = ctx.createBiquadFilter();
      turbBp.type = "bandpass";
      turbBp.frequency.setValueAtTime(180, now);
      turbBp.frequency.exponentialRampToValueAtTime(2200, now + whooshLen * 0.7);
      turbBp.Q.value = 0.85;
      const turbG = ctx.createGain();
      scheduleImpactEnvelope(turbG, ctx, now, 0.38, 0.012, 0.08, 0.32);

      const air = ctx.createBufferSource();
      air.buffer = buf;
      air.playbackRate.setValueAtTime(1.05 + Math.random() * 0.15, now);
      const airHp = ctx.createBiquadFilter();
      airHp.type = "highpass";
      airHp.frequency.setValueAtTime(1200, now);
      const airG = ctx.createGain();
      scheduleImpactEnvelope(airG, ctx, now, 0.14, 0.004, 0.015, 0.12);

      turb.connect(turbBp);
      turbBp.connect(turbG);
      turbG.connect(audioListener.gain);
      air.connect(airHp);
      airHp.connect(airG);
      airG.connect(audioListener.gain);

      try {
        punch.start(now);
        punch.stop(now + 0.1);
        growl.start(now);
        growl.stop(now + 0.4);
        turb.start(now);
        turb.stop(now + whooshLen);
        air.start(now);
        air.stop(now + 0.18);
      } catch {}
    },
    playHop() {
      if (getIsMuted() || getSfxVolume() <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      // * Mechanical click — instant tactile onset.
      const click = ctx.createBufferSource();
      click.buffer = ensureSharedNoiseBuffer(ctx);
      const clickBp = ctx.createBiquadFilter();
      clickBp.type = "bandpass";
      clickBp.frequency.setValueAtTime(2800, now);
      clickBp.Q.value = 2.2;
      const clickG = ctx.createGain();
      scheduleImpactEnvelope(clickG, ctx, now, 0.22, 0.001, 0.004, 0.025);
      click.connect(clickBp);
      clickBp.connect(clickG);
      clickG.connect(audioListener.gain);

      // * Spring release — quick pitch drop feels like suspension compressing.
      const spring = ctx.createOscillator();
      spring.type = "sine";
      spring.frequency.setValueAtTime(210, now);
      spring.frequency.exponentialRampToValueAtTime(88, now + 0.055);
      const springG = ctx.createGain();
      scheduleImpactEnvelope(springG, ctx, now, 0.3, 0.002, 0.012, 0.05);
      spring.connect(springG);
      springG.connect(audioListener.gain);

      // * Body thump — grounds the hop so it is not a cartoon boing.
      const thump = ctx.createOscillator();
      thump.type = "triangle";
      thump.frequency.setValueAtTime(95, now);
      thump.frequency.exponentialRampToValueAtTime(48, now + 0.04);
      const thumpG = ctx.createGain();
      scheduleImpactEnvelope(thumpG, ctx, now, 0.18, 0.002, 0.008, 0.035);
      thump.connect(thumpG);
      thumpG.connect(audioListener.gain);

      try {
        click.start(now);
        click.stop(now + 0.035);
        spring.start(now);
        spring.stop(now + 0.07);
        thump.start(now);
        thump.stop(now + 0.05);
      } catch {}
    },
    playFallOff() {
      if (getIsMuted() || getSfxVolume() <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;
      const fallLen = 0.45;

      // * Deep sub plunge — the "oh no" drop.
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(130, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + fallLen);
      const subG = ctx.createGain();
      scheduleImpactEnvelope(subG, ctx, now, 0.42, 0.006, 0.06, fallLen - 0.04);
      sub.connect(subG);
      subG.connect(audioListener.gain);

      // * Mid descent adds drama without sounding chirpy.
      const mid = ctx.createOscillator();
      mid.type = "triangle";
      mid.frequency.setValueAtTime(220, now);
      mid.frequency.exponentialRampToValueAtTime(42, now + fallLen * 0.85);
      const midG = ctx.createGain();
      scheduleImpactEnvelope(midG, ctx, now, 0.2, 0.004, 0.04, fallLen * 0.7);
      mid.connect(midG);
      midG.connect(audioListener.gain);

      // * Air-rush whoosh follows the cart over the edge.
      const rush = ctx.createBufferSource();
      rush.buffer = ensureSharedNoiseBuffer(ctx);
      const rushBp = ctx.createBiquadFilter();
      rushBp.type = "bandpass";
      rushBp.frequency.setValueAtTime(1100, now);
      rushBp.frequency.exponentialRampToValueAtTime(120, now + fallLen);
      rushBp.Q.value = 0.6;
      const rushG = ctx.createGain();
      scheduleImpactEnvelope(rushG, ctx, now, 0.28, 0.01, 0.05, fallLen * 0.75);
      rush.connect(rushBp);
      rushBp.connect(rushG);
      rushG.connect(audioListener.gain);

      try {
        sub.start(now);
        sub.stop(now + fallLen + 0.05);
        mid.start(now);
        mid.stop(now + fallLen);
        rush.start(now);
        rush.stop(now + fallLen);
      } catch {}
    },
    playWheelScreech(intensity) {
      if (getIsMuted() || getSfxVolume() <= 0) return;
      const i = clamp(intensity, 0, 1);
      if (i <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      // * Subtle wheel friction — soft wide-band noise, not a tonal squeal.
      const len = 0.07 + i * 0.05;
      const src = ctx.createBufferSource();
      src.buffer = ensureSharedNoiseBuffer(ctx);
      src.playbackRate.setValueAtTime(0.9 + Math.random() * 0.15, now);

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(500 + Math.random() * 200, now);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1400 + Math.random() * 400, now);
      lp.Q.value = 0.5;

      const g = ctx.createGain();
      const peak = (0.04 + i * 0.07) * getSfxVolume();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), now + 0.012);
      g.gain.linearRampToValueAtTime(0.0001, now + len);

      src.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(audioListener.gain);

      try {
        src.start(now);
        src.stop(now + len);
      } catch {}
    },
  };

  return { sfx, ensureCartCrashBufferLoaded };
}

/**
 * Initializes crowd ambient, leader chime, and gameplay SFX systems.
 *
 * @param {THREE.AudioListener} audioListener Three.js audio listener on the camera.
 * @param {{
 *   getSfxVolume: () => number,
 *   getIsMuted: () => boolean,
 *   onCollisionShake?: (intensity: number) => void,
 * }} deps Volume/mute accessors and optional collision screen-shake callback.
 * @returns {{ sfx: object, crowd: object, leaderHum: object, ensureCartCrashBufferLoaded: () => void }}
 */
export function initAudioSystem(audioListener, deps) {
  const { getSfxVolume, getIsMuted } = deps;
  const crowd = initCrowdSfx(audioListener, getSfxVolume, getIsMuted);
  const leaderHum = initLeaderHumSfx(audioListener, getSfxVolume, getIsMuted);
  const { sfx, ensureCartCrashBufferLoaded } = createSfxSystem(audioListener, deps);
  return { sfx, crowd, leaderHum, ensureCartCrashBufferLoaded };
}
