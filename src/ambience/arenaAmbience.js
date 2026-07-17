// arenaAmbience.js — per-arena ambient beds + reactive Cart Rave crowd + SD tension.
//
// Beds are script-generated loops (scripts/ambience/generate.mjs → public/sounds/ambience/)
// registered as AudioManager ambience (looping, gapless, SFX volume category, per-key
// tune-pane multipliers). Data-driven like the announcer pack: replace an opus file to
// re-skin an arena's atmosphere, no code change.
//
// Cart Rave (classicRecord) runs TWO layers: a murmur bed plus a "hype" crowd layer whose
// level tracks an excitement meter — KOs/combos/first blood bump it, and it decays back
// to murmur between moments. Other arenas are single-bed. Sudden Death fades a shared
// tension drone under any arena.

import * as AudioManager from "../audioManager.js";

/**
 * Arena id → ambience layer keys. Every quickplay arena needs a bed here —
 * contract-tested against shared/arenaPool.js so a new arena can't ship silent.
 * @type {Record<string, { bed: string, hype?: string }>}
 */
export const ARENA_AMBIENCE = {
  classicRecord: { bed: "classic_crowd_bed", hype: "classic_crowd_hype" },
  backrooms: { bed: "backrooms_bed" },
  zanzibar: { bed: "zanzibar_bed" },
};

/** Shared Sudden Death tension layer (any arena). */
const SD_TENSION_KEY = "sd_tension";

/**
 * Authored mix levels relative to the SFX category. Beds are RMS-matched at -18dB
 * (generate.mjs) so these are the whole per-bed mix; gameplay SFX sit well above.
 * Tune live via the dev SFX pane (AudioManager per-key multipliers stack on top).
 * @type {Record<string, number>}
 */
const BASE_VOLUMES = {
  classic_crowd_bed: 0.22,
  classic_crowd_hype: 0.5,
  backrooms_bed: 0.3,
  zanzibar_bed: 0.32,
  sd_tension: 0.4,
};

/**
 * Pure excitement meter: bump() on cool moments, exponential decay back to 0.
 * Time is injected so tests don't need fake timers.
 * @param {{ halfLifeMs?: number }} [opts]
 */
export function createExcitementMeter(opts = {}) {
  const halfLifeMs = opts.halfLifeMs ?? 3500;
  let level = 0;
  let stampMs = 0;
  const decayTo = (nowMs) => {
    if (nowMs > stampMs && level > 0) {
      level *= Math.pow(0.5, (nowMs - stampMs) / halfLifeMs);
      if (level < 0.005) level = 0;
    }
    stampMs = Math.max(stampMs, nowMs);
  };
  return {
    /** @param {number} amount @param {number} nowMs */
    bump(amount, nowMs) {
      decayTo(nowMs);
      level = Math.min(1, level + Math.max(0, amount));
      return level;
    },
    /** @param {number} nowMs */
    valueAt(nowMs) {
      decayTo(nowMs);
      return level;
    },
    reset() {
      level = 0;
      stampMs = 0;
    },
  };
}

// === module state ===

/** @type {string | null} Arena id whose beds are currently playing. */
let activeArenaId = null;
/** @type {ReturnType<typeof setInterval> | null} Hype-layer decay pusher. */
let hypeTickId = null;
let sdTensionActive = false;
const excitement = createExcitementMeter();

/** How often the decay glides the hype layer down between bumps. */
const HYPE_TICK_MS = 600;

/**
 * Register every bed with the AudioManager (preload:false — beds fetch at play entry).
 * Call once at boot after initAudioManager.
 * @param {(name: string) => string} soundUrl Resolver, same one main.js uses for SFX.
 */
export function initArenaAmbience(soundUrl) {
  const keys = new Set([
    ...Object.values(ARENA_AMBIENCE).flatMap((a) => [a.bed, a.hype]).filter(Boolean),
    SD_TENSION_KEY,
  ]);
  for (const key of keys) {
    AudioManager.registerAmbience(
      key,
      soundUrl(`ambience/${key}.opus`),
      BASE_VOLUMES[key] ?? 0.3,
    );
  }
}

/**
 * Start the beds for an arena (fades in). Stops any previous arena's beds first,
 * so quickplay rotation swaps can call this directly. No-op for unknown ids
 * (testArena stays silent by design).
 * @param {string | null | undefined} arenaId
 */
export function startArenaAmbience(arenaId) {
  stopArenaAmbience();
  const layers = arenaId ? ARENA_AMBIENCE[arenaId] : null;
  if (!layers) return;
  activeArenaId = arenaId ?? null;
  AudioManager.playAmbience(layers.bed, { fadeMs: 1600 });
  if (layers.hype) {
    // Hype layer idles at level 0 until excitement pushes it up.
    AudioManager.playAmbience(layers.hype, { fadeMs: 200, level: 0 });
    hypeTickId = setInterval(() => {
      AudioManager.setAmbienceLevel(
        layers.hype,
        excitement.valueAt(nowMs()),
        HYPE_TICK_MS,
      );
    }, HYPE_TICK_MS);
  }
}

/** Stop all beds + tension and reset the crowd (menu return, pre-swap). */
export function stopArenaAmbience() {
  if (hypeTickId != null) {
    clearInterval(hypeTickId);
    hypeTickId = null;
  }
  excitement.reset();
  sdTensionActive = false;
  activeArenaId = null;
  AudioManager.stopAllAmbience(700);
}

/**
 * Something cool happened — the Cart Rave crowd reacts (louder + crazier, then decays).
 * Cheap no-op on arenas without a hype layer.
 * @param {number} amount 0..1-ish (KO ~0.45, +0.12/combo tier, first blood ×1.3, SD entry 0.9).
 */
export function bumpCrowdExcitement(amount) {
  const layers = activeArenaId ? ARENA_AMBIENCE[activeArenaId] : null;
  if (!layers?.hype) return;
  const level = excitement.bump(amount, nowMs());
  // Fast attack — the roar should land with the moment, not the next tick.
  AudioManager.setAmbienceLevel(layers.hype, level, 220);
}

/**
 * Fade the Sudden Death tension drone in/out. Idempotent; cleared by stopArenaAmbience.
 * @param {boolean} active
 */
export function setSuddenDeathTension(active) {
  if (active === sdTensionActive) return;
  sdTensionActive = active;
  if (active) {
    AudioManager.playAmbience(SD_TENSION_KEY, { fadeMs: 1500 });
  } else {
    AudioManager.stopAmbience(SD_TENSION_KEY, 900);
  }
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
