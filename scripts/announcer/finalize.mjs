#!/usr/bin/env node
// finalize.mjs — turn reviewed announcer chunks into game-ready opus assets.
// Pipeline per keeper chunk: trim edge silence -> optional PA flavor -> loudnorm -> opus.
// Also emits the main.js registration snippet.
//
// Usage: node finalize.mjs <picks.json> <chunksDir> <gameRepoRoot> [--flavor]
//   picks.json = export from review.html: [{chunk,file,line,keeper}, ...]
//   --flavor   = bake in tannoy bandpass + slap echo

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2).filter((a) => a !== "--flavor");
const flavor = process.argv.includes("--flavor");
const [picksPath, chunksDir, repoRoot] = args;
if (!picksPath || !chunksDir || !repoRoot) {
  console.error("Usage: node finalize.mjs <picks.json> <chunksDir> <gameRepoRoot> [--flavor]");
  process.exit(1);
}

const picks = JSON.parse(readFileSync(picksPath, "utf8"));
const keepers = picks.filter((p) => p.keeper && p.line && p.line !== "skip");
if (keepers.length === 0) { console.error("No keeper takes in picks file."); process.exit(1); }

// One keeper per line id — bail loudly on double-stars.
const byLine = new Map();
for (const k of keepers) {
  if (byLine.has(k.line)) { console.error(`DUPLICATE keeper for ${k.line} (chunks ${byLine.get(k.line).chunk} and ${k.chunk})`); process.exit(1); }
  byLine.set(k.line, k);
}

const outDir = path.join(repoRoot, "public", "sounds", "announcer", "en");
mkdirSync(outDir, { recursive: true });

// * Filter chain mirrors scripts/normalize-sfx.mjs loudnorm targets; silenceremove
// * trims the review padding off both ends. Flavor chain matches the recording doc.
const FLAVOR = "highpass=f=250,lowpass=f=6000,aecho=0.6:0.35:28:0.18,";
const TRIM =
  "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05," +
  "areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.12,areverse,";

const done = [];
for (const [line, k] of [...byLine.entries()].sort()) {
  const inFile = path.join(chunksDir, k.file);
  const outFile = path.join(outDir, `${line}.opus`);
  const af = TRIM + (flavor ? FLAVOR : "") + "loudnorm=I=-16:TP=-1.5:LRA=11";
  const r = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-i", inFile,
    "-af", af,
    "-c:a", "libopus", "-b:a", "96k", "-vbr", "on",
    outFile,
  ], { encoding: "utf8" });
  if (r.status !== 0) console.error(`${line} FAILED: ${r.stderr}`);
  else { done.push(line); console.log(`OK ${line}.opus  (from chunk ${k.chunk})`); }
}

// ---- registration snippet -------------------------------------------------------
const keys = done.sort();
const snippet = [
  "  // * The Store PA — recorded voice pack (en). See docs/reference/announcer.md.",
  ...keys.map((k) => `  AudioManager.registerSfx("announcer_${k}", [soundUrl("announcer/en/${k}.opus")], { pool: 1 });`),
  "  registerAnnouncerVoicePack({",
  '    locale: "en",',
  `    availableKeys: [${keys.map((k) => `"${k}"`).join(", ")}],`,
  "  });",
].join("\n");
const snippetPath = path.join(chunksDir, "registration-snippet.js");
writeFileSync(snippetPath, snippet);
console.log(`\n${done.length} assets written to ${outDir}`);
console.log(`Registration snippet -> ${snippetPath}`);
