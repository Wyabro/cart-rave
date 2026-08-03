/**
 * shoot-gpu.mjs — one-off look-critical capture for ART-PASS-CLASSIC-1.
 *
 * tools/shoot.mjs passes NO GPU flags, so headless falls back to SwiftShader (blurry,
 * plus a full-screen "software mode" modal that covers the shot) — visual-qa.md trap #1.
 * This copies the launch precedent from tools/perf-profile.mjs --gpu and RECORDS the
 * actual UNMASKED_RENDERER next to the image, so a before/after can be trusted.
 *
 * Usage: node shoot-gpu.mjs --out <path.png> [--shot classic-edge] [--url http://127.0.0.1:3210]
 *                           [--cam x,y,z,lx,ly,lz] [--w 1600] [--h 900] [--settle 90] [--t 0]
 *
 * --t <ms> pins level animation to one timestamp (SHOOT-ANIM-1), making the shot a
 * reproducible phase instead of whenever it happened to land. Omit it and animation
 * free-runs. Prove a pulse by capturing two phases and comparing:
 *   node shoot-gpu.mjs --shot sundial --t 0   --out a.png
 *   node shoot-gpu.mjs --shot sundial --t 250 --out b.png
 *   npm run compare -- --a a.png --b b.png
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const out = arg("out", "capture.png");
const shot = arg("shot", "classic-edge");
const base = arg("url", "http://127.0.0.1:3210");
const cam = arg("cam", null);
const width = Number(arg("w", 1600));
const height = Number(arg("h", 900));
const settleFrames = Number(arg("settle", 90));
const animT = arg("t", null);

const params = new URLSearchParams({ shot, harness: "1", freeze: "1", hud: "0" });
if (cam) params.set("cam", cam);
// * Explicit null check, not truthiness — --t 0 is a legitimate phase.
if (animT !== null) params.set("t", String(animT));
const url = `${base}/?${params.toString()}`;

const browser = await chromium.launch({
  headless: true,
  // * Same best-effort hardware-GPU flags as tools/perf-profile.mjs --gpu. Not
  // * guaranteed — gpuVendor below is the proof, not the flags.
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-gl=angle"],
});

const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

console.log(`[shoot-gpu] ${url}`);
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

const gpuVendor = await page.evaluate(() => {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "webgl(no-debug-info)";
  } catch {
    return "probe-failed";
  }
});

await page.waitForFunction(() => window.__cartRave?.ready === true, null, { timeout: 90000 });
await page.waitForFunction(() => window.__cartRave?.worldReady === true, null, { timeout: 90000 });
await page.evaluate((n) => window.__cartRave.settle(n), settleFrames);
if (cam) await page.evaluate(() => window.__cartRave.applyCam?.());
await page.evaluate((n) => window.__cartRave.settle(n), 20);

const stats = await page.evaluate(() => {
  try {
    return window.__cartRave.stats?.() ?? null;
  } catch {
    return null;
  }
});

await page.screenshot({ path: out });
const meta = { url, out, gpuVendor, stats, consoleErrors: consoleErrors.slice(0, 10) };
writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(meta, null, 2));
console.log(`[shoot-gpu] gpuVendor = ${gpuVendor}`);
console.log(`[shoot-gpu] wrote ${out}`);
if (/swiftshader|llvmpipe|software/i.test(gpuVendor)) {
  console.log("[shoot-gpu] WARNING: software rasterizer — this capture is NOT look-critical proof.");
}

await browser.close();
