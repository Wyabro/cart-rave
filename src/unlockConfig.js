/**
 * unlockConfig.js — Permanent unlock goals for cosmetics + levels.
 * Progress is lifetime (not daily rotation). Events match ChallengeTracker event ids.
 *
 * ## Dev unlock override (AI agents / local testing)
 *
 * In Vite **development** builds (`import.meta.env.DEV`), all cosmetics and levels
 * are treated as unlocked by default so agents are not blocked by progression gates.
 *
 * - **Default (dev):** everything unlocked
 * - **Test real locks (any build, incl. production):** set localStorage
 *   `cartRaveDevUnlocks` = `"off"`, or `?devUnlocks=off` once — that URL lever works
 *   in production on purpose, because FTUE playtests run against a prod build
 * - **Force unlock in any build (incl. production):** `cartRaveDevUnlocks` = `"all"`,
 *   set **manually** — localStorage or `window.CartClashDevUnlocks.enableAll()`
 * - **`?devUnlocks=all` is DEV-only** (SEC-UNLOCK-1). Ungated it made
 *   `…/?devUnlocks=all` a shareable link that permanently unlocked everything for
 *   whoever clicked it. See `resolveDevUnlockParam` below.
 * - **Query / set from console:** `window.CartClashDevUnlocks`
 *
 * Production builds never auto-unlock; only an explicit `"all"` key overrides, and no
 * URL can write that key in production.
 *
 * See also: `isDevUnlockAll()` in `src/stores/unlockStore.js`, `.cursorrules`.
 */

import { DEFAULT_CART_PATTERN } from "./carts/cartPatternConfig.js";
import { DEFAULT_SUNGLASSES_STYLE } from "./carts/cartThemeConfig.js";
import { ARENA_CATALOG } from "./levels/arenaCatalog.js";
import { PROGRESSION_EVENTS } from "./progression/eventIds.js";

/** localStorage key — values: `"all"` | `"off"` | absent */
export const DEV_UNLOCKS_STORAGE_KEY = "cartRaveDevUnlocks";

/**
 * SEC-UNLOCK-1 — decide what a `?devUnlocks=` URL should write to localStorage.
 *
 * The two directions are deliberately asymmetric:
 * - `off` **removes** privileges, so it is harmless from a stranger's link and stays
 *   available in every build — production FTUE playtests require it
 *   (docs/playtest/README.md).
 * - `all` **grants** privileges. Ungated it made `…/?devUnlocks=all` a shareable link
 *   that permanently unlocked everything, so it is now DEV-only. The manual localStorage
 *   key and `window.CartClashDevUnlocks` still work in production by design.
 *
 * `isDev` is a parameter rather than an `import.meta.env.DEV` read in here on purpose:
 * vitest runs with DEV true, so reading it internally would make the production branch
 * untestable.
 *
 * @param {string} search Full `location.search` (leading `?` and other params are fine).
 * @param {boolean} isDev Pass `import.meta.env.DEV` from the caller.
 * @returns {"all" | "off" | null} Value to persist, or null to leave storage untouched.
 */
export function resolveDevUnlockParam(search, isDev) {
  const raw = new URLSearchParams(search || "").get("devUnlocks");
  if (raw === "off") return "off";
  if (raw === "all") return isDev ? "all" : null;
  return null;
}

/**
 * Pattern unlock table. `classic` is always free.
 * @type {Record<string, { free?: boolean, event?: string, goal?: number, hint: string }>}
 */
export const PATTERN_UNLOCKS = {
  classic: { free: true, hint: "Default look" },
  stripes: { free: true, hint: "Default pattern" },
  checker: { free: true, hint: "Default pattern" },
  // * combo_t2 fires at comboTier 2 = SAVAGE (config.js combos table), not RAMPAGE.
  dots: { event: PROGRESSION_EVENTS.COMBO_T2, goal: 8, hint: "Reach SAVAGE 8 times" },
  waves: { event: PROGRESSION_EVENTS.COMBO_T3, goal: 5, hint: "Reach CARNAGE 5 times" },
  bolt: { event: PROGRESSION_EVENTS.LAST_STANDING, goal: 3, hint: "3 Last Cart Standing wins" },
  honeycomb: { event: PROGRESSION_EVENTS.KO_VOID, goal: 10, hint: "10 KOs" },
  diamond: { event: PROGRESSION_EVENTS.KO_NPC, goal: 15, hint: "15 NPC KOs" },
  cubes: { event: PROGRESSION_EVENTS.KO_VOID, goal: 50, hint: "50 KOs" },
};

/**
 * Sunglasses unlock table. Silver Mirror is free.
 * @type {Record<string, { free?: boolean, event?: string, goal?: number, hint: string }>}
 */
export const SUNGLASSES_UNLOCKS = {
  silverMirror: { free: true, hint: "Default shades" },
  goldMirror: { event: PROGRESSION_EVENTS.KO_VOID, goal: 20, hint: "20 KOs" },
  blueMirror: { event: PROGRESSION_EVENTS.SPILL, goal: 25, hint: "Cause 25 spills" },
  redMirror: { event: PROGRESSION_EVENTS.SUDDEN_DEATH_WIN, goal: 3, hint: "3 Sudden Death wins" },
  greenMirror: { event: PROGRESSION_EVENTS.UNTOUCHABLE, goal: 1, hint: "Win without spilling" },
  purpleMirror: { event: PROGRESSION_EVENTS.KO_AGGRESSOR, goal: 5, hint: "5 Aggressor KOs" },
  obsidianMirror: { event: PROGRESSION_EVENTS.ROUND_COMPLETE, goal: 10, hint: "Finish 10 rounds" },
  hazardMirror: { event: PROGRESSION_EVENTS.ROUND_WIN, goal: 5, hint: "5 round wins" },
  pearlMirror: { event: PROGRESSION_EVENTS.ROUND_SCORED, goal: 10, hint: "Score in 10 rounds" },
};

/** Custom hue slider unlock. */
export const CUSTOM_COLOR_UNLOCK = {
  event: PROGRESSION_EVENTS.KO_VOID,
  goal: 40,
  hint: "40 KOs",
};

/**
 * Level gates (menu solo/select). Invites can still load any level at runtime.
 * @type {Record<string, { free?: boolean, killsOnLevel?: string, goal?: number, label: string, hint: string }>}
 */
export const LEVEL_UNLOCKS = Object.fromEntries(
  ARENA_CATALOG.map((arena) => [
    arena.id,
    { ...arena.unlock, label: arena.displayName },
  ]),
);

export const FREE_PATTERN = DEFAULT_CART_PATTERN;
export const FREE_SUNGLASSES = DEFAULT_SUNGLASSES_STYLE;
/**
 * The arena every player has from a cold install — the fallback clampLevelIdToUnlocks
 * drops to when a saved selection is locked. Must stay in step with whichever catalog
 * entry carries `unlock.free` (UNLOCK-ORDER-1 moved that from Cart Rave to Sundial).
 */
export const FREE_LEVEL = "zanzibar";
