// zanzibarPlatform.js — Zanzibar Platform: offshore octagonal sundeck arena at sunset.
//
// Design intent (third arena — fills the slot the first two don't):
//   Classic Record  = circular, TWO kill directions (center pit + outer void), rave extras.
//   The Storerooms  = walled box, four corner holes, center obstacle, no outer fall.
//   Zanzibar        = OPEN octagon — no walls, no holes. Every one of the eight edges is a
//                     kill zone, and a low drivable center podium adds verticality.
//
// Physics philosophy (July 1 collider overhaul rules): primitives only, no trimesh.
//   Deck   = ONE convex hull (octagonal prism — convex, zero seams, zero tunneling).
//   Podium = ONE convex hull (octagonal frustum, 15.5° drivable ramp all around).
//   Corner bollards = 8 cylinder colliders. Booths = 4 cuboids.

import * as THREE from "three";
import { RAPIER } from "../physics/rapierInstance.js";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "../scene.js";
import { isLowQualityMode } from "../utils.js";

// ===== Layout constants =====

const OCT_SIDES = 8;
const HALF_ANGLE = Math.PI / OCT_SIDES; // 22.5°
const COS_HALF = Math.cos(HALF_ANGLE); // 0.9238795…
// * Flats face the four booth angles (0, π/2, π, 3π/2): first vertex at +22.5°.
const VERTEX_OFFSET = HALF_ANGLE;

const DECK_THICKNESS = 0.6; // meters — matches Classic + Storerooms floor thickness
const DECK_FRICTION = 0.62; // unitless — grippy steel; between Classic vinyl and carpet

const PODIUM_BASE_R = 6.0; // meters — circumradius of frustum base
const PODIUM_TOP_R = 4.2; // meters — circumradius of frustum top
const PODIUM_HEIGHT = 0.5; // meters — 0.5 rise over 1.8 run ≈ 15.5°, fully drivable

const BOLLARD_RADIUS = 0.55; // meters
const BOLLARD_HEIGHT = 1.6; // meters
const BOLLARD_RING_SCALE = 0.97; // fraction of circumradius — fully on deck

const WATER_Y = -6.0; // meters — carts sink ~4 m before the global -10 fall respawn
const WATER_SIZE = 900; // meters — fog swallows the far edge

const SKY_RADIUS = 480; // meters
const SUN_DISTANCE = 430; // meters
const SUN_AZIMUTH = Math.PI * 0.78; // radians — between two booth lanes, never behind a booth
const SUN_HEIGHT = 14; // meters — low over the water
const SUN_DRIFT_AMPLITUDE_RAD = 0.015; // radians (~0.9°) — barely-perceptible sunset wobble
const SUN_DRIFT_SPEED = 0.00006; // rad/ms — full drift cycle ≈ 105 s

/** Matches the Storerooms convention: nominal FX radius for anything pit-scaled. */
const PIT_INNER_RADIUS = 66;

const ISLAND_HAZE_DIST_OFFSET = 35; // meters — a ridge's haze layer sits this much farther out
// meters — keeps every island (incl. its haze layer) well inside the WATER_SIZE ocean plane's
// edge, so fog swallows the plane's true edge before any silhouette appears to float past it.
const ISLAND_MAX_DIST = WATER_SIZE / 2 - 50;

// ===== Canvas texture builders =====

/**
 * Steel deck top: plate seams, bolt rings, hazard-yellow perimeter band traced as a
 * true octagon (aligned to the collider flats), and helipad-style podium markings.
 *
 * @param {number} circumR Deck circumradius in meters.
 * @returns {THREE.CanvasTexture}
 */
function buildDeckTexture(circumR) {
  const size = isLowQualityMode() ? 512 : 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const pxPerM = c / circumR;

  // Base steel.
  ctx.fillStyle = "#262a31";
  ctx.fillRect(0, 0, size, size);

  // Subtle grime blotches.
  for (let i = 0; i < 90; i += 1) {
    const r = 8 + Math.random() * 42;
    ctx.fillStyle = `rgba(${10 + Math.random() * 18}, ${12 + Math.random() * 16}, ${16 + Math.random() * 14}, 0.16)`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Trace the deck octagon path at a given radius (meters). */
  const octPath = (radiusM) => {
    ctx.beginPath();
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const a = VERTEX_OFFSET + i * (Math.PI / 4);
      const x = c + Math.cos(a) * radiusM * pxPerM;
      const y = c + Math.sin(a) * radiusM * pxPerM;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // Plate seams: concentric octagon rings + radial spokes to each vertex.
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = Math.max(2, size * 0.004);
  for (const rM of [8.5, 14.5, 20.5]) {
    octPath(rM);
    ctx.stroke();
  }
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * PODIUM_BASE_R * pxPerM, c + Math.sin(a) * PODIUM_BASE_R * pxPerM);
    ctx.lineTo(c + Math.cos(a) * circumR * pxPerM, c + Math.sin(a) * circumR * pxPerM);
    ctx.stroke();
  }

  // Bolt dots along the middle seam ring.
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * 14.5 * pxPerM, c + Math.sin(a) * 14.5 * pxPerM, size * 0.0035, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hazard-yellow edge band (readability: the rim IS the kill zone).
  const apothem = circumR * COS_HALF;
  ctx.strokeStyle = "#d9a614";
  ctx.lineWidth = 1.5 * pxPerM;
  octPath(apothem - 1.7);
  ctx.stroke();
  // Black chevron dashes over the band.
  ctx.strokeStyle = "rgba(10,10,12,0.85)";
  ctx.lineWidth = 1.5 * pxPerM;
  ctx.setLineDash([1.1 * pxPerM, 1.9 * pxPerM]);
  octPath(apothem - 1.7);
  ctx.stroke();
  ctx.setLineDash([]);

  // Podium apron markings: thin cyan ring + tick marks (helipad read).
  ctx.strokeStyle = "rgba(43,214,255,0.55)";
  ctx.lineWidth = Math.max(2, 0.22 * pxPerM);
  ctx.beginPath();
  ctx.arc(c, c, (PODIUM_BASE_R + 1.1) * pxPerM, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (PODIUM_BASE_R + 0.6) * pxPerM, c + Math.sin(a) * (PODIUM_BASE_R + 0.6) * pxPerM);
    ctx.lineTo(c + Math.cos(a) * (PODIUM_BASE_R + 1.6) * pxPerM, c + Math.sin(a) * (PODIUM_BASE_R + 1.6) * pxPerM);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Sunset gradient for the sky dome: deep indigo zenith → dusk magenta → ember horizon.
 * @returns {THREE.CanvasTexture}
 */
function buildSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#0b0620"); // zenith — deep blue-violet
  grad.addColorStop(0.42, "#3a1548");
  grad.addColorStop(0.62, "#8a2d5e");
  grad.addColorStop(0.78, "#d95a35");
  grad.addColorStop(0.88, "#f57a3c"); // ember band at the horizon
  // * Must track CONFIG.postFx.fog.zanzibar.color — the ocean fogs to that hex at
  // * distance, so a mismatched sky bottom shows as a seam at the waterline.
  grad.addColorStop(1.0, "#ff5a22"); // horizon melt color matching fog
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Horizontal glint streaks for the animated sun-path strip on the water.
 * @returns {THREE.CanvasTexture}
 */
function buildGlintTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 60; i += 1) {
    const y = Math.random() * 256;
    const w = 10 + Math.random() * 46;
    const x = Math.random() * (128 - w);
    ctx.fillStyle = `rgba(255, ${170 + Math.floor(Math.random() * 60)}, 110, ${0.12 + Math.random() * 0.3})`;
    ctx.fillRect(x, y, w, 1.5 + Math.random() * 1.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Diagonal hazard stripes for corner bollards.
 * @returns {THREE.CanvasTexture}
 */
function buildHazardStripeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d9a614";
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "#15151a";
  ctx.lineWidth = 12;
  for (let x = -64; x < 128; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x + 70, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===== Geometry helpers =====

/**
 * Octagonal prism convex-hull vertices (16 floats × 3), flats aligned to booth angles.
 *
 * @param {number} circumR Circumradius.
 * @param {number} yTop Top face Y.
 * @param {number} yBottom Bottom face Y.
 * @param {number} [topCircumR] Optional distinct top circumradius (frustum).
 * @returns {Float32Array}
 */
function buildOctHullVertices(circumR, yTop, yBottom, topCircumR = circumR) {
  const verts = new Float32Array(OCT_SIDES * 2 * 3);
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 4);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // Top ring.
    verts[i * 3 + 0] = cos * topCircumR;
    verts[i * 3 + 1] = yTop;
    verts[i * 3 + 2] = sin * topCircumR;
    // Bottom ring.
    const j = OCT_SIDES + i;
    verts[j * 3 + 0] = cos * circumR;
    verts[j * 3 + 1] = yBottom;
    verts[j * 3 + 2] = sin * circumR;
  }
  return verts;
}

// ===== Sub-builders =====

/**
 * Ocean, sun-path glint strip, sun disc + halo, sky dome, and island silhouettes.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, glintMat: THREE.MeshBasicMaterial | null,
 *   glintTex: THREE.CanvasTexture | null, sunDir: THREE.Vector3,
 *   updateSun: (timeMs: number) => void, ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[], ownedTextures: THREE.Texture[] }}
 */
function buildSeascape(scene) {
  const lowQ = isLowQualityMode();
  const group = new THREE.Group();
  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [];

  // Ocean plane.
  const waterGeo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 1, 1);
  const waterMat = createPhysicalMaterial({
    color: 0x0d3546,
    roughness: 0.24,
    metalness: 0.85,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.5,
  });
  waterMat.userData.envMapIntensityScale = 0.5;
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  group.add(water);
  ownedGeometries.push(waterGeo);
  ownedMaterials.push(waterMat);

  // Sky dome — gradient canvas, unlit, unfogged.
  const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, lowQ ? 20 : 32, lowQ ? 10 : 16);
  const skyTex = buildSkyTexture();
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);
  ownedGeometries.push(skyGeo);
  ownedMaterials.push(skyMat);
  ownedTextures.push(skyTex);

  // Sun disc + halo, low over the water along SUN_AZIMUTH.
  const sunDir = new THREE.Vector3(Math.cos(SUN_AZIMUTH), 0, Math.sin(SUN_AZIMUTH));
  const sunPos = sunDir.clone().multiplyScalar(SUN_DISTANCE);
  sunPos.y = SUN_HEIGHT;

  const sunGeo = new THREE.CircleGeometry(26, 40);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.copy(sunPos);
  sun.lookAt(0, SUN_HEIGHT, 0);
  group.add(sun);
  ownedGeometries.push(sunGeo);
  ownedMaterials.push(sunMat);

  const haloGeo = new THREE.CircleGeometry(58, 40);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xff6a30,
    transparent: true,
    opacity: 0.35,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.copy(sunPos).add(sunDir.clone().multiplyScalar(2));
  halo.lookAt(0, SUN_HEIGHT, 0);
  group.add(halo);
  ownedGeometries.push(haloGeo);
  ownedMaterials.push(haloMat);

  // Animated sun-path glint strip (skipped in Low Quality).
  let glintMat = null;
  let glintTex = null;
  if (!lowQ) {
    glintTex = buildGlintTexture();
    glintMat = new THREE.MeshBasicMaterial({
      map: glintTex,
      color: 0xffb36a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glintGeo = new THREE.PlaneGeometry(16, 300, 1, 1);
    const glint = new THREE.Mesh(glintGeo, glintMat);
    glint.rotation.x = -Math.PI / 2;
    glint.rotation.z = -SUN_AZIMUTH + Math.PI / 2;
    glint.position.copy(sunDir.clone().multiplyScalar(185));
    glint.position.y = WATER_Y + 0.15;
    group.add(glint);
    ownedGeometries.push(glintGeo);
    ownedMaterials.push(glintMat);
    ownedTextures.push(glintTex);
  }

  // Island silhouettes — each is two atmospheric-perspective layers (a darker, larger
  // foreground ridge + a lighter, hazier background ridge set further back) instead of a
  // single flat cutout. Colors are hand-picked steps down from the sky gradient's
  // magenta/ember horizon band (buildSkyTexture above) so the far layers sit just darker
  // than the dusk behind them and the near layers read as true silhouette.
  // * Islands take scene fog (unlike the sky) so they inherit the exact same ember haze
  // * the ocean fades into — at 300-365m that's a 60-75% fog mix, which does the
  // * atmospheric-perspective blending for us. Base colors are therefore much darker
  // * than the final on-screen tones; the fog lift lands them just under the horizon.
  const islandNearMat = new THREE.MeshBasicMaterial({ color: 0x140a10 }); // closest ridge — near-black plum
  const islandMidMat = new THREE.MeshBasicMaterial({ color: 0x231018 }); // mid-distance ridge / near haze
  const islandFarMat = new THREE.MeshBasicMaterial({ color: 0x321823 }); // far ridge — dusty mauve
  const islandFarHazeMat = new THREE.MeshBasicMaterial({ color: 0x40202c }); // farthest haze — near-merges with the horizon glow
  ownedMaterials.push(islandNearMat, islandMidMat, islandFarMat, islandFarHazeMat);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  ownedGeometries.push(coneGeo, boxGeo);

  /**
   * One ridge layer: a chain of cone/box primitives whose profile reads as a jagged
   * skyline rather than a single flat cutout.
   * @param {number} azimuth @param {number} dist @param {Array<[number, number, number]>} parts
   *   cone/box [radiusOrWidth, height, kind 0=cone 1=box] @param {THREE.Material} mat
   * @param {number} [yLift] Extra Y so a hazier, farther ridge's base sits above the
   *   waterline, as if its foot were lost in the haze.
   */
  const addRidge = (azimuth, dist, parts, mat, yLift = 0) => {
    const island = new THREE.Group();
    island.position.set(Math.cos(azimuth) * dist, WATER_Y + yLift, Math.sin(azimuth) * dist);
    let offset = 0;
    for (const [w, h, kind] of parts) {
      const m = new THREE.Mesh(kind === 0 ? coneGeo : boxGeo, mat);
      m.scale.set(w, h, w);
      m.position.set(offset, h / 2, offset * 0.4);
      island.add(m);
      offset += w * 0.7;
    }
    island.lookAt(0, WATER_Y + yLift, 0);
    group.add(island);
  };

  /**
   * Foreground ridge plus an optional smaller, lighter haze ridge set further back (clamped
   * to ISLAND_MAX_DIST) so the pair reads as one island with depth.
   * @param {number} azimuth @param {number} dist @param {Array<[number, number, number]>} nearParts
   * @param {THREE.Material} nearMat @param {Array<[number, number, number]>} [hazeParts]
   * @param {THREE.Material} [hazeMat]
   */
  const addIsland = (azimuth, dist, nearParts, nearMat, hazeParts, hazeMat) => {
    addRidge(azimuth, dist, nearParts, nearMat);
    if (hazeParts) {
      addRidge(azimuth, Math.min(dist + ISLAND_HAZE_DIST_OFFSET, ISLAND_MAX_DIST), hazeParts, hazeMat, 1.5);
    }
  };

  // Closest cluster — darkest tier, largest silhouette.
  addIsland(
    SUN_AZIMUTH + 0.55, 300,
    [[76, 37, 0], [50, 24, 0], [64, 29, 0]], islandNearMat,
    [[40, 20, 0], [30, 15, 0]], islandMidMat,
  );
  // Mid cluster — jagged rock spires, tier fading toward the far cluster's tone.
  addIsland(
    SUN_AZIMUTH - 0.5, 335,
    [[11, 60, 1], [8, 88, 1], [13, 48, 1], [9, 68, 1]], islandMidMat,
    [[6, 40, 1], [5, 55, 1]], islandFarMat,
  );
  // Farthest cluster — smallest, hazy silhouette that nearly merges with the horizon glow.
  addIsland(
    SUN_AZIMUTH + 1.6, 365,
    [[28, 19, 0], [16, 32, 0]], islandFarMat,
    [[18, 12, 0]], islandFarHazeMat,
  );

  // Sun drift: a slow, barely-perceptible azimuth wobble so the sunset doesn't feel frozen.
  // Mutates sunDir/sun/halo in place each call — zero per-frame allocations. initZanzibarPlatform
  // reads the updated sunDir afterward to keep the sunLight pointed the same direction.
  function updateSun(timeMs) {
    const azimuth = SUN_AZIMUTH + Math.sin(timeMs * SUN_DRIFT_SPEED) * SUN_DRIFT_AMPLITUDE_RAD;
    sunDir.set(Math.cos(azimuth), 0, Math.sin(azimuth));
    sun.position.set(sunDir.x * SUN_DISTANCE, SUN_HEIGHT, sunDir.z * SUN_DISTANCE);
    sun.lookAt(0, SUN_HEIGHT, 0);
    halo.position.set(sun.position.x + sunDir.x * 2, SUN_HEIGHT, sun.position.z + sunDir.z * 2);
    halo.lookAt(0, SUN_HEIGHT, 0);
  }

  scene.add(group);
  return { group, glintMat, glintTex, sunDir, updateSun, ownedGeometries, ownedMaterials, ownedTextures };
}

/**
 * The octagonal deck: visual cylinder (8 segments), under-skirt, support pillars,
 * deck + podium convex-hull colliders, and eight corner bollards.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config
 * @param {number} circumR
 * @returns {{ group: THREE.Group, body: import("@dimforge/rapier3d").RigidBody,
 *   floorColliderHandles: number[], deckTex: THREE.CanvasTexture,
 *   neonStripMeshes: THREE.Mesh[], neonMat: THREE.Material,
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[], ownedTextures: THREE.Texture[] }}
 */
function buildDeck(scene, world, config, circumR) {
  const group = new THREE.Group();
  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [];

  // --- Visual: deck slab ---
  const deckTex = buildDeckTexture(circumR);
  ownedTextures.push(deckTex);
  const deckTopMat = createPhysicalMaterial({
    map: deckTex,
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0.62,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.45,
  });
  deckTopMat.userData.envMapIntensityScale = 0.45;
  const deckSideMat = createPhysicalMaterial({
    color: 0x1a1d24,
    roughness: 0.5,
    metalness: 0.7,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.35,
  });
  deckSideMat.userData.envMapIntensityScale = 0.35;
  const deckBottomMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.95, metalness: 0.2 });
  ownedMaterials.push(deckTopMat, deckSideMat, deckBottomMat);

  const deckGeo = new THREE.CylinderGeometry(
    circumR, circumR, DECK_THICKNESS, OCT_SIDES, 1, false, VERTEX_OFFSET,
  );
  ownedGeometries.push(deckGeo);
  const deckMesh = new THREE.Mesh(deckGeo, [deckSideMat, deckTopMat, deckBottomMat]);
  deckMesh.position.y = -DECK_THICKNESS / 2;
  group.add(deckMesh);

  // Under-skirt.
  const skirtGeo = new THREE.CylinderGeometry(
    circumR - 0.25, circumR - 1.4, 2.2, OCT_SIDES, 1, true, VERTEX_OFFSET,
  );
  ownedGeometries.push(skirtGeo);
  const skirt = new THREE.Mesh(skirtGeo, deckBottomMat);
  skirt.position.y = -DECK_THICKNESS - 1.1;
  group.add(skirt);

  // Support pillars.
  const pillarGeo = new THREE.BoxGeometry(5.2, 7.5, 5.2);
  ownedGeometries.push(pillarGeo);
  const pillarMat = createPhysicalMaterial({ color: 0x23262e, roughness: 0.7, metalness: 0.5 });
  pillarMat.userData.envMapIntensityScale = 1;
  ownedMaterials.push(pillarMat);
  for (let i = 0; i < 4; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 2);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(Math.cos(a) * 15, -DECK_THICKNESS - 3.7, Math.sin(a) * 15);
    group.add(pillar);
  }

  // Center podium.
  const podiumGeo = new THREE.CylinderGeometry(
    PODIUM_TOP_R, PODIUM_BASE_R, PODIUM_HEIGHT, OCT_SIDES, 1, false, VERTEX_OFFSET,
  );
  ownedGeometries.push(podiumGeo);
  const podiumMat = createPhysicalMaterial({
    color: 0x2c313a,
    roughness: 0.5,
    metalness: 0.7,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.5,
  });
  podiumMat.userData.envMapIntensityScale = 0.5;
  ownedMaterials.push(podiumMat);
  const podium = new THREE.Mesh(podiumGeo, podiumMat);
  podium.position.y = PODIUM_HEIGHT / 2;
  group.add(podium);

  // Neon rim strips & crown.
  const neonMat = new THREE.MeshStandardMaterial({
    color: config.booth.neonColor1,
    emissive: config.booth.neonColor1,
    emissiveIntensity: 2.2,
    roughness: 0.4,
    metalness: 0.1,
  });
  ownedMaterials.push(neonMat);
  const apothem = circumR * COS_HALF;
  const edgeLen = 2 * circumR * Math.sin(HALF_ANGLE);
  const stripGeo = new THREE.BoxGeometry(edgeLen - 1.6, 0.14, 0.22);
  ownedGeometries.push(stripGeo);
  const neonStripMeshes = [];
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const mid = i * (Math.PI / 4);
    const strip = new THREE.Mesh(stripGeo, neonMat);
    strip.position.set(Math.cos(mid) * (apothem - 0.45), 0.08, Math.sin(mid) * (apothem - 0.45));
    strip.rotation.y = -mid + Math.PI / 2;
    group.add(strip);
    neonStripMeshes.push(strip);
  }
  const crownGeo = new THREE.TorusGeometry(PODIUM_TOP_R - 0.18, 0.09, 8, 32);
  ownedGeometries.push(crownGeo);
  const crown = new THREE.Mesh(crownGeo, neonMat);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = PODIUM_HEIGHT + 0.05;
  group.add(crown);
  neonStripMeshes.push(crown);

  // Corner bollards.
  const stripeTex = buildHazardStripeTexture();
  ownedTextures.push(stripeTex);
  const bollardMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, metalness: 0.3 });
  ownedMaterials.push(bollardMat);
  const bollardGeo = new THREE.CylinderGeometry(BOLLARD_RADIUS, BOLLARD_RADIUS, BOLLARD_HEIGHT, 10);
  const capGeo = new THREE.CylinderGeometry(BOLLARD_RADIUS * 0.7, BOLLARD_RADIUS * 0.7, 0.12, 10);
  ownedGeometries.push(bollardGeo, capGeo);
  const bollardRing = circumR * BOLLARD_RING_SCALE;
  const bollardPositions = [];
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 4);
    const x = Math.cos(a) * bollardRing;
    const z = Math.sin(a) * bollardRing;
    bollardPositions.push({ x, z });
    const bollard = new THREE.Mesh(bollardGeo, bollardMat);
    bollard.position.set(x, BOLLARD_HEIGHT / 2, z);
    group.add(bollard);
    const cap = new THREE.Mesh(capGeo, neonMat);
    cap.position.set(x, BOLLARD_HEIGHT + 0.06, z);
    group.add(cap);
    neonStripMeshes.push(cap);
  }

  scene.add(group);

  // --- Physics ---
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  const floorColliderHandles = [];

  const deckHull = buildOctHullVertices(circumR, 0, -DECK_THICKNESS);
  const deckCollider = world.createCollider(
    RAPIER.ColliderDesc.convexHull(deckHull)
      .setFriction(DECK_FRICTION)
      .setRestitution(config.record.restitution),
    body,
  );
  floorColliderHandles.push(deckCollider.handle);

  const podiumHull = buildOctHullVertices(PODIUM_BASE_R, PODIUM_HEIGHT, 0, PODIUM_TOP_R);
  const podiumCollider = world.createCollider(
    RAPIER.ColliderDesc.convexHull(podiumHull)
      .setFriction(DECK_FRICTION)
      .setRestitution(config.record.restitution),
    body,
  );
  floorColliderHandles.push(podiumCollider.handle);

  for (const p of bollardPositions) {
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(BOLLARD_HEIGHT / 2, BOLLARD_RADIUS)
        .setTranslation(p.x, BOLLARD_HEIGHT / 2, p.z)
        .setFriction(0.3)
        .setRestitution(0.55),
      body,
    );
  }

  return {
    group, body, floorColliderHandles, deckTex, neonStripMeshes, neonMat,
    ownedGeometries, ownedMaterials, ownedTextures,
  };
}

/**
 * Spawn booths.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config
 * @param {number[]} boothColliderHandles
 * @param {THREE.Mesh[]} boothNeonMeshes
 * @param {THREE.Material} neonMat
 * @returns {{ group: THREE.Group, bodies: import("@dimforge/rapier3d").RigidBody[],
 *   ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[] }}
 */
function buildZanzibarBooths(scene, world, config, boothColliderHandles, boothNeonMeshes, neonMat) {
  const B = config.booth;
  const arenaR = config.record.radius;
  const boothCenterDist = arenaR + B.gapDistance + B.rampLength + B.platformDepth / 2;
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  const group = new THREE.Group();
  const bodies = [];

  const slabMat = createPhysicalMaterial({ color: 0x262a31, roughness: 0.55, metalness: 0.65 });
  slabMat.userData.envMapIntensityScale = 1;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.75, metalness: 0.4 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9a614, roughness: 0.6, metalness: 0.25 });

  const platGeo = new THREE.BoxGeometry(B.platformWidth, B.platformThickness, B.platformDepth);
  const trimGeo = new THREE.BoxGeometry(B.platformWidth, 0.1, 0.3);
  const legGeo = new THREE.BoxGeometry(0.5, B.platformY + 7, 0.5);
  const braceGeo = new THREE.BoxGeometry(0.28, 0.28, B.platformDepth - 0.6);
  const railGeo = new THREE.CylinderGeometry(B.railThickness / 2, B.railThickness / 2, 1, 8);

  const ownedGeometries = [platGeo, trimGeo, legGeo, braceGeo, railGeo];
  const ownedMaterials = [slabMat, legMat, trimMat];

  const pw = B.platformWidth / 2;
  const pd = B.platformDepth / 2;

  for (let i = 0; i < 4; i += 1) {
    const angle = angles[i];
    const cx = boothCenterDist * Math.cos(angle);
    const cz = boothCenterDist * Math.sin(angle);
    const topY = B.platformY;
    const yaw = Math.PI / 2 - angle;

    const boothGroup = new THREE.Group();
    boothGroup.position.set(cx, 0, cz);
    boothGroup.rotation.y = yaw;

    const slab = new THREE.Mesh(platGeo, slabMat);
    slab.position.set(0, topY, 0);
    boothGroup.add(slab);

    const platBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, topY, cz),
    );
    const halfYaw = yaw / 2;
    platBody.setRotation({ x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) }, true);
    const boothCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(pw, B.platformThickness / 2, pd)
        .setFriction(B.friction)
        .setRestitution(B.restitution),
      platBody,
    );
    boothColliderHandles.push(boothCollider.handle);
    bodies.push(platBody);

    const deckTopY = topY + B.platformThickness / 2;

    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.set(0, deckTopY + 0.02, -pd + 0.15);
    boothGroup.add(trim);

    for (const [lx, lz] of [[-pw + 0.4, -pd + 0.4], [pw - 0.4, -pd + 0.4], [-pw + 0.4, pd - 0.4], [pw - 0.4, pd - 0.4]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, topY - (B.platformY + 7) / 2, lz);
      boothGroup.add(leg);
    }
    for (const sx of [-pw + 0.4, pw - 0.4]) {
      const brace = new THREE.Mesh(braceGeo, legMat);
      brace.position.set(sx, topY - 2.2, 0);
      boothGroup.add(brace);
    }

    for (const sx of [-pw + 0.1, pw - 0.1]) {
      const rail = new THREE.Mesh(railGeo, neonMat);
      rail.scale.set(1, B.platformDepth - 0.4, 1);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(sx, deckTopY + B.railHeight, 0);
      boothGroup.add(rail);
      boothNeonMeshes.push(rail);

      for (const rz of [-pd + 0.2, pd - 0.2]) {
        const post = new THREE.Mesh(railGeo, legMat);
        post.scale.set(1, B.railHeight, 1);
        post.position.set(sx, deckTopY + B.railHeight / 2, rz);
        boothGroup.add(post);
      }
    }
    const backRail = new THREE.Mesh(railGeo, neonMat);
    backRail.scale.set(1, B.platformWidth - 0.2, 1);
    backRail.rotation.z = Math.PI / 2;
    backRail.position.set(0, deckTopY + B.railHeight, pd - 0.2);
    boothGroup.add(backRail);
    boothNeonMeshes.push(backRail);

    group.add(boothGroup);
  }

  scene.add(group);
  return { group, bodies, ownedGeometries, ownedMaterials };
}

// ===== Level entry point =====

/**
 * Builds the Zanzibar Platform arena.
 *
 * @param {THREE.Scene} scene Root Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 * @param {object} config Full game CONFIG.
 * @returns {{
 *   recordMesh: THREE.Object3D,
 *   recordCollider: import("@dimforge/rapier3d").Collider | undefined,
 *   recordColliderHandles: number[],
 *   pitWallColliderHandle: number,
 *   boothColliderHandles: number[],
 *   boothNeonMeshes: THREE.Mesh[],
 *   spindleLight: THREE.PointLight,
 *   spindleLightColorPink: THREE.Color,
 *   spindleLightColorCyan: THREE.Color,
 *   pitInnerRadius: number,
 *   recordLabelMat: null,
 *   aiHazards: object,
 *   update: (timeMs: number) => void,
 *   dispose: () => void,
 * }}
 */
export function initZanzibarPlatform(scene, world, config) {
  const prevCenterHole = config.record.centerHole;
  config.record.centerHole = { enabled: false };

  const prevFog = scene.fog;
  const zanzibarFog = config.postFx.fog.zanzibar;
  scene.fog = new THREE.FogExp2(zanzibarFog.color, zanzibarFog.density);

  const circumR = config.record.radius / COS_HALF;

  const seascape = buildSeascape(scene);
  const deck = buildDeck(scene, world, config, circumR);

  // Sun light tracks the seascape's sun disc direction (see buildSeascape's updateSun) so
  // the lighting stays coherent with the drifting sunset visual each frame.
  const sunLight = new THREE.DirectionalLight(0xffa04e, 2.1);
  sunLight.position.copy(seascape.sunDir).multiplyScalar(80).setY(16);
  scene.add(sunLight);
  const hemiLight = new THREE.HemisphereLight(0xff9a5c, 0x0a1e34, 0.85);
  scene.add(hemiLight);
  const ambient = new THREE.AmbientLight(0x40304a, 0.6);
  scene.add(ambient);

  const boothNeonMeshes = [...deck.neonStripMeshes];
  const boothColliderHandles = [];
  const booths = buildZanzibarBooths(
    scene, world, config, boothColliderHandles, boothNeonMeshes, deck.neonMat,
  );

  const spindleLight = new THREE.PointLight(config.booth.neonColor1, 38, 55, 2);
  const spindleLightColorPink = new THREE.Color(config.booth.neonColor1);
  const spindleLightColorCyan = new THREE.Color(config.booth.neonColor2);
  spindleLight.position.set(0, 7, 0);
  scene.add(spindleLight);

  const recordMesh = new THREE.Group();
  const pitWallColliderHandle = -1;

  const glintTex = seascape.glintTex;
  const glintMat = seascape.glintMat;
  function update(timeMs) {
    seascape.updateSun(timeMs);
    sunLight.position.copy(seascape.sunDir).multiplyScalar(80).setY(16);
    if (glintTex) {
      glintTex.offset.y = (timeMs * 0.00004) % 1;
      if (glintMat) glintMat.opacity = 0.45 + Math.sin(timeMs * 0.0011) * 0.12;
    }
  }

  const sceneRoots = [
    seascape.group, deck.group, booths.group,
    sunLight, hemiLight, ambient, spindleLight,
  ];
  const ownedGeometries = [
    ...seascape.ownedGeometries, ...deck.ownedGeometries, ...booths.ownedGeometries,
  ];
  const ownedMaterials = [
    ...seascape.ownedMaterials, ...deck.ownedMaterials, ...booths.ownedMaterials,
  ];
  const ownedTextures = [...seascape.ownedTextures, ...deck.ownedTextures];

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (typeof material.dispose === "function") material.dispose();
  }

  function dispose() {
    for (const root of sceneRoots) {
      if (scene) scene.remove(root);
    }

    if (scene && spindleLight) scene.remove(spindleLight);
    if (scene && boothNeonMeshes) {
      for (const mesh of boothNeonMeshes) {
        if (scene) scene.remove(mesh);
        if (mesh.parent) mesh.parent.remove(mesh);
      }
    }

    for (const geo of new Set(ownedGeometries)) geo.dispose();
    for (const mat of new Set(ownedMaterials)) disposeMaterial(mat);
    for (const tex of new Set(ownedTextures)) tex.dispose();

    if (world && deck.body && world.getRigidBody(deck.body.handle)) world.removeRigidBody(deck.body);
    if (world && booths.bodies) {
      for (const body of booths.bodies) {
        if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
      }
    }

    if (scene) scene.fog = prevFog;
    config.record.centerHole = prevCenterHole;
  }

  return {
    recordMesh,
    recordCollider: undefined,
    recordColliderHandles: deck.floorColliderHandles,
    pitWallColliderHandle,
    boothColliderHandles,
    boothNeonMeshes,
    spindleLight,
    spindleLightColorPink,
    spindleLightColorCyan,
    pitInnerRadius: PIT_INNER_RADIUS,
    recordLabelMat: null,
    aiHazards: {
      arenaHalf: config.record.radius,
      isOctagon: true,
      circumRadius: circumR,
      circularKeepOuts: [{ x: 0, z: 0, radius: PODIUM_BASE_R, margin: 1.2 }],
    },
    update,
    dispose,
  };
}
