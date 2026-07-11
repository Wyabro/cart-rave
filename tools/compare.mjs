/**
 * compare.mjs — side-by-side PNG compare + mean absolute channel error.
 *
 * Usage:
 *   npm run compare -- --a shots/before.png --b shots/after.png --out shots/cmp.png
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/**
 * Minimal PNG decoder for 8-bit RGBA/RGB (no interlacing). Uses browser-less inflate.
 * Falls back to dynamic import of 'pngjs' if present; otherwise uses a tiny path via
 * playwright is not available — we implement with node zlib + raw IHDR/IDAT.
 */
async function decodePng(path) {
  // * Prefer sharp if installed (optional), else pngjs, else pure IHDR size + note.
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  } catch {
    /* optional */
  }
  try {
    const { PNG } = await import("pngjs");
    const png = PNG.sync.read(readFileSync(path));
    return { width: png.width, height: png.height, data: png.data };
  } catch {
    /* optional */
  }
  throw new Error(
    "Need `sharp` or `pngjs` for compare. Install one:\n  npm i -D sharp\n  # or\n  npm i -D pngjs",
  );
}

async function encodePng(width, height, rgba, outPath) {
  try {
    const sharp = (await import("sharp")).default;
    await sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } }).png().toFile(outPath);
    return;
  } catch {
    /* optional */
  }
  try {
    const { PNG } = await import("pngjs");
    const png = new PNG({ width, height });
    png.data = Buffer.from(rgba);
    writeFileSync(outPath, PNG.sync.write(png));
    return;
  } catch {
    /* optional */
  }
  throw new Error("Need sharp or pngjs to write comparison PNG");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aPath = resolve(/** @type {string} */ (args.a || ""));
  const bPath = resolve(/** @type {string} */ (args.b || ""));
  const outPath = resolve(/** @type {string} */ (args.out || "shots/cmp.png"));
  if (!args.a || !args.b) {
    console.error("Usage: npm run compare -- --a before.png --b after.png [--out cmp.png]");
    process.exit(1);
  }

  const a = await decodePng(aPath);
  const b = await decodePng(bPath);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  if (a.width !== b.width || a.height !== b.height) {
    console.warn(
      `[compare] size mismatch a=${a.width}x${a.height} b=${b.width}x${b.height} — comparing ${w}x${h} top-left crop`,
    );
  }

  const side = new Uint8ClampedArray(w * 3 * h * 4);
  let sumAbs = 0;
  let maxAbs = 0;
  let differing = 0;
  const thr = Number(args.threshold ?? 2);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const ai = (y * a.width + x) * 4;
      const bi = (y * b.width + x) * 4;
      const ar = a.data[ai];
      const ag = a.data[ai + 1];
      const ab = a.data[ai + 2];
      const br = b.data[bi];
      const bg = b.data[bi + 1];
      const bb = b.data[bi + 2];
      const dr = Math.abs(ar - br);
      const dg = Math.abs(ag - bg);
      const db = Math.abs(ab - bb);
      const d = (dr + dg + db) / 3;
      sumAbs += d;
      if (d > maxAbs) maxAbs = d;
      if (d > thr) differing += 1;

      // * left = a, middle = abs diff * 4, right = b
      const li = (y * (w * 3) + x) * 4;
      const mi = (y * (w * 3) + w + x) * 4;
      const ri = (y * (w * 3) + w * 2 + x) * 4;
      side[li] = ar;
      side[li + 1] = ag;
      side[li + 2] = ab;
      side[li + 3] = 255;
      side[mi] = Math.min(255, dr * 4);
      side[mi + 1] = Math.min(255, dg * 4);
      side[mi + 2] = Math.min(255, db * 4);
      side[mi + 3] = 255;
      side[ri] = br;
      side[ri + 1] = bg;
      side[ri + 2] = bb;
      side[ri + 3] = 255;
    }
  }

  const pixels = w * h;
  const meanAbs = pixels > 0 ? sumAbs / pixels : 0;
  const pctDiff = pixels > 0 ? (100 * differing) / pixels : 0;

  mkdirSync(dirname(outPath), { recursive: true });
  await encodePng(w * 3, h, side, outPath);

  console.log(`[compare] meanAbs=${meanAbs.toFixed(3)} maxAbs=${maxAbs.toFixed(1)} pctDiff>${thr}=${pctDiff.toFixed(2)}%`);
  console.log(`[compare] wrote ${outPath} (a | amp-diff | b)`);
  if (meanAbs > 5 || pctDiff > 2) {
    console.log("[compare] RESULT: notable difference");
  } else {
    console.log("[compare] RESULT: largely similar");
  }
}

main().catch((e) => {
  console.error("[compare] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
