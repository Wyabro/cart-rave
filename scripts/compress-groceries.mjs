#!/usr/bin/env node
/**
 * Compress the grocery spill/cargo props for web delivery:
 *   art/models/groceries/<name>.glb → public/models/groceries/<name>.glb
 *
 * Same discrete, non-destructive pass chain as scripts/compress-rave-gltf.mjs
 * (resize → webp → draco) and the same rationale for NOT using
 * `gltf-transform optimize` — see that script's header comment. Output keeps
 * the master's filename so src/effects/groceryPool.js GROCERY_DEFS paths never
 * change; the pool's GLTFLoader already carries a DRACOLoader.
 *
 * Textures cap at 512px (masters are 1024²): groceries render as fist-sized
 * spill debris and cart cargo, so 512 is visually lossless at gameplay camera
 * distance while cutting ~85% of the bytes.
 *
 * Usage:
 *   npm run compress:groceries              # all six props
 *   npm run compress:groceries -- soda      # one prop
 *   node scripts/compress-groceries.mjs [name…] [--texture-size N]
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const ALL_PROPS = ["milk", "cereal", "soda", "soup", "orange", "baguette"];

// ─── Parse args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let textureSize = 512;
/** @type {string[]} */
const requested = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--texture-size") {
    textureSize = parseInt(argv[++i], 10);
    if (!Number.isFinite(textureSize) || textureSize <= 0) {
      console.error(`[compress-groceries] Invalid --texture-size: ${argv[i]}`);
      process.exit(1);
    }
  } else if (a.startsWith("--")) {
    console.error(`[compress-groceries] Unknown flag: ${a}`);
    process.exit(1);
  } else {
    requested.push(a);
  }
}
const props = requested.length > 0 ? requested : ALL_PROPS;

const outDir = path.join(root, "public", "models", "groceries");
mkdirSync(outDir, { recursive: true });

let totalIn = 0;
let totalOut = 0;
for (const name of props) {
  const input = path.join(root, "art", "models", "groceries", `${name}.glb`);
  const output = path.join(outDir, `${name}.glb`);
  if (!existsSync(input)) {
    console.error(
      `[compress-groceries] Missing master: ${input}\n` +
        `  Grocery masters live under art/models/groceries/ (runtime ships compressed only).`,
    );
    process.exit(1);
  }

  const passes = [
    {
      label: `resize (max ${textureSize}px)`,
      args: ["resize", "$IN", "$OUT", "--width", String(textureSize), "--height", String(textureSize)],
    },
    { label: "webp texture compression", args: ["webp", "$IN", "$OUT"] },
    { label: "draco geometry compression", args: ["draco", "$IN", "$OUT"] },
  ];

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
        : path.join(tmpDir, `compress-grocery-${name}-${i}-${process.pid}.glb`);
      if (!isLast) tmpFiles.push(dest);

      const cmd = ["npx", "--yes", "@gltf-transform/cli", ...pass.args]
        .map((tok) => (tok === "$IN" ? `"${current}"` : tok === "$OUT" ? `"${dest}"` : tok))
        .join(" ");
      execSync(cmd, { stdio: "pipe", cwd: root, shell: true });
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
    console.error(`[compress-groceries] Output was not created for ${name}.`);
    process.exit(1);
  }
  const inKb = statSync(input).size / 1024;
  const outKb = statSync(output).size / 1024;
  totalIn += inKb;
  totalOut += outKb;
  console.log(
    `[compress-groceries] ${name.padEnd(9)} ${inKb.toFixed(0).padStart(4)} KB → ${outKb
      .toFixed(0)
      .padStart(4)} KB (${((1 - outKb / inKb) * 100).toFixed(0)}% smaller)`,
  );
}

console.log(
  `[compress-groceries] Total: ${(totalIn / 1024).toFixed(2)} MB → ${(totalOut / 1024).toFixed(2)} MB`,
);
