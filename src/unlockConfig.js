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
 * - **Test real locks in dev:** set localStorage `cartRaveDevUnlocks` = `"off"`
 *   (or `?devUnlocks=off` once — writes that key) then hard refresh
 * - **Force unlock in any build (incl. production):** `cartRaveDevUnlocks` = `"all"`
 *   (do not ship this to real players; prod builds ignore unless the key is set)
 * - **Query / set from console:** `window.CartClashDevUnlocks`
 *
 * Production builds never auto-unlock; only an explicit `"all"` key overrides.
 *
 * See also: `isDevUnlockAll()` in `src/stores/unlockStore.js`, `.cursorrules`.
 */

import { DEFAULT_CART_PATTERN } from "./cartPatternConfig.js";
import { DEFAULT_SUNGLASSES_STYLE } from "./cartThemeConfig.js";

/** localStorage key — values: `"all"` | `"off"` | absent */
export const DEV_UNLOCKS_STORAGE_KEY = "cartRaveDevUnlocks";

/** Lifetime KOs on Classic to unlock The Storerooms. */
const UNLOCK_BACKROOMS_KILLS = 15;
/** Lifetime KOs on Storerooms to unlock Zanzibar. */
const UNLOCK_ZANZIBAR_KILLS = 25;

/**
 * Pattern unlock table. `classic` is always free.
 * @type {Record<string, { free?: boolean, event?: string, goal?: number, hint: string }>}
 */
export const PATTERN_UNLOCKS = {
  classic: { free: true, hint: "Default look" },
  stripes: { event: "ko_void", goal: 10, hint: "10 knockouts" },
  checker: { event: "ko_npc", goal: 15, hint: "15 NPC knockouts" },
  dots: { event: "combo_t2", goal: 8, hint: "Reach RAMPAGE 8 times" },
  waves: { event: "combo_t3", goal: 5, hint: "Reach CARNAGE 5 times" },
  bolt: { event: "last_standing", goal: 3, hint: "3 Last Cart Standing wins" },
};

/**
 * Sunglasses unlock table. Silver Mirror is free.
 * @type {Record<string, { free?: boolean, event?: string, goal?: number, hint: string }>}
 */
export const SUNGLASSES_UNLOCKS = {
  silverMirror: { free: true, hint: "Default shades" },
  goldMirror: { event: "ko_void", goal: 20, hint: "20 knockouts" },
  blueMirror: { event: "spill", goal: 25, hint: "Cause 25 spills" },
  redMirror: { event: "sd_win", goal: 3, hint: "3 Sudden Death wins" },
  greenMirror: { event: "untouchable", goal: 1, hint: "Win without spilling" },
  purpleMirror: { event: "ko_aggressor", goal: 5, hint: "5 Aggressor knockouts" },
};

/** Custom hue slider unlock. */
export const CUSTOM_COLOR_UNLOCK = {
  event: "ko_void",
  goal: 40,
  hint: "40 knockouts",
};

/**
 * Level gates (menu solo/select). Invites can still load any level at runtime.
 * @type {Record<string, { free?: boolean, killsOnLevel?: string, goal?: number, label: string, hint: string }>}
 */
export const LEVEL_UNLOCKS = {
  classicRecord: {
    free: true,
    label: "Cart Rave",
    hint: "Always available",
  },
  backrooms: {
    killsOnLevel: "classicRecord",
    goal: UNLOCK_BACKROOMS_KILLS,
    label: "The Storerooms",
    hint: `${UNLOCK_BACKROOMS_KILLS} KOs on Cart Rave`,
  },
  zanzibar: {
    killsOnLevel: "backrooms",
    goal: UNLOCK_ZANZIBAR_KILLS,
    label: "Sundial Station",
    hint: `${UNLOCK_ZANZIBAR_KILLS} KOs on The Storerooms`,
  },
  testArena: { free: true, label: "Test Arena", hint: "Dev" },
};

export const FREE_PATTERN = DEFAULT_CART_PATTERN;
export const FREE_SUNGLASSES = DEFAULT_SUNGLASSES_STYLE;
export const FREE_LEVEL = "classicRecord";
