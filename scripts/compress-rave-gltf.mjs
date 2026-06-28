#!/usr/bin/env node
/**
 * Compress public/models/ravecart.glb → public/models/cart-rave-base-draco.glb
 *
 * Applies DRACO mesh compression plus texture resize/re-encode so the asset is suitable
 * for web delivery (target < 4 MB). Requires network on first run (npx downloads CLI).
 *
 * Usage:
 *   node scripts/compress-rave-gltf.mjs
 *   npm run compress:rave-gltf
 */

import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const input = path.join(root, "public", "models", "cart-rave-base.glb");
const output = path.join(root, "public", "models", "cart-rave-base-draco.glb");

if (!existsSync(input)) {
  console.error(`[compress-rave-gltf] Missing input: ${input}`);
  process.exit(1);
}

const inputMb = (statSync(input).size / (1024 * 1024)).toFixed(2);
console.log(`[compress-rave-gltf] Input: ${input} (${inputMb} MB)`);
console.log("[compress-rave-gltf] Running @gltf-transform/cli optimize (DRACO + texture compress)...");

const cmd = [
  "npx",
  "--yes",
  "@gltf-transform/cli",
  "optimize",
  `"${input}"`,
  `"${output}"`,
  "--compress",
  "draco",
  "--texture-compress",
  "webp",
  "--texture-size",
  "2048",
].join(" ");

execSync(cmd, { stdio: "inherit", cwd: root, shell: true });

if (!existsSync(output)) {
  console.error("[compress-rave-gltf] Output file was not created.");
  process.exit(1);
}

const outputMb = (statSync(output).size / (1024 * 1024)).toFixed(2);
console.log(`[compress-rave-gltf] Output: ${output} (${outputMb} MB)`);

if (statSync(output).size > 4 * 1024 * 1024) {
  console.warn(
    "[compress-rave-gltf] Output is still > 4 MB — try --texture-size 1024 or re-export from Meshy with smaller textures.",
  );
} else {
  console.log("[compress-rave-gltf] Target size met (< 4 MB).");
}

console.log("[compress-rave-gltf] Draco decoder is served from public/draco/gltf/ (copy from three/examples if missing).");
