/**
 * unlockStore.js — Lifetime unlock progress + grants for cosmetics and levels.
 *
 * ## Dev unlock override
 * @see unlockConfig.js header — `isDevUnlockAll()` below. In `import.meta.env.DEV`,
 * all gates open unless localStorage `cartRaveDevUnlocks` === `"off"`.
 */
import { createStore } from "zustand/vanilla";
import { STORAGE_KEYS, storageGetJson, storageSetJson, storageGet, storageSet } from "../utils/storage.js";
import {
  PATTERN_UNLOCKS,
  SUNGLASSES_UNLOCKS,
  CUSTOM_COLOR_UNLOCK,
  LEVEL_UNLOCKS,
  FREE_PATTERN,
  FREE_SUNGLASSES,
  FREE_LEVEL,
  DEV_UNLOCKS_STORAGE_KEY,
} from "../unlockConfig.js";

// * URL one-shot: ?devUnlocks=all|off writes localStorage then can be bookmarked by agents.
if (typeof window !== "undefined") {
  try {
    const raw = new URLSearchParams(window.location.search || "").get("devUnlocks");
    if (raw === "all" || raw === "off") {
      storageSet(DEV_UNLOCKS_STORAGE_KEY, raw);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Whether progression gates should be ignored (everything unlocked).
 *
 * | Build | localStorage `cartRaveDevUnlocks` | Result |
 * |-------|-----------------------------------|--------|
 * | DEV   | absent / `"all"`                  | unlock all |
 * | DEV   | `"off"`                           | real gates |
 * | PROD  | absent                            | real gates |
 * | PROD  | `"all"`                           | unlock all (manual override only) |
 *
 * @returns {boolean}
 */
function isDevUnlockAll() {
  const flag = storageGet(DEV_UNLOCKS_STORAGE_KEY, null);
  if (flag === "all") return true;
  if (flag === "off") return false;
  return Boolean(import.meta.env.DEV);
}

if (typeof window !== "undefined") {
  // * Agent-facing console API — do not remove without updating .cursorrules / unlockConfig docs.
  window.CartClashDevUnlocks = {
    /** @returns {boolean} */
    isActive: () => isDevUnlockAll(),
    /** Unlock everything (persists). */
    enableAll: () => {
      storageSet(DEV_UNLOCKS_STORAGE_KEY, "all");
      console.info("[CartClashDevUnlocks] all cosmetics/levels unlocked — hard refresh if UI already open");
    },
    /** Use real progression gates even in Vite dev. */
    enableGates: () => {
      storageSet(DEV_UNLOCKS_STORAGE_KEY, "off");
      console.info("[CartClashDevUnlocks] real unlock gates ON — hard refresh if UI already open");
    },
    /** Clear override (dev → unlock all; prod → real gates). */
    clear: () => {
      try {
        localStorage.removeItem(DEV_UNLOCKS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      console.info("[CartClashDevUnlocks] override cleared — hard refresh if UI already open");
    },
    help: () => {
      console.info(
        "[CartClashDevUnlocks] DEV defaults to unlock-all.\n" +
          "  CartClashDevUnlocks.enableGates()  // test real locks in dev\n" +
          "  CartClashDevUnlocks.enableAll()    // force unlock\n" +
          "  CartClashDevUnlocks.clear()        // reset override\n" +
          "  ?devUnlocks=off | ?devUnlocks=all  // URL one-shot → localStorage",
      );
    },
  };
}

/**
 * @typedef {{
 *   events: Record<string, number>,
 *   killsByLevel: Record<string, number>,
 *   patterns: Record<string, boolean>,
 *   sunglasses: Record<string, boolean>,
 *   customColor: boolean,
 *   levels: Record<string, boolean>,
 * }} UnlockState
 */

/** @returns {UnlockState} */
function emptyState() {
  return {
    events: {},
    killsByLevel: {
      classicRecord: 0,
      backrooms: 0,
      zanzibar: 0,
    },
    patterns: { [FREE_PATTERN]: true },
    sunglasses: { [FREE_SUNGLASSES]: true },
    customColor: false,
    levels: { classicRecord: true, testArena: true },
  };
}

/**
 * @param {unknown} raw
 * @returns {UnlockState}
 */
function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.events && typeof o.events === "object") {
    base.events = { ...base.events, .../** @type {Record<string, number>} */ (o.events) };
  }
  if (o.killsByLevel && typeof o.killsByLevel === "object") {
    base.killsByLevel = {
      ...base.killsByLevel,
      .../** @type {Record<string, number>} */ (o.killsByLevel),
    };
  }
  if (o.patterns && typeof o.patterns === "object") {
    base.patterns = { ...base.patterns, .../** @type {Record<string, boolean>} */ (o.patterns) };
  }
  if (o.sunglasses && typeof o.sunglasses === "object") {
    base.sunglasses = {
      ...base.sunglasses,
      .../** @type {Record<string, boolean>} */ (o.sunglasses),
    };
  }
  if (typeof o.customColor === "boolean") base.customColor = o.customColor;
  if (o.levels && typeof o.levels === "object") {
    base.levels = { ...base.levels, .../** @type {Record<string, boolean>} */ (o.levels) };
  }
  base.patterns[FREE_PATTERN] = true;
  base.sunglasses[FREE_SUNGLASSES] = true;
  base.levels.classicRecord = true;
  base.levels.testArena = true;
  return base;
}

function loadPersisted() {
  return normalizeState(storageGetJson(STORAGE_KEYS.unlocks, null));
}

/**
 * @param {UnlockState} state
 */
function persist(state) {
  storageSetJson(STORAGE_KEYS.unlocks, {
    events: state.events,
    killsByLevel: state.killsByLevel,
    patterns: state.patterns,
    sunglasses: state.sunglasses,
    customColor: state.customColor,
    levels: state.levels,
  });
}

/** @type {Array<(msg: string) => void>} */
const unlockListeners = [];

/**
 * @param {(msg: string) => void} fn
 * @returns {() => void}
 */
export function onUnlockGranted(fn) {
  unlockListeners.push(fn);
  return () => {
    const i = unlockListeners.indexOf(fn);
    if (i >= 0) unlockListeners.splice(i, 1);
  };
}

/**
 * @param {string} msg
 */
function notifyUnlock(msg) {
  for (const fn of unlockListeners) {
    try {
      fn(msg);
    } catch {
      /* ignore */
    }
  }
}

/**
 * "goldMirror" → "Gold Mirror" — grant messages are player-facing (HUD + menu toasts).
 * @param {string} id
 * @returns {string}
 */
function humanizeUnlockId(id) {
  return id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Recompute permanent grants from lifetime counters (idempotent).
 * @param {UnlockState} state
 * @returns {{ state: UnlockState, granted: string[] }}
 */
function evaluateGrants(state) {
  const granted = [];
  const next = {
    ...state,
    patterns: { ...state.patterns },
    sunglasses: { ...state.sunglasses },
    levels: { ...state.levels },
    events: { ...state.events },
    killsByLevel: { ...state.killsByLevel },
  };

  for (const [id, def] of Object.entries(PATTERN_UNLOCKS)) {
    if (def.free || next.patterns[id]) continue;
    if (def.event && (next.events[def.event] || 0) >= (def.goal || 0)) {
      next.patterns[id] = true;
      granted.push(`${humanizeUnlockId(id)} pattern unlocked!`);
    }
  }

  for (const [id, def] of Object.entries(SUNGLASSES_UNLOCKS)) {
    if (def.free || next.sunglasses[id]) continue;
    if (def.event && (next.events[def.event] || 0) >= (def.goal || 0)) {
      next.sunglasses[id] = true;
      granted.push(`${humanizeUnlockId(id)} shades unlocked!`);
    }
  }

  if (!next.customColor) {
    const ev = CUSTOM_COLOR_UNLOCK.event;
    if ((next.events[ev] || 0) >= CUSTOM_COLOR_UNLOCK.goal) {
      next.customColor = true;
      granted.push("Custom color unlocked!");
    }
  }

  for (const [levelId, def] of Object.entries(LEVEL_UNLOCKS)) {
    if (def.free || next.levels[levelId]) continue;
    if (def.killsOnLevel) {
      const n = next.killsByLevel[def.killsOnLevel] || 0;
      if (n >= (def.goal || 0)) {
        next.levels[levelId] = true;
        granted.push(`${def.label} unlocked!`);
      }
    }
  }

  return { state: next, granted };
}

export const unlockStore = createStore((set, get) => ({
  ...loadPersisted(),

  /**
   * @param {string} event
   * @param {number} [amount]
   */
  recordEvent: (event, amount = 1) => {
    if (!event || amount <= 0) return;
    const prev = get();
    const events = {
      ...prev.events,
      [event]: (prev.events[event] || 0) + amount,
    };
    const { state: next, granted } = evaluateGrants({ ...prev, events });
    set(next);
    persist(next);
    for (const msg of granted) notifyUnlock(msg);
  },

  /**
   * @param {string} levelId
   * @param {number} [amount]
   */
  recordKillOnLevel: (levelId, amount = 1) => {
    if (!levelId || amount <= 0) return;
    const prev = get();
    const killsByLevel = {
      ...prev.killsByLevel,
      [levelId]: (prev.killsByLevel[levelId] || 0) + amount,
    };
    const { state: next, granted } = evaluateGrants({ ...prev, killsByLevel });
    set(next);
    persist(next);
    for (const msg of granted) notifyUnlock(msg);
  },

  /** Re-run grants after load (handles raised/lowered goals). */
  reevaluate: () => {
    const { state: next, granted } = evaluateGrants(get());
    set(next);
    persist(next);
    for (const msg of granted) notifyUnlock(msg);
  },
}));

// Ensure free unlocks + catch-up grants on boot.
unlockStore.getState().reevaluate();

// ─── Query helpers ───────────────────────────────────────────────────────────

/**
 * @param {string} patternId
 * @returns {boolean}
 */
export function isPatternUnlocked(patternId) {
  if (isDevUnlockAll()) return true;
  const def = PATTERN_UNLOCKS[patternId];
  if (!def || def.free) return true;
  return Boolean(unlockStore.getState().patterns[patternId]);
}

/**
 * @param {string} styleId
 * @returns {boolean}
 */
export function isSunglassesUnlocked(styleId) {
  if (isDevUnlockAll()) return true;
  const def = SUNGLASSES_UNLOCKS[styleId];
  if (!def || def.free) return true;
  return Boolean(unlockStore.getState().sunglasses[styleId]);
}

/** @returns {boolean} */
export function isCustomColorUnlocked() {
  if (isDevUnlockAll()) return true;
  return Boolean(unlockStore.getState().customColor);
}

/**
 * @param {string} levelId
 * @returns {boolean}
 */
export function isLevelUnlocked(levelId) {
  if (isDevUnlockAll()) return true;
  const def = LEVEL_UNLOCKS[levelId];
  if (!def || def.free) return true;
  return Boolean(unlockStore.getState().levels[levelId]);
}

/**
 * @param {string} patternId
 * @returns {{ unlocked: boolean, progress: number, goal: number, hint: string }}
 */
export function getPatternUnlockStatus(patternId) {
  const def = PATTERN_UNLOCKS[patternId] || { free: true, hint: "" };
  if (isDevUnlockAll() || def.free) {
    return { unlocked: true, progress: 1, goal: 1, hint: isDevUnlockAll() ? "Dev unlock all" : def.hint };
  }
  const progress = unlockStore.getState().events[def.event || ""] || 0;
  const goal = def.goal || 1;
  return {
    unlocked: isPatternUnlocked(patternId),
    progress: Math.min(progress, goal),
    goal,
    hint: def.hint,
  };
}

/**
 * @param {string} styleId
 * @returns {{ unlocked: boolean, progress: number, goal: number, hint: string }}
 */
export function getSunglassesUnlockStatus(styleId) {
  const def = SUNGLASSES_UNLOCKS[styleId] || { free: true, hint: "" };
  if (isDevUnlockAll() || def.free) {
    return { unlocked: true, progress: 1, goal: 1, hint: isDevUnlockAll() ? "Dev unlock all" : def.hint };
  }
  const progress = unlockStore.getState().events[def.event || ""] || 0;
  const goal = def.goal || 1;
  return {
    unlocked: isSunglassesUnlocked(styleId),
    progress: Math.min(progress, goal),
    goal,
    hint: def.hint,
  };
}

/** @returns {{ unlocked: boolean, progress: number, goal: number, hint: string }} */
export function getCustomColorUnlockStatus() {
  if (isDevUnlockAll()) {
    return { unlocked: true, progress: 1, goal: 1, hint: "Dev unlock all" };
  }
  const progress = unlockStore.getState().events[CUSTOM_COLOR_UNLOCK.event] || 0;
  const goal = CUSTOM_COLOR_UNLOCK.goal;
  return {
    unlocked: isCustomColorUnlocked(),
    progress: Math.min(progress, goal),
    goal,
    hint: CUSTOM_COLOR_UNLOCK.hint,
  };
}

/**
 * @param {string} levelId
 * @returns {{ unlocked: boolean, progress: number, goal: number, hint: string }}
 */
export function getLevelUnlockStatus(levelId) {
  const def = LEVEL_UNLOCKS[levelId];
  if (isDevUnlockAll() || !def || def.free) {
    return {
      unlocked: true,
      progress: 1,
      goal: 1,
      hint: isDevUnlockAll() ? "Dev unlock all" : (def?.hint || ""),
    };
  }
  const progress = unlockStore.getState().killsByLevel[def.killsOnLevel || ""] || 0;
  const goal = def.goal || 1;
  return {
    unlocked: isLevelUnlocked(levelId),
    progress: Math.min(progress, goal),
    goal,
    hint: def.hint,
  };
}

/**
 * Clamp a loaded customization payload to unlocked options.
 * @param {{ colorMode?: string, pattern?: string, sunglassesStyle?: string }} c
 * @returns {{ colorMode?: string, pattern?: string, sunglassesStyle?: string }}
 */
export function clampCustomizationToUnlocks(c) {
  const out = { ...c };
  if (out.colorMode === "custom" && !isCustomColorUnlocked()) {
    out.colorMode = "preset";
  }
  if (out.pattern && !isPatternUnlocked(out.pattern)) {
    out.pattern = FREE_PATTERN;
  }
  if (out.sunglassesStyle && !isSunglassesUnlocked(out.sunglassesStyle)) {
    out.sunglassesStyle = FREE_SUNGLASSES;
  }
  return out;
}

/**
 * @param {string | null | undefined} levelId
 * @returns {string}
 */
export function clampLevelIdToUnlocks(levelId) {
  if (levelId && isLevelUnlocked(levelId)) return levelId;
  return FREE_LEVEL;
}

export const UnlockTracker = {
  recordEvent: (event, amount = 1) => unlockStore.getState().recordEvent(event, amount),
  recordKillOnLevel: (levelId, amount = 1) =>
    unlockStore.getState().recordKillOnLevel(levelId, amount),
};
