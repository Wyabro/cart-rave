// raveGltfCartTweakpane.js — Tweakpane replacement for cart debug folder (dev-only, tree-shaken in prod).

// @ts-ignore - tweakpane v4 exports Pane as type, used as constructor
import { Pane } from "tweakpane";
import {
  logRaveGltfCasterPivotsOnScene,
  logRaveGltfTuningValues,
  RAVE_GLTF_TUNING_RESET_GROUPS,
  reapplyRaveGltfCartTuningOnScene,
  resetRaveGltfTuningAll,
  resetRaveGltfTuningKeys,
  raveGltfTuningKeysNeedVisualReapply,
} from "./cartRaveGltf.js";
import { raveGltfTuning } from "./stores/cartTuningStore.js";

/**
 * @param {import("tweakpane").FolderApi} folder
 * @param {object} obj
 * @param {string} key
 * @param {{ min: number, max: number, step?: number, label?: string }} opts
 * @param {(() => void) | undefined} [onChange]
 * @returns {any} tweakpane v4 removed BindingApi; use any
 */
function addSlider(folder, obj, key, opts, onChange) {
  const b = folder.addBinding(obj, key, {
    min: opts.min,
    max: opts.max,
    step: opts.step ?? (opts.max - opts.min) / 100,
    label: opts.label ?? key,
  });
  if (onChange) b.on("change", onChange);
  return b;
}

/**
 * Adds a clickable "↩ Reset to defaults" button that resets the given keys and refreshes visuals.
 *
 * @param {import("tweakpane").FolderApi} folder
 * @param {readonly string[]} keys
 * @param {import("tweakpane").Pane} rootPane
 * @param {() => void} applyVisuals
 */
function addSectionReset(folder, keys, rootPane, applyVisuals) {
  folder.addButton({ title: "↩ Reset to defaults" }).on("click", () => {
    resetRaveGltfTuningKeys(keys);
    if (raveGltfTuningKeysNeedVisualReapply(keys)) applyVisuals();
    rootPane.refresh();
  });
}

/**
 * Wires the "Cart Forks & Wheels" folder tree into the given Tweakpane pane.
 *
 * @param {import("tweakpane").Pane} pane
 * @param {import("three").Scene} scene
 * @returns {import("tweakpane").FolderApi}
 */
export function wireRaveGltfCartDebugTweakpane(pane, scene) {
  const applyVisuals = () => reapplyRaveGltfCartTuningOnScene(scene);

  const folder = pane.addFolder({ title: "Cart Forks & Wheels", expanded: true });

  // — Global actions —
  folder.addButton({ title: "What do these do? → console" }).on("click", () => {
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "=== Cart fork tuning guide ===",
        "",
        "Each folder has ↩ Reset to defaults — use it to undo a bad tuning pass.",
        "Cart Forks & Wheels (top) resets EVERYTHING in this panel.",
        "",
        "1 · Front steering — turn in game, watch front forks",
        "2 · Straight driving — calm forks when not turning",
        "3 · Fork attach (kingpin) ↻ — moves rotation point; re-layouts cart",
        "4 · Wheel placement ↻ — stance / inset / shift",
        "5 · Cart size ↻ — overall scale & body",
        "",
        "Kingpin sliders shift the fork rotation point on all wheels.",
        "Front-only sliders add extra offset on top. Turn while tuning to preview arc.",
        "Panel toggle: H key",
        "",
      ].join("\n"),
    );
  });
  folder.addButton({ title: "↩ Reset ALL cart tuning to defaults" }).on("click", () => {
    resetRaveGltfTuningAll();
    applyVisuals();
    pane.refresh();
  });

  // --- 1 · Front steering (live while driving) ---
  const steerFolder = folder.addFolder({ title: "1 · Front steering", expanded: true });
  addSectionReset(steerFolder, RAVE_GLTF_TUNING_RESET_GROUPS.steeringAll, pane, applyVisuals);

  addSlider(steerFolder, raveGltfTuning, "frontSteerMul", { min: 0, max: 2.5, step: 0.05, label: "Turn strength" });
  addSlider(steerFolder, raveGltfTuning, "frontTurnSteerDamping", { min: 0.1, max: 0.95, step: 0.01, label: "Turn snappiness" });
  addSlider(steerFolder, raveGltfTuning, "steeringInfluence", { min: 0, max: 2, step: 0.01, label: "Yaw → steer scale" });
  steerFolder.addBinding(raveGltfTuning, "frontAxleRigid", { label: "Rigid front axle (both forks sync)" });
  steerFolder.addBinding(raveGltfTuning, "frontAxleSign", {
    label: "Steer direction",
    options: { "Into turn ✓": -1, "Opposite (flip)": 1 },
  });
  addSlider(steerFolder, raveGltfTuning, "yawSteerBlend", { min: 0, max: 1, step: 0.01, label: "Input-driven steer (1=MK)" });

  const rearFolder = steerFolder.addFolder({ title: "Rear wheels (usually leave alone)" });
  addSectionReset(rearFolder, RAVE_GLTF_TUNING_RESET_GROUPS.rearSteering, pane, applyVisuals);
  addSlider(rearFolder, raveGltfTuning, "rearSteerMul", { min: 0, max: 1, step: 0.02, label: "Rear turn amount" });
  addSlider(rearFolder, raveGltfTuning, "turnSteerDamping", { min: 0.1, max: 0.95, step: 0.01, label: "Rear snappiness" });
  addSlider(rearFolder, raveGltfTuning, "rearSteerMinOmega", { min: 0.05, max: 0.6, step: 0.01, label: "Rear steer starts (yaw)" });
  addSlider(rearFolder, raveGltfTuning, "rearSteerFullOmega", { min: 0.1, max: 0.8, step: 0.01, label: "Rear steer full (yaw)" });

  const turnFeelFolder = steerFolder.addFolder({ title: "Turn in / out timing" });
  addSectionReset(turnFeelFolder, RAVE_GLTF_TUNING_RESET_GROUPS.turnFeel, pane, applyVisuals);
  addSlider(turnFeelFolder, raveGltfTuning, "turnEngageOmega", { min: 0.05, max: 0.5, step: 0.005, label: "Start turning (yaw)" });
  addSlider(turnFeelFolder, raveGltfTuning, "turnReleaseOmega", { min: 0.02, max: 0.4, step: 0.005, label: "Stop turning (yaw)" });
  addSlider(turnFeelFolder, raveGltfTuning, "swivelMaxAngleDeg", { min: 60, max: 180, step: 1, label: "Max fork angle (°)" });
  addSlider(turnFeelFolder, raveGltfTuning, "swivelDamping", { min: 0.05, max: 0.95, step: 0.01, label: "General fork smoothing" });

  // --- 2 · Straight-line stability ---
  const straightFolder = folder.addFolder({ title: "2 · Straight driving" });
  addSectionReset(straightFolder, RAVE_GLTF_TUNING_RESET_GROUPS.straight, pane, applyVisuals);
  addSlider(straightFolder, raveGltfTuning, "straightYawDeadzone", { min: 0, max: 0.35, step: 0.005, label: "Yaw deadzone" });
  addSlider(straightFolder, raveGltfTuning, "straightYawSmoothing", { min: 0, max: 0.98, step: 0.01, label: "Yaw smoothing" });
  addSlider(straightFolder, raveGltfTuning, "straightCruiseMinSpeed", { min: 0, max: 1.5, step: 0.02, label: "Cruise lock min speed" });
  addSlider(straightFolder, raveGltfTuning, "straightRestEpsilon", { min: 0.005, max: 0.15, step: 0.005, label: "Settled-at-rest threshold" });
  addSlider(straightFolder, raveGltfTuning, "restReturnDamping", { min: 0.02, max: 0.5, step: 0.01, label: "Return-to-straight speed" });

  // --- 3 · Kingpin (fork rotation point) ---
  const kingpinFolder = folder.addFolder({ title: "3 · Fork attach point ↻", expanded: true });
  addSectionReset(kingpinFolder, RAVE_GLTF_TUNING_RESET_GROUPS.kingpinAll, pane, applyVisuals);

  addSlider(kingpinFolder, raveGltfTuning, "casterPivotXOffset", { min: -0.35, max: 0.35, step: 0.005, label: "Side (X) — all wheels" }, applyVisuals);
  addSlider(kingpinFolder, raveGltfTuning, "casterPivotYOffset", { min: -0.4, max: 0.4, step: 0.005, label: "Height (Y) — all wheels" }, applyVisuals);
  addSlider(kingpinFolder, raveGltfTuning, "casterPivotZOffset", { min: -0.35, max: 0.35, step: 0.005, label: "Fore/aft (Z) — all wheels" }, applyVisuals);

  const frontKingpinFolder = kingpinFolder.addFolder({ title: "Front forks — extra offset" });
  addSectionReset(frontKingpinFolder, RAVE_GLTF_TUNING_RESET_GROUPS.frontKingpin, pane, applyVisuals);
  addSlider(frontKingpinFolder, raveGltfTuning, "frontPivotXOffset", { min: -0.35, max: 0.35, step: 0.005, label: "Extra side (X)" }, applyVisuals);
  addSlider(frontKingpinFolder, raveGltfTuning, "frontPivotYOffset", { min: -0.4, max: 0.4, step: 0.005, label: "Extra height (Y)" }, applyVisuals);
  addSlider(frontKingpinFolder, raveGltfTuning, "frontPivotZOffset", { min: -0.35, max: 0.35, step: 0.005, label: "Extra fore/aft (Z)" }, applyVisuals);

  // --- 4 · Wheel placement ---
  const placementFolder = folder.addFolder({ title: "4 · Wheel placement ↻" });
  addSectionReset(placementFolder, RAVE_GLTF_TUNING_RESET_GROUPS.placement, pane, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterStanceScaleZ", { min: 0.85, max: 1.15, step: 0.005, label: "Stance width" }, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterStanceScaleX", { min: 0.85, max: 1.15, step: 0.005, label: "Stance length" }, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "cornerInset", { min: 0, max: 0.15, step: 0.005, label: "Corner inset (absolute)" }, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "cornerInsetFracX", { min: 0, max: 0.25, step: 0.005, label: "Corner inset % (length)" }, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "cornerInsetFracZ", { min: 0, max: 0.25, step: 0.005, label: "Corner inset % (width)" }, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterOffsetX", { min: -0.15, max: 0.15, step: 0.002, label: "Shift all wheels X" }, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterOffsetZ", { min: -0.15, max: 0.15, step: 0.002, label: "Shift all wheels Z" }, applyVisuals);

  // --- 5 · Cart size ---
  const sizeFolder = folder.addFolder({ title: "5 · Cart size ↻" });
  addSectionReset(sizeFolder, RAVE_GLTF_TUNING_RESET_GROUPS.size, pane, applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "scale", { min: 1.5, max: 2.8, step: 0.01, label: "Overall cart scale" }, applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "yOffset", { min: -1.5, max: -0.5, step: 0.01, label: "Cart height on ground" }, applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "bodyScale", { min: 1.0, max: 1.35, step: 0.005, label: "Basket/body scale" }, applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "bodyYDrop", { min: 0, max: 0.25, step: 0.005, label: "Body drop vs wheels" }, applyVisuals);

  // --- Advanced / dev ---
  const advancedFolder = folder.addFolder({ title: "Advanced / dev" });
  addSectionReset(advancedFolder, RAVE_GLTF_TUNING_RESET_GROUPS.advanced, pane, applyVisuals);
  addSlider(advancedFolder, raveGltfTuning, "travelHeadingSmoothing", { min: 0, max: 0.98, step: 0.01, label: "Travel heading smooth" });
  addSlider(advancedFolder, raveGltfTuning, "trailBlend", { min: 0, max: 1, step: 0.01, label: "Velocity trail blend (0=off)" });
  advancedFolder.addBinding(raveGltfTuning, "casterCoordinationLog", { label: "Log fork sync → console" });

  const cornerKingpinFolder = advancedFolder.addFolder({ title: "Per-corner kingpin (rarely needed)" });
  addSectionReset(cornerKingpinFolder, ["casterPivotCorner"], pane, applyVisuals);
  for (const label of ["frontRight", "frontLeft", "backLeft", "backRight"]) {
    const corner = raveGltfTuning.casterPivotCorner[label];
    const cornerGui = cornerKingpinFolder.addFolder({ title: label });
    addSectionReset(cornerGui, [`casterPivotCorner.${label}`], pane, applyVisuals);
    addSlider(cornerGui, corner, "x", { min: -0.15, max: 0.15, step: 0.005, label: "Side (X)" }, applyVisuals);
    addSlider(cornerGui, corner, "y", { min: -0.2, max: 0.2, step: 0.005, label: "Height (Y)" }, applyVisuals);
    addSlider(cornerGui, corner, "z", { min: -0.15, max: 0.15, step: 0.005, label: "Fore/aft (Z)" }, applyVisuals);
  }

  advancedFolder.addButton({ title: "Copy cart values → console" }).on("click", () => {
    logRaveGltfTuningValues();
  });
  advancedFolder.addButton({ title: "Log kingpin positions → console" }).on("click", () => {
    logRaveGltfCasterPivotsOnScene(scene);
  });

  return folder;
}
