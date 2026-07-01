#!/usr/bin/env node
/**
 * Normalize all SFX .ogg files in public/sounds/ to a consistent perceived loudness
 * using FFmpeg's loudnorm filter (EBU R128).
 *
 * Music files (song2, song3, song4, music, menu) are intentionally skipped.
 *
 * Usage:
 *   node scripts/normalize-sfx.mjs
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, unlinkSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const soundsDir = path.join(root, "public", "sounds");

// * Music files — excluded from normalization.
const MUSIC_FILES = new Set([
  "song2.ogg",
  "song3.ogg",
  "song4.ogg",
  "music.ogg",
  "menu.ogg",
]);

if (!existsSync(soundsDir)) {
  console.error("[normalize-sfx] Missing directory: " + soundsDir);
  process.exit(1);
}

const allOggFiles = readdirSync(soundsDir).filter((f) => f.endsWith(".ogg"));
const sfxFiles = allOggFiles.filter((f) => !MUSIC_FILES.has(f));

if (sfxFiles.length === 0) {
  console.log("[normalize-sfx] No SFX files found to normalize.");
  process.exit(0);
}

console.log(`[normalize-sfx] Found ${sfxFiles.length} SFX files to normalize:`);
for (const f of sfxFiles) {
  console.log(`  - ${f}`);
}

// * Check that FFmpeg is available.
try {
  execSync("ffmpeg -version", { stdio: "pipe" });
} catch {
  console.error("[normalize-sfx] FFmpeg not found in PATH. Install FFmpeg and try again.");
  process.exit(1);
}

let successCount = 0;
let failCount = 0;

for (const filename of sfxFiles) {
  const inputPath = path.join(soundsDir, filename);
  const tempPath = path.join(soundsDir, `_normalized_${filename}`);

  const inputSize = (statSync(inputPath).size / 1024).toFixed(1);

  // * loudnorm filter — standardizes perceived loudness (EBU R128).
  // * I=-16  : integrated loudness target of -16 LUFS
  // * TP=-1.5: true peak limit of -1.5 dBTP (avoids clipping)
  // * LRA=11  : loudness range target of 11 LU (consistent dynamic range)
  const cmd = [
    "ffmpeg",
    "-y",                          // overwrite output without prompting
    "-i", `"${inputPath}"`,        // input file
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",  // loudness normalization
    "-c:a", "libvorbis",           // Ogg Vorbis encoder
    "-q:a", "4",                   // quality 4 (reasonable balance of size/quality)
    `"${tempPath}"`,               // output to temp file
  ].join(" ");

  console.log(`\n[normalize-sfx] Processing: ${filename} (${inputSize} KB)...`);

  try {
    execSync(cmd, { stdio: "pipe", cwd: root, shell: true });

    if (!existsSync(tempPath)) {
      console.error(`  FAILED: temp file not created for ${filename}`);
      failCount += 1;
      continue;
    }

    const outputSize = (statSync(tempPath).size / 1024).toFixed(1);

    // * Replace original with normalized version.
    try {
      unlinkSync(inputPath);
    } catch {
      // * Input may already be gone — proceed.
    }
    renameSync(tempPath, inputPath);

    console.log(`  OK → ${outputSize} KB (was ${inputSize} KB)`);
    successCount += 1;
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    // * Clean up temp file if it exists.
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // swallow
    }
    failCount += 1;
  }
}

console.log(`\n[normalize-sfx] Done. ${successCount} normalized, ${failCount} failed.`);
if (failCount > 0) {
  process.exit(1);
}
