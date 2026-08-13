/**
 * compare.mjs — side-by-side PNG compare + mean absolute channel error
 * + Rec.709 luma / darkness statistics per image (ART-LUMA-TOOL-1).
 *
 * Usage:
 *   npm run compare -- --a shots/before.png --b shots/after.png --out shots/cmp.png
 *
 * The luma line guards art-direction.md Rule 3 ("blacks stay black"): floor is
 * the mean of the darkest decile, plus median, mean, and pure-black %. Metric
 * definition — Rec.709 luma on raw sRGB bytes (no linearization):
 * 0.2126R + 0.7152G + 0.0722B. Importable for tests: main() only runs when
 * executed directly.
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

/** Decode PNG via sharp (devDependency). */
async function decodePng(path) {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

/** Encode RGBA buffer as PNG via sharp. */
async function encodePng(width, height, rgba, outPath) {
  const sharp = (await import("sharp")).default;
  await sharp(Buffer.from(rgba), { raw: { width, height, channels: 4 } }).png().toFile(outPath);
}

/**
 * Rec.709 luma + darkness statistics for a raw RGBA pixel buffer (sRGB bytes).
 *
 * Metric definition (matches art-direction.md Rule 3's scratchpad method):
 * - luma = 0.2126R + 0.7152G + 0.0722B on raw bytes 0–255, no linearization
 * - floor = mean of the darkest decile (N = max(1, floor(0.1 * count)))
 * - median = 50th percentile of sorted luma (lower-middle for even counts)
 * - mean = arithmetic mean of all luma
 * - blackPct = % of pixels whose luma byte rounds to 0
 *
 * @param {Uint8ClampedArray} data RGBA bytes, row-major.
 * @param {number} width
 * @param {number} height
 * @returns {{ floor: number, median: number, mean: number, blackPct: number }}
 */
export function computeLumaStats(data, width, height) {
  const count = width * height;
  const luma = new Float64Array(count);
  let sum = 0;
  let black = 0;
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[i] = y;
    sum += y;
    if (Math.round(y) === 0) black += 1;
  }

  const sorted = Float64Array.from(luma).sort();
  const n = Math.max(1, Math.floor(count * 0.1));
  let floorSum = 0;
  for (let i = 0; i < n; i += 1) floorSum += sorted[i];

  const mid = count >> 1;
  const median = count % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  return {
    floor: count > 0 ? floorSum / n : 0,
    median,
    mean: count > 0 ? sum / count : 0,
    blackPct: count > 0 ? (100 * black) / count : 0,
  };
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

  // * Rule 3 luma guard (ART-LUMA-TOOL-1) — printed per input, pre-diff.
  for (const [label, img] of [["a", a], ["b", b]]) {
    const s = computeLumaStats(img.data, img.width, img.height);
    console.log(
      `[compare] luma ${label}: floor=${s.floor.toFixed(2)} median=${s.median.toFixed(2)} mean=${s.mean.toFixed(2)} black=${s.blackPct.toFixed(1)}%`,
    );
  }

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

// * Only run as a CLI; importing for tests must not execute main().
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error("[compare] FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
