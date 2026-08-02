// arena.js — dancefloor record, pit wall, and spawn booth geometry + physics

import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAPIER } from "./physics/rapierInstance.js";
import { setShatterEnvironment } from "./cartShatter.js";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "./scene.js";
import { isLowQualityMode } from "./utils.js";
import { sampleArenaReactive } from "./arenaReactiveLights.js";
import { mergeStaticMeshesByMaterial } from "./utils/mergeStaticMeshes.js";
import { installCheapMirrorPass } from "./utils/cheapMirror.js";
import { getDebugParams } from "./utils/debugParams.js";

// * Play-time Reflector RT. Was 1024² (Pass 2 isolation: Reflector ≈ 60% of Classic High
// * GPU). 512² is a 4× bandwidth cut; cart/booth silhouettes still read on the vinyl at
// * fight distance. High tier still owns the only Reflector-on path (medium/low use solid floor).
const REFLECTOR_TEXTURE_SIZE_FULL = 512;
const REFLECTOR_TEXTURE_SIZE_BOOT = 256;

const VISUAL_RECORD_THICKNESS = 0.28;


/**
 * Procedural pit-shaft panel textures (albedo / normal / roughness).
 * Tiles around the cylinder so the throat reads as plated metal, not a smooth tube.
 * @returns {{
 *   map: THREE.CanvasTexture,
 *   normalMap: THREE.CanvasTexture,
 *   roughnessMap: THREE.CanvasTexture,
 * }}
 */
function buildPitSurfaceTextures() {
  const size = 512;
  const panelsU = 6; // * around-cylinder repeats come from texture.repeat
  const panelsV = 8;

  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext("2d");

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext("2d");

  // * Base: flat normal (128,128,255), mid roughness, dark plate albedo.
  aCtx.fillStyle = "#1a1228";
  aCtx.fillRect(0, 0, size, size);
  nCtx.fillStyle = "#8080ff";
  nCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = "#6a6a6a";
  rCtx.fillRect(0, 0, size, size);

  const cellW = size / panelsU;
  const cellH = size / panelsV;

  for (let v = 0; v < panelsV; v += 1) {
    for (let u = 0; u < panelsU; u += 1) {
      const x0 = u * cellW;
      const y0 = v * cellH;
      // * Slight per-panel brightness variance (stained / patched plating).
      const shade = 18 + ((u * 17 + v * 31) % 14);
      const g = 10 + ((u * 7 + v * 11) % 8);
      const b = 28 + ((u * 13 + v * 5) % 18);
      aCtx.fillStyle = `rgb(${shade},${g},${b})`;
      aCtx.fillRect(x0 + 3, y0 + 3, cellW - 6, cellH - 6);

      // * Inner inset plate (reads as recessed panel when combined with normals).
      aCtx.fillStyle = `rgb(${shade + 8},${g + 4},${b + 10})`;
      aCtx.fillRect(x0 + 10, y0 + 10, cellW - 20, cellH - 20);

      // * Rivet dots along panel edges.
      aCtx.fillStyle = "rgba(90,70,120,0.85)";
      const rivetStep = Math.max(14, cellW / 5);
      for (let rx = x0 + 12; rx < x0 + cellW - 12; rx += rivetStep) {
        aCtx.beginPath();
        aCtx.arc(rx, y0 + 8, 1.6, 0, Math.PI * 2);
        aCtx.fill();
        aCtx.beginPath();
        aCtx.arc(rx, y0 + cellH - 8, 1.6, 0, Math.PI * 2);
        aCtx.fill();
      }

      // * Normal map: bevelled panel (lighter = up/out). Flat 8080ff + edge cues.
      // * Left edge: pull left (-X) → more red channel low; right: high red.
      const gradL = nCtx.createLinearGradient(x0, y0, x0 + 12, y0);
      gradL.addColorStop(0, "#4040ff");
      gradL.addColorStop(1, "#8080ff");
      nCtx.fillStyle = gradL;
      nCtx.fillRect(x0, y0, 12, cellH);
      const gradR = nCtx.createLinearGradient(x0 + cellW - 12, y0, x0 + cellW, y0);
      gradR.addColorStop(0, "#8080ff");
      gradR.addColorStop(1, "#c0c0ff");
      nCtx.fillStyle = gradR;
      nCtx.fillRect(x0 + cellW - 12, y0, 12, cellH);
      const gradT = nCtx.createLinearGradient(x0, y0, x0, y0 + 12);
      gradT.addColorStop(0, "#80c0ff");
      gradT.addColorStop(1, "#8080ff");
      nCtx.fillStyle = gradT;
      nCtx.fillRect(x0, y0, cellW, 12);
      const gradB = nCtx.createLinearGradient(x0, y0 + cellH - 12, x0, y0 + cellH);
      gradB.addColorStop(0, "#8080ff");
      gradB.addColorStop(1, "#8040ff");
      nCtx.fillStyle = gradB;
      nCtx.fillRect(x0, y0 + cellH - 12, cellW, 12);

      // * Roughness: seams gritty, plate faces smoother (darker = smoother in three).
      rCtx.fillStyle = "#9a9a9a";
      rCtx.fillRect(x0, y0, cellW, 4);
      rCtx.fillRect(x0, y0 + cellH - 4, cellW, 4);
      rCtx.fillRect(x0, y0, 4, cellH);
      rCtx.fillRect(x0 + cellW - 4, y0, 4, cellH);
      rCtx.fillStyle = "#4a4a4a";
      rCtx.fillRect(x0 + 10, y0 + 10, cellW - 20, cellH - 20);

      // * Occasional grime streak.
      if ((u + v * 3) % 5 === 0) {
        aCtx.fillStyle = "rgba(0,0,0,0.22)";
        aCtx.fillRect(x0 + cellW * 0.35, y0 + 8, cellW * 0.12, cellH - 16);
        rCtx.fillStyle = "#b0b0b0";
        rCtx.fillRect(x0 + cellW * 0.35, y0 + 8, cellW * 0.12, cellH - 16);
      }
    }
  }

  // * Cross weld / seam lines over the whole tile for extra scale.
  aCtx.strokeStyle = "rgba(120,90,160,0.35)";
  aCtx.lineWidth = 2;
  for (let u = 0; u <= panelsU; u += 1) {
    aCtx.beginPath();
    aCtx.moveTo(u * cellW, 0);
    aCtx.lineTo(u * cellW, size);
    aCtx.stroke();
  }
  for (let v = 0; v <= panelsV; v += 1) {
    aCtx.beginPath();
    aCtx.moveTo(0, v * cellH);
    aCtx.lineTo(size, v * cellH);
    aCtx.stroke();
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = 4;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;

  // * Repeat must keep the TILE square, not the panel: the canvas is 512x512, so equal
  // * world width/height per tile is what gives undistorted texels. The old (16, 200)
  // * mapped a square canvas onto a 17.4m x 3.0m tile — 5.8x anisotropy, which rendered
  // * every round rivet as a ~5.8:1 oval.
  // *   circumference = 2*PI * pitInnerRadius(44.30m) = 278.4m; shaft depth = 69.6m.
  // *   U=32 -> tile 8.700m wide;  V=8 -> tile 8.700m tall  (square).
  // * Both integers, so the wrap seam stays clean. At this scale the authored cell
  // * (85.3x64px, 12px bevels, 1.6px rivets) lands at a 1.45m plate with 5.4cm rivets
  // * and a 20cm seam — believable shaft plating. Texel density doubles to 59 px/m,
  // * which matters because only the top ~30m of the shaft is ever visible.
  // * Changing pitInnerRadius or pitWallDepth invalidates these numbers — V is
  // * pitWallDepth / 8.700, and PIT-DEPTH-1 picked 69.6m precisely to keep it whole.
  map.repeat.set(32, 8);
  normalMap.repeat.set(32, 8);
  roughnessMap.repeat.set(32, 8);

  return { map, normalMap, roughnessMap };
}

/**
 * Pressed-vinyl surface maps for the dancefloor ring (albedo / normal / roughness).
 * Designed to sit over the Reflector as a translucent detail layer so the floor stays
 * mirror-bright while reading as real black vinyl (grooves, dust, hairline scratches).
 *
 * @returns {{
 *   map: THREE.CanvasTexture,
 *   normalMap: THREE.CanvasTexture,
 *   roughnessMap: THREE.CanvasTexture,
 * }}
 */
function buildVinylSurfaceTextures() {
  const size = isLowQualityMode() ? 512 : 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const nCanvas = document.createElement("canvas");
  nCanvas.width = size;
  nCanvas.height = size;
  const nCtx = nCanvas.getContext("2d");

  const rCanvas = document.createElement("canvas");
  rCanvas.width = size;
  rCanvas.height = size;
  const rCtx = rCanvas.getContext("2d");

  const c = size / 2;
  // * Near-black violet body — club vinyl, not pure void.
  ctx.fillStyle = "#0c0818";
  ctx.fillRect(0, 0, size, size);
  nCtx.fillStyle = "#8080ff";
  nCtx.fillRect(0, 0, size, size);
  // * Mid-dark roughness: clearcoat + Reflector carry the mirror; grooves stay matte-er.
  rCtx.fillStyle = "#5a5a5a";
  rCtx.fillRect(0, 0, size, size);

  // * Dense concentric groove rings (radial in UV: radius from center).
  const grooveCount = isLowQualityMode() ? 90 : 160;
  for (let i = 0; i < grooveCount; i += 1) {
    const t = (i + 0.5) / grooveCount;
    const rad = size * (0.08 + t * 0.42);
    // * Alternating micro-brightness = pressed land / groove valley.
    const bright = i % 2 === 0;
    const a = bright ? 0.07 + (i % 7) * 0.004 : 0.03;
    ctx.strokeStyle = bright
      ? `rgba(62, 42, 88, ${a})`
      : `rgba(4, 2, 10, ${0.12 + (i % 5) * 0.01})`;
    ctx.lineWidth = bright ? 1.1 : 0.85;
    ctx.beginPath();
    ctx.arc(c, c, rad, 0, Math.PI * 2);
    ctx.stroke();

    // * Normal: slight radial ridge — red/green bias on ring edges (world-up is blue).
    if (i % 2 === 0) {
      nCtx.strokeStyle = "rgba(140, 120, 255, 0.55)";
      nCtx.lineWidth = 1.2;
      nCtx.beginPath();
      nCtx.arc(c, c, rad, 0, Math.PI * 2);
      nCtx.stroke();
      nCtx.strokeStyle = "rgba(100, 140, 255, 0.4)";
      nCtx.lineWidth = 1.0;
      nCtx.beginPath();
      nCtx.arc(c, c, rad + 0.8, 0, Math.PI * 2);
      nCtx.stroke();
    }

    // * Groove valleys rougher (brighter in roughness map), lands smoother.
    rCtx.strokeStyle = bright ? "#3a3a3a" : "#787878";
    rCtx.lineWidth = bright ? 1.0 : 1.4;
    rCtx.beginPath();
    rCtx.arc(c, c, rad, 0, Math.PI * 2);
    rCtx.stroke();
  }

  // * Hairline radial scratches (play wear).
  const scratchCount = isLowQualityMode() ? 18 : 36;
  for (let i = 0; i < scratchCount; i += 1) {
    const a0 = (i / scratchCount) * Math.PI * 2 + (i % 3) * 0.07;
    const r0 = size * (0.12 + (i % 5) * 0.06);
    const r1 = r0 + size * (0.08 + (i % 4) * 0.04);
    ctx.strokeStyle = `rgba(180, 160, 220, ${0.04 + (i % 3) * 0.015})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0);
    ctx.lineTo(c + Math.cos(a0) * r1, c + Math.sin(a0) * r1);
    ctx.stroke();
    rCtx.strokeStyle = "#9a9a9a";
    rCtx.lineWidth = 1;
    rCtx.beginPath();
    rCtx.moveTo(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0);
    rCtx.lineTo(c + Math.cos(a0) * r1, c + Math.sin(a0) * r1);
    rCtx.stroke();
  }

  // * Soft dust / fingerprint blotches (low contrast).
  for (let i = 0; i < 28; i += 1) {
    const ang = Math.random() * Math.PI * 2;
    const rad = size * (0.15 + Math.random() * 0.32);
    const x = c + Math.cos(ang) * rad;
    const y = c + Math.sin(ang) * rad;
    const r = 6 + Math.random() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(40, 28, 55, 0.12)");
    g.addColorStop(1, "rgba(40, 28, 55, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // * Specular highlight band hint (static sheen catch — Reflector does the live mirror).
  const sheen = ctx.createRadialGradient(c * 0.72, c * 0.62, size * 0.02, c * 0.78, c * 0.68, size * 0.28);
  sheen.addColorStop(0, "rgba(140, 110, 200, 0.1)");
  sheen.addColorStop(0.45, "rgba(80, 50, 120, 0.04)");
  sheen.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // * Inner + outer run-in grooves (label edge / rim land).
  for (const radFrac of [0.09, 0.095, 0.48, 0.485]) {
    ctx.strokeStyle = "rgba(90, 60, 130, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, size * radFrac, 0, Math.PI * 2);
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.needsUpdate = true;

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  return { map, normalMap, roughnessMap };
}

/**
 * Booth-side metal plate texture: panel seams, bolts, scuffs — shared across truss /
 * speakers / platforms so spawn stages read as hardware, not flat emissive plastic.
 *
 * @returns {THREE.CanvasTexture}
 */
function buildBoothMetalTexture() {
  const size = isLowQualityMode() ? 256 : 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2a2a38";
  ctx.fillRect(0, 0, size, size);

  // * Plate grid.
  const cells = 4;
  const cell = size / cells;
  for (let gy = 0; gy < cells; gy += 1) {
    for (let gx = 0; gx < cells; gx += 1) {
      const x0 = gx * cell;
      const y0 = gy * cell;
      const shade = 36 + ((gx * 13 + gy * 19) % 18);
      ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 10})`;
      ctx.fillRect(x0 + 2, y0 + 2, cell - 4, cell - 4);
      // * Inset face.
      ctx.fillStyle = `rgb(${shade + 10},${shade + 10},${shade + 18})`;
      ctx.fillRect(x0 + 8, y0 + 8, cell - 16, cell - 16);
      // * Corner bolts.
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      for (const [bx, by] of [
        [x0 + 10, y0 + 10],
        [x0 + cell - 10, y0 + 10],
        [x0 + 10, y0 + cell - 10],
        [x0 + cell - 10, y0 + cell - 10],
      ]) {
        ctx.beginPath();
        ctx.arc(bx, by, size * 0.012, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(160,160,180,0.35)";
        ctx.beginPath();
        ctx.arc(bx - 1, by - 1, size * 0.006, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.45)";
      }
    }
  }

  // * Seams.
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= cells; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }

  // * Scuffs / wear.
  for (let i = 0; i < 40; i += 1) {
    ctx.strokeStyle = `rgba(200,200,220,${0.04 + Math.random() * 0.06})`;
    ctx.lineWidth = 1 + Math.random();
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 18);
    ctx.stroke();
  }

  // * Grime streaks.
  for (let i = 0; i < 12; i += 1) {
    const x = Math.random() * size;
    ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`;
    ctx.fillRect(x, 0, 2 + Math.random() * 4, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Speaker grille / mesh fabric — dark weave with slight gloss pores.
 * @returns {THREE.CanvasTexture}
 */
function buildBoothGrilleTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12121c";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#1a1a28";
  const step = 5;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      if (((x / step) + (y / step)) % 2 === 0) {
        ctx.fillRect(x, y, step - 1, step - 1);
      }
    }
  }
  // * Speckle.
  for (let i = 0; i < 400; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(4, 6);
  tex.needsUpdate = true;
  return tex;
}

/**
 * * Deck record — the 12" on each turntable. CylinderGeometry caps take a disc UV in
 * * [0,1], so a radial design maps straight onto the top face without any UV work.
 * * Small canvas on purpose: eight of these sit at 0.36m radius and are never the
 * * subject of a shot, they are the detail that makes a DJ booth read as in-use.
 * @returns {THREE.CanvasTexture}
 */
function buildDeckRecordTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;

  // * Cap UVs put the disc edge at r = size/2, so draw to that radius, not the corner.
  ctx.fillStyle = "#07060c";
  ctx.fillRect(0, 0, size, size);

  // * Grooves — dense concentric hairlines from the label edge out to the rim.
  for (let i = 0; i < 54; i += 1) {
    const t = (i + 0.5) / 54;
    const r = c * (0.34 + t * 0.63);
    ctx.strokeStyle = i % 2 === 0
      ? `rgba(96, 78, 128, ${0.05 + (i % 5) * 0.006})`
      : "rgba(2, 1, 6, 0.16)";
    ctx.lineWidth = i % 2 === 0 ? 1.1 : 0.8;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // * Sheen band — a record catches one highlight arc, never an even shine.
  const sheen = ctx.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, "rgba(150, 120, 210, 0)");
  sheen.addColorStop(0.42, "rgba(150, 120, 210, 0.09)");
  sheen.addColorStop(0.6, "rgba(150, 120, 210, 0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.97, 0, Math.PI * 2);
  ctx.fill();

  // * Paper label + run-out ring. Warm off-white so the booth neon tints it.
  ctx.fillStyle = "#d8cfc2";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.28, 0, Math.PI * 2);
  ctx.stroke();

  // * Spindle hole.
  ctx.fillStyle = "#0a0810";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.035, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * * Platter wear — grayscale roughness break-up so the chrome stops reading as a
 * * perfect mirror. Handled prints and dust, not damage.
 * @returns {THREE.CanvasTexture}
 */
function buildPlatterWearTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;

  // * Mid-dark base = fairly smooth; every mark below only ever ADDS roughness.
  ctx.fillStyle = "#2e2e2e";
  ctx.fillRect(0, 0, size, size);

  // * Concentric machining rings on the platter face.
  for (let i = 0; i < 22; i += 1) {
    ctx.strokeStyle = `rgba(140,140,140,${0.05 + (i % 3) * 0.02})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, c * (0.12 + (i / 22) * 0.85), 0, Math.PI * 2);
    ctx.stroke();
  }

  // * Smudges — soft blobs where hands land.
  for (let i = 0; i < 14; i += 1) {
    const ang = (i * 2.399) % (Math.PI * 2);
    const rad = c * (0.2 + ((i * 37) % 60) / 100);
    const x = c + Math.cos(ang) * rad;
    const y = c + Math.sin(ang) * rad;
    const r = 6 + ((i * 13) % 14);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(190,190,190,0.5)");
    g.addColorStop(1, "rgba(190,190,190,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function buildRecordRingGeometry({
  outerRadius,
  innerRadius,
  thickness,
  curveSegments,
  bevelThickness = 0.15,
  bevelSize = 0.15,
}) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  // * ExtrudeGeometry's default WorldUVGenerator emits UVs straight from SHAPE
  // * COORDINATES — for a 26.4m record that is roughly -26..+26, not 0..1. The vinyl maps
  // * set no wrapS/wrapT, so they default to ClampToEdge and every one of those UVs
  // * resolved to the canvas edge pixel: the body rendered as flat #0c0818.
  // * Adding RepeatWrapping instead would be WORSE — UVs of +/-26 tile the radial groove
  // * design ~52x across the record, a grid of tiny records.
  // * This projects x,y into 0..1 across the outer diameter, which is exactly
  // * RingGeometry's own convention, so the body and the vinyl detail ring stacked on top
  // * of it finally agree about where the grooves are.
  // * Side walls (outer rim, inner hole) get the same projection: all four corners of a
  // * wall quad share x,y and differ only in depth, so each samples the texture at its own
  // * radius — the rim reads as the edge of the pressing, which is what it is.
  const uvScale = 1 / (2 * outerRadius);
  /** @param {number[]} v @param {number} i @returns {THREE.Vector2} */
  const shapeUV = (v, i) => new THREE.Vector2(v[i * 3] * uvScale + 0.5, v[i * 3 + 1] * uvScale + 0.5);
  const recordUVGenerator = {
    generateTopUV: (_geometry, vertices, a, b, c) => [
      shapeUV(vertices, a), shapeUV(vertices, b), shapeUV(vertices, c),
    ],
    generateSideWallUV: (_geometry, vertices, a, b, c, d) => [
      shapeUV(vertices, a), shapeUV(vertices, b), shapeUV(vertices, c), shapeUV(vertices, d),
    ],
  };

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: thickness,
    bevelEnabled: true,
    bevelThickness,
    bevelSize,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments,
    UVGenerator: recordUVGenerator,
  });

  // ExtrudeGeometry extrudes along +Z; center it and rotate so thickness becomes Y (floor height).
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * * Procedural record physics mesh: annular floor with beveled outer rim and a chamfered
 * * inner hole. Visual hole stays at innerRadius; physics flat surface ends at
 * * playInnerR (= innerRadius + holeClearance), then chamferWidth slopes inward to
 * * chamferInnerR before the open void. Must stay aligned with getRecordFloorInnerR()
 * * in simulation.js (floorInnerR = innerRadius).
 */
function buildRecordPhysicsGeometry({
  outerRadius,
  innerRadius,
  thickness,
  chamferWidth = 0.35,
  holeClearance = 0.45,
  outerBevel = 0.12,
  segments = 72,
}) {
  const positions = [];
  const indices = [];
  const halfT = thickness / 2;
  const topY = halfT;
  const bottomY = -halfT;
  const outerTopR = outerRadius - outerBevel;

  // * Flat playing surface ends slightly beyond the visual hole (holeClearance).
  // * The chamfer ramp then slopes inward/down over chamferWidth before the open void.
  const playInnerR = innerRadius + Math.max(holeClearance, 0);
  const chamferInnerR = Math.max(innerRadius, playInnerR - Math.max(chamferWidth, 0));

  const pushVertex = (x, y, z) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const pushTri = (a, b, c) => {
    indices.push(a, b, c);
  };
  const addQuad = (i0, i1, i2, i3) => {
    pushTri(i0, i1, i2);
    pushTri(i0, i2, i3);
  };

  let prevOt = null;
  let prevPi = null;
  let prevCi = null;
  let prevOb = null;
  let prevOr = null;

  for (let i = 0; i < segments; i += 1) {
    const t0 = (i / segments) * Math.PI * 2;
    const t1 = ((i + 1) / segments) * Math.PI * 2;
    const cos0 = Math.cos(t0);
    const sin0 = Math.sin(t0);
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);

    // * Reuse seam vertices from the previous segment instead of duplicating radial edges.
    const ot0 = prevOt ?? pushVertex(outerTopR * cos0, topY, outerTopR * sin0);
    const pi0 = prevPi ?? pushVertex(playInnerR * cos0, topY, playInnerR * sin0);
    const ci0 = prevCi ?? pushVertex(chamferInnerR * cos0, bottomY, chamferInnerR * sin0);
    const ob0 = prevOb ?? pushVertex(outerRadius * cos0, bottomY, outerRadius * sin0);
    const or0 = prevOr ?? pushVertex(outerRadius * cos0, topY, outerRadius * sin0);

    const ot1 = pushVertex(outerTopR * cos1, topY, outerTopR * sin1);
    const pi1 = pushVertex(playInnerR * cos1, topY, playInnerR * sin1);
    const ci1 = pushVertex(chamferInnerR * cos1, bottomY, chamferInnerR * sin1);
    const ob1 = pushVertex(outerRadius * cos1, bottomY, outerRadius * sin1);
    const or1 = pushVertex(outerRadius * cos1, topY, outerRadius * sin1);

    // Top playing surface — flat annulus up to the chamfer start.
    addQuad(ot0, ot1, pi1, pi0);

    // Inner hole chamfer — gentle inward slope instead of a vertical drop at the rim.
    addQuad(pi0, pi1, ci1, ci0);

    // Underside substrate ring; open void begins at chamferInnerR.
    addQuad(ob0, ob1, ci1, ci0);

    // Outer top bevel — matches the visual record's softened outer edge.
    addQuad(or0, or1, ot1, ot0);

    // Outer rim wall.
    addQuad(ot0, ot1, ob1, ob0);

    prevOt = ot1;
    prevPi = pi1;
    prevCi = ci1;
    prevOb = ob1;
    prevOr = or1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildRecordSurfaceGrooves(parentMesh, config, visualRecordThickness) {
  const surf = config.record.surface;
  const th = visualRecordThickness;
  const yBase = th / 2;

  const rings = surf.concentricRings;
  const rMin = rings.innerRadius;
  const rMax = rings.outerRadius;

  const grooveGeometries = [];
  // * Sparse geometric accents — vinyl texture owns density; these catch specular.
  const ringColorA = new THREE.Color(0x4a3560);
  const ringColorB = new THREE.Color(0x181420);
  const ringColorC = new THREE.Color(0x3a2460);
  const step = Math.max(1, Math.floor(rings.count / 48));

  for (let i = 0; i < rings.count; i += step) {
    const t = (i + 0.5) / rings.count;
    const rCenter = rMin + (rMax - rMin) * t;
    const halfW = rings.lineWidth * 0.7;
    let inner = rCenter - halfW;
    let outer = rCenter + halfW;
    inner = Math.max(inner, rMin + 0.001);
    outer = Math.min(outer, rMax - 0.001);
    if (outer - inner < 0.002) continue;

    const ringGeo = new THREE.RingGeometry(inner, outer, 64);
    ringGeo.rotateX(-Math.PI / 2);

    const ringColor = i % (step * 5) === 0 ? ringColorC : (i % (step * 2) === 0 ? ringColorA : ringColorB);
    const pos = ringGeo.attributes.position;
    const colorArray = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v += 1) {
      colorArray[v * 3] = ringColor.r;
      colorArray[v * 3 + 1] = ringColor.g;
      colorArray[v * 3 + 2] = ringColor.b;
    }
    ringGeo.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
    grooveGeometries.push(ringGeo);
  }

  if (grooveGeometries.length === 0) {
    return null;
  }

  const mergedGrooves = BufferGeometryUtils.mergeGeometries(grooveGeometries, false);
  grooveGeometries.forEach((g) => g.dispose());

  // * Thin metallic groove accents over the reflective vinyl layer.
  const ringMat = createPhysicalMaterial({
    vertexColors: true,
    roughness: 0.28,
    metalness: 0.72,
    depthWrite: false,
    transparent: true,
    opacity: 0.38,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
  });
  const ringMesh = new THREE.Mesh(mergedGrooves, ringMat);
  ringMesh.userData.recordSurfacePart = "groove";
  ringMesh.position.y = yBase + rings.yOffset + 0.007;
  ringMesh.renderOrder = 1;
  parentMesh.add(ringMesh);
  return { ringMesh, ringMat, mergedGrooves };
}

/**
 * Light rave dancefloor polish — a pair of race tracks + label dance circle.
 * Vinyl material + Reflector carry the surface; neon is accent only (not groove filler).
 *
 * @param {THREE.Mesh} recordMesh
 * @param {object} config
 * @param {number} visualRecordThickness
 * @returns {{
 *   group: THREE.Group,
 *   geos: THREE.BufferGeometry[],
 *   mats: THREE.Material[],
 *   textures: THREE.Texture[],
 *   update: (timeMs: number) => void,
 * }}
 */
function buildDancefloorRaveDecor(recordMesh, config, visualRecordThickness) {
  const group = new THREE.Group();
  group.name = "raveDancefloorDecor";
  /** @type {THREE.BufferGeometry[]} */
  const geos = [];
  /** @type {THREE.Material[]} */
  const mats = [];
  /** @type {THREE.Texture[]} */
  const textures = [];
  /** @type {THREE.Material[]} */
  const pulseMats = [];

  const y =
    visualRecordThickness / 2 +
    (config.record.surface?.concentricRings?.yOffset ?? 0.3) +
    0.018;
  // --- Two neon race tracks (mid + outer) — vinyl grooves fill the rest ---
  const raceRadii = [14.2, 22.6];
  const raceRingColors = [0xff2bd6, 0x22e6ff];
  for (let i = 0; i < raceRadii.length; i += 1) {
    const geo = new THREE.TorusGeometry(raceRadii[i], 0.038, 10, 96);
    geos.push(geo);
    const mat = new THREE.MeshBasicMaterial({
      color: raceRingColors[i % 2],
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    mat.userData.baseOpacity = 0.48;
    mat.userData.pulsePhase = i * 1.1;
    mats.push(mat);
    pulseMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y + 0.002 * i;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // --- Dance circle around the label (double ring) ---
  {
    const innerGeo = new THREE.TorusGeometry(8.15, 0.06, 10, 64);
    const outerGeo = new THREE.TorusGeometry(8.55, 0.035, 10, 64);
    geos.push(innerGeo, outerGeo);
    const matA = new THREE.MeshBasicMaterial({
      color: 0xff2bd6,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const matB = new THREE.MeshBasicMaterial({
      color: 0x22e6ff,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    matA.userData.baseOpacity = 0.62;
    matA.userData.pulsePhase = 0.2;
    matB.userData.baseOpacity = 0.48;
    matB.userData.pulsePhase = 1.7;
    mats.push(matA, matB);
    pulseMats.push(matA, matB);
    for (const [geo, mat, dy] of /** @type {const} */ ([
      [innerGeo, matA, 0.01],
      [outerGeo, matB, 0.012],
    ])) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = y + dy;
      mesh.renderOrder = 2;
      group.add(mesh);
    }
  }

  recordMesh.add(group);

  return {
    group,
    geos,
    mats,
    textures,
    update(timeMs) {
      const t = timeMs * 0.001;
      for (let i = 0; i < pulseMats.length; i += 1) {
        const mat = pulseMats[i];
        const base = typeof mat.userData.baseOpacity === "number" ? mat.userData.baseOpacity : 0.5;
        const phase = typeof mat.userData.pulsePhase === "number" ? mat.userData.pulsePhase : 0;
        mat.opacity = base * (0.72 + 0.28 * Math.sin(t * 2.4 + phase));
      }
    },
  };
}

function buildBooths(scene, world, config, boothNeonMeshes, boothColliderHandles) {
  const B = config.booth;
  const arenaR = config.record.radius;

  const boothCenterDist = arenaR + B.gapDistance + B.rampLength + B.platformDepth / 2;
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  const boothColors = [
    0xff2bd6,
    0x2bff6e,
    0x2bd6ff,
    0xff6b2b,
  ];

  // * Shared booth surface maps — plate metal + speaker grille.
  const boothMetalTex = buildBoothMetalTexture();
  const boothGrilleTex = buildBoothGrilleTexture();
  const deckRecordTex = buildDeckRecordTexture();
  const platterWearTex = buildPlatterWearTexture();

  // * Booth truss — plated steel (map) so towers read as hardware, not grey bars.
  const trussLegMat = createPhysicalMaterial({
    map: boothMetalTex,
    color: 0xb0b0c4,
    roughness: 0.38,
    metalness: 0.88,
  });
  const trussCrossMat = createPhysicalMaterial({
    map: boothMetalTex,
    color: 0x9696aa,
    roughness: 0.42,
    metalness: 0.8,
  });
  const trussLightGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5);
  const mixerGeo = new THREE.BoxGeometry(3.0, 0.5, 1.2);
  const mixerMat = createPhysicalMaterial({
    map: boothMetalTex,
    color: 0x3a3a55,
    roughness: 0.55,
    metalness: 0.55,
  });
  const mixerPanelGeo = new THREE.BoxGeometry(2.6, 0.06, 0.8);
  const deckGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16);
  // * Booth DJ deck — Physical: metalness 0.8, roughness 0.25
  const deckMat = createPhysicalMaterial({
    map: boothMetalTex,
    color: 0x222230,
    roughness: 0.28,
    metalness: 0.85,
  });
  const spkGeo = new THREE.BoxGeometry(0.9, 1.6, 0.9);
  // * Booth speaker cabinets — grille fabric + dark metal tint.
  const spkMat = createPhysicalMaterial({
    map: boothGrilleTex,
    color: 0x4a4a66,
    roughness: 0.72,
    metalness: 0.35,
  });
  const coneGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12);
  const coneMat = createPhysicalMaterial({
    map: boothMetalTex,
    color: 0x55556a,
    roughness: 0.55,
    metalness: 0.4,
  });
  const wooferGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12);
  const platterGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24);
  // * DJ platter — chrome, but not a showroom mirror: the wear map carries machining
  // * rings and handling smudges so it reads as equipment that gets touched. Roughness
  // * raised 0.12 -> 0.3 as the map's floor; the map only ever adds from there.
  const platterMat = createPhysicalMaterial({
    color: 0x222222,
    roughness: 0.3,
    metalness: 0.9,
    roughnessMap: platterWearTex,
  });
  // * The 12" on the platter. Slightly under the platter radius (0.36 vs 0.42) so the
  // * chrome rim still reads, and thin enough that it sits under the spindle dot.
  const deckRecordGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.006, 32);
  const deckRecordMat = createPhysicalMaterial({
    map: deckRecordTex,
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.2,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
  });
  const knobGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
  const knobMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc, roughness: 0.2, metalness: 0.8,
  });
  const sidePanelGeo = new THREE.PlaneGeometry(B.platformDepth * 0.8, 1.0);
  const platGeo = new THREE.BoxGeometry(B.platformWidth, B.platformThickness, B.platformDepth);
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
  // * 16 radial segments — smoother neon tubes under bloom; shared geo so cost is free.
  const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 16);

  /**
   * Caps emissive intensity for high-luma booth hues. Rec.709 (and UnrealBloom's
   * luma high-pass) weight green ~3.4× red, so the green spawn booth's
   * toneMapped:false beacons used to bloom into a pure-white floor sheet while
   * pink/orange booths looked fine. Low-luma hues keep full base intensity.
   * @param {number} hex
   * @param {number} baseIntensity
   * @param {number} [refLuma=0.42] ~ pink booth 0xff2bd6
   * @returns {number}
   */
  function boothEmissiveIntensity(hex, baseIntensity, refLuma = 0.42) {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma <= refLuma) return baseIntensity;
    return baseIntensity * (refLuma / luma);
  }

  // * Per-booth neon hue is sticky: the frame loop pulses emissiveIntensity only
  // * (see main.js). Overwriting color/emissive every frame used to collapse all
  // * four spawn corners into one pink↔cyan wash.
  const neonMats = boothColors.map((color, boothIndex) => {
    const ei = boothEmissiveIntensity(color, 1.5);
    const mat = createPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: ei,
      roughness: 0.25,
      metalness: 0.85,
      toneMapped: false,
    });
    mat.userData.baseEmissiveIntensity = ei;
    // * 90° phase offsets so adjacent booths breathe out of sync.
    mat.userData.neonPulsePhase = boothIndex * (Math.PI / 2);
    return mat;
  });
  const trussLightMats = boothColors.map((color) => {
    const ei = boothEmissiveIntensity(color, 2.0);
    return createPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: ei,
      roughness: 0.2,
      metalness: 0.7,
      toneMapped: false,
    });
  });
  const platMats = boothColors.map((color) => {
    const mat = createPhysicalMaterial({
      map: boothMetalTex,
      color,
      roughness: 0.48,
      metalness: 0.55,
      emissive: color,
      emissiveIntensity: boothEmissiveIntensity(color, 0.18),
    });
    return mat;
  });
  const sidePanelMats = boothColors.map((color) => new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const diamondMats = boothColors.map((color) => new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const panelMats = boothColors.map((color) => createPhysicalMaterial({
    map: boothMetalTex,
    color: 0x55557a,
    roughness: 0.38,
    metalness: 0.7,
    emissive: color,
    emissiveIntensity: boothEmissiveIntensity(color, 0.2),
  }));
  const dotMats = boothColors.map((color) => new THREE.MeshBasicMaterial({ color }));

  const neonAxis = new THREE.Vector3(0, 1, 0);
  const neonDir = new THREE.Vector3();
  const neonMid = new THREE.Vector3();
  const diamondGeo = new THREE.PlaneGeometry(0.5, 0.8);
  diamondGeo.rotateZ(Math.PI / 4);
  const dotGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.025, 12);

  function makeNeonTube(p1, p2, radius, neonMat) {
    neonDir.subVectors(p2, p1);
    const len = neonDir.length();
    const mesh = new THREE.Mesh(UNIT_CYL, neonMat);
    mesh.scale.set(radius, len, radius);
    neonMid.addVectors(p1, p2).multiplyScalar(0.5);
    mesh.position.copy(neonMid);
    mesh.quaternion.setFromUnitVectors(neonAxis, neonDir.normalize());
    return mesh;
  }

  // * Truss towers — InstancedMesh legs/braces across all 16 towers (4 booths × 4
  // * corners). Was ~320 individual Mesh draws of the same unit box.
  const TRUSS_HEIGHT = 6;
  const TRUSS_LEG_W = 0.12;
  const TRUSS_W = 0.45;
  const TRUSS_BRACE_H = 0.08;
  const TRUSS_BRACE_LEVELS = Math.floor(TRUSS_HEIGHT / 2) + 1;
  const TRUSS_LEG_OFFSETS = [
    [-TRUSS_W / 2, -TRUSS_W / 2],
    [TRUSS_W / 2, -TRUSS_W / 2],
    [-TRUSS_W / 2, TRUSS_W / 2],
    [TRUSS_W / 2, TRUSS_W / 2],
  ];
  const TRUSSES_PER_BOOTH = 4;
  const BOOTH_COUNT = 4;
  const totalTrusses = BOOTH_COUNT * TRUSSES_PER_BOOTH;
  const totalLegs = totalTrusses * TRUSS_LEG_OFFSETS.length;
  const totalBraces = totalTrusses * TRUSS_BRACE_LEVELS * 4;
  const trussLegMesh = new THREE.InstancedMesh(UNIT_BOX, trussLegMat, totalLegs);
  const trussBraceMesh = new THREE.InstancedMesh(UNIT_BOX, trussCrossMat, totalBraces);
  trussLegMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  trussBraceMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  trussLegMesh.frustumCulled = true;
  trussBraceMesh.frustumCulled = true;
  let trussLegIdx = 0;
  let trussBraceIdx = 0;
  const trussDummy = new THREE.Object3D();
  const trussYAxis = new THREE.Vector3(0, 1, 0);

  /**
   * Places one truss box instance in world space from booth-local coordinates.
   * Booth yaw matches THREE.Object3D rotation.y (cos/sin on XZ).
   */
  function setTrussInstance(mesh, index, lx, ly, lz, sx, sy, sz, cx, cz, yaw) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    trussDummy.position.set(cx + lx * cos + lz * sin, ly, cz - lx * sin + lz * cos);
    trussDummy.quaternion.setFromAxisAngle(trussYAxis, yaw);
    trussDummy.scale.set(sx, sy, sz);
    trussDummy.updateMatrix();
    mesh.setMatrixAt(index, trussDummy.matrix);
  }

  // * Spawn-platform fog — one shared SpriteMaterial per booth color (was 160 unique
  // * materials). Opacity breathes on the shared mats; sprites drift/scale individually.
  const fogPuffCount = 40;
  const fogPuffCanvas = document.createElement("canvas");
  fogPuffCanvas.width = 64;
  fogPuffCanvas.height = 64;
  const fogPuffCtx = fogPuffCanvas.getContext("2d");
  const fogPuffGrad = fogPuffCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  fogPuffGrad.addColorStop(0, "rgba(255,255,255,0.3)");
  fogPuffGrad.addColorStop(0.5, "rgba(255,255,255,0.08)");
  fogPuffGrad.addColorStop(1, "rgba(255,255,255,0)");
  fogPuffCtx.fillStyle = fogPuffGrad;
  fogPuffCtx.fillRect(0, 0, 64, 64);
  const fogPuffTex = new THREE.CanvasTexture(fogPuffCanvas);
  const fogPuffMats = boothColors.map((color, boothIndex) => {
    const mat = new THREE.SpriteMaterial({
      map: fogPuffTex,
      color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    mat.userData.baseOpacity = 0.3;
    mat.userData.fogPulsePhase = boothIndex * (Math.PI / 2);
    return mat;
  });
  const boothGroups = [];
  const fogSprites = [];
  const boothBodies = [];

  for (let i = 0; i < 4; i += 1) {
    const angle = angles[i];
    const neonMat = neonMats[i];

    const cx = boothCenterDist * Math.cos(angle);
    const cz = boothCenterDist * Math.sin(angle);
    const topY = B.platformY;

    const yaw = Math.PI / 2 - angle;

    const boothGroup = new THREE.Group();
    boothGroup.position.set(cx, 0, cz);
    boothGroup.rotation.y = yaw;

    // ===== PLATFORM SLAB =====
    const platMesh = new THREE.Mesh(platGeo, platMats[i]);
    platMesh.position.set(0, topY, 0);
    boothGroup.add(platMesh);

    // Platform collider (world space)
    const platBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, topY, cz),
    );
    const halfYaw = yaw / 2;
    platBody.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
    const boothCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(B.platformWidth / 2, B.platformThickness / 2, B.platformDepth / 2)
        .setFriction(B.friction)
        .setRestitution(B.restitution),
      platBody,
    );
    boothColliderHandles.push(boothCollider.handle);
    boothBodies.push(platBody);

    // ===== NEON EDGE STRIPS (platform perimeter) =====
    const pw = B.platformWidth / 2;
    const pd = B.platformDepth / 2;
    const edgeY = topY + B.platformThickness / 2 + 0.02;
    const edgeR = 0.035;

    const platformEdges = [
      [new THREE.Vector3(-pw, edgeY, -pd), new THREE.Vector3(pw, edgeY, -pd)],
      [new THREE.Vector3(-pw, edgeY, pd), new THREE.Vector3(pw, edgeY, pd)],
      [new THREE.Vector3(-pw, edgeY, -pd), new THREE.Vector3(-pw, edgeY, pd)],
      [new THREE.Vector3(pw, edgeY, -pd), new THREE.Vector3(pw, edgeY, pd)],
    ];
    for (const [a, b] of platformEdges) {
      const tube = makeNeonTube(a, b, edgeR, neonMat);
      boothGroup.add(tube);
      boothNeonMeshes.push(tube);
    }

    // * Runway chevrons on the deck — point toward the dancefloor (local -Z).
    if (!isLowQualityMode()) {
      for (let c = 0; c < 4; c += 1) {
        const chev = new THREE.Mesh(
          new THREE.BoxGeometry(1.0 - c * 0.14, 0.05, 0.16),
          neonMat,
        );
        chev.position.set(0, edgeY + 0.02, -pd * 0.2 - c * 0.5);
        boothGroup.add(chev);
        boothNeonMeshes.push(chev);
      }
    }

    // ===== SIDE RAILINGS (platform only) =====
    const rh = B.railHeight;
    const railBaseY = topY + B.platformThickness / 2;
    const railTopY = railBaseY + rh;
    const tubeR = B.railThickness / 2;

    for (const ry of [railBaseY, railTopY]) {
      const t = makeNeonTube(
        new THREE.Vector3(-pw, ry, pd),
        new THREE.Vector3(pw, ry, pd),
        tubeR, neonMat,
      );
      boothGroup.add(t);
      boothNeonMeshes.push(t);
    }

    for (const sz of [-pd, pd]) {
      const t = makeNeonTube(
        new THREE.Vector3(-pw, railBaseY, sz),
        new THREE.Vector3(-pw, railTopY, sz),
        tubeR, neonMat,
      );
      boothGroup.add(t);
      boothNeonMeshes.push(t);
    }
    const ltop = makeNeonTube(
      new THREE.Vector3(-pw, railTopY, -pd),
      new THREE.Vector3(-pw, railTopY, pd),
      tubeR, neonMat,
    );
    boothGroup.add(ltop);
    boothNeonMeshes.push(ltop);

    for (const sz of [-pd, pd]) {
      const t = makeNeonTube(
        new THREE.Vector3(pw, railBaseY, sz),
        new THREE.Vector3(pw, railTopY, sz),
        tubeR, neonMat,
      );
      boothGroup.add(t);
      boothNeonMeshes.push(t);
    }
    const rtop = makeNeonTube(
      new THREE.Vector3(pw, railTopY, -pd),
      new THREE.Vector3(pw, railTopY, pd),
      tubeR, neonMat,
    );
    boothGroup.add(rtop);
    boothNeonMeshes.push(rtop);

    // ===== TRUSS TOWERS (4 corners — instanced legs/braces, local light mesh) =====
    const trussBaseY = railBaseY;
    const trussOffsets = [
      [-pw + 0.5, -pd + 0.5],
      [pw - 0.5, -pd + 0.5],
      [-pw + 0.5, pd - 0.5],
      [pw - 0.5, pd - 0.5],
    ];
    for (const [tx, tz] of trussOffsets) {
      for (const [ox, oz] of TRUSS_LEG_OFFSETS) {
        setTrussInstance(
          trussLegMesh, trussLegIdx,
          tx + ox, trussBaseY + TRUSS_HEIGHT / 2, tz + oz,
          TRUSS_LEG_W, TRUSS_HEIGHT, TRUSS_LEG_W,
          cx, cz, yaw,
        );
        trussLegIdx += 1;
      }
      for (let b = 0; b < TRUSS_BRACE_LEVELS; b += 1) {
        const by = trussBaseY + b * 2;
        setTrussInstance(
          trussBraceMesh, trussBraceIdx,
          tx, by, tz - TRUSS_W / 2,
          TRUSS_W, TRUSS_BRACE_H, TRUSS_BRACE_H,
          cx, cz, yaw,
        );
        trussBraceIdx += 1;
        setTrussInstance(
          trussBraceMesh, trussBraceIdx,
          tx, by, tz + TRUSS_W / 2,
          TRUSS_W, TRUSS_BRACE_H, TRUSS_BRACE_H,
          cx, cz, yaw,
        );
        trussBraceIdx += 1;
        setTrussInstance(
          trussBraceMesh, trussBraceIdx,
          tx - TRUSS_W / 2, by, tz,
          TRUSS_BRACE_H, TRUSS_BRACE_H, TRUSS_W,
          cx, cz, yaw,
        );
        trussBraceIdx += 1;
        setTrussInstance(
          trussBraceMesh, trussBraceIdx,
          tx + TRUSS_W / 2, by, tz,
          TRUSS_BRACE_H, TRUSS_BRACE_H, TRUSS_W,
          cx, cz, yaw,
        );
        trussBraceIdx += 1;
      }
      // * Beacon tip stays a regular mesh so per-booth emissive mats stay simple.
      const trussLight = new THREE.Mesh(trussLightGeo, trussLightMats[i]);
      trussLight.position.set(tx, trussBaseY + TRUSS_HEIGHT + 0.2, tz);
      boothGroup.add(trussLight);
    }

    // ===== DECORATIVE SIDE PANELS =====
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(sidePanelGeo, sidePanelMats[i]);
      panel.position.set(side * (pw + 0.02), topY + 1.5, 0);
      panel.rotation.y = side * Math.PI / 2;
      boothGroup.add(panel);

      // Horizontal neon strips on side panels
      for (let s = 0; s < 3; s++) {
        const stripY = topY + 0.8 + s * 0.6;
        const strip = makeNeonTube(
          new THREE.Vector3(side * (pw + 0.03), stripY, -pd * 0.35),
          new THREE.Vector3(side * (pw + 0.03), stripY, pd * 0.35),
          0.02, neonMat
        );
        boothGroup.add(strip);
        boothNeonMeshes.push(strip);
      }
    }

    // Diamond accent on each side
    for (const side of [-1, 1]) {
      const diamond = new THREE.Mesh(diamondGeo, diamondMats[i]);
      diamond.position.set(side * (pw + 0.04), topY + 1.5, 0);
      diamond.rotation.y = side * Math.PI / 2;
      boothGroup.add(diamond);
    }

    // ===== DJ GEAR (behind cart spawn, local +Z = away from arena) =====
    if (B.gearEnabled) {
      const gearGroup = new THREE.Group();
      gearGroup.position.set(0, topY + B.platformThickness / 2, pd - 0.6);

      const mixer = new THREE.Mesh(mixerGeo, mixerMat);
      mixer.position.set(0, 0.25, 0);
      gearGroup.add(mixer);

      const panel = new THREE.Mesh(mixerPanelGeo, panelMats[i]);
      panel.position.set(0, 0.52, 0);
      gearGroup.add(panel);

      const ld = new THREE.Mesh(deckGeo, deckMat);
      ld.position.set(-0.9, 0.55, 0);
      gearGroup.add(ld);
      const rd = new THREE.Mesh(deckGeo, deckMat);
      rd.position.set(0.9, 0.55, 0);
      gearGroup.add(rd);

      const ls = new THREE.Mesh(spkGeo, spkMat);
      ls.position.set(-2.2, 0.8, 0.2);
      gearGroup.add(ls);
      const rs = new THREE.Mesh(spkGeo, spkMat);
      rs.position.set(2.2, 0.8, 0.2);
      gearGroup.add(rs);

      const lc = new THREE.Mesh(coneGeo, coneMat);
      lc.rotation.x = Math.PI / 2;
      lc.position.set(-2.2, 0.9, -0.25);
      gearGroup.add(lc);
      const rc = new THREE.Mesh(coneGeo, coneMat);
      rc.rotation.x = Math.PI / 2;
      rc.position.set(2.2, 0.9, -0.25);
      gearGroup.add(rc);

      // Speaker neon trim
      for (const sx of [-2.2, 2.2]) {
        const spkEdges = [
          [new THREE.Vector3(sx - 0.45, 0.0, -0.25), new THREE.Vector3(sx + 0.45, 0.0, -0.25)],
          [new THREE.Vector3(sx - 0.45, 1.6, -0.25), new THREE.Vector3(sx + 0.45, 1.6, -0.25)],
          [new THREE.Vector3(sx - 0.45, 0.0, -0.25), new THREE.Vector3(sx - 0.45, 1.6, -0.25)],
          [new THREE.Vector3(sx + 0.45, 0.0, -0.25), new THREE.Vector3(sx + 0.45, 1.6, -0.25)],
        ];
        for (const [a, b] of spkEdges) {
          const edge = makeNeonTube(a, b, 0.015, neonMat);
          gearGroup.add(edge);
          boothNeonMeshes.push(edge);
        }
        const woofer = new THREE.Mesh(wooferGeo, coneMat);
        woofer.rotation.x = Math.PI / 2;
        woofer.position.set(sx, 0.4, -0.25);
        gearGroup.add(woofer);
      }

      for (const dx of [-0.9, 0.9]) {
        const platter = new THREE.Mesh(platterGeo, platterMat);
        platter.position.set(dx, 0.6, 0);
        gearGroup.add(platter);
        // * A turntable with no record on it reads as unfinished theme in a
        // * vinyl-record arena. Sits on the platter face (0.61) under the spindle dot.
        const deckRecord = new THREE.Mesh(deckRecordGeo, deckRecordMat);
        deckRecord.position.set(dx, 0.613, 0);
        // * Vary the run-out so the four booths do not look stamped from one press.
        deckRecord.rotation.y = i * 0.9 + (dx > 0 ? 0.45 : 0);
        gearGroup.add(deckRecord);
        const dot = new THREE.Mesh(dotGeo, dotMats[i]);
        dot.position.set(dx, 0.62, 0);
        gearGroup.add(dot);
      }

      for (let k = 0; k < 5; k += 1) {
        const knob = new THREE.Mesh(knobGeo, knobMat);
        knob.position.set(-0.5 + k * 0.25, 0.56, 0);
        gearGroup.add(knob);
      }

      const ledStrip = makeNeonTube(
        new THREE.Vector3(-1.3, 0.3, -0.6),
        new THREE.Vector3(1.3, 0.3, -0.6),
        0.025, neonMat,
      );
      gearGroup.add(ledStrip);
      boothNeonMeshes.push(ledStrip);

      boothGroup.add(gearGroup);
    }

    scene.add(boothGroup);
    boothGroups.push(boothGroup);

    if (!isLowQualityMode()) {
      const fogMat = fogPuffMats[i];
      for (let f = 0; f < fogPuffCount; f += 1) {
        const puff = new THREE.Sprite(fogMat);
        const spread = B.platformWidth * 1.5;
        const puffScale = 4 + Math.random() * 4;
        const baseX = cx + (Math.random() - 0.5) * spread;
        const baseY = B.platformY + 0.05 + Math.random() * 0.3;
        const baseZ = cz + (Math.random() - 0.5) * spread;
        puff.scale.set(puffScale, puffScale * 0.3, 1);
        puff.position.set(baseX, baseY, baseZ);
        puff.userData.fogAnim = {
          baseX,
          baseY,
          baseZ,
          baseScaleX: puffScale,
          baseScaleY: puffScale * 0.3,
          phase: Math.random() * Math.PI * 2,
          speed: 0.35 + Math.random() * 0.45,
          driftX: 0.18 + Math.random() * 0.35,
          driftZ: 0.18 + Math.random() * 0.35,
          bob: 0.06 + Math.random() * 0.12,
        };
        scene.add(puff);
        fogSprites.push(puff);
      }
    }
  }

  trussLegMesh.instanceMatrix.needsUpdate = true;
  trussBraceMesh.instanceMatrix.needsUpdate = true;
  trussLegMesh.count = trussLegIdx;
  trussBraceMesh.count = trussBraceIdx;
  scene.add(trussLegMesh);
  scene.add(trussBraceMesh);

  // * Collapse per-booth neon rails / gear / panels into one draw per material.
  // * Neon pulse in main.js only needs material refs (deduped via Set) — orphaned
  // * pre-merge mesh entries in boothNeonMeshes still carry those materials.
  for (let bi = 0; bi < boothGroups.length; bi += 1) {
    mergeStaticMeshesByMaterial(boothGroups[bi], { deep: true });
  }

  /**
   * Drifts booth fog sprites and breathes shared fog material opacity.
   * @param {number} timeMs
   */
  function updateFog(timeMs) {
    if (fogSprites.length === 0) return;
    const t = timeMs * 0.001;
    for (let m = 0; m < fogPuffMats.length; m += 1) {
      const mat = fogPuffMats[m];
      const base = mat.userData.baseOpacity ?? 0.3;
      const phase = mat.userData.fogPulsePhase ?? 0;
      mat.opacity = base * (0.78 + 0.28 * Math.sin(t * 0.85 + phase));
    }
    for (let s = 0; s < fogSprites.length; s += 1) {
      const puff = fogSprites[s];
      const a = puff.userData.fogAnim;
      if (!a) continue;
      const w = t * a.speed + a.phase;
      puff.position.x = a.baseX + Math.sin(w) * a.driftX;
      puff.position.z = a.baseZ + Math.cos(w * 0.85) * a.driftZ;
      puff.position.y = a.baseY + Math.sin(w * 1.3) * a.bob;
      const breathe = 1 + 0.14 * Math.sin(w * 1.1);
      puff.scale.set(a.baseScaleX * breathe, a.baseScaleY * breathe, 1);
    }
  }

  return {
    boothGroups,
    fogSprites,
    boothBodies,
    trussMeshes: [trussLegMesh, trussBraceMesh],
    updateFog,
    sharedGeometries: [
      UNIT_BOX, UNIT_CYL, trussLightGeo, platGeo, sidePanelGeo, diamondGeo, dotGeo,
      mixerGeo, mixerPanelGeo, deckGeo, spkGeo, coneGeo, wooferGeo, platterGeo, knobGeo,
      deckRecordGeo,
    ],
    sharedMaterials: [
      trussLegMat, trussCrossMat, mixerMat, deckMat, spkMat, coneMat, platterMat, knobMat,
      deckRecordMat,
      fogPuffTex, boothMetalTex, boothGrilleTex, deckRecordTex, platterWearTex,
      ...fogPuffMats, ...neonMats, ...trussLightMats, ...platMats, ...sidePanelMats,
      ...diamondMats, ...panelMats, ...dotMats,
    ],
  };
}

/**
 * Builds the dancefloor record (visual + physics), center pit wall, and four spawn booths.
 * Adds all meshes to the scene and registers Rapier colliders on the supplied world.
 *
 * @param {THREE.Scene} scene Root Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 * @param {object} config Full game CONFIG (record, booth, debug sections).
 * @returns {{
 *   recordMesh: THREE.Mesh,
 *   recordColliderHandles: number[],
 *   pitWallColliderHandle: number,
 *   boothColliderHandles: number[],
 *   boothNeonMeshes: THREE.Mesh[],
 *   spindleLight: THREE.PointLight,
 *   spindleLightColorPink: THREE.Color,
 *   spindleLightColorCyan: THREE.Color,
 *   pitInnerRadius: number,
 *   dispose: () => void,
 * }}
 */
export function initArena(scene, world, config, options = {}) {
  // * Classic Record uses a deep death threshold: the knockout shaft is a straight
  // * vertical drop (walls give a live cart nothing to rest or drive on), so carts
  // * fall long and dramatic — ricocheting off the shaft walls — before the KO
  // * fires. Free-fall from platform level to -30 is ~1.6s, safely inside the 2.5s
  // * kill-attribution window (wall bounces only redirect laterally, they don't
  // * slow the vertical fall).
  const prevFallYThreshold = config.fall.yThreshold;
  config.fall.yThreshold = -30;

  const reflectorTextureSize = options.reflectorTextureSize ?? REFLECTOR_TEXTURE_SIZE_FULL;
  const visualRecordThickness = VISUAL_RECORD_THICKNESS;
  const boothNeonMeshes = [];
  const boothColliderHandles = [];

  // --- Record platform (visual rotates; physics ring collider stays world-fixed) ---
  const visualRecordY = -0.46;
  const recordGeo = buildRecordRingGeometry({
    outerRadius: config.record.radius,
    innerRadius: config.record.innerRadius,
    thickness: visualRecordThickness,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    curveSegments: 64,
  });
  // * Vinyl body — High path is translucent so the Reflector carries the live mirror;
  // * a separate vinyl detail ring (maps) sells grooves. Shipped profile is jam OG
  // * (matte, no clearcoat, dark Reflector tint) — fixed the green-booth white pool.
  // * Escape hatch: ?floor=v2 restores the prior Physical clearcoat stack.
  const vinylTex = buildVinylSurfaceTextures();
  const lowQ = isLowQualityMode();
  const floorProfile = lowQ ? "v2" : getDebugParams().floor;
  const useOgFloor = floorProfile === "og";
  // * High body opacity when Reflector is on — og matches jam (0.7); v2 was 0.55.
  const recordBodyOpacityHigh = useOgFloor ? 0.7 : 0.55;
  // * High path: scalar roughness only (Reflector sells the shine). Low path:
  // * keep the roughness map so the opaque floor still reads as vinyl grain.
  // * Do not pass roughnessMap: undefined — Three logs a material warning.
  const recordMat = createPhysicalMaterial({
    color: useOgFloor ? 0x050006 : 0x0c0818,
    map: vinylTex.map,
    roughness: lowQ ? 0.55 : useOgFloor ? 0.72 : 0.38,
    metalness: lowQ ? 0.25 : useOgFloor ? 0.35 : 0.48,
    clearcoat: lowQ ? 0.2 : useOgFloor ? 0 : 0.72,
    clearcoatRoughness: lowQ ? 0.35 : useOgFloor ? 1 : 0.12,
    transparent: !lowQ,
    opacity: lowQ ? 1.0 : recordBodyOpacityHigh,
    ...(lowQ ? { roughnessMap: vinylTex.roughnessMap } : {}),
  });
  recordMat.depthWrite = lowQ;
  if (!lowQ) {
    recordMat.normalMap = vinylTex.normalMap;
    // * OG had no normal map; keep a light groove read so maps still earn their keep.
    recordMat.normalScale = new THREE.Vector2(
      useOgFloor ? 0.35 : 0.55,
      useOgFloor ? 0.35 : 0.55,
    );
  }
  const recordMesh = new THREE.Mesh(recordGeo, recordMat);
  if (import.meta.env.DEV && !lowQ) {
    // eslint-disable-next-line no-console
    console.log(`[floor] Classic High profile=${floorProfile} (?floor=og|v2)`);
  }

  /**
   * Classic floor env clamp — kills the white pool in front of the green booth.
   *
   * Root cause (isolated 2026-07-12 via mesh/light/env bisection): the RoomEnvironment
   * probe's bright window sits at world +Z; at grazing angles the clearcoat floor stack
   * (record body + vinyl detail) reflects it as a hot white sheet exactly where the
   * camera faces the green booth. It is IBL, not a lamp: zeroing all 25 scene lights
   * left it untouched; scene.environmentIntensity=0 (and rotating the env) removed it.
   *
   * material.envMapIntensity is a NO-OP for scene.environment in this three version —
   * the per-material clamp only works when the material owns its envMap reference. So
   * the floor materials get scene.environment as their own envMap at a low intensity.
   * Floor-only: the record Reflector (the live mirror) and every other material keep
   * full scene IBL, per the "reduce only that contribution" rule.
   *
   * @param {THREE.MeshPhysicalMaterial} mat
   */
  function clampFloorEnv(mat) {
    if (!mat) return;
    const FLOOR_ENV_SCALE = 0.25; // × getMaterialEnvMapIntensity() (0.24) ⇒ ~0.06
    // * Register the scale + intensity unconditionally so the clamp survives the deferred
    // * PMREM bake: refreshSceneEnvironmentMaterials reapplies base × this scale when the
    // * IBL lands (and on GUI tweaks). Only the direct envMap assignment needs the env.
    mat.userData.envMapIntensityScale = FLOOR_ENV_SCALE;
    mat.envMapIntensity = getMaterialEnvMapIntensity() * FLOOR_ENV_SCALE;
    if (scene.environment) mat.envMap = scene.environment;
  }
  clampFloorEnv(recordMat);
  recordMesh.position.set(0, visualRecordY, 0);
  recordMesh.receiveShadow = false;
  scene.add(recordMesh);

  // ! Debug export — expose record mesh for Tweakpane export buttons.
  window.recordMesh = recordMesh;

  // * Spindle accent light: slowly cycles pink <-> cyan in the render loop.
  const spindleLight = new THREE.PointLight(0xff2bd6, 80, 30, 2);
  const spindleLightColorPink = new THREE.Color(0xff2bd6);
  const spindleLightColorCyan = new THREE.Color(0x2bd6ff);
  spindleLight.position.set(0, 1.5, 0);
  scene.add(spindleLight);

  const visualRecordTopY = visualRecordThickness / 2;
  const reflectorYOffset =
    visualRecordTopY + config.record.surface.concentricRings.yOffset + 0.001;

  function createRecordReflector(textureSize) {
    const geo = new THREE.RingGeometry(
      config.record.innerRadius,
      config.record.radius,
      128,
      1,
    );
    const reflector = new Reflector(geo, {
      clipBias: 0.003,
      textureWidth: textureSize,
      textureHeight: textureSize,
      // * og: jam 0x111111 dark tint (crushes hot spindle/IBL in the mirror).
      // * v2: slightly lifted purple so booths/carts read a bit brighter.
      color: useOgFloor ? 0x111111 : 0x1c1528,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = reflectorYOffset;
    reflector.renderOrder = 0;
    reflector.userData._cartRaveTextureSize = textureSize;
    // * Cart-first mirror: hide crowd/stadium/lasers for this pass only (no frame skip).
    installCheapMirrorPass(reflector);
    return reflector;
  }

  // * Reflector — always created so quality toggle can show/hide it without a world rebuild.
  let recordReflector = createRecordReflector(reflectorTextureSize);
  recordReflector.visible = !isLowQualityMode();
  recordMesh.add(recordReflector);

  // * Vinyl detail layer ON the reflective floor — maps sell grooves without killing the
  // * mirror. Hidden in low-quality (solid floor carries maps). og: no clearcoat so this
  // * layer is dust/groove only; v2: Physical clearcoat sheen on top of the Reflector.
  const vinylDetailGeo = new THREE.RingGeometry(
    config.record.innerRadius,
    config.record.radius,
    128,
    1,
  );
  const vinylDetailMat = createPhysicalMaterial({
    map: vinylTex.map,
    normalMap: vinylTex.normalMap,
    normalScale: new THREE.Vector2(useOgFloor ? 0.45 : 0.7, useOgFloor ? 0.45 : 0.7),
    roughnessMap: vinylTex.roughnessMap,
    color: 0xffffff,
    roughness: useOgFloor ? 0.68 : 0.42,
    metalness: useOgFloor ? 0.35 : 0.55,
    clearcoat: useOgFloor ? 0 : 0.65,
    clearcoatRoughness: useOgFloor ? 1 : 0.14,
    transparent: true,
    opacity: useOgFloor ? 0.38 : 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  clampFloorEnv(vinylDetailMat);
  const vinylDetailMesh = new THREE.Mesh(vinylDetailGeo, vinylDetailMat);
  vinylDetailMesh.rotation.x = -Math.PI / 2;
  vinylDetailMesh.position.y = reflectorYOffset + 0.002;
  vinylDetailMesh.renderOrder = 1;
  vinylDetailMesh.visible = !isLowQualityMode();
  vinylDetailMesh.userData.isVinylDetail = true;
  recordMesh.add(vinylDetailMesh);

  // * Solid opaque floor ring for low-quality mode — covers the record surface when the Reflector is hidden.
  const solidFloorGeo = new THREE.RingGeometry(
    config.record.innerRadius,
    config.record.radius,
    128,
    1,
  );
  const solidFloorMat = createPhysicalMaterial({
    map: vinylTex.map,
    normalMap: vinylTex.normalMap,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughnessMap: vinylTex.roughnessMap,
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.4,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  // * Medium + Low use this opaque floor (reflector knob off on both tiers), so it needs
  // * the same IBL clamp as the reflective vinyl. Without it the shinier solid floor takes
  // * full-intensity env (~0.24 vs the reflective floor's ~0.06) and blows out — the
  // * "Medium/Low floor light is blown out" from the playtest report.
  clampFloorEnv(solidFloorMat);
  const recordSolidFloor = new THREE.Mesh(solidFloorGeo, solidFloorMat);
  recordSolidFloor.rotation.x = -Math.PI / 2;
  recordSolidFloor.position.y = reflectorYOffset;
  recordSolidFloor.visible = isLowQualityMode();
  recordSolidFloor.renderOrder = 0;
  recordSolidFloor.userData.isRecordSolidFloor = true;
  recordMesh.add(recordSolidFloor);

  function upgradeRecordReflector() {
    if (!recordReflector) return;
    if (recordReflector.userData._cartRaveTextureSize >= REFLECTOR_TEXTURE_SIZE_FULL) return;
    // @ts-expect-error THREE duck-typing suppress
    if (recordReflector.renderTarget) recordReflector.renderTarget.dispose();
    if (recordReflector.material) disposeMaterial(recordReflector.material);
    recordReflector.geometry.dispose();
    recordMesh.remove(recordReflector);
    recordReflector = createRecordReflector(REFLECTOR_TEXTURE_SIZE_FULL);
    // * Preserve current quality-mode visibility from the solid floor state.
    recordReflector.visible = !recordSolidFloor.visible;
    recordMesh.add(recordReflector);
  }

  /**
   * Toggles the Reflector and solid-floor replacement for quality changes.
   * Call with `true` to show the reflective floor, `false` for the opaque low-quality surface.
   * @param {boolean} visible
   */
  function setReflectorVisible(visible) {
    if (recordReflector) recordReflector.visible = visible;
    if (recordSolidFloor) recordSolidFloor.visible = !visible;
    if (vinylDetailMesh) vinylDetailMesh.visible = visible;
    // Toggle record material transparency to match.
    if (recordMat) {
      recordMat.transparent = visible;
      recordMat.opacity = visible ? recordBodyOpacityHigh : 1.0;
      recordMat.depthWrite = !visible;
      recordMat.needsUpdate = true;
    }
  }

  // --- Record center label (branded vinyl label; material.color cycles tint) ---
  // * Single source of truth for the label ring. Both the canvas layout (labelInnerPx)
  // * and the RingGeometry below read these, so the drawn art and the mesh can never
  // * disagree about where the visible band starts. LABEL_RING_INNER_M is paired with the
  // * spindle ring's default outerRadius — changing it needs that checked too.
  const LABEL_RING_INNER_M = 3.7;
  const LABEL_RING_OUTER_M = 7.0;
  const recordLabelCanvas = document.createElement("canvas");
  recordLabelCanvas.width = 512;
  recordLabelCanvas.height = 512;
  const recordLabelCtx = recordLabelCanvas.getContext("2d");
  recordLabelCtx.clearRect(0, 0, 512, 512);

  const labelCx = 256;
  const labelCy = 256;
  const labelR = 256;

  // * The label mesh is an ANNULUS, not a disc — the middle of this record is the kill
  // * pit, so there is no centre to put a wordmark in. RingGeometry normalises UVs by the
  // * OUTER radius, so the ring's inner edge lands at canvas radius
  // * (inner / (2 * outer)) * width. Anything drawn inside that is NEVER RENDERED: the
  // * previous disc-style layout put the CART RAVE wordmark (max ~92px), its divider, the
  // * spindle-hole cut and grooves 1-3 of 7 in there, so the arena's namesake shipped as a
  // * blank tinted gradient. Derived from the same constants the geometry uses below —
  // * do not hardcode, or the two drift apart again.
  const labelInnerPx =
    (LABEL_RING_INNER_M / (2 * LABEL_RING_OUTER_M)) * recordLabelCanvas.width;

  // * Paper label body, faded at BOTH edges so the annulus reads as a printed ring
  // * rather than a hard washer. Stops are fractions of [labelInnerPx, labelR].
  const labelBodyGrad = recordLabelCtx.createRadialGradient(
    labelCx, labelCy, labelInnerPx,
    labelCx, labelCy, labelR,
  );
  labelBodyGrad.addColorStop(0, "rgba(255,255,255,0)");
  labelBodyGrad.addColorStop(0.07, "rgba(255,255,255,0.93)");
  labelBodyGrad.addColorStop(0.72, "rgba(255,255,255,0.88)");
  labelBodyGrad.addColorStop(0.93, "rgba(255,255,255,0.45)");
  labelBodyGrad.addColorStop(1, "rgba(255,255,255,0)");
  recordLabelCtx.fillStyle = labelBodyGrad;
  recordLabelCtx.beginPath();
  recordLabelCtx.arc(labelCx, labelCy, labelR, 0, Math.PI * 2);
  recordLabelCtx.fill();

  // * Fine runout grooves — concentric hairlines in the INNER third of the visible band,
  // * where a real label's run-in grooves sit relative to its printing.
  recordLabelCtx.strokeStyle = "rgba(0,0,0,0.18)";
  recordLabelCtx.lineWidth = 1.2;
  const grooveInnerR = labelInnerPx + 8;
  const grooveOuterR = labelInnerPx + 38;
  for (let g = 0; g < 5; g += 1) {
    const gr = grooveInnerR + (g * (grooveOuterR - grooveInnerR)) / 4;
    recordLabelCtx.beginPath();
    recordLabelCtx.arc(labelCx, labelCy, gr, 0, Math.PI * 2);
    recordLabelCtx.stroke();
  }

  // * Outer pinstripe ring (classic vinyl label edge).
  recordLabelCtx.strokeStyle = "rgba(0,0,0,0.28)";
  recordLabelCtx.lineWidth = 3;
  recordLabelCtx.beginPath();
  recordLabelCtx.arc(labelCx, labelCy, labelR * 0.9, 0, Math.PI * 2);
  recordLabelCtx.stroke();
  recordLabelCtx.strokeStyle = "rgba(255,255,255,0.55)";
  recordLabelCtx.lineWidth = 1.5;
  recordLabelCtx.beginPath();
  recordLabelCtx.arc(labelCx, labelCy, labelR * 0.86, 0, Math.PI * 2);
  recordLabelCtx.stroke();

  // 5-point star path helper.
  const drawStar = (cx, cy, outerR, innerR, rotationRad) => {
    recordLabelCtx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = rotationRad + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) recordLabelCtx.moveTo(x, y);
      else recordLabelCtx.lineTo(x, y);
    }
    recordLabelCtx.closePath();
    recordLabelCtx.fill();
  };

  /**
   * Draws text along a circular arc, one glyph at a time, centred on `centerAngle`.
   * A straight wordmark cannot work here — the printable area is an annulus, so the
   * brand has to follow the band the way real record labels do.
   *
   * @param {string} text
   * @param {number} radius Canvas px from label centre.
   * @param {number} centerAngle Radians; -PI/2 is canvas-up.
   * @param {number} tracking Extra px between glyph advances.
   */
  const drawArcText = (text, radius, centerAngle, tracking) => {
    const advances = Array.from(text, (ch) => recordLabelCtx.measureText(ch).width + tracking);
    const totalAngle = advances.reduce((sum, w) => sum + w, 0) / radius;
    let a = centerAngle - totalAngle / 2;
    for (let i = 0; i < text.length; i += 1) {
      const glyphAngle = advances[i] / radius;
      const mid = a + glyphAngle / 2;
      recordLabelCtx.save();
      recordLabelCtx.translate(labelCx + Math.cos(mid) * radius, labelCy + Math.sin(mid) * radius);
      // * +PI/2 stands each glyph up on the tangent, feet toward the centre.
      recordLabelCtx.rotate(mid + Math.PI / 2);
      recordLabelCtx.strokeText(text[i], 0, 0);
      recordLabelCtx.fillText(text[i], 0, 0);
      recordLabelCtx.restore();
      a += glyphAngle;
    }
  };

  // * Brand wordmark, curved along the band and printed TWICE at opposite ends. The
  // * record's visual spins, so two repetitions keep the name readable through most of
  // * the rotation instead of only when one side faces the camera.
  const labelTextR = 196;
  recordLabelCtx.save();
  recordLabelCtx.textAlign = "center";
  recordLabelCtx.textBaseline = "middle";
  recordLabelCtx.font = "bold 34px system-ui, Segoe UI, sans-serif";
  recordLabelCtx.lineWidth = 5;
  recordLabelCtx.strokeStyle = "rgba(0,0,0,0.45)";
  recordLabelCtx.fillStyle = "rgba(255,255,255,0.95)";
  drawArcText("CART RAVE", labelTextR, -Math.PI / 2, 3);
  drawArcText("CART RAVE", labelTextR, Math.PI / 2, 3);
  recordLabelCtx.restore();

  // * Two stars as separators in the wordmark ring, filling the gaps the text leaves.
  recordLabelCtx.fillStyle = "rgba(0,0,0,0.35)";
  const starOuter = labelR * 0.05;
  const starInner = starOuter * 0.42;
  for (let i = 0; i < 2; i += 1) {
    const a = i * Math.PI;
    const sx = labelCx + Math.cos(a) * labelTextR;
    const sy = labelCy + Math.sin(a) * labelTextR;
    drawStar(sx, sy, starOuter, starInner, a);
  }

  const recordLabelTex = new THREE.CanvasTexture(recordLabelCanvas);
  recordLabelTex.needsUpdate = true;
  recordLabelTex.colorSpace = THREE.SRGBColorSpace;
  const recordLabelGeo = new THREE.RingGeometry(LABEL_RING_INNER_M, LABEL_RING_OUTER_M, 96);
  const recordLabelMat = new THREE.MeshBasicMaterial({
    map: recordLabelTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
    blending: THREE.NormalBlending,
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  recordLabelMat.depthTest = true;
  const recordLabelMesh = new THREE.Mesh(recordLabelGeo, recordLabelMat);
  recordLabelMesh.rotation.x = -Math.PI / 2;
  recordLabelMesh.position.y = visualRecordTopY + config.record.surface.concentricRings.yOffset + 0.012;
  recordLabelMesh.renderOrder = -1;
  recordMesh.add(recordLabelMesh);

  // * Spindle ring — bright lip at the hole edge (config.surface.spindleRing; was dead).
  /** @type {THREE.Mesh | null} */
  let spindleRingMesh = null;
  /** @type {THREE.BufferGeometry | null} */
  let spindleRingGeo = null;
  /** @type {THREE.MeshPhysicalMaterial | null} */
  let spindleRingMat = null;
  const spindleCfg = config.record.surface?.spindleRing;
  if (spindleCfg?.enabled !== false) {
    const sInner = spindleCfg?.innerRadius ?? config.record.innerRadius * 0.91;
    const sOuter = spindleCfg?.outerRadius ?? 3.7;
    spindleRingGeo = new THREE.RingGeometry(sInner, sOuter, 64);
    spindleRingMat = createPhysicalMaterial({
      color: spindleCfg?.color ?? 0xffffff,
      emissive: spindleCfg?.color ?? 0xffffff,
      emissiveIntensity: 1.35,
      roughness: 0.35,
      metalness: 0.55,
      toneMapped: false,
    });
    spindleRingMesh = new THREE.Mesh(spindleRingGeo, spindleRingMat);
    spindleRingMesh.rotation.x = -Math.PI / 2;
    spindleRingMesh.position.y =
      visualRecordTopY + (spindleCfg?.yOffset ?? config.record.surface.concentricRings.yOffset) + 0.014;
    spindleRingMesh.renderOrder = 0;
    recordMesh.add(spindleRingMesh);
  }

  const grooveResult = buildRecordSurfaceGrooves(recordMesh, config, visualRecordThickness);
  const raveDecor = buildDancefloorRaveDecor(recordMesh, config, visualRecordThickness);

  // Neon rim (visual only).
  // * Record neon rim — Physical emissive: emissiveIntensity 2.2, metalness 0, roughness 0.45
  const rimMat = createPhysicalMaterial({
    color: config.record.rimColor,
    emissive: config.record.rimColor,
    emissiveIntensity: 2.45,
    roughness: 0.4,
    metalness: 0.0,
    depthWrite: false,
    toneMapped: false,
  });
  // * Beveled ExtrudeGeometry extends past nominal outerRadius — inset torus (0.985*r) sits inside the floor mesh and
  // * disappears; place slightly outside the nominal edge (mirrors inner rim * 1.015) so the neon ring stays visible.
  const rimGeo = new THREE.TorusGeometry(config.record.radius * 1.015, 0.14, 10, 96);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.set(0, config.record.y + config.record.thickness / 2 + 0.02, 0);
  rimMesh.rotation.x = Math.PI / 2;
  scene.add(rimMesh);

  // * Secondary cyan edge ring — dual-tone rim reads more "club vinyl" than single magenta.
  const edgeRingGeo = new THREE.TorusGeometry(config.record.radius * 1.028, 0.055, 10, 96);
  const edgeRingMat = new THREE.MeshBasicMaterial({
    color: 0x22e6ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const edgeRingMesh = new THREE.Mesh(edgeRingGeo, edgeRingMat);
  edgeRingMesh.position.set(0, config.record.y + config.record.thickness / 2 + 0.024, 0);
  edgeRingMesh.rotation.x = Math.PI / 2;
  scene.add(edgeRingMesh);

  // Inner neon rim (visual only): sells the hole edge.
  const innerRimGeo = new THREE.TorusGeometry(config.record.innerRadius * 1.02, 0.12, 10, 72);
  const innerRimMesh = new THREE.Mesh(innerRimGeo, rimMat);
  innerRimMesh.position.set(0, config.record.y + config.record.thickness / 2 + 0.03, 0);
  innerRimMesh.rotation.x = Math.PI / 2;
  scene.add(innerRimMesh);

  // * Extra hot-pink lip just outside the inner hole for a double-rim "portal" look.
  const innerEdgeGeo = new THREE.TorusGeometry(config.record.innerRadius * 1.055, 0.045, 8, 64);
  const innerEdgeMat = new THREE.MeshBasicMaterial({
    color: 0xffe53d,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const innerEdgeMesh = new THREE.Mesh(innerEdgeGeo, innerEdgeMat);
  innerEdgeMesh.position.set(0, config.record.y + config.record.thickness / 2 + 0.035, 0);
  innerEdgeMesh.rotation.x = Math.PI / 2;
  scene.add(innerEdgeMesh);

  const recordBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(0, config.record.y, 0),
  );

  // * Build visual debug geometry (wireframe only, lazy allocated if debug enabled).
  const recordPhysics = config.record.physics || {};
  let recordPhysicsGeo = null;
  if (config.debug.arenaTrimesh) {
    recordPhysicsGeo = buildRecordPhysicsGeometry({
      outerRadius: config.record.radius,
      innerRadius: config.record.innerRadius,
      thickness: config.record.thickness,
      chamferWidth: recordPhysics.chamferWidth ?? 0.35,
      holeClearance: recordPhysics.holeClearance ?? 0.45,
      outerBevel: recordPhysics.outerBevel ?? 0.12,
      segments: recordPhysics.segments ?? 72,
    });
  }

  // --- PRIMITIVE RING COLLIDER (Fixes Trimesh Bounce & Overlap Tunneling) ---
  const N_SEGMENTS = 16;
  const R_out = config.record.radius;
  const R_in = config.record.innerRadius;
  const halfT = config.record.thickness / 2;

  // * Exact tangent widths so segments touch edge-to-edge with zero overlap.
  const halfAngle = Math.PI / N_SEGMENTS;
  const zIn = R_in * Math.tan(halfAngle);
  const zOut = R_out * Math.tan(halfAngle);
  const topY = halfT;
  const botY = -halfT;

  // * 8 vertices of a trapezoidal prism, centered radially (no translation needed).
  // * Vertices already encode R_in → R_out; rotation around origin places them in the ring.
  const vertices = new Float32Array([
    // Top face
    R_in, topY, -zIn,
    R_in, topY,  zIn,
    R_out, topY, -zOut,
    R_out, topY,  zOut,
    // Bottom face
    R_in, botY, -zIn,
    R_in, botY,  zIn,
    R_out, botY, -zOut,
    R_out, botY,  zOut,
  ]);

  const yAxis = new THREE.Vector3(0, 1, 0);
  /** @type {number[]} */
  const recordColliderHandles = [];

  for (let i = 0; i < N_SEGMENTS; i++) {
    const angle = (i / N_SEGMENTS) * Math.PI * 2;
    const quat = new THREE.Quaternion().setFromAxisAngle(yAxis, angle);

    const segmentDesc = RAPIER.ColliderDesc.convexHull(vertices)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setFriction(config.record.friction)
      .setRestitution(config.record.restitution);

    const segmentCollider = world.createCollider(segmentDesc, recordBody);
    recordColliderHandles.push(segmentCollider.handle);
  }

  let debugMesh = null;
  let debugMat = null;
  if (config.debug.arenaTrimesh && recordPhysicsGeo) {
    debugMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
    });
    debugMesh = new THREE.Mesh(recordPhysicsGeo.clone(), debugMat);
    debugMesh.position.set(0, config.record.y, 0);
    scene.add(debugMesh);
  }

  // DJ spawn booths (4x, N/S/E/W)
  const boothBuild = buildBooths(scene, world, config, boothNeonMeshes, boothColliderHandles);

  const pitInnerRadius = (config.record.radius + 2) * 1.30 * 1.20;

  // * 69.6m, not 600m. The fall kill fires at y=-30, the vertex gradient dies 32m below
  // * the rim, and the deepest thing anyone can touch is the backstop cap at y=-64 — so
  // * the old shaft spent ~530m below the last observable surface. The floor on this
  // * number is the backstop at pitWallPhysicsTopY (-64): its half-height is derived
  // * from this depth and goes NEGATIVE below 61m. 69.6 clears that and keeps the
  // * plating tile square at an integer V=8 (see buildPitSurfaceTextures).
  const pitWallDepth = 69.6;
  const pitWallTopY = -3;
  const pitWallCenterY = pitWallTopY - pitWallDepth / 2;
  // * Higher radial density so panel UVs + structural ribs land cleanly.
  const pitWallGeo = new THREE.CylinderGeometry(
    pitInnerRadius,
    pitInnerRadius,
    pitWallDepth,
    96,
    64,
    true,
  );
  {
    const pos = pitWallGeo.attributes.position;
    const pitWallColorArray = new Float32Array(pos.count * 3);
    // * Short falloff — black takes over higher in the shaft (creepier void read).
    const GRADIENT_DEPTH_M = 32;
    const TOP_R = 0.52;
    const TOP_G = 0.07;
    const TOP_B = 0.88;
    const RIM_BAND_CENTER = 0.05;
    const RIM_BAND_WIDTH = 1.5;

    for (let i = 0; i < pos.count; i += 1) {
      const localY = pos.getY(i);
      const worldY = localY + pitWallCenterY;
      const depthBelowRim = Math.max(0, pitWallTopY - worldY);
      const tLin = Math.max(0, Math.min(1, 1 - depthBelowRim / GRADIENT_DEPTH_M));
      const t = tLin * tLin * (3 - 2 * tLin);
      const eased = Math.pow(t, 1.65);
      const rimGlow = Math.exp(
        -Math.pow((depthBelowRim - RIM_BAND_CENTER) / RIM_BAND_WIDTH, 2),
      );
      // * Tiny azimuthal noise so the gradient isn't a perfect cartoon band.
      const ang = Math.atan2(pos.getZ(i), pos.getX(i));
      const grain = 0.92 + 0.08 * Math.sin(ang * 11.0 + localY * 0.07);

      pitWallColorArray[i * 3] = (TOP_R * eased + 0.14 * rimGlow) * grain;
      pitWallColorArray[i * 3 + 1] = (TOP_G * eased + 0.025 * rimGlow) * grain;
      pitWallColorArray[i * 3 + 2] = (TOP_B * eased + 0.2 * rimGlow) * grain;
    }
    pitWallGeo.setAttribute("color", new THREE.BufferAttribute(pitWallColorArray, 3));
  }

  const pitSurfaceTex = buildPitSurfaceTextures();
  // * Reflective plated shaft — panel maps break up the smooth-tube silhouette;
  // * metal + clearcoat catch arena neon as warped reflections.
  const pitWallMat = createPhysicalMaterial({
    color: 0xffffff,
    map: pitSurfaceTex.map,
    normalMap: pitSurfaceTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: pitSurfaceTex.roughnessMap,
    vertexColors: true,
    metalness: 0.9,
    roughness: 0.38,
    clearcoat: 0.45,
    clearcoatRoughness: 0.35,
    side: THREE.BackSide,
    fog: false,
  });
  pitWallMat.userData.envMapIntensityScale = 1.45;
  const pitWall = new THREE.Mesh(pitWallGeo, pitWallMat);
  pitWall.position.y = pitWallCenterY;
  scene.add(pitWall);

  // * Structural detail in the lit throat (top ~45m) — ribs, ring beams, service
  // * pipes. Local Y: rim is at +pitWallDepth/2 on the centered cylinder mesh.
  const pitDetailMats = [];
  const pitDetailGeos = [];
  /** @type {THREE.Texture[]} */
  const pitDetailTextures = [];
  {
    const rimLocalY = pitWallDepth * 0.5;
    const worldToLocalY = (worldY) => worldY - pitWallCenterY;

    // * Run-5 "purple light around the pit needs to be softened like the sundial":
    // * the haze discs and throat cylinder were flat-opacity surfaces whose geometry
    // * rims drew hard purple lines under ACES — the same failure the sundial cross
    // * had. Same cure (dabdb6b technique): canvas-gradient alpha that reaches 0
    // * before the geometry edge, with peak opacity nudged up since only the center
    // * hits full alpha now.
    const makePitFadeTex = (radial) => {
      const c = document.createElement("canvas");
      c.width = radial ? 128 : 2;
      c.height = 128;
      const g = c.getContext("2d");
      if (g) {
        const grad = radial
          ? g.createRadialGradient(64, 64, 0, 64, 64, 64)
          : g.createLinearGradient(0, 0, 0, 128);
        if (radial) {
          grad.addColorStop(0, "rgba(255,255,255,1)");
          grad.addColorStop(0.62, "rgba(255,255,255,0.78)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
        } else {
          // * Symmetric so the cylinder's top AND bottom edges melt regardless of UV flip.
          grad.addColorStop(0, "rgba(255,255,255,0)");
          grad.addColorStop(0.45, "rgba(255,255,255,1)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, c.width, c.height);
      }
      const tex = new THREE.CanvasTexture(c);
      pitDetailTextures.push(tex);
      return tex;
    };
    const hazeFadeTex = makePitFadeTex(true);
    const throatFadeTex = makePitFadeTex(false);

    const ribMat = createPhysicalMaterial({
      color: 0x1c1528,
      metalness: 0.88,
      roughness: 0.32,
      side: THREE.DoubleSide,
      fog: false,
    });
    ribMat.userData.envMapIntensityScale = 1.2;
    pitDetailMats.push(ribMat);

    const ringBeamMat = createPhysicalMaterial({
      color: 0x221830,
      metalness: 0.9,
      roughness: 0.28,
      side: THREE.DoubleSide,
      fog: false,
    });
    ringBeamMat.userData.envMapIntensityScale = 1.25;
    pitDetailMats.push(ringBeamMat);

    const pipeMat = createPhysicalMaterial({
      color: 0x2a1838,
      metalness: 0.95,
      roughness: 0.2,
      side: THREE.DoubleSide,
      fog: false,
    });
    pipeMat.userData.envMapIntensityScale = 1.3;
    pitDetailMats.push(pipeMat);

    // * Vertical structural ribs (inside face, slightly proud of the wall).
    const RIB_COUNT = 16;
    const ribH = 42;
    const ribGeo = new THREE.BoxGeometry(0.55, ribH, 0.35);
    pitDetailGeos.push(ribGeo);
    const ribR = pitInnerRadius - 0.28;
    for (let i = 0; i < RIB_COUNT; i += 1) {
      const a = (i / RIB_COUNT) * Math.PI * 2;
      const rib = new THREE.Mesh(ribGeo, ribMat);
      // * Hang ribs from just under the rim down into the black.
      rib.position.set(
        Math.cos(a) * ribR,
        rimLocalY - ribH * 0.5 - 0.8,
        Math.sin(a) * ribR,
      );
      rib.rotation.y = -a;
      pitWall.add(rib);
    }

    // * Horizontal ring beams (Torus sits in XZ; rotate to lie flat).
    const ringBeamWorldYs = [-5.5, -11, -18, -27, -38];
    for (let i = 0; i < ringBeamWorldYs.length; i += 1) {
      const tube = 0.22 - i * 0.02;
      const ringGeo = new THREE.TorusGeometry(pitInnerRadius - 0.2, Math.max(0.1, tube), 8, 72);
      pitDetailGeos.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, ringBeamMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = worldToLocalY(ringBeamWorldYs[i]);
      pitWall.add(ring);
    }

    // * Service pipes running down between ribs (thinner, offset).
    const PIPE_COUNT = 8;
    const pipeH = 36;
    const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, pipeH, 6);
    pitDetailGeos.push(pipeGeo);
    const pipeR = pitInnerRadius - 0.45;
    for (let i = 0; i < PIPE_COUNT; i += 1) {
      const a = (i / PIPE_COUNT) * Math.PI * 2 + Math.PI / PIPE_COUNT;
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set(
        Math.cos(a) * pipeR,
        rimLocalY - pipeH * 0.5 - 2.5,
        Math.sin(a) * pipeR,
      );
      pitWall.add(pipe);
      // * Small horizontal stub at the top (looks like a feed-in).
      const stubGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6);
      pitDetailGeos.push(stubGeo);
      const stub = new THREE.Mesh(stubGeo, pipeMat);
      stub.rotation.z = Math.PI / 2;
      stub.position.set(
        Math.cos(a) * (pipeR - 0.5),
        rimLocalY - 2.5,
        Math.sin(a) * (pipeR - 0.5),
      );
      stub.rotation.y = -a;
      pitWall.add(stub);
    }

    // * Neon glow rings — thinner accent on the structural ring beams.
    const glowRingDefs = [
      { worldY: -5.5, opacity: 0.34, color: 0xc43dff },
      { worldY: -11, opacity: 0.22, color: 0xa229e6 },
      { worldY: -18, opacity: 0.14, color: 0x22e6ff },
      { worldY: -27, opacity: 0.09, color: 0xa229e6 },
      { worldY: -38, opacity: 0.05, color: 0x6611aa },
    ];
    for (const def of glowRingDefs) {
      const ringGeo = new THREE.CylinderGeometry(
        pitInnerRadius - 0.12,
        pitInnerRadius - 0.12,
        0.42,
        64,
        1,
        true,
      );
      pitDetailGeos.push(ringGeo);
      const ringMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: def.opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      pitDetailMats.push(ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = worldToLocalY(def.worldY);
      pitWall.add(ring);
    }

    // * Layered void haze discs — stacked translucent planes sell infinite depth
    // * without more shaft geometry (cheaper than extra cylinder segments).
    const hazeDefs = [
      { worldY: -8, opacity: 0.13, scale: 0.92, color: 0x4a1480 },
      { worldY: -16, opacity: 0.18, scale: 0.86, color: 0x2a0a50 },
      { worldY: -28, opacity: 0.23, scale: 0.78, color: 0x120428 },
      { worldY: -42, opacity: 0.28, scale: 0.68, color: 0x080214 },
    ];
    const hazeGeo = new THREE.CircleGeometry(pitInnerRadius, 64);
    pitDetailGeos.push(hazeGeo);
    for (const def of hazeDefs) {
      const hazeMat = new THREE.MeshBasicMaterial({
        color: def.color,
        // * Radial alpha fade kills the 64-seg circle rim line (run-5); opacities
        // * bumped ~1.3× to keep the same perceived center density.
        map: hazeFadeTex,
        transparent: true,
        opacity: def.opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        blending: THREE.NormalBlending,
      });
      pitDetailMats.push(hazeMat);
      const haze = new THREE.Mesh(hazeGeo, hazeMat);
      haze.rotation.x = -Math.PI / 2;
      haze.position.y = worldToLocalY(def.worldY);
      haze.scale.setScalar(def.scale);
      haze.renderOrder = -2;
      pitWall.add(haze);
    }

    // * Soft throat fog cylinder at the mouth — violet club haze just under the rim.
    {
      const throatH = 14;
      const throatGeo = new THREE.CylinderGeometry(
        pitInnerRadius * 0.98,
        pitInnerRadius * 0.92,
        throatH,
        48,
        1,
        true,
      );
      pitDetailGeos.push(throatGeo);
      const throatMat = new THREE.MeshBasicMaterial({
        color: 0x7a22cc,
        // * Vertical alpha fade melts the cylinder's hard top edge at the pit mouth
        // * (run-5) — the sundial horizon-haze treatment. Peak nudged 0.07 → 0.09.
        map: throatFadeTex,
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      pitDetailMats.push(throatMat);
      const throat = new THREE.Mesh(throatGeo, throatMat);
      throat.position.y = rimLocalY - throatH * 0.5 - 1.2;
      pitWall.add(throat);
    }

    // * Depth marker numerals as simple glowing ticks (every other ring beam).
    const tickGeo = new THREE.BoxGeometry(0.8, 0.12, 0.08);
    pitDetailGeos.push(tickGeo);
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0xff2bd6,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    pitDetailMats.push(tickMat);
    for (let i = 0; i < ringBeamWorldYs.length; i += 1) {
      const a = i * (Math.PI / 2.5);
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.position.set(
        Math.cos(a) * (pitInnerRadius - 0.55),
        worldToLocalY(ringBeamWorldYs[i]),
        Math.sin(a) * (pitInnerRadius - 0.55),
      );
      tick.lookAt(0, tick.position.y, 0);
      pitWall.add(tick);
    }
  }

  // * Deep void uplight — magenta/violet from below so the shaft isn't pure black
  // * when carts fall; intensity low so it stays creepy, not rave-floor.
  const pitUplight = new THREE.PointLight(0x9911ff, 42, 55, 2);
  pitUplight.position.set(0, -22, 0);
  scene.add(pitUplight);
  const pitRimFill = new THREE.PointLight(0x22e6ff, 18, 28, 2);
  pitRimFill.position.set(0, -4.5, 0);
  scene.add(pitRimFill);

  // * Top cap sits below the drain throat (-61.5) so the solid cylinder never
  // * overlaps the funnel interior; it's the final bounce for corpses that fall
  // * through the throat.
  const pitWallPhysicsTopY = -64;
  const pitWallPhysicsBottomY = pitWallCenterY - pitWallDepth / 2;
  const pitWallPhysicsHalfHeight = (pitWallPhysicsTopY - pitWallPhysicsBottomY) / 2;
  const pitWallPhysicsCenterY = (pitWallPhysicsTopY + pitWallPhysicsBottomY) / 2;
  const pitWallBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, pitWallPhysicsCenterY, 0),
  );
  // * Native cylinder collider — smooth wall, no tri-seam jitter. Solid, so the top
  // * cap doubles as the shaft floor for anything that clears the drain throat.
  const pitWallCollider = world.createCollider(
    RAPIER.ColliderDesc.cylinder(pitWallPhysicsHalfHeight, pitInnerRadius)
      .setFriction(0.2)
      .setRestitution(0.8),
    pitWallBody,
  );
  const pitWallColliderHandle = pitWallCollider.handle;

  // --- Shaft walls — the knockout space is a straight drop (the mushroom stem) ---
  // * 18 tangent-fit convex-hull wall staves (Rapier has no hollow-cylinder
  // * primitive and trimesh is banned) line the inside of the visual shaft from
  // * just below the rim down to the solid backstop cap. Vertical walls give a
  // * live cart nothing to rest or drive on, they ricochet fallers around the
  // * shaft on the way down, and carts knocked outward below the containment lip
  // * bounce back inside instead of escaping under the stands. The existing pit
  // * wall gradient + depth rings are the visual — no extra geometry needed.
  const shaftWallTopY = -4; // meets the containment lip base
  const shaftWallBottomY = -64; // meets the solid pit-wall backstop cap
  const SHAFT_SEGMENTS = 18;
  const shaftBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  {
    const shaftHalfAngle = Math.PI / SHAFT_SEGMENTS;
    const wallThickness = 1.5;
    const zInner = pitInnerRadius * Math.tan(shaftHalfAngle);
    const zOuter = (pitInnerRadius + wallThickness) * Math.tan(shaftHalfAngle);
    const wallVertices = new Float32Array([
      // Inner face — flush with the visual shaft wall.
      pitInnerRadius, shaftWallTopY, -zInner,
      pitInnerRadius, shaftWallTopY, zInner,
      pitInnerRadius, shaftWallBottomY, -zInner,
      pitInnerRadius, shaftWallBottomY, zInner,
      // Outer face — radial extrusion away from the shaft.
      pitInnerRadius + wallThickness, shaftWallTopY, -zOuter,
      pitInnerRadius + wallThickness, shaftWallTopY, zOuter,
      pitInnerRadius + wallThickness, shaftWallBottomY, -zOuter,
      pitInnerRadius + wallThickness, shaftWallBottomY, zOuter,
    ]);
    for (let i = 0; i < SHAFT_SEGMENTS; i++) {
      const angle = (i / SHAFT_SEGMENTS) * Math.PI * 2;
      const quat = new THREE.Quaternion().setFromAxisAngle(yAxis, angle);
      const wallDesc = RAPIER.ColliderDesc.convexHull(wallVertices)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setFriction(0.05)
        .setRestitution(0.6);
      const wallCollider = world.createCollider(wallDesc, shaftBody);
      // * Registered as "edge" so impacts get the wall-clang FX/audio classification.
      boothColliderHandles.push(wallCollider.handle);
    }
  }

  // * Containment lip — an invisible wall above the pit rim that keeps boosted rams
  // * (~27 m/s) from sailing carts out over the stands. Same tangent-fit hull
  // * recipe, on the same fixed body as the shaft walls.
  // * It OVERHANGS the shaft mouth (top edge leans inward, skate-bowl over-vert):
  // * where it meets the shaft wall top at (44.3, -4) both contact normals point
  // * inward, so there is no resting equilibrium in the crease — an outward-leaning
  // * wall forms a V-gutter carts can sit in and grind (the "drive on the upper pit
  // * edge" bug). Base meets the wall top exactly; any gap leaves a wedge slot.
  {
    const LIP_SEGMENTS = 16;
    const lipBaseR = pitInnerRadius; // 44.3 — meets the shaft wall top exactly
    const lipBaseY = -4;
    const lipTopR = pitInnerRadius - 1.5; // leans inward over the shaft
    const lipTopY = 9;
    const lipThickness = 1.5; // radial extrusion outward (thick enough for CCD)
    const lipHalfAngle = Math.PI / LIP_SEGMENTS;
    const zBase = lipBaseR * Math.tan(lipHalfAngle);
    const zTop = lipTopR * Math.tan(lipHalfAngle);
    const lipVertices = new Float32Array([
      // Inner face — the deflecting overhang, pit rim up/inward over the shaft.
      lipBaseR, lipBaseY, -zBase,
      lipBaseR, lipBaseY, zBase,
      lipTopR, lipTopY, -zTop,
      lipTopR, lipTopY, zTop,
      // Outer face — thick at the base for CCD, tapering to a near-knife edge 2m
      // above the inner top so the hull has no flat top ledge a cart could park on.
      lipBaseR + lipThickness, lipBaseY, -zBase,
      lipBaseR + lipThickness, lipBaseY, zBase,
      lipTopR + 0.2, lipTopY + 2, -zTop,
      lipTopR + 0.2, lipTopY + 2, zTop,
    ]);
    for (let i = 0; i < LIP_SEGMENTS; i++) {
      const angle = (i / LIP_SEGMENTS) * Math.PI * 2;
      const quat = new THREE.Quaternion().setFromAxisAngle(yAxis, angle);
      const lipDesc = RAPIER.ColliderDesc.convexHull(lipVertices)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setFriction(0.02)
        .setRestitution(0.5);
      const lipCollider = world.createCollider(lipDesc, shaftBody);
      boothColliderHandles.push(lipCollider.handle);
    }
  }

  // * Shatter debris ricochets off the inside of the shaft wall (analytic,
  // * client-local) so explosion parts rain down the shaft instead of flying
  // * out through the visual wall.
  setShatterEnvironment({ wallR: pitInnerRadius, topY: shaftWallTopY });

  const sceneRoots = [
    recordMesh, rimMesh, edgeRingMesh, innerRimMesh, innerEdgeMesh, pitWall, spindleLight,
    pitUplight, pitRimFill,
    ...boothBuild.boothGroups,
    ...boothBuild.fogSprites,
    ...(boothBuild.trussMeshes || []),
    recordSolidFloor,
  ];
  if (debugMesh) {
    // @ts-expect-error THREE duck-typing suppress
    sceneRoots.push(debugMesh);
  }

  /** @type {THREE.BufferGeometry[]} */
  const ownedGeometries = [
    recordGeo, recordLabelGeo, rimGeo, edgeRingGeo, innerRimGeo, innerEdgeGeo, pitWallGeo,
    solidFloorGeo, vinylDetailGeo,
    ...pitDetailGeos,
    ...raveDecor.geos,
  ];
  if (recordPhysicsGeo) {
    ownedGeometries.push(recordPhysicsGeo);
  }
  if (grooveResult) {
    ownedGeometries.push(grooveResult.mergedGrooves);
  }
  if (spindleRingGeo) {
    ownedGeometries.push(spindleRingGeo);
  }

  const ownedMaterials = [
    recordMat, recordLabelMat, rimMat, edgeRingMat, innerEdgeMat, pitWallMat, solidFloorMat,
    vinylDetailMat,
    ...pitDetailMats,
    ...raveDecor.mats,
  ];
  if (grooveResult) {
    ownedMaterials.push(grooveResult.ringMat);
  }
  if (spindleRingMat) {
    ownedMaterials.push(spindleRingMat);
  }
  if (debugMat) {
    ownedMaterials.push(debugMat);
  }
  /** @type {THREE.Texture[]} */
  const ownedTextures = [
    pitSurfaceTex.map,
    pitSurfaceTex.normalMap,
    pitSurfaceTex.roughnessMap,
    vinylTex.map,
    vinylTex.normalMap,
    vinylTex.roughnessMap,
    ...pitDetailTextures,
    ...raveDecor.textures,
  ];

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (typeof material.dispose === "function") material.dispose();
  }

  function dispose() {
    const sharedGeos = new Set(boothBuild.sharedGeometries);
    const sharedMats = new Set(boothBuild.sharedMaterials);
    const ownedGeoSet = new Set(ownedGeometries);
    const ownedMatSet = new Set(ownedMaterials);

    for (const root of sceneRoots) {
      if (scene) scene.remove(root);
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
        const target = /** @type {THREE.Mesh | THREE.Sprite} */ (child);
        if (target.geometry && !sharedGeos.has(/** @type {any} */ (target.geometry)) && !ownedGeoSet.has(/** @type {any} */ (target.geometry))) {
          target.geometry.dispose();
        }
        const mats = Array.isArray(target.material) ? target.material : [target.material];
        mats.forEach((mat) => {
          if (mat && !sharedMats.has(/** @type {any} */ (mat)) && !ownedMatSet.has(/** @type {any} */ (mat))) disposeMaterial(mat);
        });
      });
    }

    if (scene && spindleLight) scene.remove(spindleLight);
    if (scene && pitUplight) scene.remove(pitUplight);
    if (scene && pitRimFill) scene.remove(pitRimFill);
    if (scene && boothNeonMeshes) {
      for (const mesh of boothNeonMeshes) {
        if (scene) scene.remove(mesh);
        if (mesh.parent) mesh.parent.remove(mesh);
      }
    }

    ownedGeometries.forEach((geo) => geo.dispose());
    ownedMaterials.forEach((mat) => disposeMaterial(mat));
    ownedTextures.forEach((tex) => tex.dispose());
    recordLabelTex.dispose();
    boothBuild.sharedGeometries.forEach((geo) => geo.dispose());
    boothBuild.sharedMaterials.forEach((item) => {
      // @ts-expect-error THREE duck-typing suppress
      if (item && item.isTexture) item.dispose();
      else disposeMaterial(item);
    });

    if (recordReflector) {
      // @ts-expect-error THREE duck-typing suppress
      if (recordReflector.renderTarget) {
        // @ts-expect-error THREE duck-typing suppress
        recordReflector.renderTarget.dispose();
      }
      if (recordReflector.material) {
        disposeMaterial(recordReflector.material);
      }
      recordReflector.geometry?.dispose?.();
    }

    if (window.recordMesh === recordMesh) {
      window.recordMesh = undefined;
    }

    if (world && recordBody && world.getRigidBody(recordBody.handle)) world.removeRigidBody(recordBody);
    if (world && pitWallBody && world.getRigidBody(pitWallBody.handle)) world.removeRigidBody(pitWallBody);
    if (world && shaftBody && world.getRigidBody(shaftBody.handle)) world.removeRigidBody(shaftBody);
    setShatterEnvironment(null);
    if (world && boothBuild.boothBodies) {
      for (const body of boothBuild.boothBodies) {
        if (world.getRigidBody(body.handle)) {
          world.removeRigidBody(body);
        }
      }
    }

    config.fall.yThreshold = prevFallYThreshold;
  }

  const SPINDLE_LIGHT_BASE_INTENSITY = 80;
  const RIM_BASE_EMISSIVE = 2.2;
  const SPINDLE_RING_BASE_EMISSIVE = 1.35;

  /**
   * Per-frame Classic Record visual tick (booth fog, leader/KO rim + spindle).
   * @param {number} timeMs
   */
  function update(timeMs) {
    boothBuild.updateFog?.(timeMs);
    raveDecor.update?.(timeMs);

    // * Ambient club pulse on dual rims (play-reactive leader/KO is disabled globally).
    const reactive = sampleArenaReactive(timeMs);
    if (spindleLight) {
      spindleLight.color.copy(reactive.accentColor);
      spindleLight.intensity = SPINDLE_LIGHT_BASE_INTENSITY * reactive.intensityMul;
    }
    if (rimMat && typeof rimMat.emissiveIntensity === "number") {
      // * Keep magenta rim identity; only breathe intensity with the ambient sample.
      rimMat.emissiveIntensity = RIM_BASE_EMISSIVE * (0.9 + 0.15 * Math.sin(timeMs * 0.002));
    }
    if (edgeRingMat && typeof edgeRingMat.opacity === "number") {
      edgeRingMat.opacity = 0.75 + 0.2 * Math.sin(timeMs * 0.0025 + 1.2);
    }
    if (innerEdgeMat && typeof innerEdgeMat.opacity === "number") {
      innerEdgeMat.opacity = 0.55 + 0.25 * Math.sin(timeMs * 0.003 + 0.4);
    }
    if (spindleRingMat && typeof spindleRingMat.emissiveIntensity === "number") {
      spindleRingMat.emissiveIntensity =
        SPINDLE_RING_BASE_EMISSIVE * (0.85 + 0.2 * Math.sin(timeMs * 0.0018));
    }
    // * Pit void breathe — subtle so falls feel alive without washing the shaft.
    if (pitUplight) {
      pitUplight.intensity = 36 + 12 * Math.sin(timeMs * 0.0011);
    }
    if (pitRimFill) {
      pitRimFill.intensity = 14 + 6 * Math.sin(timeMs * 0.0014 + 1.0);
    }
  }

  return {
    recordMesh,
    recordColliderHandles,
    pitWallColliderHandle,
    boothColliderHandles,
    boothNeonMeshes,
    spindleLight,
    spindleLightColorPink,
    spindleLightColorCyan,
    pitInnerRadius,
    // @ts-expect-error THREE duck-typing suppress
    recordLabelMat,
    upgradeRecordReflector,
    setReflectorVisible,
    update,
    dispose,
  };
}
