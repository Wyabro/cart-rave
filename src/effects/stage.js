/**
 * stage.js — Main stage truss, LED screen, speakers, neon trim, and sweep lights.
 *
 * Extracted from src/effects.js (EFFECTS-SPLIT-1). `stageGroup` / `stageLightEntries`
 * are exported live bindings read by effects.js (setRaveExtrasVisible / applyRaveExtrasQuality)
 * and lasers.js (initLasers anchors beams to the stage).
 */

import * as THREE from "three";
import { createPhysicalMaterial } from "../scene.js";
import { mergeStaticMeshesByMaterial } from "../utils/mergeStaticMeshes.js";

/** @typedef {import("../effects/ambientParticles.js").CartColorMap} CartColorMap */

/** @type {THREE.Group | null} */
let stageGroup = null;


let stageLightEntries = [];


let ledCtx = null;


let ledTex = null;

let lastLedUpdate = 0;

/**
 * Builds the main stage truss, LED screen, speakers, neon trim, and sweep lights.
 * @param {THREE.Scene} scene
 * @param {number} pitInnerRadius
 * @param {CartColorMap} cartColors
 */
export function initStage(scene, pitInnerRadius, cartColors) {
  const stageAngle = 0;
  // * Keep in lockstep with stadium bay filler in initCrowd (STAGE_CENTER_R / depths).
  const stageRadius = pitInnerRadius + 15;
  const stageX = Math.cos(stageAngle) * stageRadius;
  const stageZ = Math.sin(stageAngle) * stageRadius;
  // * Group origin stays at bay floor height; deck top is local y=1.5 (world -1.5)
  // * so truss/LED/speaker local offsets keep working.
  const stageY = -3;
  stageGroup = new THREE.Group();

  // * Stage platform — Physical: metalness 0.85, roughness 0.28
  const stageBaseMat = createPhysicalMaterial({
    color: 0x0a0a1a,
    metalness: 0.85,
    roughness: 0.28,
  });
  // * Stage truss poles — Physical: metalness 0.9, roughness 0.32
  const stageMetalMat = createPhysicalMaterial({
    color: 0x1a1a2e,
    metalness: 0.9,
    roughness: 0.32,
  });
  // * Stage speaker stacks — Physical: metalness 0.75, roughness 0.28
  const stageSpeakerMat = createPhysicalMaterial({
    color: 0x0a0a12,
    metalness: 0.75,
    roughness: 0.28,
  });
  const stageSpeakerFaceMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const stageFrameMat = new THREE.MeshBasicMaterial({ color: 0x0a0a1a });
  const neonMagentaMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x22e6ff });
  const stageLightPalette = Object.values(cartColors).map((entry) => entry.hex);
  stageLightEntries = [];

  stageGroup.clear();

  // * Performance deck on the bay apron + skirt down into the filled plinth.
  const stageBase = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 10.4), stageBaseMat);
  stageBase.position.y = 1.35; // * top ≈ local 1.55 → world ≈ -1.45 (flush with bay deck)
  stageGroup.add(stageBase);
  const stageSkirt = new THREE.Mesh(new THREE.BoxGeometry(23.6, 1.25, 10.0), stageBaseMat);
  stageSkirt.position.y = 0.55;
  stageGroup.add(stageSkirt);

  const towerXs = [-11, 11];
  for (const towerX of towerXs) {
    for (const ox of [-0.5, 0.5]) {
      for (const oz of [-0.5, 0.5]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 18, 8),
          stageMetalMat,
        );
        pole.position.set(towerX + ox, 9, oz);
        stageGroup.add(pole);
      }
    }

    for (let b = 0; b < 6; b += 1) {
      const braceY = 1.5 + b * 3;
      const braceX = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), stageMetalMat);
      braceX.position.set(towerX, braceY, 0);
      stageGroup.add(braceX);
      const braceZ = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), stageMetalMat);
      braceZ.position.set(towerX, braceY, 0);
      stageGroup.add(braceZ);
    }
  }

  for (const z of [-0.5, 0.5]) {
    const topPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 22, 8),
      stageMetalMat,
    );
    topPole.rotation.z = Math.PI / 2;
    topPole.position.set(0, 18, z);
    stageGroup.add(topPole);
  }
  for (let x = -10; x <= 10; x += 2) {
    const spanBrace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), stageMetalMat);
    spanBrace.position.set(x, 18, 0);
    stageGroup.add(spanBrace);
  }

  const ledCanvas = document.createElement("canvas");
  ledCanvas.width = 512;
  ledCanvas.height = 256;
  ledCtx = ledCanvas.getContext("2d");
  const ledGrad = ledCtx.createLinearGradient(0, 0, 512, 256);
  ledGrad.addColorStop(0, "#0a0020");
  ledGrad.addColorStop(0.5, "#1a0040");
  ledGrad.addColorStop(1, "#0a0020");
  ledCtx.fillStyle = ledGrad;
  ledCtx.fillRect(0, 0, 512, 256);
  ledCtx.font = 'bold 90px "Arial Black", "Impact", sans-serif';
  ledCtx.textAlign = "center";
  ledCtx.textBaseline = "middle";
  ledCtx.fillStyle = "#ff2bd6";
  ledCtx.shadowColor = "#ff2bd6";
  ledCtx.shadowBlur = 20;
  ledCtx.fillText("CART", 256, 100);
  ledCtx.fillStyle = "#ffe53d";
  ledCtx.shadowColor = "#ffe53d";
  ledCtx.shadowBlur = 20;
  ledCtx.fillText("RAVE", 256, 185);
  ledCtx.shadowBlur = 0;
  for (let y = 0; y < 256; y += 4) {
    ledCtx.fillStyle = "rgba(0,0,0,0.15)";
    ledCtx.fillRect(0, y, 512, 2);
  }
  ledTex = new THREE.CanvasTexture(ledCanvas);
  const ledScreenMat = new THREE.MeshBasicMaterial({ map: ledTex });
  const ledScreen = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 0.3), ledScreenMat);
  ledScreen.position.set(0, 9, -4);
  // * Canvas texture is updated live — keep as its own draw.
  ledScreen.userData.noMerge = true;
  stageGroup.add(ledScreen);
  const ledFrame = new THREE.Mesh(new THREE.BoxGeometry(16.5, 8.5, 0.2), stageFrameMat);
  ledFrame.position.set(0, 9, -4.3);
  stageGroup.add(ledFrame);

  const speakerXs = [-9, -7, 7, 9];
  const speakerYs = [1.5, 3.5, 5.5];
  for (const sx of speakerXs) {
    for (const sy of speakerYs) {
      const speaker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), stageSpeakerMat);
      speaker.position.set(sx, sy, 0);
      stageGroup.add(speaker);
      const speakerFace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16),
        stageSpeakerFaceMat,
      );
      speakerFace.rotation.x = Math.PI / 2;
      speakerFace.position.set(sx, sy, 1.01);
      stageGroup.add(speakerFace);
    }
  }

  const neonTop = new THREE.Mesh(new THREE.BoxGeometry(22, 0.08, 0.08), neonMagentaMat);
  neonTop.position.set(0, 18, 0);
  stageGroup.add(neonTop);
  for (const towerX of towerXs) {
    const towerTopNeon = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.08), neonCyanMat);
    towerTopNeon.position.set(towerX, 18, 0);
    stageGroup.add(towerTopNeon);
  }
  const neonBaseFront = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 0.08), neonMagentaMat);
  neonBaseFront.position.set(0, 1.54, 5);
  stageGroup.add(neonBaseFront);

  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const lx = -10 + t * 20;
    const color = stageLightPalette[i % stageLightPalette.length];
    const light = new THREE.SpotLight(color, 3, 30, Math.PI / 6, 0.5);
    light.position.set(lx, 18, 0);
    stageGroup.add(light);
    const target = new THREE.Object3D();
    target.position.set(lx, 0, 0);
    stageGroup.add(target);
    light.target = target;
    stageLightEntries.push({ light, target, baseX: lx, index: i });
  }

  stageGroup.position.set(stageX, stageY, stageZ);
  stageGroup.lookAt(0, stageGroup.position.y, 0);
  scene.add(stageGroup);
  stageGroup.updateMatrixWorld(true);
  // * Poles/speakers/neon → few draws; LED screen stays separate (noMerge).
  // * Stage stays IN the mirror (readable hardware silhouette on the vinyl).
  mergeStaticMeshesByMaterial(stageGroup, { deep: true });
}


/**
 * Sweeps stage spot targets over the deck.
 * @param {number} nowMs Current time (ms).
 */
export function updateStageLights(nowMs) {
  if (stageLightEntries.length === 0) return;
  const nowSec = nowMs * 0.001;
  for (const entry of stageLightEntries) {
    entry.target.position.x = entry.baseX + Math.sin(nowSec * 0.5 + entry.index) * 5;
    entry.target.position.y = 0;
    entry.target.position.z = 0;
    entry.target.updateMatrix();
  }
}


/**
 * Pulses the stage LED screen canvas texture.
 * @param {number} nowMs Current time (ms).
 */
export function updateStageLed(nowMs) {
  if (!ledCtx || !ledTex || nowMs - lastLedUpdate <= 150) return;

  const pulse = 0.6 + Math.sin(nowMs * 0.002) * 0.4;
  const pulse2 = 0.6 + Math.sin(nowMs * 0.002 + 1.5) * 0.4;
  const ledGradAnim = ledCtx.createLinearGradient(0, 0, 512, 256);
  ledGradAnim.addColorStop(0, "#0a0020");
  ledGradAnim.addColorStop(0.5, "#1a0040");
  ledGradAnim.addColorStop(1, "#0a0020");
  ledCtx.fillStyle = ledGradAnim;
  ledCtx.fillRect(0, 0, 512, 256);
  ledCtx.font = 'bold 90px "Arial Black", "Impact", sans-serif';
  ledCtx.textAlign = "center";
  ledCtx.textBaseline = "middle";
  ledCtx.fillStyle = `rgba(255, 43, 214, ${pulse})`;
  ledCtx.shadowColor = "#ff2bd6";
  ledCtx.shadowBlur = 20 + pulse * 15;
  ledCtx.fillText("CART", 256, 100);
  ledCtx.fillStyle = `rgba(255, 229, 61, ${pulse2})`;
  ledCtx.shadowColor = "#ffe53d";
  ledCtx.shadowBlur = 20 + pulse2 * 15;
  ledCtx.fillText("RAVE", 256, 185);
  ledCtx.shadowBlur = 0;
  for (let y = 0; y < 256; y += 4) {
    ledCtx.fillStyle = "rgba(0,0,0,0.15)";
    ledCtx.fillRect(0, y, 512, 2);
  }
  ledTex.needsUpdate = true;
  lastLedUpdate = nowMs;
}


export { stageGroup, stageLightEntries };
