// scripts/ambience/dsp.mjs — shared loop-finishing DSP for the ambience tools.
// Used by generate.mjs (synthesized beds) and loopify.mjs (premade clips).
// See generate.mjs for why there is NO loudnorm anywhere in this pipeline.

import { writeFileSync } from "node:fs";

export const SR = 48000;
export const CROSSFADE_S = 2.0;
export const TARGET_RMS_DB = -18;
export const PEAK_CEIL_DB = -1;

export const dbToLin = (db) => Math.pow(10, db / 20);

/**
 * Equal-power blend of the extra tail into the head, returns loop-length channels.
 * Input channels must be loopSamples + fade long; output is exactly loopSamples.
 */
export function crossfadeLoop(channels, loopSamples, fadeSeconds = CROSSFADE_S) {
  const fadeSamples = Math.min(Math.round(fadeSeconds * SR), loopSamples);
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
export function normalize(channels) {
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

/** 16-bit PCM WAV writer (interleaved from per-channel Float32Arrays). */
export function writeWav(filePath, channels) {
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
