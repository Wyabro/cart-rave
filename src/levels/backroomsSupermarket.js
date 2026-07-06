// backroomsSupermarket.js — Backrooms Supermarket arena (reworked, liminal direction)
//
// A large, open square room dressed as classic "Backrooms" liminal space: yellowed
// wallpaper walls set far back, worn industrial carpet, concrete support pillars, a few
// aged store shelves, and a dropped ceiling lit by overhead fluorescent panels (several
// dead or dimmed). Four square voids near the corners drop straight into blackness, and a
// fully-enclosed black pit surrounds the play floor on all sides — both are fall-kill
// vectors that read as intentional darkness rather than a broken seam. Neon/rave dressing
// is stripped to almost nothing.
//
// The Backrooms level is self-contained: main.js disables the Classic space skybox /
// colored spotlights (sceneExtras) and hides the crowd / stage / lasers / billboard
// (effects) while this level is active, so no Classic Record elements bleed through.
//
// Returns the same level contract as initArena()/initClassicRecord() so main.js consumes
// it unchanged.

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAPIER } from "../physics/rapierInstance.js";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "../scene.js";
import { createStaticContactShadowCluster } from "../contactShadows.js";

// ===== Tunable layout constants =====

// * Floor: large worn-carpet play surface centered on the origin. Sized so the spawn
// * booths (fixed at CONFIG-derived radius ≈ 30.4m) sit comfortably ON the floor near its
// * outer edge, giving a wide, open arena.
const ARENA_HALF = 34; // meters — floor half-extent (full square = 68 x 68)
const FLOOR_TOP_Y = 0; // meters — flat playing-surface height
const FLOOR_FRICTION = 0.55; // unitless — lower than Classic record; high friction catches trimesh seams
const FLOOR_GRID_CELLS = 76; // count — trimesh grid resolution per axis
const FLOOR_STEP = (ARENA_HALF * 2) / FLOOR_GRID_CELLS; // meters — grid cell size
const CARPET_TILE_M = 3.0; // meters — carpet texture world repeat

// * Four square corner voids (interior fall hazards), inset from each corner.
const HOLE_SIZE = 8.5; // meters — square void side length
const HOLE_HALF = HOLE_SIZE / 2;
const HOLE_CENTER = 18; // meters — |x| and |z| of each void center
const HOLE_DEPTH = 32; // meters — black shaft depth (well past fall.yThreshold = -10)

const HOLE_CENTERS = [
  { x: HOLE_CENTER, z: HOLE_CENTER },
  { x: -HOLE_CENTER, z: HOLE_CENTER },
  { x: HOLE_CENTER, z: -HOLE_CENTER },
  { x: -HOLE_CENTER, z: -HOLE_CENTER },
];

// * Chamfered hazard lips — physics trimesh slopes carts inward (holes) or outward (perimeter).
const CHAMFER_DEPTH = 0.55; // meters — vertical drop across each lip band
const HOLE_CHAMFER_W = 1.05; // meters — inward ramp width around each square void
const OUTER_CHAMFER_W = 1.25; // meters — outward ramp width at the arena perimeter
const FLOOR_BOTTOM_Y = FLOOR_TOP_Y - CHAMFER_DEPTH;

// * Perimeter walls set well back from the floor so the room reads as open. The ring
// * between the floor edge and the walls is the surrounding pit (see buildPit).
const WALL_HALF = 56; // meters — inner wall face distance from origin
const WALL_SPAN = 124; // meters — wall length (overlaps corners)
const PIT_FLOOR_Y = -26; // meters — visual bottom of the surrounding void
const WALL_HEIGHT = 17; // meters — wall top (above dropped ceiling)
const WALL_BOTTOM_Y = PIT_FLOOR_Y; // meters — wallpaper extends to void floor
const CEILING_Y = 14.5; // meters — dropped-ceiling height
const WALL_DECOR_INSET = 0.1; // meters — shelves/pillars sit inside the inner wall face

// * Pit: black void filling the gap between the floor edge and the far walls. Carts
// * rammed off the floor edge fall into it and respawn.

// * Kept for the level contract; consumed by scene extras / effects radii (those are
// * disabled for this level, but the value still feeds any startup-time placement).
const PIT_INNER_RADIUS = 66; // meters

// ===== Procedural textures =====

/**
 * Worn industrial-carpet texture: muddy yellow-beige base, fiber speckle, wear stains,
 * and faint carpet-tile seams.
 *
 * @returns {THREE.CanvasTexture}
 */
function buildCarpetTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#9c8f63";
  ctx.fillRect(0, 0, size, size);

  // Dense fiber speckle so the floor reads as carpet, not flat paint.
  for (let i = 0; i < 4200; i += 1) {
    const shade = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.015 + Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  // Broad wear / stain patches.
  for (let i = 0; i < 60; i += 1) {
    const r = 8 + Math.random() * 34;
    ctx.fillStyle = `rgba(45,38,24,${0.03 + Math.random() * 0.07})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Carpet-tile seams along the canvas border (one tile per repeat).
  ctx.strokeStyle = "rgba(40,34,22,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Classic Backrooms yellowed-wallpaper texture: mono-yellow base, vertical seam stripes,
 * and brown water-stain blotches.
 *
 * @returns {THREE.CanvasTexture}
 */
function buildWallpaperTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#bfa94e";
  ctx.fillRect(0, 0, size, size);

  // Subtle vertical wallpaper seams.
  ctx.strokeStyle = "rgba(120,100,40,0.25)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= size; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  // Faint horizontal patterned banding.
  ctx.strokeStyle = "rgba(150,130,70,0.12)";
  for (let y = 0; y <= size; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // Brown water stains.
  for (let i = 0; i < 26; i += 1) {
    const r = 6 + Math.random() * 26;
    const grad = ctx.createRadialGradient(
      Math.random() * size, Math.random() * size, 0,
      Math.random() * size, Math.random() * size, r,
    );
    grad.addColorStop(0, "rgba(70,50,20,0.16)");
    grad.addColorStop(1, "rgba(70,50,20,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Dropped-ceiling acoustic-tile texture: off-white tiles with a darker grout grid and
 * a light pinhole speckle.
 *
 * @returns {THREE.CanvasTexture}
 */
function buildCeilingTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#cdc6ad";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i += 1) {
    ctx.fillStyle = `rgba(60,55,40,${0.04 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  ctx.strokeStyle = "rgba(70,64,48,0.6)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ===== Floor geometry (square voids cut from a shared trimesh) =====

/**
 * Chebyshev (L∞) distance from a point to the axis-aligned square centered at (cx, cz).
 *
 * @param {number} x World X.
 * @param {number} z World Z.
 * @param {number} cx Square center X.
 * @param {number} cz Square center Z.
 * @returns {number}
 */
function distToSquareHole(x, z, cx, cz) {
  return Math.max(Math.abs(x - cx), Math.abs(z - cz));
}

/**
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {boolean} True when the point lies inside any open void (past the chamfer lip).
 */
function isInSquareHole(x, z) {
  for (const h of HOLE_CENTERS) {
    if (distToSquareHole(x, z, h.x, h.z) <= HOLE_HALF) return true;
  }
  return false;
}

/**
 * Distance from a point to the nearest arena edge along the square perimeter (L∞ metric).
 *
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {number}
 */
function distToArenaEdge(x, z) {
  return Math.min(ARENA_HALF - Math.abs(x), ARENA_HALF - Math.abs(z));
}

/**
 * Computes the physics/visual floor height at (x, z), including chamfered hazard lips.
 * Returns null inside an open void where no collider surface exists.
 *
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {number|null}
 */
function getFloorSurfaceY(x, z) {
  if (isInSquareHole(x, z)) return null;

  let y = FLOOR_TOP_Y;

  for (const h of HOLE_CENTERS) {
    const d = distToSquareHole(x, z, h.x, h.z);
    if (d < HOLE_HALF + HOLE_CHAMFER_W) {
      const t = (d - HOLE_HALF) / HOLE_CHAMFER_W;
      y = Math.min(y, FLOOR_BOTTOM_Y + t * (FLOOR_TOP_Y - FLOOR_BOTTOM_Y));
    }
  }

  const edgeDist = distToArenaEdge(x, z);
  if (edgeDist < OUTER_CHAMFER_W) {
    const t = Math.max(0, edgeDist) / OUTER_CHAMFER_W;
    y = Math.min(y, FLOOR_BOTTOM_Y + t * (FLOOR_TOP_Y - FLOOR_BOTTOM_Y));
  }

  return y;
}

/**
 * Returns 0–1 darkening for chamfer/hazard zones (0 = full carpet, 1 = void lip).
 *
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {number}
 */
function getChamferDarkenFactor(x, z) {
  let darken = 0;

  for (const h of HOLE_CENTERS) {
    const d = distToSquareHole(x, z, h.x, h.z);
    if (d <= HOLE_HALF) return 1;
    if (d < HOLE_HALF + HOLE_CHAMFER_W) {
      const t = 1 - (d - HOLE_HALF) / HOLE_CHAMFER_W;
      darken = Math.max(darken, t);
    }
  }

  const edgeDist = distToArenaEdge(x, z);
  if (edgeDist < OUTER_CHAMFER_W) {
    const t = 1 - Math.max(0, edgeDist) / OUTER_CHAMFER_W;
    darken = Math.max(darken, t);
  }

  return darken;
}

/**
 * Builds the square floor as one indexed trimesh shared by the visual mesh and the Rapier
 * collider. Square corner voids have inward-sloping chamfer lips; the perimeter has an
 * outward-sloping drop-off. Open void vertices are omitted so carts fall through
 * (drop below CONFIG.fall.yThreshold → respawn).
 *
 * @returns {THREE.BufferGeometry}
 */
function buildFloorGeometry() {
  const cells = FLOOR_GRID_CELLS;
  const verts = cells + 1;
  const step = FLOOR_STEP;

  const positions = new Float32Array(verts * verts * 3);
  const uvs = new Float32Array(verts * verts * 2);
  const colors = new Float32Array(verts * verts * 3);
  const inVoid = new Uint8Array(verts * verts);

  // Warm carpet tint lerped toward worn concrete at hazard lips.
  const baseR = 0.96;
  const baseG = 0.91;
  const baseB = 0.78;
  const lipR = 0.22;
  const lipG = 0.19;
  const lipB = 0.14;

  for (let j = 0; j <= cells; j += 1) {
    const z = -ARENA_HALF + j * step;
    for (let i = 0; i <= cells; i += 1) {
      const x = -ARENA_HALF + i * step;
      const idx = j * verts + i;
      const surfaceY = getFloorSurfaceY(x, z);
      inVoid[idx] = surfaceY === null ? 1 : 0;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = surfaceY ?? FLOOR_BOTTOM_Y;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = x / CARPET_TILE_M;
      uvs[idx * 2 + 1] = z / CARPET_TILE_M;
      const darken = getChamferDarkenFactor(x, z);
      colors[idx * 3] = baseR * (1 - darken) + lipR * darken;
      colors[idx * 3 + 1] = baseG * (1 - darken) + lipG * darken;
      colors[idx * 3 + 2] = baseB * (1 - darken) + lipB * darken;
    }
  }

  const indices = [];
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const a = j * verts + i;
      const b = j * verts + (i + 1);
      const c = (j + 1) * verts + i;
      const d = (j + 1) * verts + (i + 1);
      // * Drop any quad touching an open void so carts fall straight through.
      if (inVoid[a] || inVoid[b] || inVoid[c] || inVoid[d]) continue;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the dressing for one square void: a black shaft dropping into darkness. Sloped
 * hazard lips live on the shared carpet floor trimesh — no duplicate overlay geometry.
 *
 * @param {number} cx Void center X.
 * @param {number} cz Void center Z.
 * @param {THREE.Material} shaftMat Shared black shaft material.
 * @returns {{ group: THREE.Group, geometries: THREE.BufferGeometry[] }}
 */
function buildSquareVoid(cx, cz, shaftMat) {
  const group = new THREE.Group();
  const geometries = [];

  // Shaft slightly larger than the ragged opening so no side gap shows through.
  const shaftOuter = HOLE_SIZE + FLOOR_STEP * 2 + 0.6;
  const shaftGeo = new THREE.BoxGeometry(shaftOuter, HOLE_DEPTH, shaftOuter);
  geometries.push(shaftGeo);
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.set(cx, FLOOR_TOP_Y - HOLE_DEPTH / 2 + 0.05, cz);
  group.add(shaft);

  return { group, geometries };
}

// ===== Surrounding void pit (fills the floor → wall gap with darkness) =====

/**
 * Builds the black pit that surrounds the play floor: a deep dark floor plane, an inner
 * cliff dropping from the floor edge, and an outer skirt rising to the perimeter walls.
 * Reads as an intentional dangerous void rather than a broken seam. Entirely visual — the
 * absence of floor collider beyond ARENA_HALF is what makes carts fall.
 *
 * @returns {{ group: THREE.Group, geometries: THREE.BufferGeometry[], materials: THREE.Material[] }}
 */
function buildPit() {
  const group = new THREE.Group();
  const geometries = [];

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x070708, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide,
  });
  const materials = [darkMat];

  // Deep dark pit floor spanning the whole room footprint.
  const floorGeo = new THREE.PlaneGeometry(WALL_HALF * 2, WALL_HALF * 2);
  geometries.push(floorGeo);
  const pitFloor = new THREE.Mesh(floorGeo, darkMat);
  pitFloor.rotation.x = -Math.PI / 2;
  pitFloor.position.y = PIT_FLOOR_Y;
  group.add(pitFloor);

  const skirtThickness = 1.0;

  // Vertical inner cliff below the carpet chamfer lip + outer skirt at the perimeter wall.
  // Slopes are rendered by the floor trimesh; only the drop below the lip is duplicated here.
  const cliffTop = FLOOR_BOTTOM_Y - 0.08;
  const cliffHeight = cliffTop - PIT_FLOOR_Y;
  const cliffMidY = (cliffTop + PIT_FLOOR_Y) / 2;
  const cliffGeo = new THREE.BoxGeometry(1, cliffHeight, skirtThickness);
  geometries.push(cliffGeo);

  const addCliffRing = (half) => {
    const sideOff = skirtThickness / 2;
    const lenAlong = half * 2 + skirtThickness * 2;
    const edges = [
      { x: 0, z: half + sideOff, sx: lenAlong, rot: 0 },
      { x: 0, z: -(half + sideOff), sx: lenAlong, rot: 0 },
      { x: half + sideOff, z: 0, sx: lenAlong, rot: Math.PI / 2 },
      { x: -(half + sideOff), z: 0, sx: lenAlong, rot: Math.PI / 2 },
    ];
    for (const e of edges) {
      const m = new THREE.Mesh(cliffGeo, darkMat);
      m.scale.set(e.sx, 1, 1);
      m.position.set(e.x, cliffMidY, e.z);
      m.rotation.y = e.rot;
      group.add(m);
    }
  };

  addCliffRing(ARENA_HALF);

  return { group, geometries, materials };
}

// ===== Perimeter walls (drywall + baseboard + pillars + worn shelves) =====

/**
 * Per-wall coordinate frame. `along` runs the wall length, `out` points away from the room
 * center, `up` is world Y. Returns the world position and whether `along` maps to X.
 *
 * @param {number} side 0=North(+Z), 1=South(-Z), 2=East(+X), 3=West(-X)
 * @returns {{ toWorld: (a:number,u:number,o:number)=>[number,number,number], alongIsX: boolean }}
 */
function wallFrame(side) {
  switch (side) {
    case 0: return { toWorld: (a, u, o) => [a, u, WALL_HALF + o], alongIsX: true };
    case 1: return { toWorld: (a, u, o) => [-a, u, -WALL_HALF - o], alongIsX: true };
    case 2: return { toWorld: (a, u, o) => [WALL_HALF + o, u, -a], alongIsX: false };
    default: return { toWorld: (a, u, o) => [-WALL_HALF - o, u, a], alongIsX: false };
  }
}

// * Scratch objects reused by pushBox / pushFadeBox during wall geometry merges (avoids GC spikes).
const _pushM = new THREE.Matrix4();
const _pushV = new THREE.Vector3();
const _pushQ = new THREE.Quaternion();
const _pushS = new THREE.Vector3();

/**
 * Adds a unit box clone scaled + translated into world space to a geometry list for merging.
 */
function pushBox(list, sx, sy, sz, px, py, pz, unitBox) {
  _pushV.set(px, py, pz);
  _pushS.set(sx, sy, sz);
  _pushM.compose(_pushV, _pushQ.identity(), _pushS);
  list.push(unitBox.clone().applyMatrix4(_pushM));
}

/**
 * Returns 0–1 brightness for the void fade at a world Y (matches wallpaper smoothstep).
 *
 * @param {number} worldY
 * @returns {number}
 */
function getVoidFadeBrightness(worldY) {
  const vNorm = (worldY - WALL_BOTTOM_Y) / (WALL_HEIGHT - WALL_BOTTOM_Y);
  const t = Math.max(0, Math.min(1, vNorm));
  return t * t * (3 - 2 * t);
}

/**
 * Pushes a box with per-vertex colors that darken toward the pit floor (void fade).
 *
 * @param {THREE.BufferGeometry[]} list
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {THREE.BoxGeometry} unitBox
 * @param {[number, number, number]} baseRgb Linear RGB multipliers at full brightness (0–1).
 */
function pushFadeBox(list, sx, sy, sz, px, py, pz, unitBox, baseRgb) {
  _pushV.set(px, py, pz);
  _pushS.set(sx, sy, sz);
  _pushM.compose(_pushV, _pushQ.identity(), _pushS);
  const geo = unitBox.clone().applyMatrix4(_pushM);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const [br, bg, bb] = baseRgb;
  const dark = 0.03;

  for (let i = 0; i < pos.count; i += 1) {
    const bright = getVoidFadeBrightness(pos.getY(i));
    colors[i * 3] = dark + (br - dark) * bright;
    colors[i * 3 + 1] = dark + (bg - dark) * bright;
    colors[i * 3 + 2] = dark + (bb - dark) * bright;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  list.push(geo);
}

/**
 * Inner wallpaper face spanning from the void floor up to the wall top. UVs tile the
 * wallpaper; vertex colors fade from full brightness at the top to black at the pit bottom.
 *
 * @param {number} spanW Wall length in meters.
 * @param {number} bottomY World Y of the pit floor (wall bottom).
 * @param {number} topY World Y of the wall top.
 * @param {number} [vSegments] Vertical subdivisions for a smooth darkness gradient.
 * @returns {THREE.BufferGeometry}
 */
function buildWallpaperPlaneGeometry(spanW, bottomY, topY, vSegments = 24) {
  const height = topY - bottomY;
  const halfW = spanW / 2;
  const halfH = height / 2;
  const xSegments = 1;
  const tileM = 6; // meters — wallpaper repeat (matches buildWallpaperTexture scale)

  const vertCount = (xSegments + 1) * (vSegments + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const indices = [];

  let ptr = 0;
  for (let j = 0; j <= vSegments; j += 1) {
    const vNorm = j / vSegments;
    const localY = -halfH + vNorm * height;
    const bright = getVoidFadeBrightness(WALL_BOTTOM_Y + vNorm * height);
    const r = 0.025 + 0.975 * bright;
    const g = 0.02 + 0.92 * bright;
    const b = 0.015 + 0.75 * bright;

    for (let i = 0; i <= xSegments; i += 1) {
      const uNorm = i / xSegments;
      const localX = -halfW + uNorm * spanW;
      positions[ptr * 3] = localX;
      positions[ptr * 3 + 1] = localY;
      positions[ptr * 3 + 2] = 0;
      uvs[ptr * 2] = (localX + halfW) / tileM;
      uvs[ptr * 2 + 1] = (localY + halfH) / tileM;
      colors[ptr * 3] = r;
      colors[ptr * 3 + 1] = g;
      colors[ptr * 3 + 2] = b;
      ptr += 1;
    }
  }

  for (let j = 0; j < vSegments; j += 1) {
    for (let i = 0; i < xSegments; i += 1) {
      const a = j * (xSegments + 1) + i;
      const b = a + 1;
      const c = a + (xSegments + 1);
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a chaotic, climbable pile of office furniture in the center of the Backrooms
 * arena: desks, chairs, couches, filing cabinets, monitors, and cardboard boxes. All
 * visual geometry is merged into one mesh per material for performance.
 *
 * Physics is a SINGLE convex-hull mound rather than one collider per piece. A convex shape
 * has no concave pockets, so carts ram it and slide off instead of wedging permanently into
 * the V-shaped gaps that per-piece angled cuboids created.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @returns {{
 *   group: THREE.Group,
 *   bodies: object[],
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 * }}
 */
function buildCenterFurniturePile(scene, world) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  // * Scale all visual pile geometry by 0.85 — tighter footprint, less snag-prone.
  const pileVisualGroup = new THREE.Group();
  pileVisualGroup.scale.setScalar(0.85);
  group.add(pileVisualGroup);

  const parts = { wood: [], fabric: [], metal: [], cardboard: [], dark: [] };

  // Emit one box into a material bucket, placed in a piece's local frame then transformed
  // into world space by that piece's matrix.
  const addBox = (bucket, parent, sx, sy, sz, px, py, pz) => {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz),
    );
    bucket.push(unitBox.clone().applyMatrix4(parent.clone().multiply(local)));
  };

  // Piece-local → world transform (position + yaw + tilt + roll).
  const piece = (px, py, pz, yaw = 0, tilt = 0, roll = 0) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, roll, "YXZ")),
      new THREE.Vector3(1, 1, 1),
    );

  // ----- Recognizable furniture builders (local origin at the floor footprint) -----
  const desk = (m, w = 1.8, d = 1.0) => {
    const legH = 0.72;
    const topT = 0.08;
    addBox(parts.wood, m, w, topT, d, 0, legH + topT / 2, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addBox(parts.metal, m, 0.08, legH, 0.08, sx * (w / 2 - 0.1), legH / 2, sz * (d / 2 - 0.1));
      }
    }
  };

  const chair = (m) => {
    const seatY = 0.5;
    const sw = 0.56;
    const sd = 0.56;
    addBox(parts.fabric, m, sw, 0.1, sd, 0, seatY, 0);
    addBox(parts.fabric, m, sw, 0.62, 0.09, 0, seatY + 0.36, -sd / 2 + 0.05);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addBox(parts.metal, m, 0.06, seatY, 0.06, sx * (sw / 2 - 0.06), seatY / 2, sz * (sd / 2 - 0.06));
      }
    }
  };

  const couch = (m, len = 2.6) => {
    const baseH = 0.45;
    const depth = 1.0;
    addBox(parts.fabric, m, len, baseH, depth, 0, baseH / 2, 0);
    addBox(parts.fabric, m, len - 0.5, 0.22, depth - 0.2, 0, baseH + 0.11, 0.06);
    addBox(parts.fabric, m, len, 0.62, 0.26, 0, baseH + 0.3, -depth / 2 + 0.13);
    for (const sx of [-1, 1]) {
      addBox(parts.fabric, m, 0.26, 0.6, depth, sx * (len / 2 - 0.13), 0.34, 0);
    }
  };

  const cabinet = (m, h = 1.5) => {
    const w = 0.9;
    const d = 1.1;
    addBox(parts.metal, m, w, h, d, 0, h / 2, 0);
    const n = Math.max(2, Math.round(h / 0.55));
    const dh = (h - 0.08) / n;
    for (let i = 0; i < n; i += 1) {
      const cy = 0.04 + dh / 2 + i * dh;
      addBox(parts.dark, m, w - 0.12, dh - 0.06, 0.04, 0, cy, d / 2);
      addBox(parts.dark, m, 0.26, 0.05, 0.07, 0, cy, d / 2 + 0.04);
    }
  };

  const monitor = (m) => {
    addBox(parts.dark, m, 0.92, 0.56, 0.08, 0, 0.62, 0);
    addBox(parts.dark, m, 0.2, 0.3, 0.2, 0, 0.15, 0);
  };

  const crate = (m, s = 0.9) => {
    addBox(parts.cardboard, m, s, s, s, 0, s / 2, 0);
  };

  // ----- Messy stacked layout (chaotic, dense, ~6.5m tall) -----
  // Pieces overlap and ride on the ones below so the pile reads as solid junk, not floats.

  // Base ring (y≈0) — packed full around the footprint.
  couch(piece(-1.9, 0.0, 1.4, 0.5, 0.02, 0.0));
  couch(piece(1.7, 0.0, 1.9, 2.5, 0.0, 0.05), 2.4);
  desk(piece(1.8, 0.0, -1.2, -0.5), 2.0, 1.1);
  desk(piece(-1.6, 0.0, -1.8, 0.7), 1.8, 1.0);
  desk(piece(-2.6, 0.0, 0.3, 1.5), 1.7, 1.0);
  cabinet(piece(2.7, 0.0, 1.0, 0.4), 1.6);
  cabinet(piece(0.4, 0.0, 2.7, -0.3), 1.4);
  cabinet(piece(2.5, 0.0, -2.0, 0.9), 1.5);
  cabinet(piece(-2.9, 0.0, -1.4, 2.2), 1.3);
  crate(piece(3.2, 0.0, -0.4, 0.3), 1.0);
  crate(piece(0.1, 0.0, -2.6, -0.2), 0.95);
  chair(piece(-0.4, 0.0, 0.2, 0.5));
  chair(piece(1.0, 0.0, 0.0, -0.6));

  // Mid layer (~0.8–1.8m) — resting on base tops, filling the gaps.
  couch(piece(0.6, 1.15, -0.5, 2.2, 0.14, 0.08), 2.4);
  desk(piece(-1.4, 1.0, 0.7, 0.2, -0.16, 0.1), 1.9, 1.0);
  desk(piece(1.5, 1.05, 1.3, 1.1, 0.1, -0.08), 1.7, 0.95);
  cabinet(piece(1.7, 1.1, 1.6, 1.1, 0.16, 0.0), 1.5);
  cabinet(piece(-1.9, 1.0, -1.1, 0.5, 0.12, 0.0), 1.2);
  chair(piece(-2.2, 0.85, -0.6, 0.6, 0.1, 0.2));
  chair(piece(2.3, 0.9, 0.2, 1.6, 0.08, 0.15));
  crate(piece(2.0, 1.2, -1.3, 0.5), 0.85);
  crate(piece(-0.4, 1.2, 2.0, -0.4), 0.95);
  crate(piece(0.7, 1.3, 1.2, 0.2), 0.8);
  crate(piece(-1.0, 1.25, -2.0, 0.7), 0.85);

  // Upper layer (~1.9–3.4m).
  couch(piece(-0.7, 2.5, -0.5, 1.0, 0.18, 0.1), 2.0);
  desk(piece(0.4, 2.3, 0.8, 1.4, 0.22, -0.16), 1.7, 0.95);
  cabinet(piece(-1.3, 2.4, 1.0, 0.8, 0.35, 0.1), 1.2);
  cabinet(piece(1.4, 2.5, -0.7, 2.0, 0.28, 0.0), 1.1);
  chair(piece(1.2, 2.7, -0.5, 2.0, 0.28, 0.22));
  chair(piece(-1.0, 2.9, -0.2, -0.5, -0.18, 0.28));
  chair(piece(0.9, 2.6, 1.2, 0.9, 0.2, -0.2));
  crate(piece(-0.2, 3.0, -1.1, 0.2), 0.8);
  crate(piece(0.0, 2.7, 0.0, 0.4), 0.9);
  crate(piece(-1.4, 2.7, -0.9, -0.3), 0.75);

  // Top layer (~3.5–5.0m).
  desk(piece(-0.2, 3.7, 0.2, 0.6, 0.24, 0.14), 1.6, 0.9);
  chair(piece(0.4, 4.1, 0.1, 0.7, 0.36, 0.28));
  chair(piece(-0.7, 4.0, -0.5, 1.8, -0.24, 0.3));
  cabinet(piece(0.7, 3.8, -0.6, 1.3, 0.4, 0.0), 1.0);
  crate(piece(-0.6, 4.3, -0.2, 0.5), 0.75);
  crate(piece(0.8, 4.4, -0.1, -0.3), 0.7);
  crate(piece(0.1, 4.0, 0.8, 0.2), 0.8);

  // Peak (~5.0–6.5m).
  monitor(piece(0.1, 5.0, 0.2, 0.4, 0.18, 0.0));
  chair(piece(-0.3, 5.3, 0.1, 1.2, 0.45, 0.38));
  crate(piece(0.4, 5.4, -0.2, 0.6), 0.7);
  crate(piece(-0.2, 5.8, 0.0, -0.4), 0.6);

  // Crate-fill pass — plugs the remaining interior voids so no gaps show between pieces.
  // Radius tapers with height to stay inside the mound; deterministic so the pile is stable.
  const fillCrates = [
    [1.4, 0.4, 0.6, 0.3, 0.7], [-1.0, 0.5, 1.1, -0.5, 0.75], [0.2, 0.6, -1.5, 0.8, 0.65],
    [-2.0, 0.4, 1.6, 0.2, 0.7], [2.2, 0.5, 0.9, -0.4, 0.7], [-0.6, 1.7, 0.4, 0.5, 0.7],
    [1.1, 1.8, 0.3, -0.3, 0.65], [-1.5, 1.9, 1.0, 0.6, 0.6], [0.5, 2.0, -1.0, 0.2, 0.7],
    [-0.2, 3.3, 0.5, 0.4, 0.6], [0.9, 3.4, 0.4, -0.5, 0.6], [-0.9, 3.5, 0.3, 0.7, 0.55],
    [0.3, 4.6, 0.3, 0.3, 0.55], [-0.4, 4.8, -0.3, -0.4, 0.5],
  ];
  for (const [fx, fy, fz, fyaw, fs] of fillCrates) {
    crate(piece(fx, fy, fz, fyaw, fyaw * 0.3, 0), fs);
  }

  unitBox.dispose();

  // ----- Physics: stacked convex-hull layers (no concave traps, tighter than one big dome) -----
  const hullRings = [
    { y: 0.05, r: 3.315, n: 10 },
    { y: 1.53, r: 2.89, n: 10 },
    { y: 2.805, r: 2.21, n: 8 },
    { y: 3.995, r: 1.36, n: 8 },
    { y: 5.27, r: 0.595, n: 6 },
  ];

  const bodies = [];
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  const hullFriction = 0.45;
  const hullRestitution = 0.45;

  for (let ri = 0; ri < hullRings.length - 1; ri += 1) {
    const base = hullRings[ri];
    const top = hullRings[ri + 1];
    const layerPts = [];
    const basePhase = ri * 0.35;
    const topPhase = (ri + 1) * 0.35;
    for (let j = 0; j < base.n; j += 1) {
      const a = basePhase + (j / base.n) * Math.PI * 2;
      layerPts.push(Math.cos(a) * base.r, base.y, Math.sin(a) * base.r);
    }
    for (let j = 0; j < top.n; j += 1) {
      const a = topPhase + (j / top.n) * Math.PI * 2;
      layerPts.push(Math.cos(a) * top.r, top.y, Math.sin(a) * top.r);
    }
    const hullDesc = RAPIER.ColliderDesc.convexHull(new Float32Array(layerPts));
    if (hullDesc) {
      world.createCollider(
        hullDesc.setFriction(hullFriction).setRestitution(hullRestitution),
        body,
      );
    }
  }

  // * Apex cap — small hull so carts cannot clip through the pile peak.
  const apexRing = hullRings[hullRings.length - 1];
  const apexPts = [0, 5.695, 0];
  const apexPhase = (hullRings.length - 1) * 0.35;
  for (let j = 0; j < apexRing.n; j += 1) {
    const a = apexPhase + (j / apexRing.n) * Math.PI * 2;
    apexPts.push(Math.cos(a) * apexRing.r, apexRing.y, Math.sin(a) * apexRing.r);
  }
  const apexDesc = RAPIER.ColliderDesc.convexHull(new Float32Array(apexPts));
  if (apexDesc) {
    world.createCollider(
      apexDesc.setFriction(hullFriction).setRestitution(hullRestitution),
      body,
    );
  }
  // * Ball cap at the very peak — ensures carts landing on the top of the pile
  // * hit a smooth surface instead of slipping into a convex-hull gap at [0, 5.695, 0].
  world.createCollider(
    RAPIER.ColliderDesc.ball(0.51)
      .setTranslation(0, 5.695, 0)
      .setFriction(hullFriction)
      .setRestitution(hullRestitution),
    body,
  );
  bodies.push(body);

  // ----- Materials + per-material merge -----
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6f5434, roughness: 0.82, metalness: 0.02,
  });
  const fabricMat = new THREE.MeshStandardMaterial({
    color: 0x5f5247, roughness: 0.96, metalness: 0.0,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x777870, roughness: 0.68, metalness: 0.45,
  });
  const cardboardMat = new THREE.MeshStandardMaterial({
    color: 0xa88455, roughness: 0.9, metalness: 0.0,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x292724, roughness: 0.88, metalness: 0.08,
  });

  const ownedGeometries = [];
  const ownedMaterials = [];
  const mergeAdd = (bucket, mat) => {
    if (bucket.length === 0) return;
    const merged = BufferGeometryUtils.mergeGeometries(bucket, false);
    bucket.forEach((g) => g.dispose());
    ownedGeometries.push(merged);
    ownedMaterials.push(mat);
    pileVisualGroup.add(new THREE.Mesh(merged, mat));
  };

  mergeAdd(parts.wood, woodMat);
  mergeAdd(parts.fabric, fabricMat);
  mergeAdd(parts.metal, metalMat);
  mergeAdd(parts.cardboard, cardboardMat);
  mergeAdd(parts.dark, darkMat);

  const pileShadows = createStaticContactShadowCluster([
    { x: 0, z: 0.1, radiusX: 2.975, radiusZ: 2.635 },
    { x: -0.68, z: -0.425, radiusX: 2.21, radiusZ: 1.955, opacity: 0.36 },
  ]);
  pileVisualGroup.add(pileShadows.group);

  scene.add(group);
  return {
    group,
    bodies,
    ownedGeometries: [...ownedGeometries, ...pileShadows.ownedGeometries],
    ownedMaterials: [...ownedMaterials, ...pileShadows.ownedMaterials],
  };
}

// ===== Flickering spotlight over center furniture pile =====

/**
 * Hangs a single warm spotlight above the furniture pile with slow, irregular flicker —
 * occasional dips and rare blinks, smoothed so it reads as a dying fluorescent, not a glitch.
 *
 * @param {THREE.Scene} scene
 * @returns {{
 *   spot: THREE.SpotLight,
 *   fixture: THREE.Mesh,
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 *   update: (timeMs: number) => void,
 * }}
 */
function buildFurniturePileSpotlight(scene) {
  const pileTargetX = 0;
  const pileTargetZ = 0;
  const pileTargetY = 4.8;
  const fixtureY = CEILING_Y - 0.28;
  const baseIntensity = 30;

  const spot = new THREE.SpotLight(
    0xfff0cf,
    baseIntensity,
    16,
    Math.PI / 6.2,
    0.68,
    2.4,
  );
  spot.position.set(pileTargetX, fixtureY - 0.12, pileTargetZ);
  spot.target.position.set(pileTargetX, pileTargetY, pileTargetZ);

  const fixtureGeo = new THREE.BoxGeometry(1.35, 0.09, 0.55);
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e0,
    emissive: 0xfff2d6,
    emissiveIntensity: 0.85,
    roughness: 0.5,
    metalness: 0.0,
  });
  const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
  fixture.position.set(pileTargetX, fixtureY, pileTargetZ);

  scene.add(spot.target);
  scene.add(spot);
  scene.add(fixture);

  let lastTimeMs = 0;
  let currentIntensity = baseIntensity;
  let goalIntensity = baseIntensity;
  /** @type {"idle" | "dipping" | "blink" | "recovering"} */
  let eventPhase = "idle";
  let phaseUntil = 0;
  let nextEventAt = 2500 + Math.random() * 4000;

  function scheduleIdleGap(timeMs) {
    eventPhase = "idle";
    nextEventAt = timeMs + 5000 + Math.random() * 9000;
  }

  function update(timeMs) {
    const dt = lastTimeMs ? Math.min((timeMs - lastTimeMs) * 0.001, 0.05) : 0.016;
    lastTimeMs = timeMs;

    if (timeMs >= phaseUntil) {
      if (eventPhase === "idle" && timeMs >= nextEventAt) {
        const roll = Math.random();
        if (roll < 0.42) {
          eventPhase = "dipping";
          goalIntensity = baseIntensity * (0.52 + Math.random() * 0.22);
          phaseUntil = timeMs + 280 + Math.random() * 520;
        } else if (roll < 0.52) {
          eventPhase = "blink";
          goalIntensity = baseIntensity * 0.06;
          phaseUntil = timeMs + 110 + Math.random() * 90;
        } else {
          scheduleIdleGap(timeMs);
        }
      } else if (eventPhase === "dipping" || eventPhase === "blink") {
        eventPhase = "recovering";
        goalIntensity = baseIntensity;
        phaseUntil = timeMs + 320 + Math.random() * 480;
      } else if (eventPhase === "recovering") {
        scheduleIdleGap(timeMs);
      }
    }

    const smooth = 1 - Math.exp(-3.2 * dt);
    currentIntensity += (goalIntensity - currentIntensity) * smooth;
    spot.intensity = currentIntensity;
    fixtureMat.emissiveIntensity = 0.1 + (currentIntensity / baseIntensity) * 0.78;
  }

  return {
    spot,
    fixture,
    ownedGeometries: [fixtureGeo],
    ownedMaterials: [fixtureMat],
    update,
  };
}

/**
 * Builds the four perimeter walls: yellowed drywall, dark baseboards, concrete support
 * pillars, and a few aged store-shelf bays (worn metal + faded boxes) mixed in. Visual
 * geometry is merged per-material; thin tall cuboid colliders back the inner face.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {THREE.Texture} wallpaperTex
 * @returns {{
 *   group: THREE.Group,
 *   wallBodies: object[],
 *   wallColliderHandles: number[],
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 * }}
 */
function buildWalls(scene, world, wallpaperTex) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const baseboardParts = [];
  const pillarParts = [];
  const shelfMetalParts = [];
  const shelfBoxRedParts = [];
  const shelfBoxBlueParts = [];
  const shelfBoxBeigeParts = [];

  const group = new THREE.Group();
  const ownedGeometries = [];
  const wallBodies = [];
  const wallColliderHandles = [];

  // Drywall faces use the wallpaper texture directly (not merged, so UVs tile cleanly).
  const drywallMat = new THREE.MeshStandardMaterial({
    map: wallpaperTex, color: 0xffffff, roughness: 0.96, metalness: 0.0,
    vertexColors: true, side: THREE.DoubleSide,
  });
  const wallCenterY = (WALL_HEIGHT + WALL_BOTTOM_Y) / 2;
  const wallFullHeight = WALL_HEIGHT - WALL_BOTTOM_Y;
  const drywallGeo = buildWallpaperPlaneGeometry(WALL_SPAN, WALL_BOTTOM_Y, WALL_HEIGHT);
  ownedGeometries.push(drywallGeo);

  const pillarBaseRgb = /** @type {[number, number, number]} */ ([0.56, 0.54, 0.48]);
  const shelfMetalBaseRgb = /** @type {[number, number, number]} */ ([0.42, 0.4, 0.35]);

  // Sides that carry aged store shelving (mixed with plain drywall walls).
  const SHELVED_SIDES = new Set([0, 2]);
  const SHELF_LEVELS = 5;
  const SHELF_DEPTH = 2.0;
  const boardThickness = 0.12;
  const boxH = 0.9;
  const levelGap = (WALL_HEIGHT * 0.62 - 1.0) / SHELF_LEVELS;
  const SHELF_BOX_SPACING = 1.7;

  for (let side = 0; side < 4; side += 1) {
    const { toWorld, alongIsX } = wallFrame(side);
    const wDim = (along, depth) => (alongIsX ? [along, depth] : [depth, along]);

    // Drywall face (textured plane on the inner side, facing the room).
    {
      const wall = new THREE.Mesh(drywallGeo, drywallMat);
      const [px, , pz] = toWorld(0, wallCenterY, -0.04);
      wall.position.set(px, wallCenterY, pz);
      // Plane normal must face the room center (inward).
      if (side === 0) wall.rotation.y = Math.PI;
      else if (side === 1) wall.rotation.y = 0;
      else if (side === 2) wall.rotation.y = -Math.PI / 2;
      else wall.rotation.y = Math.PI / 2;
      group.add(wall);
    }

    // Dark baseboard strip along the floor (inside the wall plane).
    {
      const [sx, sz] = wDim(WALL_SPAN, 0.4);
      const [px, py, pz] = toWorld(0, 0.4, -(0.4 / 2 + WALL_DECOR_INSET));
      pushBox(baseboardParts, sx, 0.8, sz, px, py, pz, unitBox);
    }

    // Concrete support pillars — full wall height, fading into the void at the pit floor.
    for (let a = -WALL_SPAN / 2 + 8; a <= WALL_SPAN / 2 - 8; a += 16) {
      const [sx, sz] = wDim(1.3, 1.3);
      const [px, py, pz] = toWorld(a, wallCenterY, -(1.3 / 2 + WALL_DECOR_INSET));
      pushFadeBox(pillarParts, sx, wallFullHeight, sz, px, py, pz, unitBox, pillarBaseRgb);
    }

    // Aged store-shelf bays on selected sides only.
    if (SHELVED_SIDES.has(side)) {
      const shelfCenterOut = -(SHELF_DEPTH / 2 + WALL_DECOR_INSET);
      // Vertical uprights — full height, void fade at bottom.
      for (let a = -WALL_SPAN / 2 + 6; a <= WALL_SPAN / 2 - 6; a += SHELF_BOX_SPACING * 3) {
        const [sx, sz] = wDim(0.16, SHELF_DEPTH);
        const [px, py, pz] = toWorld(a, wallCenterY, shelfCenterOut);
        pushFadeBox(shelfMetalParts, sx, wallFullHeight, sz, px, py, pz, unitBox, shelfMetalBaseRgb);
      }

      // Horizontal boards + faded product boxes per level.
      for (let lvl = 0; lvl < SHELF_LEVELS; lvl += 1) {
        const boardY = 1.0 + lvl * levelGap;
        const [bsx, bsz] = wDim(WALL_SPAN - 10, SHELF_DEPTH);
        const [bpx, bpy, bpz] = toWorld(0, boardY, shelfCenterOut);
        pushFadeBox(shelfMetalParts, bsx, boardThickness, bsz, bpx, bpy, bpz, unitBox, shelfMetalBaseRgb);

        const boxY = boardY + boardThickness / 2 + boxH / 2;
        for (let a = -WALL_SPAN / 2 + 7; a <= WALL_SPAN / 2 - 7; a += SHELF_BOX_SPACING) {
          // Leave gaps so shelves read as half-empty / abandoned.
          // Deterministic hash so all clients render the same layout.
          if (((lvl * 7 + Math.round(a) * 13 + side * 41) % 10) < 3) continue;
          const [sx, sz] = wDim(1.1, 0.95);
          const [px, py, pz] = toWorld(a, boxY, shelfCenterOut + 0.15);
          const pick = (lvl + Math.round(a)) % 3;
          const list = pick === 0
            ? shelfBoxRedParts
            : pick === 1 ? shelfBoxBlueParts : shelfBoxBeigeParts;
          pushBox(list, sx, boxH, sz, px, py, pz, unitBox);
        }
      }
    }

    // Physics wall: thin tall cuboid just inside the inner face (visual backstop; carts
    // fall into the surrounding pit before they reach it). Must span the full visual
    // height (pit floor → wall top) — the old WALL_HEIGHT/2 center only covered y∈[0,17].
    {
      const wallHalfDepth = 0.75;
      const [hx, hz] = wDim(WALL_SPAN / 2, wallHalfDepth);
      const [px, py, pz] = toWorld(0, wallCenterY, -(wallHalfDepth + WALL_DECOR_INSET));
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz),
      );
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, wallFullHeight / 2, hz)
          .setFriction(0.4)
          .setRestitution(0.2),
        body,
      );
      wallBodies.push(body);
      wallColliderHandles.push(collider.handle);
    }
  }

  // * Corner filler cubes seal the L-joint gaps where thin north/south/east/west slabs meet.
  const cornerHalf = 1.35;
  const cornerInset = WALL_HALF - (0.75 + WALL_DECOR_INSET) - cornerHalf;
  const cornerPairs = [
    [cornerInset, cornerInset],
    [-cornerInset, cornerInset],
    [cornerInset, -cornerInset],
    [-cornerInset, -cornerInset],
  ];
  for (const [cx, cz] of cornerPairs) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, wallCenterY, cz),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(cornerHalf, wallFullHeight / 2, cornerHalf)
        .setFriction(0.4)
        .setRestitution(0.2),
      body,
    );
    wallBodies.push(body);
    wallColliderHandles.push(collider.handle);
  }

  unitBox.dispose();

  const baseboardMat = new THREE.MeshStandardMaterial({
    color: 0x2c2820, roughness: 0.85, metalness: 0.05,
  });
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0.0, vertexColors: true,
  });
  const shelfMetalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.78, metalness: 0.4, vertexColors: true,
  });
  const shelfRedMat = new THREE.MeshStandardMaterial({
    color: 0x8a4f44, roughness: 0.85, metalness: 0.05,
  });
  const shelfBlueMat = new THREE.MeshStandardMaterial({
    color: 0x556272, roughness: 0.85, metalness: 0.05,
  });
  const shelfBeigeMat = new THREE.MeshStandardMaterial({
    color: 0xa89f80, roughness: 0.88, metalness: 0.03,
  });

  const ownedMaterials = [
    drywallMat, baseboardMat, pillarMat,
    shelfMetalMat, shelfRedMat, shelfBlueMat, shelfBeigeMat,
  ];

  const mergeAdd = (parts, mat) => {
    if (parts.length === 0) return;
    const merged = BufferGeometryUtils.mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(merged, mat));
    ownedGeometries.push(merged);
  };

  mergeAdd(baseboardParts, baseboardMat);
  mergeAdd(pillarParts, pillarMat);
  mergeAdd(shelfMetalParts, shelfMetalMat);
  mergeAdd(shelfBoxRedParts, shelfRedMat);
  mergeAdd(shelfBoxBlueParts, shelfBlueMat);
  mergeAdd(shelfBoxBeigeParts, shelfBeigeMat);

  scene.add(group);
  return { group, wallBodies, wallColliderHandles, ownedGeometries, ownedMaterials };
}

// ===== Dropped ceiling + fluorescent panels =====

/**
 * Builds the dropped acoustic-tile ceiling and an overhead grid of recessed fluorescent
 * fixtures. A deterministic pattern leaves some panels dead (dark) and some dimmed
 * ("failing"). Lit panels use emissive + bloom for fixture glow and downward SpotLights
 * (aimed at the floor) so active fluorescents actually wash the arena below.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {THREE.Texture} ceilingTex
 * @returns {{
 *   group: THREE.Group,
 *   body: object,
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 * }}
 */
function buildCeiling(scene, world, ceilingTex) {
  const group = new THREE.Group();
  const ownedGeometries = [];
  const ownedMaterials = [];

  // Ceiling plane (covers the whole room, flush to the perimeter walls).
  const ceilSpan = WALL_HALF * 2;
  const ceilGeo = new THREE.PlaneGeometry(ceilSpan, ceilSpan);
  ceilingTex.repeat.set(ceilSpan / 2, ceilSpan / 2); // ~2m acoustic tiles
  const ceilMat = new THREE.MeshStandardMaterial({
    map: ceilingTex, color: 0xb8b29a, roughness: 0.95, metalness: 0.0,
    side: THREE.FrontSide,
  });
  ownedGeometries.push(ceilGeo);
  ownedMaterials.push(ceilMat);
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = CEILING_Y;
  group.add(ceiling);

  // Fluorescent fixtures hang visibly below the acoustic ceiling — thin frame rails plus
  // a box panel (not a rotated plane) so lights read from below without z-fighting the tile.
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x3a382f, roughness: 0.7, metalness: 0.3,
  });
  const litMat = new THREE.MeshStandardMaterial({
    color: 0xfff6e0, emissive: 0xfff2d6, emissiveIntensity: 1.42,
    roughness: 0.5, metalness: 0.0,
  });
  const dimMat = new THREE.MeshStandardMaterial({
    color: 0xb7ad8e, emissive: 0xb7a87a, emissiveIntensity: 0.41,
    roughness: 0.6, metalness: 0.0,
  });
  const deadMat = new THREE.MeshStandardMaterial({
    color: 0x5d584a, emissive: 0x000000, emissiveIntensity: 0.0,
    roughness: 0.8, metalness: 0.0,
  });
  ownedMaterials.push(frameMat, litMat, dimMat, deadMat);

  const frameRailGeo = new THREE.BoxGeometry(4.8, 0.07, 0.14);
  const panelGeo = new THREE.BoxGeometry(4.5, 0.1, 1.85);
  ownedGeometries.push(frameRailGeo, panelGeo);

  const grid = 5;
  const span = ARENA_HALF * 1.75;
  const fixtureY = CEILING_Y - 0.22;
  // * Tight cones aimed above the floor — wash mid-air, not hot carpet pools.
  const spotIntensity = 12;
  const spotDistance = 32;
  const spotAngle = Math.PI / 5.4;
  const spotPenumbra = 0.74;
  const spotDecay = 2.35;
  const spotTargetY = 4.2;
  for (let gx = 0; gx < grid; gx += 1) {
    for (let gz = 0; gz < grid; gz += 1) {
      const px = -span / 2 + (gx + 0.5) * (span / grid);
      const pz = -span / 2 + (gz + 0.5) * (span / grid);

      // Deterministic state: ~1 in 5 dead, ~1 in 4 dimmed, rest lit.
      const h = (gx * 7 + gz * 13) % 20;
      const state = h < 4 ? "dead" : h < 9 ? "dim" : "lit";
      const panelMat = state === "dead" ? deadMat : state === "dim" ? dimMat : litMat;

      const railOffsets = [
        { x: 0, z: 0.98, ry: 0 },
        { x: 0, z: -0.98, ry: 0 },
        { x: 2.4, z: 0, ry: Math.PI / 2 },
        { x: -2.4, z: 0, ry: Math.PI / 2 },
      ];
      for (const r of railOffsets) {
        const rail = new THREE.Mesh(frameRailGeo, frameMat);
        rail.position.set(px + r.x, fixtureY + 0.04, pz + r.z);
        rail.rotation.y = r.ry;
        group.add(rail);
      }

      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(px, fixtureY - 0.06, pz);
      group.add(panel);

      if (state === "lit") {
        const spot = new THREE.SpotLight(
          0xfff0cf,
          spotIntensity,
          spotDistance,
          spotAngle,
          spotPenumbra,
          spotDecay,
        );
        spot.position.set(px, fixtureY - 0.14, pz);
        spot.target.position.set(px, spotTargetY, pz);
        group.add(spot.target);
        group.add(spot);
      }
    }
  }

  // * Thin overhead slab — carts that hop high enough hit the acoustic tiles and bounce back.
  const ceilHalf = ceilSpan / 2;
  const ceilColliderHalfY = 0.25;
  const ceilingBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, CEILING_Y + ceilColliderHalfY, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(ceilHalf, ceilColliderHalfY, ceilHalf)
      .setFriction(0.35)
      .setRestitution(0.42),
    ceilingBody,
  );

  scene.add(group);
  return { group, body: ceilingBody, ownedGeometries, ownedMaterials };
}

// ===== Liminal / office spawn booths (replace neon DJ booths) =====

/**
 * Builds four drab office-staging spawn platforms at the same positions, sizes, and deck
 * height as the standard DJ booths, so carts spawn on them identically. Re-skinned with
 * grey/beige slabs, cubicle dividers, dull metal rails, and a worn cardboard-box prop —
 * no neon. Platform colliders are registered and their handles pushed onto
 * `boothColliderHandles`.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config Full game CONFIG.
 * @param {number[]} boothColliderHandles Out param — platform collider handles.
 * @returns {{
 *   group: THREE.Group,
 *   bodies: object[],
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 * }}
 */
function buildBackroomsBooths(scene, world, config, boothColliderHandles) {
  const B = config.booth;
  const arenaR = config.record.radius;
  const boothCenterDist = arenaR + B.gapDistance + B.rampLength + B.platformDepth / 2;
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  const group = new THREE.Group();
  const bodies = [];

  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x7c766a, roughness: 0.9, metalness: 0.05,
  });
  const railMat = createPhysicalMaterial({
    color: 0x6c6a62, roughness: 0.45, metalness: 0.7,
  });
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0xa68a5c, roughness: 0.9, metalness: 0.0,
  });

  const platGeo = new THREE.BoxGeometry(B.platformWidth, B.platformThickness, B.platformDepth);
  // * Width extended by railThickness so the box end caps overlap the cylindrical side posts,
  // * closing the visible corner gap where the low back rail meets the side rails.
  const lowRailGeo = new THREE.BoxGeometry(B.platformWidth + B.railThickness, 0.55, 0.14);
  const railGeo = new THREE.CylinderGeometry(B.railThickness / 2, B.railThickness / 2, 1, 8);
  const cardboardGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);

  const ownedGeometries = [platGeo, lowRailGeo, railGeo, cardboardGeo];
  const ownedMaterials = [slabMat, railMat, boxMat];

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

    // Platform slab.
    const slab = new THREE.Mesh(platGeo, slabMat);
    slab.position.set(0, topY, 0);
    boothGroup.add(slab);

    // Platform collider (world space, matches buildBooths exactly).
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

    // Low back rail (local +Z = away from arena) — keeps a rear barrier without blocking the cart.
    const backRail = new THREE.Mesh(lowRailGeo, railMat);
    backRail.position.set(0, deckTopY + 0.275, pd - 0.08);
    boothGroup.add(backRail);

    // Dull metal side rails (no neon).
    for (const sx of [-pw + 0.1, pw - 0.1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.scale.set(1, B.platformDepth - 0.4, 1);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(sx, deckTopY + B.railHeight, 0);
      boothGroup.add(rail);

      for (const rz of [-pd + 0.2, pd - 0.2]) {
        const post = new THREE.Mesh(railGeo, railMat);
        post.scale.set(1, B.railHeight, 1);
        post.position.set(sx, deckTopY + B.railHeight / 2, rz);
        boothGroup.add(post);
      }
    }

    // Worn cardboard-box prop in the back corner.
    const box = new THREE.Mesh(cardboardGeo, boxMat);
    box.position.set(pw - 1.0, deckTopY + 0.55, pd - 1.0);
    box.rotation.y = 0.3;
    boothGroup.add(box);

    group.add(boothGroup);
  }

  scene.add(group);
  return { group, bodies, ownedGeometries, ownedMaterials };
}

// ===== Level entry point =====

/**
 * Builds the reworked Backrooms Supermarket arena: worn-carpet square floor with four
 * square corner voids, a surrounding black pit, yellowed drywall + pillar + aged-shelf
 * walls set well back, a dropped fluorescent ceiling, and liminal office spawn booths.
 * Returns the standard level contract.
 *
 * @param {THREE.Scene} scene Root Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 * @param {object} config Full game CONFIG.
 * @returns {{
 *   recordMesh: THREE.Object3D,
 *   recordCollider: import("@dimforge/rapier3d").Collider,
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
export function initBackroomsSupermarket(scene, world, config) {
  // * Disable the Classic Record center-hole suck — this arena is solid at the origin.
  const prevCenterHole = config.record.centerHole;
  config.record.centerHole = { enabled: false };

  const prevFog = scene.fog;
  const backroomsFog = config.postFx.fog.backrooms;
  // * Thick, musty warm fog — oppressive haze that swallows far walls and pit depth.
  scene.fog = new THREE.FogExp2(backroomsFog.color, backroomsFog.density);

  // ===== Floor (visual + physics share one trimesh) =====
  const floorGeo = buildFloorGeometry();
  const carpetTex = buildCarpetTexture();
  carpetTex.repeat.set(1, 1); // UVs already scaled in geometry by CARPET_TILE_M
  // * Matte worn carpet — roughness 0.98, no sheen, minimal IBL (envMapIntensityScale 0.08)
  const carpetEnvScale = 0.08;
  const floorMat = createPhysicalMaterial({
    map: carpetTex,
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0.0,
    sheen: 0.0,
    envMapIntensity: getMaterialEnvMapIntensity() * carpetEnvScale,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  floorMat.userData.envMapIntensityScale = carpetEnvScale;
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = false;
  scene.add(floorMesh);

  // --- 9-CUBOID SLICE COLLIDER (Fixes Trimesh Bounce & Tunneling) ---
  const floorBody = world.createRigidBody(
    // Body placed at -0.3 so top surface of 0.6-thick colliders is exactly at Y=0
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.3, 0),
  );

  const T_HALF = 0.3; // 0.6m thickness
  const INNER = 12.70; // 18 - 4.25 - 1.05 (HOLE_CENTER - HOLE_HALF - CHAMFER)
  const OUTER = 23.30; // 18 + 4.25 + 1.05
  const EDGE = 32.75; // 34 - 1.25 (ARENA_HALF - OUTER_CHAMFER)

  const floorColliders = [];

  // Helper to create cuboids cleanly
  const addCuboid = (hx, hz, px, pz) => {
    // * FIX: Use roundCuboid to bevel the vertical edges.
    // * This prevents the cart's roundCuboid from catching on sharp 90-degree lips 
    // * when hopping over the 10.6m corner voids, which was dragging carts into the pit.
    const desc = RAPIER.ColliderDesc.roundCuboid(hx, T_HALF, hz, 0.15)
      .setTranslation(px, 0, pz) // Local Y is 0 because body is at -0.3
      .setFriction(FLOOR_FRICTION)
      .setRestitution(config.record.restitution);
    floorColliders.push(world.createCollider(desc, floorBody));
  };

  // 1. The 3 solid full-length strips (Left-Outer, Center, Right-Outer)
  addCuboid((EDGE - OUTER) / 2, EDGE, -(OUTER + EDGE) / 2, 0); // Left-Outer
  addCuboid((INNER * 2) / 2, EDGE, 0, 0);                      // Center
  addCuboid((EDGE - OUTER) / 2, EDGE, (OUTER + EDGE) / 2, 0);  // Right-Outer

  // 2. Left-Inner Strip (Framed around Top-Left and Bottom-Left holes)
  const stripHX = (OUTER - INNER) / 2;
  const stripPX = -((OUTER + INNER) / 2);
  addCuboid(stripHX, (EDGE - OUTER) / 2, stripPX, (OUTER + EDGE) / 2); // Top
  addCuboid(stripHX, (INNER * 2) / 2, stripPX, 0);                     // Middle
  addCuboid(stripHX, (EDGE - OUTER) / 2, stripPX, -((OUTER + EDGE) / 2)); // Bottom

  // 3. Right-Inner Strip (Framed around Top-Right and Bottom-Right holes)
  addCuboid(stripHX, (EDGE - OUTER) / 2, -stripPX, (OUTER + EDGE) / 2); // Top
  addCuboid(stripHX, (INNER * 2) / 2, -stripPX, 0);                     // Middle
  addCuboid(stripHX, (EDGE - OUTER) / 2, -stripPX, -((OUTER + EDGE) / 2)); // Bottom

  // Return handles array (main.js will normalize this for simulation.js)
  const recordCollider = floorColliders[0]; // Backward compat
  const recordColliderHandles = floorColliders.map(c => c.handle);

  // ===== Square voids (black shafts) =====
  const voidShaftMat = new THREE.MeshBasicMaterial({ color: 0x040406, side: THREE.BackSide });
  const voidGroup = new THREE.Group();
  const voidGeometries = [];
  for (const h of HOLE_CENTERS) {
    const v = buildSquareVoid(h.x, h.z, voidShaftMat);
    voidGroup.add(v.group);
    voidGeometries.push(...v.geometries);
  }
  scene.add(voidGroup);

  // ===== Surrounding void pit (fills floor → wall gap with darkness) =====
  const pit = buildPit();
  scene.add(pit.group);

  // ===== Walls (drywall + baseboards + pillars + aged shelves) =====
  const wallpaperTex = buildWallpaperTexture();
  wallpaperTex.repeat.set(1, 1);
  const walls = buildWalls(scene, world, wallpaperTex);

  // ===== Dropped ceiling + fluorescent panels =====
  const ceilingTex = buildCeilingTexture();
  const ceiling = buildCeiling(scene, world, ceilingTex);

  // ===== Ambient fill lighting (warm; compensates for thick fog while staying dim/liminal) =====
  const hemiLight = new THREE.HemisphereLight(0xd6c9a0, 0x33301f, 1.42);
  scene.add(hemiLight);
  const ambient = new THREE.AmbientLight(0x7a7358, 0.74);
  scene.add(ambient);

  // ===== Spawn booths (liminal office re-skin) =====
  const boothNeonMeshes = []; // * Intentionally empty — no rave neon to color-cycle.
  const boothColliderHandles = [];
  const booths = buildBackroomsBooths(scene, world, config, boothColliderHandles);

  // ===== Center furniture pile (Backrooms-only obstacle) =====
  const furniturePile = buildCenterFurniturePile(scene, world);
  const furnitureSpotlight = buildFurniturePileSpotlight(scene);
  let spotlightUpdateFn = furnitureSpotlight.update;

  // ===== Contract stand-ins =====
  // * spindleLight is required by main.js (it lerps its color each frame). Keep it as a
  // * dim warm ambient pulse by giving both cycle endpoints near-identical muted tones,
  // * so the "pink<->cyan" cycle is imperceptible and never reads as rave lighting.
  const spindleLight = new THREE.PointLight(0x3a3526, 6, 40, 2);
  const spindleLightColorPink = new THREE.Color(0x3a3526);
  const spindleLightColorCyan = new THREE.Color(0x2f2c20);
  spindleLight.position.set(0, 9, 0);
  scene.add(spindleLight);

  // * Dummy stand-in for the rotating Classic record — main.js spins recordMesh each
  // * frame; an empty detached group makes that harmless for this static floor.
  const recordMesh = new THREE.Group();

  // * pitWallColliderHandle classifies edge FX; reuse a perimeter wall handle.
  const pitWallColliderHandle = walls.wallColliderHandles[0] ?? -1;

  const sceneRoots = [
    floorMesh, voidGroup, pit.group, walls.group, ceiling.group, booths.group,
    furniturePile.group,
    furnitureSpotlight.spot, furnitureSpotlight.spot.target, furnitureSpotlight.fixture,
    hemiLight, ambient, spindleLight,
  ];

  const ownedGeometries = [
    floorGeo, ...voidGeometries, ...pit.geometries,
    ...walls.ownedGeometries, ...ceiling.ownedGeometries, ...booths.ownedGeometries,
    ...furniturePile.ownedGeometries, ...furnitureSpotlight.ownedGeometries,
  ];
  const ownedMaterials = [
    floorMat, voidShaftMat, ...pit.materials,
    ...walls.ownedMaterials, ...ceiling.ownedMaterials, ...booths.ownedMaterials,
    ...furniturePile.ownedMaterials, ...furnitureSpotlight.ownedMaterials,
  ];
  const ownedTextures = [carpetTex, wallpaperTex, ceilingTex];

  function disposeMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (typeof material.dispose === "function") material.dispose();
  }

  function dispose() {
    // * Neutralize the spotlight update closure so subsequent calls are no-ops,
    // * preventing any captured material references from being resurrected.
    spotlightUpdateFn = () => {};

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

    // Dedupe before disposing — booth/pit meshes share a small geometry/material pool.
    for (const geo of new Set(ownedGeometries)) geo.dispose();
    for (const mat of new Set(ownedMaterials)) disposeMaterial(mat);
    for (const tex of ownedTextures) tex.dispose();

    if (world && floorBody) world.removeRigidBody(floorBody);
    if (world && walls.wallBodies) {
      for (const body of walls.wallBodies) world.removeRigidBody(body);
    }
    if (world && ceiling.body) world.removeRigidBody(ceiling.body);
    if (world && booths.bodies) {
      for (const body of booths.bodies) world.removeRigidBody(body);
    }
    if (world && furniturePile.bodies) {
      for (const body of furniturePile.bodies) world.removeRigidBody(body);
    }

    if (scene) scene.fog = prevFog;
    config.record.centerHole = prevCenterHole;
  }

  return {
    recordMesh,
    recordCollider,
    recordColliderHandles,
    pitWallColliderHandle,
    boothColliderHandles,
    boothNeonMeshes,
    spindleLight,
    spindleLightColorPink,
    spindleLightColorCyan,
    pitInnerRadius: PIT_INNER_RADIUS,
    recordLabelMat: null,
    // * NPC AI hazard model for this level — the four square corner voids. Consumed by
    // * main.js → Simulation.setLevelHazards() so NPCs avoid them like the Classic center hole.
    aiHazards: {
      squareHoles: HOLE_CENTERS.map((h) => ({ x: h.x, z: h.z })),
      half: HOLE_HALF,
      holeCenter: HOLE_CENTER,
      arenaHalf: ARENA_HALF,
      avoidMargin: 1.2, // * wider keep-out — gives steering more time to react at speed
      influenceBand: 1.2, // * wider steer nudge — pushes bots away from the void lip earlier
      // * Center furniture pile — keep NPC patrol targets outside the convex-hull footprint.
      circularKeepOuts: [{ x: 0, z: 0, radius: 3.4, margin: 1.7 }],
    },
    update: (timeMs) => spotlightUpdateFn(timeMs),
    dispose,
  };
}
