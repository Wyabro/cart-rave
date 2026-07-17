#!/usr/bin/env node
// scripts/ambience/loopify.mjs — turn a premade audio clip into a game-ready ambience loop.
//
// Takes any file ffmpeg can read (wav/mp3/opus/m4a/...), makes it loop seamlessly
// (equal-power tail→head crossfade), RMS-matches it to the same -18dB target as the
// generated beds, and encodes it to public/sounds/ambience/<key>.opus. No loudnorm —
// same reasoning as generate.mjs (a gain ramp would put a level step at the seam).
//
// Usage:
//   node scripts/ambience/loopify.mjs <input> <key> [--fade 2]
//   node scripts/ambience/loopify.mjs crowd.wav classic_crowd_bed
//   node scripts/ambience/loopify.mjs cheering.mp3 classic_crowd_hype --fade 3
//
// <key> is the ambience layer to replace (see src/ambience/arenaAmbience.js):
//   classic_crowd_bed | classic_crowd_hype | backrooms_bed | zanzibar_bed | sd_tension
// The output loop is (input length - fade) seconds; use clips ≥ ~10s so the
// repetition isn't obvious.

import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { SR, CROSSFADE_S, crossfadeLoop, normalize, writeWav } from "./dsp.mjs";

const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/sounds/ambience",
);

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const [input, key] = positional;
const fadeIdx = args.indexOf("--fade");
const fadeSeconds = fadeIdx >= 0 ? Number(args[fadeIdx + 1]) : CROSSFADE_S;

if (!input || !key || !Number.isFinite(fadeSeconds) || fadeSeconds <= 0) {
  console.error("usage: node scripts/ambience/loopify.mjs <input> <key> [--fade seconds]");
  process.exit(1);
}
if (!existsSync(input)) {
  console.error(`input not found: ${input}`);
  process.exit(1);
}

// Decode to raw stereo float PCM at the game rate.
const dec = spawnSync("ffmpeg", [
  "-hide_banner", "-loglevel", "error",
  "-i", input,
  "-f", "f32le", "-ac", "2", "-ar", String(SR),
  "-",
], { maxBuffer: 1024 * 1024 * 1024 });
if (dec.status !== 0 || !dec.stdout?.length) {
  console.error(`ffmpeg decode failed for ${input}\n${dec.stderr?.toString() || ""}`);
  process.exit(1);
}

const interleaved = new Float32Array(dec.stdout.buffer, dec.stdout.byteOffset, dec.stdout.byteLength / 4);
const frames = Math.floor(interleaved.length / 2);
const fadeSamples = Math.round(fadeSeconds * SR);
const loopSamples = frames - fadeSamples;
if (loopSamples < SR * 4) {
  console.error(`clip too short: ${(frames / SR).toFixed(1)}s minus ${fadeSeconds}s fade leaves <4s of loop`);
  process.exit(1);
}

const L = new Float32Array(frames);
const R = new Float32Array(frames);
for (let i = 0; i < frames; i += 1) {
  L[i] = interleaved[i * 2];
  R[i] = interleaved[i * 2 + 1];
}

const looped = crossfadeLoop([L, R], loopSamples, fadeSeconds);
normalize(looped);

mkdirSync(OUT_DIR, { recursive: true });
const wavPath = path.join(OUT_DIR, `${key}.loopify.tmp.wav`);
const opusPath = path.join(OUT_DIR, `${key}.opus`);
writeWav(wavPath, looped);
const enc = spawnSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-i", wavPath,
  "-c:a", "libopus", "-b:a", "64k",
  opusPath,
], { stdio: "inherit" });
rmSync(wavPath);
if (enc.status !== 0) {
  console.error(`ffmpeg encode failed (status ${enc.status})`);
  process.exit(1);
}
console.log(`${key}: ${(loopSamples / SR).toFixed(1)}s loop (${fadeSeconds}s seam fade) → ${opusPath}`);
console.log("Refresh the game — beds load per play entry, no rebuild needed in dev.");
