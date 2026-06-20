// audioSetup.js — SFX, crowd ambient, and leader chime initialization

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import * as GameState from "./gameState.js";
import * as Netcode from "./netcode.js";
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
function createSfxSystem(audioListener, { getSfxVolume, getIsMuted, onCollisionShake }) {
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
    playCollision(intensity) {
      const i = clamp(intensity, 0, 1);
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
      src.playbackRate.setValueAtTime(0.6 + Math.random() * 0.4 + i * 0.5, now);

      const out = ctx.createGain();
      const g = (0.2 + i * 0.8) * getSfxVolume() * 0.85;
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

      if (GameState.getRoundState().phase === "running" && i > 0.2) {
        onCollisionShake?.(i);
      }
    },
    playNitro() {
      const ctx = audioListener.context;
      if (ctx.state !== "running") return;
      const now = ctx.currentTime;

      // * Aggressive nitro burst: wide whoosh + saw accent + low thump.
      const len = 0.25;
      const buf = ensureSharedNoiseBuffer(ctx);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.setValueAtTime(0.9 + Math.random() * 0.2, now);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(400, now);
      bp.frequency.exponentialRampToValueAtTime(4000, now + len);
      bp.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5 * getSfxVolume(), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + len);
      src.connect(bp);
      bp.connect(g);
      g.connect(audioListener.gain);
      src.start(now);
      src.stop(now + len);

      // * Pitch accent: sawtooth sweep for extra bite.
      const accent = ctx.createOscillator();
      accent.type = "sawtooth";
      accent.frequency.setValueAtTime(200, now);
      accent.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.25 * getSfxVolume(), now);
      ag.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      accent.connect(ag);
      ag.connect(audioListener.gain);
      accent.start(now);
      accent.stop(now + 0.15);

      // * Low-end thump: quick chest-punch.
      const thump = ctx.createOscillator();
      thump.type = "sine";
      thump.frequency.setValueAtTime(80, now);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.3 * getSfxVolume(), now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      thump.connect(tg);
      tg.connect(audioListener.gain);
      thump.start(now);
      thump.stop(now + 0.15);
    },
    playHop() {
      if (getIsMuted() || getSfxVolume() <= 0) return;
      const ctx = audioListener.context;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.3 * getSfxVolume(), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioListener.gain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    },
    playFallOff() {
      const ctx = audioListener.context;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const now = ctx.currentTime;

      // * Quick low drop, keeping the fall cue short and grounded.
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(g);
      g.connect(audioListener.gain);
      osc.start(now);
      osc.stop(now + 0.18);
    },
    playWheelScreech(intensity) {
      if (getIsMuted() || getSfxVolume() <= 0) return;
      const i = clamp(intensity, 0, 1);
      if (i <= 0) return;
      const ctx = audioListener.context;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const now = ctx.currentTime;

      // * Rubber-on-glass squeak via high-Q resonant bandpass noise (no oscillators/LFOs).
      const len = 0.12;
      const attackSec = 0.005;

      const buf = ensureSharedNoiseBuffer(ctx);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.setValueAtTime(0.85 + Math.random() * 0.3, now);

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      // Center freq: 2800–3800 Hz (higher pitch = squeakier).
      const centerHz = 2800 + Math.random() * 1000;
      bp.frequency.setValueAtTime(centerHz, now);
      // High resonance makes the filter ring/squeal; add small per-trigger Q variation.
      const baseQ = 15 + Math.random() * 5; // 15–20
      const qJitter = (Math.random() - 0.5) * 6; // ±3
      bp.Q.value = Math.max(1, baseQ + qJitter);

      const g = ctx.createGain();
      const base = 0.25 * getSfxVolume();
      const peak = base * (0.35 + i * 0.65);
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + attackSec);
      g.gain.exponentialRampToValueAtTime(0.001, now + len);

      src.connect(bp);
      bp.connect(g);
      g.connect(audioListener.gain);
      src.start(now);
      src.stop(now + len);
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
