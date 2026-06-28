// raveGltfCartDebug.js — dev-only lil-gui folder for live GLTF cart tuning (tree-shaken in prod).

import {
  logRaveGltfCasterPivotsOnScene,
  logRaveGltfTuningValues,
  raveGltfTuning,
  reapplyRaveGltfCartTuningOnScene,
} from "./cartRaveGltf.js";

/**
 * Adds a "GLTF Cart Tuning" folder to an existing lil-gui panel.
 *
 * @param {import("lil-gui").GUI} gui
 * @param {import("three").Scene} scene
 * @returns {import("lil-gui").GUI}
 */
export function wireRaveGltfCartDebugFolder(gui, scene) {
  const folder = gui.addFolder("GLTF Cart Tuning");
  const applyVisuals = () => reapplyRaveGltfCartTuningOnScene(scene);

  const modelFolder = folder.addFolder("Model");
  modelFolder
    .add(raveGltfTuning, "scale", 1.5, 2.8, 0.01)
    .name("scale")
    .onChange(applyVisuals);
  modelFolder
    .add(raveGltfTuning, "yOffset", -1.5, -0.5, 0.01)
    .name("yOffset")
    .onChange(applyVisuals);

  const bodyFolder = folder.addFolder("Body");
  bodyFolder
    .add(raveGltfTuning, "bodyScale", 1.0, 1.35, 0.005)
    .name("bodyScale")
    .onChange(applyVisuals);
  bodyFolder
    .add(raveGltfTuning, "bodyYDrop", 0, 0.25, 0.005)
    .name("bodyYDrop")
    .onChange(applyVisuals);

  const casterFolder = folder.addFolder("Casters");
  casterFolder
    .add(raveGltfTuning, "cornerInset", 0, 0.15, 0.005)
    .name("cornerInset (abs)")
    .onChange(applyVisuals);
  casterFolder
    .add(raveGltfTuning, "cornerInsetFracX", 0, 0.25, 0.005)
    .name("insetFrac X")
    .onChange(applyVisuals);
  casterFolder
    .add(raveGltfTuning, "cornerInsetFracZ", 0, 0.25, 0.005)
    .name("insetFrac Z")
    .onChange(applyVisuals);
  casterFolder
    .add(raveGltfTuning, "casterStanceScaleX", 0.85, 1.15, 0.005)
    .name("stanceScale X")
    .onChange(applyVisuals);
  casterFolder
    .add(raveGltfTuning, "casterStanceScaleZ", 0.85, 1.15, 0.005)
    .name("stanceScale Z")
    .onChange(applyVisuals);
  casterFolder
    .add(raveGltfTuning, "casterOffsetX", -0.15, 0.15, 0.002)
    .name("offset X")
    .onChange(applyVisuals);
  casterFolder
    .add(raveGltfTuning, "casterOffsetZ", -0.15, 0.15, 0.002)
    .name("offset Z")
    .onChange(applyVisuals);

  const pivotFolder = folder.addFolder("Caster Pivot (kingpin)");
  pivotFolder
    .add(raveGltfTuning, "casterPivotYOffset", -0.25, 0.35, 0.002)
    .name("pivot Y (main)")
    .onChange(applyVisuals);
  pivotFolder
    .add(raveGltfTuning, "casterPivotXOffset", -0.15, 0.15, 0.002)
    .name("pivot X")
    .onChange(applyVisuals);
  pivotFolder
    .add(raveGltfTuning, "casterPivotZOffset", -0.15, 0.15, 0.002)
    .name("pivot Z")
    .onChange(applyVisuals);

  const pivotCornerFolder = pivotFolder.addFolder("Per-corner fine-tune");
  for (const label of ["frontRight", "frontLeft", "backLeft", "backRight"]) {
    const corner = raveGltfTuning.casterPivotCorner[label];
    const cornerGui = pivotCornerFolder.addFolder(label);
    cornerGui
      .add(corner, "y", -0.2, 0.2, 0.002)
      .name("Y")
      .onChange(applyVisuals);
    cornerGui
      .add(corner, "x", -0.1, 0.1, 0.002)
      .name("X")
      .onChange(applyVisuals);
    cornerGui
      .add(corner, "z", -0.1, 0.1, 0.002)
      .name("Z")
      .onChange(applyVisuals);
  }

  const swivelFolder = folder.addFolder("Swivel");
  swivelFolder
    .add(raveGltfTuning, "swivelMaxAngleDeg", 60, 180, 1)
    .name("swivelMaxAngleDeg");
  swivelFolder
    .add(raveGltfTuning, "swivelDamping", 0.05, 0.95, 0.01)
    .name("swivelDamping");
  swivelFolder
    .add(raveGltfTuning, "steeringInfluence", 0, 1.2, 0.01)
    .name("steeringInfluence");
  swivelFolder
    .add(raveGltfTuning, "frontSteerMul", 0, 2, 0.05)
    .name("frontSteerMul");
  swivelFolder
    .add(raveGltfTuning, "rearSteerMul", 0, 1.5, 0.05)
    .name("rearSteerMul");
  swivelFolder
    .add(raveGltfTuning, "trailBlend", 0, 1, 0.01)
    .name("trailBlend");
  swivelFolder
    .add(raveGltfTuning, "steeringMinOmega", 0, 0.5, 0.01)
    .name("steeringMinOmega");

  const actions = {
    logTuningValues() {
      logRaveGltfTuningValues();
    },
    logCasterPivots() {
      logRaveGltfCasterPivotsOnScene(scene);
    },
  };
  folder.add(actions, "logTuningValues").name("Log values → console");
  folder.add(actions, "logCasterPivots").name("Log caster pivots → console");

  return folder;
}
