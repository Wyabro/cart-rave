#!/usr/bin/env node
// recut.mjs — re-cut keeper takes from a DAW-processed re-export of the ORIGINAL
// session WAV, using the chunk timestamps captured by slice.mjs.
// No flavor chain — the DAW chain is already printed. Align -> trim -> loudnorm -> opus.
//
// Usage: node recut.mjs <wetMaster.wav> <picks.json> <chunksDir> <gameRepoRoot>
//
// The dry timestamps are the source of truth. Envelope cross-correlation only
// REFINES each cut within ±0.5s — never more. A wide (±5s) search sounded safer but
// bit us on Tier 2: same-line takes are so consistent that, after DAW compression,
// sibling takes out-correlate the real one, and the aligner shipped wrong takes and
// a slate. Siblings sit >1.5s apart, so a ±0.5s window can't reach them.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const [, , wetPath, picksPath, chunksDir, repoRoot] = process.argv;
if (!wetPath || !picksPath || !chunksDir || !repoRoot) {
  console.error("Usage: node recut.mjs <wetMaster.wav> <picks.json> <chunksDir> <gameRepoRoot>");
  process.exit(1);
}

const picks = JSON.parse(readFileSync(picksPath, "utf8")).filter((p) => p.keeper && p.line && p.line !== "skip");
/** @type {{n:number,file:string,start:number,dur:number}[]} */
const index = JSON.parse(readFileSync(path.join(chunksDir, "index.json"), "utf8"));
const byN = new Map(index.map((c) => [c.n, c]));

const outDir = path.join(repoRoot, "public", "sounds", "announcer", "en");
mkdirSync(outDir, { recursive: true });

// * Extra tail so the DAW chain's reverb/echo decay survives the cut.
const TAIL = 0.6;
// * Alignment refine window around the dry timestamp (seconds each way). MUST stay
// * well under the ~1.5s minimum sibling-take spacing — see header comment.
const SEARCH = 0.5;
// * Envelope resolution: 100 bins/second at 8kHz mono.
const RATE = 8000, BIN = 80;

// * NO start trim: the slice.mjs cut points already sit <=0.12s before speech onset,
// * and threshold-based start trims eat soft consonants ("F", "S") — proven the hard
// * way. Only the end is trimmed (the TAIL window may reach toward the next take),
// * and only AFTER a measured static gain so the -45dB threshold is meaningful on a
// * quiet DAW export. loudnorm runs last for cross-SFX consistency.
// * Gentle: -55dB with 0.2s of kept decay — a -45dB cut audibly clipped reverb tails
// * ("cut off a tiny bit too early", Tier 2 feedback).
const END_TRIM =
  "areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.2,areverse";

/** Decodes an audio file to an 8kHz mono s16 PCM Int16Array via a temp file. */
function decodePcm(file) {
  const tmp = path.join(os.tmpdir(), `recut_${process.pid}_${Math.floor(performance.now() * 1000)}.pcm`);
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "s16le", tmp], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`decode failed for ${file}: ${r.stderr}`);
  const buf = readFileSync(tmp);
  rmSync(tmp, { force: true });
  return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
}

/** Mean-abs envelope, 100 bins/second. */
function envelope(pcm) {
  const out = new Float64Array(Math.floor(pcm.length / BIN));
  for (let i = 0; i < out.length; i += 1) {
    let s = 0;
    for (let j = 0; j < BIN; j += 1) s += Math.abs(pcm[i * BIN + j]);
    out[i] = s / BIN;
  }
  return out;
}

/** Finds the dry chunk's best-matching position (seconds) in the wet envelope. */
function align(wetEnv, dryEnv, expectSec) {
  const expect = Math.round(expectSec * 100);
  let best = { off: expect, score: -1 };
  const lo = Math.max(0, expect - SEARCH * 100);
  const hi = Math.min(wetEnv.length - dryEnv.length, expect + SEARCH * 100);
  for (let off = lo; off <= hi; off += 1) {
    let dot = 0, wn = 0, dn = 0;
    for (let i = 0; i < dryEnv.length; i += 1) {
      dot += wetEnv[off + i] * dryEnv[i];
      wn += wetEnv[off + i] ** 2;
      dn += dryEnv[i] ** 2;
    }
    const score = dot / Math.sqrt(wn * dn + 1e-9);
    if (score > best.score) best = { off, score };
  }
  return { sec: best.off / 100, corr: best.score };
}

/** Measures mean volume (dB) of a window of the wet master via volumedetect. */
function measureMeanDb(start, dur) {
  const r = spawnSync("ffmpeg", [
    "-v", "info",
    "-i", wetPath,
    "-ss", start.toFixed(3), "-t", dur.toFixed(3),
    "-af", "volumedetect", "-f", "null", "-",
  ], { encoding: "utf8" });
  const m = r.stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  return m ? parseFloat(m[1]) : null;
}

console.log("Decoding wet master for alignment…");
const wetEnv = envelope(decodePcm(wetPath));

let ok = 0, fail = 0;
for (const p of [...picks].sort((a, b) => a.line.localeCompare(b.line))) {
  const c = byN.get(p.chunk);
  if (!c) { console.error(`chunk ${p.chunk} missing from index.json`); fail += 1; continue; }

  const dryEnv = envelope(decodePcm(path.join(chunksDir, c.file)));
  let { sec, corr } = align(wetEnv, dryEnv, c.start);
  if (corr < 0.6) {
    // * Timestamps are the truth — a weak local match means the chain reshaped the
    // * envelope, not that the take moved. Cut at the dry timestamp and say so.
    console.warn(`${p.line}: weak refine corr ${corr.toFixed(2)} — cutting at dry timestamp ${c.start}s`);
    sec = c.start;
  }

  const outFile = path.join(outDir, `${p.line}.opus`);
  const mean = measureMeanDb(sec, c.dur + TAIL);
  // * Static pre-gain toward -16dB mean; clamped so a mismeasure can't blow up.
  const gain = mean === null ? 0 : Math.max(-12, Math.min(30, -16 - mean));
  const r = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", wetPath,
    "-ss", sec.toFixed(3), "-t", (c.dur + TAIL).toFixed(3),
    "-af", `volume=${gain.toFixed(1)}dB,${END_TRIM},loudnorm=I=-16:TP=-1.5:LRA=11`,
    "-c:a", "libopus", "-b:a", "96k", "-vbr", "on",
    outFile,
  ], { encoding: "utf8" });
  if (r.status !== 0) { console.error(`${p.line} FAILED: ${r.stderr}`); fail += 1; }
  else {
    const drift = sec - c.start;
    console.log(`OK ${p.line}.opus  (chunk ${p.chunk}: dry@${c.start}s -> wet@${sec.toFixed(2)}s, drift ${drift >= 0 ? "+" : ""}${drift.toFixed(2)}s, corr ${corr.toFixed(2)}, pregain ${gain.toFixed(1)}dB)`);
    ok += 1;
  }
}
console.log(`\n${ok} recut, ${fail} failed -> ${outDir}`);
if (fail > 0) process.exit(1);
