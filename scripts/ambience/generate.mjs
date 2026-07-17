#!/usr/bin/env node
// scripts/ambience/generate.mjs — synthesize the per-arena ambient bed loops.
//
// Pure-Node PCM synthesis (seeded, reproducible) → 16-bit WAV → ffmpeg opus encode
// into public/sounds/ambience/. No loudnorm anywhere: single-pass dynamic loudnorm
// ramps gain over the first ~0.5s (see the announcer recut gotcha), which on a LOOP
// puts a level step exactly at the seam. Instead each bed is RMS-normalized in JS
// to one shared target and the in-game mix rides per-key volume multipliers.
//
// Loop seam: each renderer generates loop + CROSSFADE_S seconds with stateful
// filters running straight through, then the tail is equal-power-blended into the
// head — any slow-LFO phase mismatch is hidden inside the blend.
//
// Usage:
//   node scripts/ambience/generate.mjs            # all beds
//   node scripts/ambience/generate.mjs --only zanzibar_bed
//   node scripts/ambience/generate.mjs --keep-wav # leave WAVs next to the opus files

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SR = 48000;
const CROSSFADE_S = 2.0;
const TARGET_RMS_DB = -18;
const PEAK_CEIL_DB = -1;

const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/sounds/ambience",
);

// === tiny DSP toolkit ===

/** Deterministic PRNG so regeneration is byte-stable per seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ biquad, direct form 1. */
class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  set(type, freq, q) {
    const w0 = (2 * Math.PI * freq) / SR;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lowpass") {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    } else if (type === "highpass") {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    } else { // bandpass (constant peak gain)
      b0 = alpha; b1 = 0; b2 = -alpha;
    }
    a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
      - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Paul Kellet economy pink noise (stateful). */
function makePink(rng) {
  let b0 = 0, b1 = 0, b2 = 0;
  return () => {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.18;
  };
}

/** Leaky-integrated white → brown-ish rumble noise. */
function makeBrown(rng) {
  let last = 0;
  return () => {
    last = 0.998 * last + (rng() * 2 - 1) * 0.02;
    return last * 8;
  };
}

const dbToLin = (db) => Math.pow(10, db / 20);

/** Equal-power blend of the extra tail into the head, returns loop-length channels. */
function crossfadeLoop(channels, loopSamples) {
  const fadeSamples = Math.min(Math.round(CROSSFADE_S * SR), loopSamples);
  return channels.map((ch) => {
    const out = new Float32Array(loopSamples);
    out.set(ch.subarray(0, loopSamples));
    for (let i = 0; i < fadeSamples; i += 1) {
      const t = i / fadeSamples;
      const inGain = Math.sin((t * Math.PI) / 2);
      const outGain = Math.cos((t * Math.PI) / 2);
      out[i] = ch[loopSamples + i] * outGain + ch[i] * inGain;
    }
    return out;
  });
}

/** Normalize all channels together to TARGET_RMS_DB, hard-guarding the peak. */
function normalize(channels) {
  let sumSq = 0;
  let n = 0;
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i += 1) {
      sumSq += ch[i] * ch[i];
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
    n += ch.length;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n)) || 1e-9;
  let gain = dbToLin(TARGET_RMS_DB) / rms;
  if (peak * gain > dbToLin(PEAK_CEIL_DB)) gain = dbToLin(PEAK_CEIL_DB) / peak;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i += 1) ch[i] *= gain;
  }
}

function writeWav(filePath, channels) {
  const numCh = channels.length;
  const frames = channels[0].length;
  const dataBytes = frames * numCh * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * numCh * 2, 28);
  buf.writeUInt16LE(numCh * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < numCh; c += 1) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  writeFileSync(filePath, buf);
}

// === renderers ===
// Each returns [left, right] Float32Arrays of (loopSeconds + CROSSFADE_S) length.

/** Smoothed random gate — syllable/phrase style AM for crowd walla voices. */
function makeChatterEnv(rng, syllableHz, phraseHz) {
  let syl = 0, sylTarget = 0, sylCount = 0;
  let phrase = 0, phraseTarget = 0, phraseCount = 0;
  return () => {
    if (sylCount <= 0) {
      sylTarget = rng() < 0.62 ? 0.35 + rng() * 0.65 : 0.02;
      sylCount = Math.round((SR / syllableHz) * (0.5 + rng()));
    }
    if (phraseCount <= 0) {
      phraseTarget = rng() < 0.7 ? 0.5 + rng() * 0.5 : 0.06;
      phraseCount = Math.round((SR / phraseHz) * (0.5 + rng()));
    }
    sylCount -= 1;
    phraseCount -= 1;
    syl += (sylTarget - syl) * 0.0018;
    phrase += (phraseTarget - phrase) * 0.00025;
    return syl * phrase;
  };
}

/**
 * Crowd walla: N voices of double-bandpassed noise with syllabic AM, panned.
 * `dense`/`bright` push it from murmur toward excited-crowd texture.
 */
function renderWalla(rng, totalSamples, { voices, fcLow, fcHigh, syllableHz, gain }) {
  const L = new Float32Array(totalSamples);
  const R = new Float32Array(totalSamples);
  for (let v = 0; v < voices; v += 1) {
    const fc = fcLow * Math.pow(fcHigh / fcLow, rng());
    const bp1 = new Biquad().set("bandpass", fc, 2.2);
    const bp2 = new Biquad().set("bandpass", Math.min(fc * (1.5 + rng()), 6000), 2.5);
    const env = makeChatterEnv(rng, syllableHz * (0.7 + rng() * 0.6), 0.28 + rng() * 0.3);
    const pan = rng();
    const gL = Math.cos((pan * Math.PI) / 2) * gain;
    const gR = Math.sin((pan * Math.PI) / 2) * gain;
    for (let i = 0; i < totalSamples; i += 1) {
      const s = bp2.process(bp1.process(rng() * 2 - 1)) * env() * 3.5;
      L[i] += s * gL;
      R[i] += s * gR;
    }
  }
  return [L, R];
}

/** Sparse clap train (applause texture) — Poisson bursts of bandpassed noise. */
function renderClaps(rng, totalSamples, { ratePerSec, gain }) {
  const L = new Float32Array(totalSamples);
  const R = new Float32Array(totalSamples);
  const bp = new Biquad().set("bandpass", 1800, 1.2);
  const pClap = ratePerSec / SR;
  let env = 0;
  let pan = 0.5;
  for (let i = 0; i < totalSamples; i += 1) {
    if (rng() < pClap) {
      env = 0.5 + rng() * 0.5;
      pan = rng();
    }
    env *= 0.9985;
    const s = bp.process(rng() * 2 - 1) * env * gain;
    L[i] += s * Math.cos((pan * Math.PI) / 2);
    R[i] += s * Math.sin((pan * Math.PI) / 2);
  }
  return [L, R];
}

/** classic_crowd_bed — rave crowd murmur under the music, low + roomy. */
function renderClassicBed() {
  const rng = mulberry32(0xc1a551c);
  const total = Math.round((24 + CROSSFADE_S) * SR);
  const [L, R] = renderWalla(rng, total, {
    voices: 22, fcLow: 220, fcHigh: 1300, syllableHz: 3.2, gain: 0.16,
  });
  // Room tone under the voices.
  const pink = makePink(rng);
  const lp = new Biquad().set("lowpass", 350, 0.71);
  for (let i = 0; i < total; i += 1) {
    const s = lp.process(pink()) * 0.5;
    L[i] += s;
    R[i] += s;
  }
  return { channels: [L, R], loopSeconds: 24 };
}

/** classic_crowd_hype — the layer the excitement level fades in: cheers + claps + whistles. */
function renderClassicHype() {
  const rng = mulberry32(0x47e9e);
  const total = Math.round((18 + CROSSFADE_S) * SR);
  const [L, R] = renderWalla(rng, total, {
    voices: 30, fcLow: 420, fcHigh: 2600, syllableHz: 5.5, gain: 0.14,
  });
  const clap = renderClaps(rng, total, { ratePerSec: 26, gain: 0.35 });
  for (let i = 0; i < total; i += 1) { L[i] += clap[0][i]; R[i] += clap[1][i]; }
  // Cheer swells: broadband roar with a slow rise/fall, 3 per loop.
  const roarBp = new Biquad().set("bandpass", 900, 0.8);
  const swells = [0.12, 0.45, 0.78].map((p) => ({
    center: p * total,
    width: (1.2 + rng() * 1.4) * SR,
  }));
  for (let i = 0; i < total; i += 1) {
    let env = 0;
    for (const sw of swells) {
      const d = (i - sw.center) / sw.width;
      env += Math.exp(-d * d * 3);
    }
    const s = roarBp.process(rng() * 2 - 1) * env * 0.5;
    L[i] += s;
    R[i] += s * 0.9;
  }
  // Whistles riding two of the swells.
  for (const [k, sw] of swells.entries()) {
    if (k === 1) continue;
    const start = Math.round(sw.center - 0.2 * SR);
    const dur = Math.round(0.7 * SR);
    const f0 = 1900 + rng() * 700;
    let phase = 0;
    for (let j = 0; j < dur && start + j < total; j += 1) {
      const t = j / dur;
      const env = Math.sin(Math.PI * t) ** 2 * 0.16;
      const f = f0 * (1 + 0.12 * Math.sin(2 * Math.PI * 6 * t));
      phase += (2 * Math.PI * f) / SR;
      const s = Math.sin(phase) * env;
      L[start + j] += s * 0.7;
      R[start + j] += s;
    }
  }
  return { channels: [L, R], loopSeconds: 18 };
}

/** backrooms_bed — fluorescent ballast hum + HVAC rumble + faint high sizzle. */
function renderBackroomsBed() {
  const rng = mulberry32(0xbac00);
  const loopSeconds = 24;
  const total = Math.round((loopSeconds + CROSSFADE_S) * SR);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const brown = makeBrown(rng);
  const rumbleLp = new Biquad().set("lowpass", 130, 0.71);
  const sizzleHp = new Biquad().set("highpass", 7500, 0.71);
  let flicker = 1;
  let flickerCount = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / SR;
    // Ballast hum: 120Hz + decaying harmonics, slow wobble. The wobble LFO is an
    // integer number of cycles per loop so the seam blend has nothing to hide.
    const wobble = 0.85 + 0.15 * Math.sin(2 * Math.PI * (3 / loopSeconds) * t);
    // Occasional flicker: brief harmonic surge, like a tube about to give up.
    if (flickerCount <= 0 && rng() < 2.2 / (SR * 8)) flickerCount = Math.round(SR * (0.08 + rng() * 0.2));
    if (flickerCount > 0) { flickerCount -= 1; flicker = 1.9; } else flicker += (1 - flicker) * 0.001;
    const hum = (
      Math.sin(2 * Math.PI * 120 * t) * 0.5
      + Math.sin(2 * Math.PI * 240 * t) * 0.22 * flicker
      + Math.sin(2 * Math.PI * 360 * t) * 0.08 * flicker
    ) * 0.32 * wobble;
    // HVAC: brown rumble breathing at 2 cycles/loop.
    const breathe = 0.7 + 0.3 * Math.sin(2 * Math.PI * (2 / loopSeconds) * t + 1.3);
    const rumble = rumbleLp.process(brown()) * 0.85 * breathe;
    // Fluorescent sizzle: very quiet 120Hz-gated hiss.
    const gate = 0.5 + 0.5 * Math.sin(2 * Math.PI * 120 * t);
    const sizzle = sizzleHp.process(rng() * 2 - 1) * 0.012 * gate * flicker;
    const s = hum + rumble + sizzle;
    // Slight stereo decorrelation via per-channel sizzle phase.
    L[i] = s;
    R[i] = hum + rumble + sizzleHp.process(rng() * 2 - 1) * 0.012 * gate * flicker;
  }
  return { channels: [L, R], loopSeconds };
}

/** zanzibar_bed — ocean wash + wind + sparse gulls for the sunset deck. */
function renderZanzibarBed() {
  const rng = mulberry32(0x5ea51de);
  const loopSeconds = 28;
  const total = Math.round((loopSeconds + CROSSFADE_S) * SR);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const pinkL = makePink(rng);
  const pinkR = makePink(rng);
  const surfL = new Biquad().set("bandpass", 750, 0.6);
  const surfR = new Biquad().set("bandpass", 820, 0.6);
  const windLp = new Biquad().set("lowpass", 480, 0.71);
  const windSrc = makePink(rng);
  // Two overlapping wave envelopes at integer cycles/loop → seamless swell rhythm.
  const wave = (t, cycles, ph) =>
    Math.max(0, Math.sin(2 * Math.PI * (cycles / loopSeconds) * t + ph)) ** 1.6;
  for (let i = 0; i < total; i += 1) {
    const t = i / SR;
    const env = 0.28 + 0.72 * (0.62 * wave(t, 3, 0) + 0.38 * wave(t, 5, 2.1));
    L[i] = surfL.process(pinkL()) * env * 1.5;
    R[i] = surfR.process(pinkR()) * env * 1.5;
    const wind = windLp.process(windSrc()) * (0.5 + 0.2 * wave(t, 2, 4.0));
    L[i] += wind * 0.55;
    R[i] += wind * 0.5;
  }
  // Sparse gulls: descending "kyaa" cries, quiet, panned wide.
  const cries = 4;
  for (let c = 0; c < cries; c += 1) {
    const start = Math.round((0.1 + 0.8 * (c / cries) + rng() * 0.08) * loopSeconds * SR);
    const dur = Math.round((0.32 + rng() * 0.22) * SR);
    const f0 = 2500 + rng() * 700;
    const pan = rng();
    let phase = 0;
    for (let j = 0; j < dur && start + j < total; j += 1) {
      const t = j / dur;
      const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 1.5 * 0.05;
      const f = f0 * (1 - 0.32 * t) * (1 + 0.05 * Math.sin(2 * Math.PI * 38 * (j / SR)));
      phase += (2 * Math.PI * f) / SR;
      // Harsh-ish timbre: fundamental + strong 2nd partial + a pinch of noise.
      const s = (Math.sin(phase) + Math.sin(phase * 2) * 0.55 + (rng() * 2 - 1) * 0.18) * env;
      L[start + j] += s * Math.cos((pan * Math.PI) / 2);
      R[start + j] += s * Math.sin((pan * Math.PI) / 2);
    }
  }
  return { channels: [L, R], loopSeconds };
}

/** sd_tension — beatless dark drone layer faded in under Sudden Death. */
function renderSdTension() {
  const rng = mulberry32(0x5d7e2510);
  const loopSeconds = 16;
  const total = Math.round((loopSeconds + CROSSFADE_S) * SR);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const noise = makePink(rng);
  const noiseLp = new Biquad().set("lowpass", 400, 0.9);
  for (let i = 0; i < total; i += 1) {
    const t = i / SR;
    // 2-cycle swell across the loop keeps it breathing without a beat grid.
    const swell = 0.6 + 0.4 * Math.sin(2 * Math.PI * (2 / loopSeconds) * t);
    // Detuned low cluster: 55Hz root, slow beating pair, dark fifth.
    const drone = (
      Math.sin(2 * Math.PI * 55 * t)
      + Math.sin(2 * Math.PI * 55.6 * t) * 0.8
      + Math.sin(2 * Math.PI * 82.5 * t) * 0.4
      + Math.sin(2 * Math.PI * 110 * t) * 0.18 * swell
    ) * 0.24;
    // Minor-second shimmer above, only inside the swell — the "dread" note.
    const shimmer = (
      Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 233.08 * t)
    ) * 0.035 * Math.max(0, swell - 0.6);
    const breath = noiseLp.process(noise()) * 0.5 * swell;
    L[i] = drone + shimmer + breath;
    R[i] = drone * 0.98 + shimmer * 1.1 + breath;
  }
  return { channels: [L, R], loopSeconds };
}

// === pipeline ===

const RENDERERS = {
  classic_crowd_bed: renderClassicBed,
  classic_crowd_hype: renderClassicHype,
  backrooms_bed: renderBackroomsBed,
  zanzibar_bed: renderZanzibarBed,
  sd_tension: renderSdTension,
};

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const keepWav = args.includes("--keep-wav");

mkdirSync(OUT_DIR, { recursive: true });

for (const [key, render] of Object.entries(RENDERERS)) {
  if (only && key !== only) continue;
  const t0 = Date.now();
  const { channels, loopSeconds } = render();
  const looped = crossfadeLoop(channels, Math.round(loopSeconds * SR));
  normalize(looped);
  const wavPath = path.join(OUT_DIR, `${key}.wav`);
  const opusPath = path.join(OUT_DIR, `${key}.opus`);
  writeWav(wavPath, looped);
  const enc = spawnSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", wavPath,
    "-c:a", "libopus", "-b:a", "64k",
    opusPath,
  ], { stdio: "inherit" });
  if (enc.status !== 0) {
    console.error(`ffmpeg failed for ${key} (status ${enc.status})`);
    process.exit(1);
  }
  if (!keepWav) rmSync(wavPath);
  console.log(`${key}: ${loopSeconds}s loop rendered+encoded in ${Date.now() - t0}ms`);
}
console.log(`done → ${OUT_DIR}`);
