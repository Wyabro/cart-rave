/**
 * buildFreshness.js — answer one question with certainty: "is this tab running the
 * bundle that is deployed right now, or a stale cached one?"
 *
 * WHY THIS EXISTS: 2026-07-21 — a full playtest was judged ("countdown feels worse,
 * perf feels worse") on browsers that had silently served an OLD cached `index-*.js`.
 * The deployed fixes never executed. F8 captures looked normal because the baked-in
 * build sha was real — just old. Nothing surfaced the mismatch. This module makes a
 * stale cache impossible to miss: a boot banner, `window.__ccBuild`, and a
 * `buildFreshness` block stamped into every F8 capture.
 *
 * HOW: the loaded entry chunk is identified by the content-hashed filename in the
 * current document's module <script> (`assets/index-<hash>.js`). The live-deployed
 * filename is read by fetching `/` with caches bypassed. Different hash ⇒ a newer
 * deploy exists that this tab has not loaded ⇒ stale.
 *
 * Guard-safe: no top-level side effects, degrades to { checked:false } without a
 * DOM / fetch (unit tests, tools, dev server where the entry is /src/main.js).
 * No imports beyond buildInfo — cycle-safe from anywhere.
 */

import { readBuildInfo } from "./buildInfo.js";

/** Content-hashed prod entry: `.../assets/index-C1uycOJX.js` → capture group `C1uycOJX`. */
const BUNDLE_RE = /index-([A-Za-z0-9_-]{6,})\.js/;

/** @typedef {{ checked: boolean, ok?: boolean, stale?: boolean, loaded?: string|null, live?: string|null, error?: string, at?: string }} Freshness */

/** @type {Freshness} */
let cached = { checked: false };

/**
 * Filename hash of the bundle THIS tab actually loaded, read from the live DOM
 * (not import.meta — the entry chunk, whatever it split into, is the <script> tag).
 * Returns null in dev (entry is /src/main.js, no content hash) → staleness is skipped.
 * @returns {string | null}
 */
function loadedBundleHash() {
  try {
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      const m = BUNDLE_RE.exec(/** @type {HTMLScriptElement} */ (s).getAttribute("src") || "");
      if (m) return m[1];
    }
  } catch {
    /* no DOM */
  }
  return null;
}

/**
 * Filename hash of the bundle the server would serve RIGHT NOW. Bypasses every cache
 * layer (no-store + cache-bust query) so a Service-Worker / disk-cache copy can't lie.
 * @returns {Promise<string | null>}
 */
async function fetchLiveBundleHash() {
  try {
    const res = await fetch(`/?_freshness=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const m = BUNDLE_RE.exec(html);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Compare loaded vs live and cache the verdict. Cheap to call repeatedly (one small
 * fetch of `/`). Never throws — worst case returns { checked:true, ok:false }.
 * @returns {Promise<Freshness>}
 */
export async function refreshBuildFreshness() {
  const loaded = loadedBundleHash();
  const live = await fetchLiveBundleHash();
  // Dev (loaded===null) or a failed fetch (live===null): can't compare — report, don't cry wolf.
  if (!loaded || !live) {
    cached = { checked: true, ok: false, loaded, live, at: new Date().toISOString() };
    return cached;
  }
  cached = { checked: true, ok: true, stale: loaded !== live, loaded, live, at: new Date().toISOString() };
  return cached;
}

/** Last cached verdict without a network round-trip (for the synchronous F8 bundle). @returns {Freshness} */
export function getCachedFreshness() {
  return cached;
}

/**
 * Boot banner: log the loaded build immediately (so it's on screen the instant DevTools
 * opens), expose `window.__ccBuild`, then async-verify against the deploy and shout if stale.
 */
export function logBuildBanner() {
  const b = readBuildInfo();
  const sha = b?.sha ?? "unknown";
  const builtAt = b?.builtAt ?? "?";
  const loaded = loadedBundleHash();
  try {
    /** @type {any} */ (window).__ccBuild = { sha, builtAt, bundle: loaded, freshness: () => getCachedFreshness() };
  } catch {
    /* no window */
  }
  // eslint-disable-next-line no-console
  console.info(
    `%c[build] ${sha}%c  bundle=${loaded ?? "dev"}  built=${builtAt}`,
    "font-weight:bold;color:#4ec9b0",
    "color:inherit",
  );

  refreshBuildFreshness().then((f) => {
    if (f.ok && f.stale) {
      // eslint-disable-next-line no-console
      console.warn(
        `%c[build] ⚠ STALE CACHE%c  this tab is running index-${f.loaded}.js but the server now serves index-${f.live}.js.\n` +
          `Hard-reload (Ctrl+Shift+R) — or empty cache + reload from DevTools — before trusting any playtest or F8 from this tab.`,
        "font-weight:bold;color:#f14c4c",
        "color:inherit",
      );
    } else if (f.ok && !f.stale) {
      // eslint-disable-next-line no-console
      console.info(`%c[build] ✓ up to date%c  (matches deployed index-${f.live}.js)`, "color:#4ec9b0", "color:inherit");
    }
    // f.ok === false (dev server / offline): stay quiet, nothing meaningful to compare.
  });
}
