/**
 * billboard.js — Arena jumbotron opposite the stage (animated broadcast board).
 *
 * Extracted from src/effects.js (EFFECTS-SPLIT-1). `billboardGroup` and
 * `billboardLightEntries` are exported live bindings read by effects.js
 * (setRaveExtrasVisible / applyRaveExtrasQuality).
 */

import * as THREE from "three";
import { createPhysicalMaterial } from "../scene.js";
import { mergeStaticMeshesByMaterial } from "../utils/mergeStaticMeshes.js";
import { registerMirrorExclude } from "../utils/cheapMirror.js";

/** @typedef {import("../effects/ambientParticles.js").CartColorMap} CartColorMap */

/** Billboard PointLights — never tier-gated (only the group is), so a dedicated
 *  handle exists for the ?ablate=billboardlights measurement probe (PERF-PASS-1). */
/** @type {{ light: THREE.PointLight | null }[]} */
let billboardLightEntries = [];


/** @type {CanvasRenderingContext2D | null} */
let bbSmallCtx = null;

/** @type {THREE.CanvasTexture | null} */
let bbTex = null;

/** @type {THREE.CanvasTexture | null} */
let slTex = null;

/** @type {THREE.Group | null} */
let billboardGroup = null;

// * Web-safe font stacks the jumbotron cycles through so the screen reads as a
// * live animated broadcast board rather than a static sign.
const BB_FONTS = [
  "'Arial Black', sans-serif",
  "Impact, fantasy",
  "'Courier New', monospace",
  "Georgia, serif",
  "'Comic Sans MS', cursive",
];

let bbLastRedraw = 0;

/**
 * Builds the arena billboard opposite the stage.
 * @param {THREE.Scene} scene
 */
export function initBillboard(scene) {
  const bbAngle = Math.PI;

  const bbSmallCanvas = document.createElement("canvas");
  bbSmallCanvas.width = 256;
  bbSmallCanvas.height = 64;
  bbSmallCtx = bbSmallCanvas.getContext("2d");
  bbSmallCtx.imageSmoothingEnabled = false;
  bbSmallCtx.fillStyle = "#000000";
  bbSmallCtx.fillRect(0, 0, 256, 64);
  bbSmallCtx.fillStyle = "#ffffff";
  bbSmallCtx.font = `bold 40px ${BB_FONTS[0]}`;
  bbSmallCtx.textAlign = "center";
  bbSmallCtx.textBaseline = "middle";
  bbSmallCtx.fillText("CART RAVE", 128, 34);
  bbTex = new THREE.CanvasTexture(bbSmallCanvas);
  bbTex.magFilter = THREE.NearestFilter;
  bbTex.minFilter = THREE.NearestFilter;
  bbTex.colorSpace = THREE.SRGBColorSpace;

  const slCanvas = document.createElement("canvas");
  slCanvas.width = 128;
  slCanvas.height = 256;
  const slCtx = slCanvas.getContext("2d");
  for (let y = 0; y < 256; y += 2) {
    slCtx.fillStyle = "rgba(0,0,0,0.3)";
    slCtx.fillRect(0, y + 1, 128, 1);
  }
  slTex = new THREE.CanvasTexture(slCanvas);
  slTex.wrapS = THREE.RepeatWrapping;
  slTex.wrapT = THREE.RepeatWrapping;

  // * Billboard poles — Physical: metalness 0.85, roughness 0.3
  const bbPoleMat = createPhysicalMaterial({
    color: 0x333344, metalness: 0.85, roughness: 0.3,
  });
  const bbNeonCyanMat = new THREE.MeshBasicMaterial({ color: 0x22e6ff });
  const bbNeonMagentaMat = new THREE.MeshBasicMaterial({
    color: 0xff2bd6,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  billboardGroup = new THREE.Group();

  // * Center-hung jumbotron — four screen faces around a dark core cube hung low
  // * enough (y=15) that the chase cam actually frames it from the field, replacing
  // * the old ground-mounted board. One shared canvas/scanline pipeline drives all
  // * faces.
  const bbCore = new THREE.Mesh(new THREE.BoxGeometry(12.4, 3.6, 12.4), bbPoleMat);
  billboardGroup.add(bbCore);

  const bbScreenGeo = new THREE.PlaneGeometry(12, 3);
  const bbScreenMat = new THREE.MeshBasicMaterial({ map: bbTex });
  const bbScanMat = new THREE.MeshBasicMaterial({
    map: slTex,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const bbFrameParts = [
    { w: 12.3, h: 0.15, d: 0.15, x: 0, y: 1.575 },
    { w: 12.3, h: 0.15, d: 0.15, x: 0, y: -1.575 },
    { w: 0.15, h: 3.3, d: 0.15, x: -6.075, y: 0 },
    { w: 0.15, h: 3.3, d: 0.15, x: 6.075, y: 0 },
  ];
  // * Frame geometries built once and shared across the 4 faces.
  const bbFrameGeos = bbFrameParts.map(({ w, h, d }) => ({
    cyan: new THREE.BoxGeometry(w, h, d),
    halo: new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1),
  }));

  for (let face = 0; face < 4; face += 1) {
    const faceAngle = face * Math.PI * 0.5;
    const faceGroup = new THREE.Group();
    const bbScreen = new THREE.Mesh(bbScreenGeo, bbScreenMat);
    // * Live canvas texture — do not merge into static batches.
    bbScreen.userData.noMerge = true;
    faceGroup.add(bbScreen);
    const bbScanlines = new THREE.Mesh(bbScreenGeo, bbScanMat);
    bbScanlines.position.z = 0.01;
    bbScanlines.userData.noMerge = true;
    faceGroup.add(bbScanlines);
    for (let p = 0; p < bbFrameParts.length; p += 1) {
      const { x, y } = bbFrameParts[p];
      const cyanBar = new THREE.Mesh(bbFrameGeos[p].cyan, bbNeonCyanMat);
      cyanBar.position.set(x, y, 0.06);
      faceGroup.add(cyanBar);
      const haloBar = new THREE.Mesh(bbFrameGeos[p].halo, bbNeonMagentaMat);
      haloBar.position.set(x, y, 0.02);
      faceGroup.add(haloBar);
    }
    faceGroup.rotation.y = faceAngle;
    faceGroup.position.set(Math.sin(faceAngle) * 6.25, 0, Math.cos(faceAngle) * 6.25);
    billboardGroup.add(faceGroup);
  }

  // * Suspension spine — rises from the core up into the dark for the center-hung read.
  const bbSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 8), bbPoleMat);
  bbSpine.position.y = 8.8;
  billboardGroup.add(bbSpine);

  const bbLightL = new THREE.PointLight(0x22e6ff, 2, 8);
  bbLightL.position.set(-7, -1, 0);
  billboardGroup.add(bbLightL);
  const bbLightR = new THREE.PointLight(0xff2bd6, 2, 8);
  bbLightR.position.set(7, -1, 0);
  billboardGroup.add(bbLightR);
  billboardLightEntries = [
    { light: bbLightL },
    { light: bbLightR },
  ];

  billboardGroup.position.set(0, 15, 0);
  mergeStaticMeshesByMaterial(billboardGroup, { deep: true });
  scene.add(billboardGroup);
  registerMirrorExclude(billboardGroup);
}


/**
 * Animates billboard text glow and scanline UV scroll.
 * @param {number} nowMs Current time (ms).
 */
export function updateBillboard(nowMs) {
  if (!bbSmallCtx || !bbTex || !slTex) return;

  if (nowMs - bbLastRedraw > 100) {
    bbLastRedraw = nowMs;
    const t = (Math.sin(nowMs * 0.003) + 1) / 2;
    const r = Math.round(255 * (1 - t));
    bbSmallCtx.imageSmoothingEnabled = false;
    bbSmallCtx.fillStyle = "#000000";
    bbSmallCtx.fillRect(0, 0, 256, 64);
    // * Big text that fills the board, cycling through font stacks (~every 0.7s)
    // * with a size pulse — reads as an animated broadcast graphic.
    const font = BB_FONTS[Math.floor(nowMs / 700) % BB_FONTS.length];
    let size = Math.round(40 * (1 + Math.sin(nowMs * 0.004) * 0.08));
    bbSmallCtx.font = `bold ${size}px ${font}`;
    const textWidth = bbSmallCtx.measureText("CART RAVE").width;
    if (textWidth > 238) {
      size = Math.floor((size * 238) / textWidth);
      bbSmallCtx.font = `bold ${size}px ${font}`;
    }
    bbSmallCtx.textAlign = "center";
    bbSmallCtx.textBaseline = "middle";
    bbSmallCtx.shadowColor = "#ff2bd6";
    bbSmallCtx.shadowBlur = 8 + Math.sin(nowMs * 0.005) * 5;
    bbSmallCtx.fillStyle = `rgb(${r}, 255, 255)`;
    bbSmallCtx.fillText("CART RAVE", 128, 34);
    bbSmallCtx.shadowBlur = 0;
    bbTex.needsUpdate = true;
  }
  slTex.offset.y = (nowMs * 0.0005) % 1;
}


export { billboardGroup, billboardLightEntries };
