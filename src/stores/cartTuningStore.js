// cartTuningStore.js — Zustand store for rave GLTF cart visual/proportion tuning.
// Replaces the plain mutable `raveGltfTuning` object from cartRaveGltf.js.
//
// Architecture note: Tweakpane v4 `addBinding()` mutates bound objects by assignment.
// We use `createStore` (vanilla) instead of `create` so the state object is NOT frozen,
// allowing Tweakpane to mutate it directly while the store still acts as the canonical
// owner and reset-source.

import { createStore } from "zustand/vanilla";

// --- Defaults (inlined to avoid circular import with cartRaveGltf.js) ---

/**
 * Canonical defaults — must match `RAVE_GLTF_TUNING_DEFAULTS` in `cartRaveGltf.js`.
 * @type {{
 *   scale: number,
 *   yOffset: number,
 *   bodyScale: number,
 *   bodyYDrop: number,
 *   cornerInset: number,
 *   cornerInsetFracX: number,
 *   cornerInsetFracZ: number,
 *   casterOffsetX: number,
 *   casterOffsetZ: number,
 *   casterStanceScaleX: number,
 *   casterStanceScaleZ: number,
 *   swivelMaxAngleDeg: number,
 *   swivelDamping: number,
 *   steeringInfluence: number,
 *   frontSteerMul: number,
 *   rearSteerMul: number,
 *   yawSteerBlend: number,
 *   turnSteerDamping: number,
 *   frontAxleRigid: boolean,
 *   frontTurnSteerDamping: number,
 *   frontAxleSign: number,
 *   frontPivotYOffset: number,
 *   frontPivotXOffset: number,
 *   frontPivotZOffset: number,
 *   rearSteerMinOmega: number,
 *   rearSteerFullOmega: number,
 *   trailBlend: number,
 *   casterCoordinationLog: boolean,
 *   straightYawDeadzone: number,
 *   turnEngageOmega: number,
 *   turnReleaseOmega: number,
 *   straightRestEpsilon: number,
 *   straightYawSmoothing: number,
 *   restReturnDamping: number,
 *   straightCruiseMinSpeed: number,
 *   travelHeadingSmoothing: number,
 *   casterPivotYOffset: number,
 *   casterPivotXOffset: number,
 *   casterPivotZOffset: number,
 *   casterPivotCorner: {
 *     frontRight: { x: number, y: number, z: number },
 *     frontLeft: { x: number, y: number, z: number },
 *     backLeft: { x: number, y: number, z: number },
 *     backRight: { x: number, y: number, z: number },
 *   },
 * }}
 */
const TUNING_DEFAULTS = {
  scale: 2.25,
  yOffset: -1.195,
  bodyScale: 1.2,
  bodyYDrop: 0.085,
  cornerInset: 0.015,
  cornerInsetFracX: 0.25,
  cornerInsetFracZ: 0.06,
  casterOffsetX: -0.024,
  casterOffsetZ: 0,
  casterStanceScaleX: 0.925,
  casterStanceScaleZ: 0.99,
  swivelMaxAngleDeg: 135,
  swivelDamping: 0.28,
  steeringInfluence: 0.6,
  frontSteerMul: 0.15,
  rearSteerMul: 0.12,
  yawSteerBlend: 1.0,
  turnSteerDamping: 0.52,
  frontAxleRigid: true,
  frontTurnSteerDamping: 0.72,
  frontAxleSign: 1,
  frontPivotYOffset: 0,
  frontPivotXOffset: 0,
  frontPivotZOffset: 0,
  rearSteerMinOmega: 0.28,
  rearSteerFullOmega: 0.5,
  trailBlend: 0,
  casterCoordinationLog: false,
  straightYawDeadzone: 0.12,
  turnEngageOmega: 0.22,
  turnReleaseOmega: 0.08,
  straightRestEpsilon: 0.02,
  straightYawSmoothing: 0.9,
  restReturnDamping: 0.1,
  straightCruiseMinSpeed: 0.28,
  travelHeadingSmoothing: 0.82,
  casterPivotYOffset: -0.03,
  casterPivotXOffset: -0.025,
  casterPivotZOffset: 0,
  casterPivotCorner: {
    frontRight: { x: 0, y: 0, z: 0 },
    frontLeft: { x: 0, y: 0, z: 0 },
    backLeft: { x: 0, y: 0, z: 0 },
    backRight: { x: 0, y: 0, z: 0 },
  },
};

// --- Helpers ---

/** Deep-clone the tuning defaults. */
function cloneDefaults() {
  return JSON.parse(JSON.stringify(TUNING_DEFAULTS));
}

// --- Store & Mutable Proxy Sync ---

/**
 * Mutable live tuning object initialized with defaults.
 * Tweakpane bindings mutate this object directly via `addBinding()`.
 * High-frequency per-frame animation reads access this object directly for max performance.
 */
export const raveGltfTuning = cloneDefaults();

/**
 * Vanilla Zustand store synchronized with `raveGltfTuning`.
 */
export const cartTuningStore = createStore((set) => ({
  ...raveGltfTuning,

  /** Resets every tuning key to its default value in-place and in store. */
  resetAll: () => {
    const defaults = cloneDefaults();
    // 1. Mutate live object in-place so Tweakpane & runtime references stay valid
    Object.assign(raveGltfTuning, defaults);
    // 2. Synchronize Zustand store state
    set(defaults);
  },

  /**
   * Resets the given top-level keys to defaults in a single batched pass.
   * Handles `casterPivotCorner` and `casterPivotCorner.<label>` nested cases.
   *
   * @param {readonly string[]} keys
   */
  resetKeys: (keys) => {
    const defaults = cloneDefaults();
    const updates = {};

    for (const key of keys) {
      if (key === "casterPivotCorner") {
        raveGltfTuning.casterPivotCorner = cloneDefaults().casterPivotCorner;
        updates.casterPivotCorner = raveGltfTuning.casterPivotCorner;
        continue;
      }

      if (key.startsWith("casterPivotCorner.")) {
        const label = key.slice("casterPivotCorner.".length);
        const cornerDefaults = defaults.casterPivotCorner[label];
        if (cornerDefaults) {
          if (!raveGltfTuning.casterPivotCorner) {
            raveGltfTuning.casterPivotCorner = cloneDefaults().casterPivotCorner;
          }
          // * Mutate in-place so Tweakpane bindings (which reference this exact
          // * object) stay connected. Replacement would orphan them.
          Object.assign(raveGltfTuning.casterPivotCorner[label], cornerDefaults);
          updates.casterPivotCorner = {
            ...raveGltfTuning.casterPivotCorner,
          };
        }
        continue;
      }

      // Top-level scalar
      if (key in defaults) {
        raveGltfTuning[key] = defaults[key];
        updates[key] = defaults[key];
      }
    }

    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },

  /**
   * Programmatic setter for a single key to keep live snapshot and store in sync.
   * @param {string} key
   * @param {any} val
   */
  syncKey: (key, val) => {
    raveGltfTuning[key] = val;
    set({ [key]: val });
  },

  /** Returns a deep snapshot of the current live tuning state (for logging/export). */
  getRaw: () => JSON.parse(JSON.stringify(raveGltfTuning)),
}));

