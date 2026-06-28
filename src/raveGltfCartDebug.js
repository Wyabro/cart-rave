// raveGltfCartDebug.js — dev-only lil-gui folder for live GLTF cart tuning (tree-shaken in prod).

import {
  logRaveGltfCasterPivotsOnScene,
  logRaveGltfTuningValues,
  RAVE_GLTF_TUNING_RESET_GROUPS,
  raveGltfTuning,
  raveGltfTuningKeysNeedVisualReapply,
  reapplyRaveGltfCartTuningOnScene,
  resetRaveGltfTuningAll,
  resetRaveGltfTuningKeys,
} from "./cartRaveGltf.js";

/**
 * @param {import("lil-gui").GUI} folder
 * @param {object} obj
 * @param {string} prop
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {string} label
 * @param {(() => void) | undefined} [onChange]
 */
function addSlider(folder, obj, prop, min, max, step, label, onChange) {
  const ctrl = folder.add(obj, prop, min, max, step).name(label);
  if (onChange) ctrl.onChange(onChange);
  return ctrl;
}

/**
 * @param {import("lil-gui").GUI} guiFolder
 */
function refreshGuiFolder(guiFolder) {
  guiFolder.controllersRecursive().forEach((ctrl) => ctrl.updateDisplay());
}

/**
 * @param {import("lil-gui").GUI} guiFolder
 * @param {readonly string[]} keys
 * @param {import("lil-gui").GUI} refreshRoot
 * @param {() => void} applyVisuals
 */
function addSectionReset(guiFolder, keys, refreshRoot, applyVisuals) {
  const actions = {
    resetToDefaults() {
      resetRaveGltfTuningKeys(keys);
      if (raveGltfTuningKeysNeedVisualReapply(keys)) applyVisuals();
      refreshGuiFolder(refreshRoot);
    },
  };
  guiFolder.add(actions, "resetToDefaults").name("↩ Reset to defaults");
}

/**
 * Adds cart wheel / fork tuning to an existing lil-gui panel.
 * Folders are ordered for the usual workflow: steer feel → straight stability → kingpin → placement → size.
 *
 * @param {import("lil-gui").GUI} gui
 * @param {import("three").Scene} scene
 * @returns {import("lil-gui").GUI}
 */
export function wireRaveGltfCartDebugFolder(gui, scene) {
  const folder = gui.addFolder("Cart Forks & Wheels");
  const applyVisuals = () => reapplyRaveGltfCartTuningOnScene(scene);

  const help = {
    printGuide() {
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
    },
    resetEverything() {
      resetRaveGltfTuningAll();
      applyVisuals();
      refreshGuiFolder(folder);
    },
  };
  folder.add(help, "printGuide").name("What do these do? → console");
  folder.add(help, "resetEverything").name("↩ Reset ALL cart tuning to defaults");

  // --- 1 · Front steering (live while driving) ---
  const steerFolder = folder.addFolder("1 · Front steering");
  steerFolder.open();
  addSectionReset(steerFolder, RAVE_GLTF_TUNING_RESET_GROUPS.steeringAll, folder, applyVisuals);

  addSlider(steerFolder, raveGltfTuning, "frontSteerMul", 0, 2.5, 0.05, "Turn strength");
  addSlider(steerFolder, raveGltfTuning, "frontTurnSteerDamping", 0.1, 0.95, 0.01, "Turn snappiness");
  addSlider(steerFolder, raveGltfTuning, "steeringInfluence", 0, 2, 0.01, "Yaw → steer scale");
  steerFolder
    .add(raveGltfTuning, "frontAxleRigid")
    .name("Rigid front axle (both forks sync)");
  steerFolder
    .add(raveGltfTuning, "frontAxleSign", { "Into turn ✓": -1, "Opposite (flip)": 1 })
    .name("Steer direction");
  addSlider(steerFolder, raveGltfTuning, "yawSteerBlend", 0, 1, 0.01, "Input-driven steer (1=MK)");

  const rearFolder = steerFolder.addFolder("Rear wheels (usually leave alone)");
  addSectionReset(rearFolder, RAVE_GLTF_TUNING_RESET_GROUPS.rearSteering, folder, applyVisuals);
  addSlider(rearFolder, raveGltfTuning, "rearSteerMul", 0, 1, 0.02, "Rear turn amount");
  addSlider(rearFolder, raveGltfTuning, "turnSteerDamping", 0.1, 0.95, 0.01, "Rear snappiness");
  addSlider(rearFolder, raveGltfTuning, "rearSteerMinOmega", 0.05, 0.6, 0.01, "Rear steer starts (yaw)");
  addSlider(rearFolder, raveGltfTuning, "rearSteerFullOmega", 0.1, 0.8, 0.01, "Rear steer full (yaw)");
  rearFolder.close();

  const turnFeelFolder = steerFolder.addFolder("Turn in / out timing");
  addSectionReset(turnFeelFolder, RAVE_GLTF_TUNING_RESET_GROUPS.turnFeel, folder, applyVisuals);
  addSlider(turnFeelFolder, raveGltfTuning, "turnEngageOmega", 0.05, 0.5, 0.005, "Start turning (yaw)");
  addSlider(turnFeelFolder, raveGltfTuning, "turnReleaseOmega", 0.02, 0.4, 0.005, "Stop turning (yaw)");
  addSlider(turnFeelFolder, raveGltfTuning, "swivelMaxAngleDeg", 60, 180, 1, "Max fork angle (°)");
  addSlider(turnFeelFolder, raveGltfTuning, "swivelDamping", 0.05, 0.95, 0.01, "General fork smoothing");
  turnFeelFolder.close();

  // --- 2 · Straight-line stability ---
  const straightFolder = folder.addFolder("2 · Straight driving");
  addSectionReset(straightFolder, RAVE_GLTF_TUNING_RESET_GROUPS.straight, folder, applyVisuals);
  addSlider(straightFolder, raveGltfTuning, "straightYawDeadzone", 0, 0.35, 0.005, "Yaw deadzone");
  addSlider(straightFolder, raveGltfTuning, "straightYawSmoothing", 0, 0.98, 0.01, "Yaw smoothing");
  addSlider(straightFolder, raveGltfTuning, "straightCruiseMinSpeed", 0, 1.5, 0.02, "Cruise lock min speed");
  addSlider(straightFolder, raveGltfTuning, "straightRestEpsilon", 0.005, 0.15, 0.005, "Settled-at-rest threshold");
  addSlider(straightFolder, raveGltfTuning, "restReturnDamping", 0.02, 0.5, 0.01, "Return-to-straight speed");
  straightFolder.close();

  // --- 3 · Kingpin (fork rotation point) ---
  const kingpinFolder = folder.addFolder("3 · Fork attach point ↻");
  addSectionReset(kingpinFolder, RAVE_GLTF_TUNING_RESET_GROUPS.kingpinAll, folder, applyVisuals);
  kingpinFolder.open();

  addSlider(
    kingpinFolder,
    raveGltfTuning,
    "casterPivotXOffset",
    -0.35,
    0.35,
    0.005,
    "Side (X) — all wheels",
    applyVisuals,
  );
  addSlider(
    kingpinFolder,
    raveGltfTuning,
    "casterPivotYOffset",
    -0.4,
    0.4,
    0.005,
    "Height (Y) — all wheels",
    applyVisuals,
  );
  addSlider(
    kingpinFolder,
    raveGltfTuning,
    "casterPivotZOffset",
    -0.35,
    0.35,
    0.005,
    "Fore/aft (Z) — all wheels",
    applyVisuals,
  );

  const frontKingpinFolder = kingpinFolder.addFolder("Front forks — extra offset");
  addSectionReset(frontKingpinFolder, RAVE_GLTF_TUNING_RESET_GROUPS.frontKingpin, folder, applyVisuals);
  addSlider(
    frontKingpinFolder,
    raveGltfTuning,
    "frontPivotXOffset",
    -0.35,
    0.35,
    0.005,
    "Extra side (X)",
    applyVisuals,
  );
  addSlider(
    frontKingpinFolder,
    raveGltfTuning,
    "frontPivotYOffset",
    -0.4,
    0.4,
    0.005,
    "Extra height (Y)",
    applyVisuals,
  );
  addSlider(
    frontKingpinFolder,
    raveGltfTuning,
    "frontPivotZOffset",
    -0.35,
    0.35,
    0.005,
    "Extra fore/aft (Z)",
    applyVisuals,
  );
  frontKingpinFolder.close();
  kingpinFolder.close();

  // --- 4 · Wheel placement ---
  const placementFolder = folder.addFolder("4 · Wheel placement ↻");
  addSectionReset(placementFolder, RAVE_GLTF_TUNING_RESET_GROUPS.placement, folder, applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterStanceScaleX", 0.85, 1.15, 0.005, "Stance width", applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterStanceScaleZ", 0.85, 1.15, 0.005, "Stance length", applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "cornerInset", 0, 0.15, 0.005, "Corner inset (absolute)", applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "cornerInsetFracX", 0, 0.25, 0.005, "Corner inset % (width)", applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "cornerInsetFracZ", 0, 0.25, 0.005, "Corner inset % (length)", applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterOffsetX", -0.15, 0.15, 0.002, "Shift all wheels X", applyVisuals);
  addSlider(placementFolder, raveGltfTuning, "casterOffsetZ", -0.15, 0.15, 0.002, "Shift all wheels Z", applyVisuals);
  placementFolder.close();

  // --- 5 · Cart size ---
  const sizeFolder = folder.addFolder("5 · Cart size ↻");
  addSectionReset(sizeFolder, RAVE_GLTF_TUNING_RESET_GROUPS.size, folder, applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "scale", 1.5, 2.8, 0.01, "Overall cart scale", applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "yOffset", -1.5, -0.5, 0.01, "Cart height on ground", applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "bodyScale", 1.0, 1.35, 0.005, "Basket/body scale", applyVisuals);
  addSlider(sizeFolder, raveGltfTuning, "bodyYDrop", 0, 0.25, 0.005, "Body drop vs wheels", applyVisuals);
  sizeFolder.close();

  // --- Advanced / dev ---
  const advancedFolder = folder.addFolder("Advanced / dev");
  addSectionReset(advancedFolder, RAVE_GLTF_TUNING_RESET_GROUPS.advanced, folder, applyVisuals);
  addSlider(advancedFolder, raveGltfTuning, "travelHeadingSmoothing", 0, 0.98, 0.01, "Travel heading smooth");
  addSlider(advancedFolder, raveGltfTuning, "trailBlend", 0, 1, 0.01, "Velocity trail blend (0=off)");
  advancedFolder.add(raveGltfTuning, "casterCoordinationLog").name("Log fork sync → console");

  const cornerKingpinFolder = advancedFolder.addFolder("Per-corner kingpin (rarely needed)");
  addSectionReset(cornerKingpinFolder, ["casterPivotCorner"], folder, applyVisuals);
  for (const label of ["frontRight", "frontLeft", "backLeft", "backRight"]) {
    const corner = raveGltfTuning.casterPivotCorner[label];
    const cornerGui = cornerKingpinFolder.addFolder(label);
    addSectionReset(cornerGui, [`casterPivotCorner.${label}`], folder, applyVisuals);
    addSlider(cornerGui, corner, "x", -0.15, 0.15, 0.005, "Side (X)", applyVisuals);
    addSlider(cornerGui, corner, "y", -0.2, 0.2, 0.005, "Height (Y)", applyVisuals);
    addSlider(cornerGui, corner, "z", -0.15, 0.15, 0.005, "Fore/aft (Z)", applyVisuals);
    cornerGui.close();
  }
  cornerKingpinFolder.close();
  advancedFolder.close();

  const actions = {
    logTuningValues() {
      logRaveGltfTuningValues();
    },
    logCasterPivots() {
      logRaveGltfCasterPivotsOnScene(scene);
    },
  };
  folder.add(actions, "logTuningValues").name("Copy cart values → console");
  folder.add(actions, "logCasterPivots").name("Log kingpin positions → console");

  folder.open();

  return folder;
}
