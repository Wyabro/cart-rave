#!/usr/bin/env node
/**
 * Compress a cart GLB for web delivery: art/models/<model>.glb → public/models/<model>-draco.glb
 *
 * Runs DISCRETE, non-destructive gltf-transform passes (resize → webp → draco). We deliberately
 * DO NOT use `gltf-transform optimize`: its default pipeline also runs `simplify` (mesh
 * decimation), `flatten`, `join`, and `prune`, any of which breaks this project's assets —
 *   • simplify re-topologizes geometry, destroying carefully authored UVs (incl. the pattern
 *     `TEXCOORD_1` / `uv1` channel used by src/cartPatterns.js);
 *   • flatten/join collapse the `tripo_part_*` node names that the caster binding relies on
 *     (src/cartRaveGltf.js bindRaveGltfCartParts);
 *   • prune strips vertex attributes no material references — which would silently delete the
 *     runtime-only `uv1` pattern channel.
 * The discrete passes below touch only texture bytes and mesh compression, preserving the node
 * graph and every UV set.
 *
 * Usage:
 *   node scripts/compress-rave-gltf.mjs [model] [--texture-size N] [--no-webp] [--no-resize]
 *   npm run compress:rave-gltf                 # defaults to the active model (cartrave4)
 *   npm run compress:rave-gltf -- cart-rave-base --texture-size 1024
 *
 * Args:
 *   model            Base name (default: "cartrave4"). Reads art/models/<model>.glb,
 *                    writes public/models/<model>-draco.glb (runtime ships Draco only).
 *   --texture-size N Max texture dimension (default 2048). Applied as an upper bound; textures
 *                    already smaller are left untouched (resize never upscales).
 *   --no-webp        Skip WebP texture re-encoding (keeps source PNG/JPEG).
 *   --no-resize      Skip the resize pass entirely.
 *
 * Requires network on first run (npx downloads @gltf-transform/cli).
 */

import { execSync } from "node:child_process";
import { existsSync, statSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ─── Parse args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let model = "cartrave4";
let textureSize = 2048;
let doWebp = true;
let doResize = true;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--no-webp") doWebp = false;
  else if (a === "--no-resize") doResize = false;
  else if (a === "--texture-size") {
    textureSize = parseInt(argv[++i], 10);
    if (!Number.isFinite(textureSize) || textureSize <= 0) {
      console.error(`[compress-rave-gltf] Invalid --texture-size: ${argv[i]}`);
      process.exit(1);
    }
  } else if (a.startsWith("--")) {
    console.error(`[compress-rave-gltf] Unknown flag: ${a}`);
    process.exit(1);
  } else {
    model = a; // positional model name
  }
}

const inputArt = path.join(root, "art", "models", `${model}.glb`);
const inputPublicLegacy = path.join(root, "public", "models", `${model}.glb`);
const input = existsSync(inputArt)
  ? inputArt
  : inputPublicLegacy; // * legacy path if someone still drops a master under public/
const output = path.join(root, "public", "models", `${model}-draco.glb`);

if (!existsSync(input)) {
  console.error(
    `[compress-rave-gltf] Missing input: ${inputArt}\n` +
      `  Place the uncompressed master at art/models/${model}.glb (not under public/).`,
  );
  process.exit(1);
}

const inputMb = (statSync(input).size / (1024 * 1024)).toFixed(2);
console.log(`[compress-rave-gltf] Model: ${model}`);
console.log(`[compress-rave-gltf] Input: ${input} (${inputMb} MB)`);

// ─── Build the discrete pass chain (resize → webp → draco) ───────────────────
/** @type {Array<{ label: string, args: string[] }>} */
const passes = [];
if (doResize) {
  passes.push({
    label: `resize (max ${textureSize}px)`,
    args: ["resize", "$IN", "$OUT", "--width", String(textureSize), "--height", String(textureSize)],
  });
}
if (doWebp) {
  passes.push({ label: "webp texture compression", args: ["webp", "$IN", "$OUT"] });
}
passes.push({ label: "draco geometry compression", args: ["draco", "$IN", "$OUT"] });

// Chain passes through temp files; the final pass writes to `output`.
const tmpDir = os.tmpdir();
/** @type {string[]} */
const tmpFiles = [];
let current = input;
try {
  for (let i = 0; i < passes.length; i += 1) {
    const pass = passes[i];
    const isLast = i === passes.length - 1;
    const dest = isLast
      ? output
      : path.join(tmpDir, `compress-${model}-${i}-${process.pid}.glb`);
    if (!isLast) tmpFiles.push(dest);

    const cmd = ["npx", "--yes", "@gltf-transform/cli", ...pass.args]
      .map((tok) => (tok === "$IN" ? `"${current}"` : tok === "$OUT" ? `"${dest}"` : tok))
      .join(" ");
    console.log(`[compress-rave-gltf] Pass ${i + 1}/${passes.length}: ${pass.label}`);
    execSync(cmd, { stdio: "inherit", cwd: root, shell: true });
    current = dest;
  }
} finally {
  for (const f of tmpFiles) {
    try {
      rmSync(f, { force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
}

if (!existsSync(output)) {
  console.error("[compress-rave-gltf] Output file was not created.");
  process.exit(1);
}

const outputMb = (statSync(output).size / (1024 * 1024)).toFixed(2);
console.log(`[compress-rave-gltf] Output: ${output} (${outputMb} MB)`);

if (statSync(output).size > 4 * 1024 * 1024) {
  console.warn(
    "[compress-rave-gltf] Output is still > 4 MB — try a smaller --texture-size (e.g. 1024).",
  );
} else {
  console.log("[compress-rave-gltf] Target size met (< 4 MB).");
}

console.log(
  "[compress-rave-gltf] Draco decoder is served from public/draco/gltf/ (copy from three/examples if missing).",
);
console.log(
  "[compress-rave-gltf] After re-UV, confirm TEXCOORD_1 survived — see docs/guides/cart-pattern-reuv.md.",
);
