#!/usr/bin/env node
// recut.mjs — re-cut keeper takes from a DAW-processed re-export of the ORIGINAL
// session WAV (same timeline), using the chunk timestamps captured by slice.mjs.
// No flavor chain — the DAW chain is already printed. Trim -> loudnorm -> opus.
//
// Usage: node recut.mjs <wetMaster.wav> <picks.json> <chunksDir> <gameRepoRoot>

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

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
const TAIL = 0.45;

// * NO start trim: the slice.mjs cut points already sit <=0.12s before speech onset,
// * and threshold-based start trims eat soft consonants ("F", "S") — proven the hard
// * way. Only the end is trimmed (the TAIL window may reach toward the next take),
// * and only AFTER a measured static gain so the -45dB threshold is meaningful on a
// * quiet DAW export. loudnorm runs last for cross-SFX consistency.
const END_TRIM =
  "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse";

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

let ok = 0, fail = 0;
for (const p of [...picks].sort((a, b) => a.line.localeCompare(b.line))) {
  const c = byN.get(p.chunk);
  if (!c) { console.error(`chunk ${p.chunk} missing from index.json`); fail += 1; continue; }
  const outFile = path.join(outDir, `${p.line}.opus`);
  const mean = measureMeanDb(c.start, c.dur + TAIL);
  // * Static pre-gain toward -16dB mean; clamped so a mismeasure can't blow up.
  const gain = mean === null ? 0 : Math.max(-12, Math.min(30, -16 - mean));
  const r = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", wetPath,
    "-ss", c.start.toFixed(3), "-t", (c.dur + TAIL).toFixed(3),
    "-af", `volume=${gain.toFixed(1)}dB,${END_TRIM},loudnorm=I=-16:TP=-1.5:LRA=11`,
    "-c:a", "libopus", "-b:a", "96k", "-vbr", "on",
    outFile,
  ], { encoding: "utf8" });
  if (r.status !== 0) { console.error(`${p.line} FAILED: ${r.stderr}`); fail += 1; }
  else { console.log(`OK ${p.line}.opus  (chunk ${p.chunk} @ ${c.start}s, pregain ${gain.toFixed(1)}dB)`); ok += 1; }
}
console.log(`\n${ok} recut, ${fail} failed -> ${outDir}`);
if (fail > 0) process.exit(1);
