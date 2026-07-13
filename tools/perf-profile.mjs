/**
 * perf-profile.mjs — headless GPU/draw-call + CPU frame timing for Cart Clash.
 *
 * Measures across arenas × quality tiers (and optional ablations) so we rank
 * bottlenecks from evidence, not vibes.
 *
 * Usage:
 *   node tools/perf-profile.mjs
 *   node tools/perf-profile.mjs --preset medium --level classic
 *   node tools/perf-profile.mjs --url http://127.0.0.1:5173/ --noserver
 *
 * Requires Playwright Chromium. Auto-starts `npm run dev` on :5173 unless --url/--noserver.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

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

function str(v) {
  return typeof v === "string" ? v : undefined;
}

async function ensurePlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("[perf] playwright missing — npm i -D playwright && npx playwright install chromium");
    process.exit(1);
  }
}

/**
 * @param {string} baseUrl
 * @param {Record<string, string | boolean>} args
 */
async function maybeStartDevServer(baseUrl, args) {
  if (str(args.url) || args.noserver === true) return null;
  let host;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return null;
  }
  if (host !== "localhost" && host !== "127.0.0.1") return null;

  const child = spawn("npm run dev -- --host 127.0.0.1 --port 5173 --strictPort", {
    cwd: resolve(process.cwd()),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    env: { ...process.env, BROWSER: "none" },
  });

  let ready = false;
  const onData = (buf) => {
    if (String(buf).includes("Local:") || String(buf).includes("5173")) ready = true;
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  const deadline = Date.now() + 90000;
  while (!ready && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
    // eslint-disable-next-line no-await-in-loop
    const up = await new Promise((resolveProbe) => {
      import("node:net").then(({ default: net }) => {
        const s = net.connect(5173, "127.0.0.1", () => {
          s.end();
          resolveProbe(true);
        });
        s.on("error", () => resolveProbe(false));
      });
    });
    if (up) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    child.kill();
    throw new Error("Dev server failed to start on :5173");
  }
  console.log("[perf] dev server ready");
  return child;
}

/**
 * Build a harness URL for a measurement cell.
 * @param {string} base
 * @param {{ level: string, preset: string, ablate?: string, forcegpu?: string }} cell
 */
function cellUrl(base, cell) {
  const u = new URL(base);
  u.searchParams.set("harness", "1");
  u.searchParams.set("freeze", "1");
  u.searchParams.set("perfPump", "1");
  u.searchParams.set("hud", "0");
  u.searchParams.set("level", cell.level);
  u.searchParams.set("preset", cell.preset);
  // * Bookmarks that wait for attract/world; shot ids map to levels in debugParams.
  if (cell.level === "classic") u.searchParams.set("shot", "classic");
  else if (cell.level === "backrooms") u.searchParams.set("shot", "storerooms");
  else if (cell.level === "zanzibar") u.searchParams.set("shot", "sundial");
  if (cell.ablate) u.searchParams.set("ablate", cell.ablate);
  if (cell.forcegpu) u.searchParams.set("forcegpu", cell.forcegpu);
  return u.toString();
}

/**
 * In-page measurement: scene graph + serialized GPU cost + rAF dt samples.
 * Runs inside the browser.
 */
function measureInPage() {
  const renderer = window.__cartRavePerf?.renderer || window.__cartRave?.stats?.() && null;
  const harness = window.__cartRave;
  const perf = window.__cartRavePerf;
  const r = perf?.renderer || null;
  const scene = perf?.scene || null;
  const camera = perf?.camera || null;
  const composer = perf?.composer || null;

  /** @type {Record<string, number>} */
  const lights = { point: 0, spot: 0, dir: 0, hemi: 0, ambient: 0, other: 0 };
  let meshes = 0;
  let instanced = 0;
  let instancedCapacity = 0;
  let transparent = 0;
  let physical = 0;
  let basic = 0;
  let standard = 0;
  let reflectorVisible = 0;
  let reflectorTotal = 0;

  if (scene) {
    scene.traverse((obj) => {
      if (obj.isLight) {
        if (obj.isPointLight) lights.point += 1;
        else if (obj.isSpotLight) lights.spot += 1;
        else if (obj.isDirectionalLight) lights.dir += 1;
        else if (obj.isHemisphereLight) lights.hemi += 1;
        else if (obj.isAmbientLight) lights.ambient += 1;
        else lights.other += 1;
      }
      if (obj.isMesh) {
        meshes += 1;
        if (obj.isInstancedMesh) {
          instanced += 1;
          instancedCapacity += obj.count || 0;
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.transparent) transparent += 1;
          const t = m.type || "";
          if (t.includes("Physical")) physical += 1;
          else if (t.includes("Basic")) basic += 1;
          else if (t.includes("Standard") || t.includes("Lambert") || t.includes("Phong")) standard += 1;
        }
        // * Reflector is a Mesh subclass with isReflector or constructor name.
        if (obj.isReflector || obj.constructor?.name === "Reflector") {
          reflectorTotal += 1;
          if (obj.visible) reflectorVisible += 1;
        }
      }
    });
  }

  // * GPU cost: N frames of render + gl.finish (serialized).
  const gl = r?.getContext?.();
  const gpuSamples = [];
  const frameSamples = [];
  const N = 20;

  if (r && scene && camera) {
    // * Warm a few frames first.
    for (let i = 0; i < 8; i += 1) {
      if (composer && !window.__cartRavePerf?._forceDirect) {
        try {
          composer.render();
        } catch {
          r.render(scene, camera);
        }
      } else {
        r.render(scene, camera);
      }
    }
    for (let i = 0; i < N; i += 1) {
      const t0 = performance.now();
      if (composer) {
        try {
          composer.render();
        } catch {
          r.render(scene, camera);
        }
      } else {
        r.render(scene, camera);
      }
      if (gl?.finish) gl.finish();
      gpuSamples.push(performance.now() - t0);
    }
  }

  // * rAF wall-clock samples (includes JS outside pure render when freeze sim is on).
  // * With ?freeze the sim may still skip physics but attract/visuals can run.
  return new Promise((resolveDone) => {
    let left = 45;
    let last = performance.now();
    function tick(now) {
      frameSamples.push(now - last);
      last = now;
      left -= 1;
      if (left > 0) {
        requestAnimationFrame(tick);
      } else {
        const stats = harness?.stats?.() ?? {};
        const info = r?.info;
        const sort = (arr) => arr.slice().sort((a, b) => a - b);
        const pct = (arr, p) => {
          if (!arr.length) return null;
          const s = sort(arr);
          return s[Math.min(s.length - 1, Math.floor(s.length * p))];
        };
        const med = (arr) => pct(arr, 0.5);
        resolveDone({
          harness: stats,
          renderer: {
            pixelRatio: r?.getPixelRatio?.() ?? null,
            size: r
              ? { w: r.domElement?.width ?? 0, h: r.domElement?.height ?? 0 }
              : null,
            programs: r?.info?.programs?.length ?? null,
            drawCalls: info?.render?.calls ?? null,
            triangles: info?.render?.triangles ?? null,
            geometries: info?.memory?.geometries ?? null,
            textures: info?.memory?.textures ?? null,
          },
          scene: {
            meshes,
            instanced,
            instancedCapacity,
            transparent,
            materials: { physical, basic, standard },
            lights,
            reflectorVisible,
            reflectorTotal,
          },
          gpuMs: {
            median: med(gpuSamples),
            p95: pct(gpuSamples, 0.95),
            min: gpuSamples.length ? Math.min(...gpuSamples) : null,
            max: gpuSamples.length ? Math.max(...gpuSamples) : null,
            n: gpuSamples.length,
          },
          frameMs: {
            median: med(frameSamples),
            p95: pct(frameSamples, 0.95),
            min: frameSamples.length ? Math.min(...frameSamples) : null,
            max: frameSamples.length ? Math.max(...frameSamples) : null,
            n: frameSamples.length,
          },
        });
      }
    }
    requestAnimationFrame(tick);
  });
}

async function measureCell(page, url, settle) {
  console.log(`[perf] → ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(
    () => window.__cartRaveMainReady === true || window.__cartRave?.ready === true,
    undefined,
    { timeout: 120000 },
  );

  const hasHarness = await page.evaluate(() => Boolean(window.__cartRave));
  if (hasHarness) {
    await page.evaluate(async () => {
      const h = window.__cartRave;
      if (h?.ensureWorld) await h.ensureWorld();
    });
    await page
      .waitForFunction(() => window.__cartRave?.worldReady === true, undefined, { timeout: 120000 })
      .catch(() => console.warn("[perf] worldReady timeout"));
    await page.evaluate(() => {
      try {
        localStorage.setItem("cartRaveHowToSeen", "1");
      } catch {
        /* ignore */
      }
      const howto = document.getElementById("cr-howto-screen");
      if (howto) {
        howto.style.display = "none";
        howto.setAttribute("aria-hidden", "true");
      }
    });
    await page.evaluate(async (n) => {
      window.__cartRave?.applyCam?.();
      if (window.__cartRave?.settle) await window.__cartRave.settle(n);
    }, settle);
    await page.evaluate(async () => {
      window.__cartRave?.applyCam?.();
      await window.__cartRave?.settle?.(16);
    });
  } else {
    await sleep(4000);
  }

  // * Wait for DEV perf probe (scene/camera/composer attached in main.js).
  await page
    .waitForFunction(() => Boolean(window.__cartRavePerf?.renderer && window.__cartRavePerf?.scene), undefined, {
      timeout: 15000,
    })
    .catch(() => console.warn("[perf] __cartRavePerf incomplete — GPU timing may be limited"));

  const result = await page.evaluate(measureInPage);
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = str(args.url) ?? "http://127.0.0.1:5173/";
  const settle = Number(str(args.settle) ?? 40);
  const width = Number(str(args.w) ?? 1280);
  const height = Number(str(args.h) ?? 720);
  const outPath = resolve(str(args.out) ?? `shots/perf-profile-${Date.now()}.json`);

  const levels = str(args.level)
    ? [str(args.level)]
    : ["classic", "backrooms", "zanzibar"];
  const presets = str(args.preset)
    ? [str(args.preset)]
    : ["low", "medium", "high"];

  /** @type {{ level: string, preset: string, ablate?: string, forcegpu?: string }[]} */
  const cells = [];
  for (const level of levels) {
    for (const preset of presets) {
      cells.push({ level, preset });
    }
  }
  // * Ablation cells only on classic high — the known GPU monster.
  if (!str(args.level) && !str(args.preset) && args.ablate !== "0") {
    cells.push({ level: "classic", preset: "high", ablate: "bloom" });
    cells.push({ level: "classic", preset: "high", ablate: "vhs" });
  }

  let serverProc = null;
  try {
    serverProc = await maybeStartDevServer(base, args);
  } catch (err) {
    console.warn("[perf] auto server:", err instanceof Error ? err.message : err);
  }

  const { chromium } = await ensurePlaywright();
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || undefined,
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));

  /** @type {object[]} */
  const rows = [];
  try {
    for (const cell of cells) {
      const url = cellUrl(base, cell);
      // eslint-disable-next-line no-await-in-loop
      const m = await measureCell(page, url, settle);
      const row = { ...cell, ...m, url };
      rows.push(row);
      const dc = m.renderer?.drawCalls;
      const tri = m.renderer?.triangles;
      const gpu = m.gpuMs?.median;
      const fr = m.frameMs?.median;
      console.log(
        `[perf] ${cell.level}/${cell.preset}${cell.ablate ? ` ablate=${cell.ablate}` : ""} ` +
          `draws=${dc} tris=${tri} gpuMed=${gpu?.toFixed?.(2) ?? "?"}ms frameMed=${fr?.toFixed?.(2) ?? "?"}ms ` +
          `refl=${m.scene?.reflectorVisible}/${m.scene?.reflectorTotal} spots=${m.scene?.lights?.spot} pts=${m.scene?.lights?.point}`,
      );
    }
  } finally {
    await browser.close();
    if (serverProc && !serverProc.killed) serverProc.kill();
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ when: new Date().toISOString(), width, height, rows }, null, 2));
  console.log(`[perf] wrote ${outPath}`);

  // * Rank by GPU median (classic high first expected).
  const ranked = rows
    .filter((r) => r.gpuMs?.median != null)
    .slice()
    .sort((a, b) => (b.gpuMs.median ?? 0) - (a.gpuMs.median ?? 0));
  console.log("\n=== Ranked by GPU median ms ===");
  for (const r of ranked) {
    console.log(
      `  ${(r.gpuMs.median ?? 0).toFixed(2).padStart(6)} ms  ${r.level}/${r.preset}` +
        `${r.ablate ? ` ablate=${r.ablate}` : ""}  draws=${r.renderer?.drawCalls} tris=${r.renderer?.triangles}`,
    );
  }
}

main().catch((e) => {
  console.error("[perf] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
