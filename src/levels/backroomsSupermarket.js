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

// * Floor: large worn-carpet play surface centered on the origin. The spawn booths
// * (fixed at CONFIG-derived radius ≈ 30.4m) sit ~7.6m inboard of the floor edge, leaving
// * a landing apron behind each booth instead of a blind drop.
const ARENA_HALF = 38; // meters — floor half-extent (full square = 76 x 76)
const FLOOR_TOP_Y = 0; // meters — flat playing-surface height
const FLOOR_FRICTION = 0.55; // unitless — lower than Classic record; high friction catches trimesh seams
/** Play-quality floor visual grid (vertices ≈ cells+1 per axis, ~0.9m step). */
const FLOOR_GRID_CELLS_PLAY = 84;
/**
 * Menu-preview floor grid — ~½ the cells → ~¼ the vertices/faces. Physics uses
 * fixed cuboid slices (not this grid), so preview LOD only affects visuals.
 */
const FLOOR_GRID_CELLS_PREVIEW = 44;
const CARPET_TILE_M = 3.0; // meters — carpet texture world repeat (2×2 carpet tiles per repeat)

// * Four square corner voids (interior fall hazards), inset from each corner.
const HOLE_SIZE = 8.5; // meters — square void side length
const HOLE_HALF = HOLE_SIZE / 2;
const HOLE_CENTER = 20; // meters — |x| and |z| of each void center
const HOLE_DEPTH = 26; // meters — shaft depth; bottoms out exactly at the PIT_FLOOR_Y backstop
// * Per-level fall KO depth (restored on dispose). Deep enough for a dramatic ~1.2s drop
// * down a shaft, still well inside scoring's 2.5s kill-attribution window.
const FALL_Y_THRESHOLD = -18;

const HOLE_CENTERS = [
  { x: HOLE_CENTER, z: HOLE_CENTER },
  { x: -HOLE_CENTER, z: HOLE_CENTER },
  { x: HOLE_CENTER, z: -HOLE_CENTER },
  { x: -HOLE_CENTER, z: -HOLE_CENTER },
];

// * Chamfered hazard lips — sloped convex-hull prisms (buildChamferColliders) slope carts
// * inward (holes) or outward (perimeter); the visual mesh renders the same surface.
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
 * Worn commercial carpet-TILE texture: a 2×2 block of 1.5m carpet tiles per repeat with
 * quarter-turn pile direction (alternating tiles subtly lighter/darker with fiber combing
 * rotated 90° — the classic office carpet-tile checkerboard), tight fiber speckle, tile
 * seams, and sparse coffee/water stains. Mid-tone and low-contrast on purpose: gameplay
 * readability comes first, the tile grid just gives the floor scale and motion cues.
 *
 * @returns {THREE.CanvasTexture}
 */
function buildCarpetTexture() {
  const size = 512;
  const tile = size / 2; // 2×2 carpet tiles per canvas (1.5m each at CARPET_TILE_M = 3)
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  for (let ty = 0; ty < 2; ty += 1) {
    for (let tx = 0; tx < 2; tx += 1) {
      const x0 = tx * tile;
      const y0 = ty * tile;
      const lightTile = (tx + ty) % 2 === 0;

      // Quarter-turn checkerboard: ±4% lightness between neighbouring tiles.
      ctx.fillStyle = lightTile ? "#a09367" : "#94885c";
      ctx.fillRect(x0, y0, tile, tile);

      // Directional fiber combing — short dashes along the tile's pile direction
      // (horizontal on light tiles, vertical on dark: the 90° quarter-turn cue).
      for (let i = 0; i < 1100; i += 1) {
        const px = x0 + Math.random() * tile;
        const py = y0 + Math.random() * tile;
        const len = 2.5 + Math.random() * 4;
        const shade = Math.random() < 0.55 ? 0 : 255;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.015 + Math.random() * 0.03})`;
        if (lightTile) ctx.fillRect(px, py, len, 1.2);
        else ctx.fillRect(px, py, 1.2, len);
      }

      // Soft per-tile shading toward one corner (pile catching light unevenly).
      const grad = ctx.createLinearGradient(
        x0, y0,
        lightTile ? x0 + tile : x0, lightTile ? y0 : y0 + tile,
      );
      grad.addColorStop(0, "rgba(35,30,18,0.05)");
      grad.addColorStop(1, "rgba(255,250,230,0.03)");
      ctx.fillStyle = grad;
      ctx.fillRect(x0, y0, tile, tile);
    }
  }

  // Sparse stains: a couple of water blotches and one faint coffee ring per repeat.
  for (let i = 0; i < 14; i += 1) {
    const r = 10 + Math.random() * 30;
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const grad = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r);
    grad.addColorStop(0, "rgba(48,40,24,0.06)");
    grad.addColorStop(1, "rgba(48,40,24,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 2; i += 1) {
    ctx.strokeStyle = "rgba(58,44,22,0.14)";
    ctx.lineWidth = 2 + Math.random() * 2;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 7 + Math.random() * 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tile seams: dark line + light bevel hint on the far side, on every 1.5m boundary.
  for (const p of [0, tile, size - 1]) {
    ctx.fillStyle = "rgba(40,34,22,0.4)";
    ctx.fillRect(p === size - 1 ? size - 2 : p, 0, 1.5, size);
    ctx.fillRect(0, p === size - 1 ? size - 2 : p, size, 1.5);
    ctx.fillStyle = "rgba(235,225,190,0.10)";
    ctx.fillRect((p === size - 1 ? size - 2 : p) + 1.5, 0, 1, size);
    ctx.fillRect(0, (p === size - 1 ? size - 2 : p) + 1.5, size, 1);
  }

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
 * Exported for tests (floor physics/visual lockstep invariant).
 *
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {number|null}
 */
export function getFloorSurfaceY(x, z) {
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

/** Clamped smoothstep 0→1. */
function smooth01(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Returns 0–1 traffic-wear factor at (x, z): worn walking lanes from each spawn booth
 * toward the center and a scuffed ring around the furniture-pile base — foot traffic
 * that no longer happens. Deterministic (baked into vertex colors on all clients).
 *
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {number}
 */
function getTrafficWearFactor(x, z) {
  // Booth approach lanes run along both axes (booths sit on ±X/±Z at ~30.4m).
  const lane = (along, across) => {
    if (along < 7 || along > 31.5) return 0;
    const width = 1 - smooth01((across - 1.1) / 1.5);
    const ends = Math.min(smooth01((along - 7) / 3), smooth01((31.5 - along) / 3));
    return width * ends;
  };
  let wear = Math.max(lane(Math.abs(x), Math.abs(z)), lane(Math.abs(z), Math.abs(x)));

  // Scuffed ring where the pile gets circled.
  const r = Math.hypot(x, z);
  wear = Math.max(wear, 1 - Math.min(1, Math.abs(r - 5.5) / 1.4));

  return wear;
}

/**
 * Builds the square floor visual mesh (physics uses separate cuboid slices).
 * Square corner voids have inward-sloping chamfer lips; the perimeter has an
 * outward-sloping drop-off. Open void vertices are omitted so the mesh matches kill zones.
 *
 * @param {number} [cells=FLOOR_GRID_CELLS_PLAY] Grid resolution per axis.
 * @returns {THREE.BufferGeometry}
 */
function buildFloorGeometry(cells = FLOOR_GRID_CELLS_PLAY) {
  const verts = cells + 1;
  const step = (ARENA_HALF * 2) / cells;

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
      // Faint baked traffic wear (×0.90 at full strength) under the hazard-lip darkening.
      const wearMul = 1 - 0.1 * getTrafficWearFactor(x, z);
      colors[idx * 3] = (baseR * wearMul) * (1 - darken) + lipR * darken;
      colors[idx * 3 + 1] = (baseG * wearMul) * (1 - darken) + lipG * darken;
      colors[idx * 3 + 2] = (baseB * wearMul) * (1 - darken) + lipB * darken;
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

// ===== Floor physics layout (shared by collider construction and tests) =====

// * Hull tops meet the flat floor slices this far below their top faces — a step small
// * enough to never catch a cart, large enough to avoid coplanar-face contact jitter.
const CHAMFER_TUCK = 0.02;

/**
 * The 9 flat floor slices as axis-aligned rects (half-extents + centers). The flat floor
 * stops where the sloped chamfer lips begin; the lips are covered by the convex-hull
 * prisms from buildChamferColliders(). Derived from the SAME constants the visual mesh
 * uses (single source of truth) — the original bug here was hand-written INNER/OUTER/EDGE
 * numbers that excluded the chamfer bands entirely, leaving visually-solid sloped carpet
 * with no collider.
 *
 * @returns {Array<{ hx: number, hz: number, px: number, pz: number }>}
 */
function computeFloorSliceRects() {
  const INNER = HOLE_CENTER - HOLE_HALF - HOLE_CHAMFER_W;
  const OUTER = HOLE_CENTER + HOLE_HALF + HOLE_CHAMFER_W;
  const EDGE = ARENA_HALF - OUTER_CHAMFER_W;
  const stripHX = (OUTER - INNER) / 2;
  const stripPX = -((OUTER + INNER) / 2);
  return [
    // 3 solid full-length strips (Left-Outer, Center, Right-Outer).
    { hx: (EDGE - OUTER) / 2, hz: EDGE, px: -(OUTER + EDGE) / 2, pz: 0 },
    { hx: INNER, hz: EDGE, px: 0, pz: 0 },
    { hx: (EDGE - OUTER) / 2, hz: EDGE, px: (OUTER + EDGE) / 2, pz: 0 },
    // Left-inner strip framed around the two -X holes.
    { hx: stripHX, hz: (EDGE - OUTER) / 2, px: stripPX, pz: (OUTER + EDGE) / 2 },
    { hx: stripHX, hz: INNER, px: stripPX, pz: 0 },
    { hx: stripHX, hz: (EDGE - OUTER) / 2, px: stripPX, pz: -((OUTER + EDGE) / 2) },
    // Right-inner strip framed around the two +X holes.
    { hx: stripHX, hz: (EDGE - OUTER) / 2, px: -stripPX, pz: (OUTER + EDGE) / 2 },
    { hx: stripHX, hz: INNER, px: -stripPX, pz: 0 },
    { hx: stripHX, hz: (EDGE - OUTER) / 2, px: -stripPX, pz: -((OUTER + EDGE) / 2) },
  ];
}

/**
 * Pure physics-floor support height at (x, z): the surface a cart stands on, combining
 * the flat slice rects with the sloped chamfer-prism tops. Exported for tests, which
 * assert this stays in lockstep with getFloorSurfaceY() everywhere — physics must cover
 * exactly what the carpet shows (within CHAMFER_TUCK).
 *
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {number|null} Support height, or null where a cart falls (voids, past edge).
 */
export function computeFloorPhysicsY(x, z) {
  // Chamfer prism tops around each void (Chebyshev band, sloping into the shaft).
  for (const h of HOLE_CENTERS) {
    const d = distToSquareHole(x, z, h.x, h.z);
    if (d <= HOLE_HALF) return null; // open void
    if (d < HOLE_HALF + HOLE_CHAMFER_W) {
      const t = (d - HOLE_HALF) / HOLE_CHAMFER_W;
      return FLOOR_BOTTOM_Y + t * (FLOOR_TOP_Y - CHAMFER_TUCK - FLOOR_BOTTOM_Y);
    }
  }
  // Perimeter chamfer prisms (sloping toward the pit).
  const edgeDist = distToArenaEdge(x, z);
  if (edgeDist < 0) return null; // past the floor edge
  if (edgeDist < OUTER_CHAMFER_W) {
    const t = edgeDist / OUTER_CHAMFER_W;
    return FLOOR_BOTTOM_Y + t * (FLOOR_TOP_Y - CHAMFER_TUCK - FLOOR_BOTTOM_Y);
  }
  // Flat slices — coverage comes from the real collider rect list, so tiling gaps fail tests.
  for (const r of computeFloorSliceRects()) {
    if (Math.abs(x - r.px) <= r.hx && Math.abs(z - r.pz) <= r.hz) return FLOOR_TOP_Y;
  }
  return null;
}

// ===== Chamfer lip colliders (sloped lips are real ground, not empty air) =====

/**
 * Registers convex-hull prisms backing every sloped chamfer lip, so the sloped carpet the
 * floor mesh renders is driveable ground: one mitered trapezoid prism per side of each
 * square void (sloping down into the shaft) and per arena edge (sloping down toward the
 * pit). The 45° mitered ends tile exactly with their neighbours (same tangent-fit-hull
 * idea as the Classic Record ring collider), and the up-slope edge meets the flat floor
 * cuboids 2cm below their tops — a step small enough to never catch a cart, avoiding both
 * historical failure modes here (trimesh internal-edge bounce, roundCuboid shrink gaps).
 *
 * @param {import("@dimforge/rapier3d").World} world
 * @param {number} friction Matches the flat floor slices.
 * @param {number} restitution Matches the flat floor slices.
 * @returns {object[]} Rigid bodies to remove on dispose.
 */
function buildChamferColliders(world, friction, restitution) {
  const TUCK = CHAMFER_TUCK; // meters — hull top sits this far below the flat cuboid tops
  const PRISM_H = 0.5; // meters — prism thickness, extruded straight down

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));

  // Maps the canonical "+Z side" prism onto each side of an axis-aligned square.
  const sideTransforms = [
    (x, z) => [x, z], // +Z
    (x, z) => [x, -z], // -Z
    (x, z) => [z, x], // +X
    (x, z) => [-z, x], // -X
  ];

  // Canonical prism: trapezoid band between Chebyshev distances dNear→dFar (half-widths
  // equal the distances → exact 45° miters), top sloping yNear→yFar, extruded down.
  const pushPrism = (toWorld, dNear, yNear, dFar, yFar, ox, oz) => {
    const pts = [];
    for (const [d, y] of [[dNear, yNear], [dFar, yFar]]) {
      for (const sx of [-1, 1]) {
        const [wx, wz] = toWorld(sx * d, d);
        pts.push(ox + wx, y, oz + wz);
        pts.push(ox + wx, y - PRISM_H, oz + wz);
      }
    }
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
    if (desc) {
      world.createCollider(desc.setFriction(friction).setRestitution(restitution), body);
    }
  };

  for (const toWorld of sideTransforms) {
    // Void lips: floor level at the outer edge, void-lip depth at the opening.
    for (const h of HOLE_CENTERS) {
      pushPrism(toWorld, HOLE_HALF, FLOOR_BOTTOM_Y, HOLE_HALF + HOLE_CHAMFER_W, -TUCK, h.x, h.z);
    }
    // Perimeter lip: floor level on the inside, drop-off depth at the true floor edge.
    pushPrism(toWorld, ARENA_HALF - OUTER_CHAMFER_W, -TUCK, ARENA_HALF, FLOOR_BOTTOM_Y, 0, 0);
  }

  return [body];
}

// ===== Fall containment (Cart Rave-style shaft treatment) =====

/**
 * Adds the physical under-floor the Classic Record pit has and this level lacked:
 * a springy backstop cap at the pit floor (the "final bounce" a KO'd cart lands on)
 * and low-friction vertical ricochet walls lining each corner-void shaft so falling
 * carts carom down the shaft with nothing to rest on. Everything sits below
 * FALL_Y_THRESHOLD gameplay-wise — this is presentation for the fall, not play space.
 *
 * @param {import("@dimforge/rapier3d").World} world
 * @returns {object[]} Rigid bodies to remove on dispose.
 */
function buildFallContainment(world) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));

  // Backstop cap spanning the whole room footprint; top face flush with the visual pit floor.
  const capHalfY = 0.5;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(WALL_HALF, capHalfY, WALL_HALF)
      .setTranslation(0, PIT_FLOOR_Y - capHalfY, 0)
      .setFriction(0.2)
      .setRestitution(0.8),
    body,
  );

  // Void shaft ricochet walls — inner faces just outside the visual opening, overlapped
  // at the corners so there are no seams to slip through.
  const wallTopY = -1.0; // below the chamfer lip bottom
  const wallHalfY = (wallTopY - PIT_FLOOR_Y) / 2;
  const wallMidY = (wallTopY + PIT_FLOOR_Y) / 2;
  const shaftHalf = HOLE_HALF + 0.75;
  const t = 0.3;
  for (const h of HOLE_CENTERS) {
    const faces = [
      [0, shaftHalf + t, shaftHalf + 2 * t, t],
      [0, -(shaftHalf + t), shaftHalf + 2 * t, t],
      [shaftHalf + t, 0, t, shaftHalf + 2 * t],
      [-(shaftHalf + t), 0, t, shaftHalf + 2 * t],
    ];
    for (const [ox, oz, hx, hz] of faces) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, wallHalfY, hz)
          .setTranslation(h.x + ox, wallMidY, h.z + oz)
          .setFriction(0.05)
          .setRestitution(0.6),
        body,
      );
    }
  }

  return [body];
}

/**
 * Builds the dressing for one square void: a black shaft dropping into darkness, with a
 * dim, identical "second floor" room at the very bottom — the strongest Backrooms cue
 * (architecture repeats where it should end). The sub-room floor sits flush with the
 * fall-containment backstop, so KO'd carts visibly land on another layer of the same
 * building. Sloped hazard lips live on the shared carpet floor trimesh.
 *
 * @param {number} cx Void center X.
 * @param {number} cz Void center Z.
 * @param {THREE.Material} shaftMat Shared black shaft material.
 * @param {{ floor: THREE.Material, glow: THREE.Material, silhouette: THREE.Material }} subRoomMats
 *   Shared sub-room materials (dim carpet, dead-fluorescent glow quad, dark furniture).
 * @returns {{ group: THREE.Group, geometries: THREE.BufferGeometry[] }}
 */
function buildSquareVoid(cx, cz, shaftMat, subRoomMats) {
  const group = new THREE.Group();
  const geometries = [];

  // Shaft slightly larger than the ragged opening so no side gap shows through.
  // * Use play grid step so preview LOD does not shrink/expand void shafts.
  const floorStepPlay = (ARENA_HALF * 2) / FLOOR_GRID_CELLS_PLAY;
  const shaftOuter = HOLE_SIZE + floorStepPlay * 2 + 0.6;
  const shaftGeo = new THREE.BoxGeometry(shaftOuter, HOLE_DEPTH, shaftOuter);
  geometries.push(shaftGeo);
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.set(cx, FLOOR_TOP_Y - HOLE_DEPTH / 2 + 0.05, cz);
  group.add(shaft);

  // --- The room below: dim carpet, one failing fluorescent, dark shapes. Identical in
  // --- every shaft on purpose — repetition IS the unease.
  const bottomY = FLOOR_TOP_Y - HOLE_DEPTH; // flush with the backstop cap top
  const inner = shaftOuter - 0.12;

  const subFloorGeo = new THREE.PlaneGeometry(inner, inner);
  geometries.push(subFloorGeo);
  const subFloor = new THREE.Mesh(subFloorGeo, subRoomMats.floor);
  subFloor.rotation.x = -Math.PI / 2;
  subFloor.position.set(cx, bottomY + 0.06, cz);
  group.add(subFloor);

  // A single dim fluorescent bar on one shaft wall, ~3.4m above the sub-floor.
  const glowGeo = new THREE.PlaneGeometry(2.4, 0.16);
  geometries.push(glowGeo);
  const glow = new THREE.Mesh(glowGeo, subRoomMats.glow);
  glow.position.set(cx, bottomY + 3.4, cz - inner / 2 + 0.1);
  group.add(glow);

  // Two dark silhouettes standing on the sub-floor: a shelf unit and a pillar stub.
  const shelfGeo = new THREE.BoxGeometry(1.0, 2.1, 0.5);
  const stubGeo = new THREE.BoxGeometry(0.8, 3.2, 0.8);
  geometries.push(shelfGeo, stubGeo);
  const shelf = new THREE.Mesh(shelfGeo, subRoomMats.silhouette);
  shelf.position.set(cx - 1.6, bottomY + 1.05, cz + 1.2);
  shelf.rotation.y = 0.35;
  group.add(shelf);
  const stub = new THREE.Mesh(stubGeo, subRoomMats.silhouette);
  stub.position.set(cx + 1.7, bottomY + 1.6, cz - 1.4);
  group.add(stub);

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

// ===== Pit-ring dressing (the store continues, abandoned) =====

/**
 * Fills the fog-readable band of the surrounding pit (just past the floor edge) with
 * abandoned-storage silhouettes: repeating shelf-gondola rows receding into the fog,
 * shrink-wrapped pallet clumps, and exactly one dead checkout lane in one corner — the
 * 90/10 rule: machine-repeated dressing with a single human anomaly. Everything is
 * non-colliding (carts KO in the pit long before reaching it), vertex-color faded to
 * black below the lip via pushFadeBox, and merged into ONE draw call.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[] }}
 */
function buildPitRingDressing(scene) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];

  const OUT = 43; // meters — band center: past the floor edge (38), well inside the walls (56)
  const BOTTOM = -16; // meters — silhouettes fade to near-black by here, melting into the pit
  const gondolaRgb = /** @type {[number, number, number]} */ ([0.30, 0.29, 0.26]);
  const palletRgb = /** @type {[number, number, number]} */ ([0.30, 0.33, 0.38]);
  const checkoutRgb = /** @type {[number, number, number]} */ ([0.24, 0.23, 0.21]);
  const registerRgb = /** @type {[number, number, number]} */ ([0.55, 0.50, 0.40]);

  for (let side = 0; side < 4; side += 1) {
    const { toWorld, alongIsX } = wallFrame(side);
    const o = OUT - WALL_HALF; // negative — toward the room center
    const dim = (along, radial) => (alongIsX ? [along, radial] : [radial, along]);

    // Shelf-gondola rows, long axis radial (receding into the fog), evenly repeated.
    for (const a of [-26, -4, 18]) {
      const [sx, sz] = dim(1.15, 9);
      const topY = 2.4;
      const [px, , pz] = toWorld(a, 0, o);
      pushFadeBox(parts, sx, topY - BOTTOM, sz, px, (topY + BOTTOM) / 2, pz, unitBox, gondolaRgb);
    }

    // Pallet clump (skipped on side 1 — the checkout lane takes its spot).
    if (side !== 1) {
      const [px, , pz] = toWorld(30, 0, o);
      const [s1x, s1z] = dim(1.25, 1.25);
      pushFadeBox(parts, s1x, 1.3 - BOTTOM, s1z, px, (1.3 + BOTTOM) / 2, pz, unitBox, palletRgb);
      const [s2x, s2z] = dim(1.1, 1.1);
      pushFadeBox(parts, s2x, 1.1, s2z, px, 1.3 + 0.55, pz, unitBox, palletRgb);
    }
  }

  // The one dead checkout lane (side 1, -Z): conveyor, register, slumped stanchion.
  {
    const { toWorld } = wallFrame(1);
    const o = OUT - WALL_HALF;
    const [cx, , cz] = toWorld(30, 0, o);
    // Conveyor bed.
    pushFadeBox(parts, 3.2, 0.95 - BOTTOM, 0.8, cx, (0.95 + BOTTOM) / 2, cz, unitBox, checkoutRgb);
    // Register on one end of the belt.
    pushFadeBox(parts, 0.6, 0.55, 0.6, cx - 1.2, 0.95 + 0.28, cz, unitBox, registerRgb);
    // Slumped queue stanchion leaning against the conveyor.
    const stanchion = unitBox.clone();
    stanchion.scale(0.08, 1.1, 0.08);
    stanchion.rotateZ(0.55);
    stanchion.translate(cx + 1.9, 0.45, cz + 0.3);
    const stanchionColors = new Float32Array(stanchion.attributes.position.count * 3);
    stanchionColors.fill(0.25);
    stanchion.setAttribute("color", new THREE.BufferAttribute(stanchionColors, 3));
    parts.push(stanchion);
  }

  unitBox.dispose();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0.05, vertexColors: true,
  });
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  group.add(new THREE.Mesh(merged, mat));

  scene.add(group);
  return { group, ownedGeometries: [merged], ownedMaterials: [mat] };
}

// ===== Quiet uncanny details (EXIT to nowhere, stopped clock, painted arrows) =====

/**
 * Three small, quiet wrongnesses — deliberately capped at three so they stay uncanny
 * instead of cluttered: a failing EXIT sign pointing at blank wallpaper, a wall clock
 * stopped at 3:47 in the dead-lighting quadrant, and faded painted arrows on the carpet
 * edge band pointing at walls and voids. All emissive-map based, zero dynamic lights.
 *
 * @param {THREE.Scene} scene
 * @returns {{
 *   group: THREE.Group,
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 *   ownedTextures: THREE.Texture[],
 * }}
 */
function buildUncannyDetails(scene) {
  const group = new THREE.Group();
  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [];

  // --- Failing EXIT sign (west wall) whose arrow points along the blank wall.
  const exitCanvas = document.createElement("canvas");
  exitCanvas.width = 256;
  exitCanvas.height = 96;
  {
    const ctx = exitCanvas.getContext("2d");
    ctx.fillStyle = "#0c0d0a";
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = "#3f8f55";
    ctx.font = "bold 58px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("EXIT", 148, 52);
    // Arrow triangle pointing left — at nothing.
    ctx.beginPath();
    ctx.moveTo(18, 48);
    ctx.lineTo(52, 26);
    ctx.lineTo(52, 70);
    ctx.closePath();
    ctx.fill();
    // Failing half: darken one end unevenly.
    const grad = ctx.createLinearGradient(120, 0, 256, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(120, 0, 136, 96);
  }
  const exitTex = new THREE.CanvasTexture(exitCanvas);
  ownedTextures.push(exitTex);
  const exitGeo = new THREE.BoxGeometry(1.5, 0.55, 0.1);
  const exitMat = new THREE.MeshStandardMaterial({
    color: 0x161613,
    emissiveMap: exitTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.45,
    roughness: 0.7,
  });
  ownedGeometries.push(exitGeo);
  ownedMaterials.push(exitMat);
  const exitSign = new THREE.Mesh(exitGeo, exitMat);
  exitSign.position.set(-(WALL_HALF - 0.4), 3.5, 9);
  exitSign.rotation.y = Math.PI / 2;
  group.add(exitSign);

  // --- Wall clock stopped at 3:47, hung in the dead-lighting quadrant (-X/+Z).
  const clockCanvas = document.createElement("canvas");
  clockCanvas.width = 128;
  clockCanvas.height = 128;
  {
    const ctx = clockCanvas.getContext("2d");
    ctx.fillStyle = "#26241e";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#c9c2ac";
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a372e";
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
      ctx.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54);
      ctx.stroke();
    }
    const drawHand = (angleRad, len, w) => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(angleRad) * len, 64 + Math.sin(angleRad) * len);
      ctx.stroke();
    };
    // 3:47 — angles measured from 12 o'clock, canvas Y is down.
    const minuteA = (47 / 60) * Math.PI * 2 - Math.PI / 2;
    const hourA = ((3 + 47 / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    drawHand(hourA, 28, 5);
    drawHand(minuteA, 42, 3);
  }
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  ownedTextures.push(clockTex);
  const clockGeo = new THREE.CircleGeometry(0.38, 24);
  const clockMat = new THREE.MeshStandardMaterial({
    color: 0x8f8a7a,
    map: clockTex,
    emissiveMap: clockTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.1,
    roughness: 0.8,
  });
  ownedGeometries.push(clockGeo);
  ownedMaterials.push(clockMat);
  const clock = new THREE.Mesh(clockGeo, clockMat);
  clock.position.set(-(WALL_HALF - 0.3), 4.6, 20);
  clock.rotation.y = Math.PI / 2;
  group.add(clock);

  // --- Faded painted directional arrows on the carpet edge band, pointing at nothing
  // --- useful (a wall, a void). Decals: transparent, no depth write, tiny y-offset.
  const arrowCanvas = document.createElement("canvas");
  arrowCanvas.width = 128;
  arrowCanvas.height = 128;
  {
    const ctx = arrowCanvas.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(232,228,214,0.85)";
    // Chevron arrow pointing "up" (−Y canvas), worn edges punched out below.
    ctx.beginPath();
    ctx.moveTo(64, 14);
    ctx.lineTo(104, 62);
    ctx.lineTo(82, 62);
    ctx.lineTo(82, 112);
    ctx.lineTo(46, 112);
    ctx.lineTo(46, 62);
    ctx.lineTo(24, 62);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 46; i += 1) {
      ctx.beginPath();
      ctx.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  const arrowTex = new THREE.CanvasTexture(arrowCanvas);
  ownedTextures.push(arrowTex);
  const arrowGeo = new THREE.PlaneGeometry(1.3, 1.3);
  const arrowMat = new THREE.MeshStandardMaterial({
    map: arrowTex,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  ownedGeometries.push(arrowGeo);
  ownedMaterials.push(arrowMat);

  // [x, z, yaw] — yaw 0 points +Z after the flat rotation; one aims at the (+20,+20) void.
  const arrowSpots = [
    [33.5, 6, Math.PI / 2], // → +X wall
    [-8, 33.5, 0], // → +Z wall
    [27, 27, Math.PI + Math.PI / 4], // → the (20, 20) void, diagonally inward
  ];
  for (const [ax, az, yaw] of arrowSpots) {
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = yaw;
    arrow.position.set(ax, 0.02, az);
    group.add(arrow);
  }

  scene.add(group);
  return { group, ownedGeometries, ownedMaterials, ownedTextures };
}

// ===== Doorways to nowhere =====

/**
 * Shallow fake doorways on the plain (unshelved) walls: two dark openings — one with a
 * single dim hallway light strip receding inside — and one that has been wallpapered
 * over with only the frame left. Implies the maze continues and this room is one cell
 * of many. Pure visuals on the far side of the pit; nothing collides.
 *
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[] }}
 */
function buildDoorways(scene) {
  const group = new THREE.Group();

  const openingGeo = new THREE.PlaneGeometry(1.15, 2.3);
  const stripGeo = new THREE.PlaneGeometry(0.07, 2.05);
  const jambGeo = new THREE.BoxGeometry(0.12, 2.45, 0.08);
  const headerGeo = new THREE.BoxGeometry(1.42, 0.12, 0.08);

  const openingMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
  const sealedMat = new THREE.MeshStandardMaterial({ color: 0xb2a04e, roughness: 0.96 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.85 });
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x8a7a55 });

  const ownedGeometries = [openingGeo, stripGeo, jambGeo, headerGeo];
  const ownedMaterials = [openingMat, sealedMat, frameMat, stripMat];

  // [side, along, variant] — sides 1 (-Z) and 3 (-X) are the plain drywall walls.
  /** @type {Array<[number, number, "lit" | "sealed" | "dark"]>} */
  const doors = [
    [3, 6, "lit"], // dark opening with a dim hallway strip inside
    [1, -18, "sealed"], // wallpapered over, frame left behind
    [1, 26, "dark"], // plain dark opening
  ];

  for (const [side, along, variant] of doors) {
    const { toWorld } = wallFrame(side);
    const faceYaw = side === 1 ? 0 : Math.PI / 2; // plane normal toward the room
    const doorGroup = new THREE.Group();

    // * Offsets sit proud of the protruding baseboard strip (0.3m) so the doorway
    // * cuts through it visually instead of being half-buried behind it.
    const opening = new THREE.Mesh(openingGeo, variant === "sealed" ? sealedMat : openingMat);
    const [ox, , oz] = toWorld(along, 0, -0.34);
    opening.position.set(ox, 1.15, oz);
    opening.rotation.y = faceYaw;
    doorGroup.add(opening);

    if (variant === "lit") {
      const strip = new THREE.Mesh(stripGeo, stripMat);
      const [sx, , sz] = toWorld(along + 0.38, 0, -0.36);
      strip.position.set(sx, 1.15, sz);
      strip.rotation.y = faceYaw;
      doorGroup.add(strip);
    }

    for (const jambOff of [-0.66, 0.66]) {
      const jamb = new THREE.Mesh(jambGeo, frameMat);
      const [jx, , jz] = toWorld(along + jambOff, 0, -0.38);
      jamb.position.set(jx, 1.22, jz);
      jamb.rotation.y = faceYaw;
      doorGroup.add(jamb);
    }
    const header = new THREE.Mesh(headerGeo, frameMat);
    const [hx, , hz] = toWorld(along, 0, -0.38);
    header.position.set(hx, 2.42, hz);
    header.rotation.y = faceYaw;
    doorGroup.add(header);

    group.add(doorGroup);
  }

  scene.add(group);
  return { group, ownedGeometries, ownedMaterials };
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
 *   update: (timeMs: number) => void,
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
  // * Two dim buckets with independent arrhythmic flicker (driven from update()) — the
  // * building's fixtures failing out of sync with each other, at zero light cost.
  const dimMatA = new THREE.MeshStandardMaterial({
    color: 0xb7ad8e, emissive: 0xb7a87a, emissiveIntensity: 0.41,
    roughness: 0.6, metalness: 0.0,
  });
  const dimMatB = dimMatA.clone();
  const deadMat = new THREE.MeshStandardMaterial({
    color: 0x5d584a, emissive: 0x000000, emissiveIntensity: 0.0,
    roughness: 0.8, metalness: 0.0,
  });
  ownedMaterials.push(frameMat, litMat, dimMatA, dimMatB, deadMat);

  // Fixtures never move, so bake every frame rail and panel into merged static meshes:
  // one draw call for the shared frame material, plus one per panel state bucket
  // (lit/dim/dead). The panel states differ by material props (emissive color/intensity,
  // base color, roughness) that an InstancedMesh can't vary per-instance, so a per-state
  // merge reproduces their exact appearance. This collapses ~125 individual fixture meshes
  // to 4 draw calls with zero visual change — same geometry (transforms baked into
  // vertices), same materials, same deterministic dead/dim pattern.
  const frameRailGeo = new THREE.BoxGeometry(4.8, 0.07, 0.14);
  const panelGeo = new THREE.BoxGeometry(4.5, 0.1, 1.85);

  /** @type {THREE.BufferGeometry[]} */
  const railParts = [];
  /** @type {Record<"lit" | "dimA" | "dimB" | "dead", THREE.BufferGeometry[]>} */
  const panelParts = { lit: [], dimA: [], dimB: [], dead: [] };
  const railPos = new THREE.Vector3();
  const railEuler = new THREE.Euler();
  const railQuat = new THREE.Quaternion();
  const railScale = new THREE.Vector3(1, 1, 1);
  const railMatrix = new THREE.Matrix4();

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

      // Deterministic state: ~1 in 5 dead, ~1 in 4 dimmed, rest lit — EXCEPT one fully
      // dead 2×2 corner quadrant (removes 3 SpotLights vs the hash: uniform dimness reads
      // as "a look"; a genuinely dark corner reads as "something is wrong here").
      const h = (gx * 7 + gz * 13) % 20;
      const inDeadQuadrant = gx <= 1 && gz >= 3;
      const state = inDeadQuadrant
        ? "dead"
        : h < 4 ? "dead" : h < 9 ? (h % 2 === 0 ? "dimA" : "dimB") : "lit";

      const railOffsets = [
        { x: 0, z: 0.98, ry: 0 },
        { x: 0, z: -0.98, ry: 0 },
        { x: 2.4, z: 0, ry: Math.PI / 2 },
        { x: -2.4, z: 0, ry: Math.PI / 2 },
      ];
      for (const r of railOffsets) {
        railPos.set(px + r.x, fixtureY + 0.04, pz + r.z);
        railEuler.set(0, r.ry, 0);
        railQuat.setFromEuler(railEuler);
        railMatrix.compose(railPos, railQuat, railScale);
        const g = frameRailGeo.clone();
        g.applyMatrix4(railMatrix);
        railParts.push(g);
      }

      const pg = panelGeo.clone();
      pg.translate(px, fixtureY - 0.06, pz);
      panelParts[state].push(pg);

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

  // Bake the collected fixture geometry into merged static meshes (1 rail bucket + up to 3
  // panel buckets). Each merged buffer is tracked for the level dispose() path exactly like
  // the geometry it replaces; the per-cell clones and the two template geometries are
  // consumed/disposed here so nothing leaks.
  const mergeCeilingParts = (parts, mat) => {
    if (parts.length === 0) return;
    const merged = BufferGeometryUtils.mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    ownedGeometries.push(merged);
    group.add(new THREE.Mesh(merged, mat));
  };
  // ----- Decay dressing: missing tiles (black gaps into the plenum), sagging tiles,
  // ----- and hanging cables. All merged; biased toward the dead quadrant (-X/+Z).
  const gapMat = new THREE.MeshBasicMaterial({ color: 0x08070a });
  const sagMat = new THREE.MeshStandardMaterial({
    color: 0x8a7f66, roughness: 0.95, metalness: 0.0,
  });
  ownedMaterials.push(gapMat, sagMat);

  /** @type {THREE.BufferGeometry[]} */
  const gapParts = [];
  /** @type {THREE.BufferGeometry[]} */
  const sagParts = [];

  // [x, z] tile-gap positions; the first one hosts the exhaust fan.
  const gapSpots = [
    [-15, 24], [-24, 17], [-20, 9], [-6, 20], [10, -22], [26, -6], [4, 27.5],
  ];
  const gapQuad = new THREE.PlaneGeometry(1.9, 1.9);
  const cableGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
  for (let i = 0; i < gapSpots.length; i += 1) {
    const [gx2, gz2] = gapSpots[i];
    const gq = gapQuad.clone();
    gq.rotateX(Math.PI / 2); // face down
    gq.translate(gx2, CEILING_Y - 0.02, gz2);
    gapParts.push(gq);
    // Exposed grid rim around the opening (reads as the tile having been removed).
    const rimOffsets = [
      [0, 1.02, 2.1, 0.1], [0, -1.02, 2.1, 0.1], [1.02, 0, 0.1, 2.1], [-1.02, 0, 0.1, 2.1],
    ];
    for (const [ox, oz, sx, sz] of rimOffsets) {
      const rim = new THREE.BoxGeometry(sx, 0.06, sz);
      rim.translate(gx2 + ox, CEILING_Y - 0.03, gz2 + oz);
      railParts.push(rim);
    }
    // A cable drooping out of some gaps (deterministic alternation, none where the fan goes).
    if (i > 0 && i % 2 === 1) {
      const len = 0.9 + (i % 3) * 0.35;
      const cable = cableGeo.clone();
      cable.scale(1, len, 1);
      cable.rotateZ(0.08 * (i % 2 === 0 ? 1 : -1));
      cable.translate(gx2 + 0.7, CEILING_Y - len / 2, gz2 - 0.6);
      railParts.push(cable);
    }
  }
  gapQuad.dispose();
  cableGeo.dispose();

  // Sagging, water-stained tiles: 2×2 planes with the center vertex bowed down.
  for (const [sx2, sz2, sag] of [[-18, 13, 0.22], [8, 19, 0.16]]) {
    const sagGeo = new THREE.PlaneGeometry(2, 2, 2, 2);
    const pos = sagGeo.attributes.position;
    pos.setZ(4, sag); // center vertex of the 3×3 grid, along +Z (down after rotateX)
    sagGeo.rotateX(Math.PI / 2);
    sagGeo.translate(sx2, CEILING_Y - 0.04, sz2);
    sagGeo.computeVertexNormals();
    sagParts.push(sagGeo);
  }

  mergeCeilingParts(railParts, frameMat);
  mergeCeilingParts(panelParts.lit, litMat);
  mergeCeilingParts(panelParts.dimA, dimMatA);
  mergeCeilingParts(panelParts.dimB, dimMatB);
  mergeCeilingParts(panelParts.dead, deadMat);
  mergeCeilingParts(gapParts, gapMat);
  mergeCeilingParts(sagParts, sagMat);
  frameRailGeo.dispose();
  panelGeo.dispose();

  // ----- Slow exhaust fan in the first ceiling gap — one quiet moving silhouette so time
  // ----- visibly passes. Backlit by the black opening; no light, two draw calls.
  const fanMat = new THREE.MeshStandardMaterial({
    color: 0x1c1a16, roughness: 0.85, metalness: 0.2,
  });
  ownedMaterials.push(fanMat);
  const fanHubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 8);
  const fanBladeGeo = new THREE.BoxGeometry(1.62, 0.03, 0.2);
  ownedGeometries.push(fanHubGeo, fanBladeGeo);
  const fanGroup = new THREE.Group();
  const [fanX, fanZ] = gapSpots[0];
  fanGroup.position.set(fanX, CEILING_Y - 0.14, fanZ);
  fanGroup.add(new THREE.Mesh(fanHubGeo, fanMat));
  for (const rot of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(fanBladeGeo, fanMat);
    blade.rotation.y = rot;
    fanGroup.add(blade);
  }
  group.add(fanGroup);

  // ----- Per-frame ceiling life: fan rotation + out-of-sync dim-panel flicker.
  const FAN_RAD_PER_SEC = (Math.PI * 2) / 5.2;
  function update(timeMs) {
    const t = timeMs * 0.001;
    fanGroup.rotation.y = t * FAN_RAD_PER_SEC;
    // Arrhythmic slow LFOs (incommensurate frequencies) with rare near-dropouts.
    const a = 0.82 + 0.18 * Math.sin(t * 0.9) * Math.sin(t * 0.53 + 1.7);
    const b = 0.85 + 0.15 * Math.sin(t * 0.71 + 4.2) * Math.sin(t * 0.41);
    dimMatA.emissiveIntensity = 0.41 * (Math.sin(t * 0.161) > 0.997 ? 0.12 : a);
    dimMatB.emissiveIntensity = 0.41 * (Math.sin(t * 0.127 + 2.1) > 0.997 ? 0.12 : b);
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
  return { group, body: ceilingBody, ownedGeometries, ownedMaterials, update };
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

  const ownedMaterials = [slabMat, railMat, boxMat];

  const pw = B.platformWidth / 2;
  const pd = B.platformDepth / 2;

  // * Booths never move — bake all 4 booths' parts into 3 merged static meshes (one per
  // * material), same pattern as the walls/ceiling/furniture pile. ~36 draws → 3.
  /** @type {Record<"slab" | "rail" | "box", THREE.BufferGeometry[]>} */
  const parts = { slab: [], rail: [], box: [] };
  const boothMatrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const scratchPos = new THREE.Vector3();
  const scratchQuat = new THREE.Quaternion();
  const scratchEuler = new THREE.Euler();
  const scratchScale = new THREE.Vector3();
  const pushPart = (bucket, template, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    scratchPos.set(px, py, pz);
    scratchQuat.setFromEuler(scratchEuler.set(rx, ry, rz));
    scratchScale.set(sx, sy, sz);
    localMatrix.compose(scratchPos, scratchQuat, scratchScale);
    parts[bucket].push(template.clone().applyMatrix4(localMatrix.premultiply(boothMatrix)));
  };

  for (let i = 0; i < 4; i += 1) {
    const angle = angles[i];
    const cx = boothCenterDist * Math.cos(angle);
    const cz = boothCenterDist * Math.sin(angle);
    const topY = B.platformY;
    const yaw = Math.PI / 2 - angle;

    scratchPos.set(cx, 0, cz);
    scratchQuat.setFromEuler(scratchEuler.set(0, yaw, 0));
    scratchScale.set(1, 1, 1);
    boothMatrix.compose(scratchPos, scratchQuat, scratchScale);

    // Platform slab.
    pushPart("slab", platGeo, 0, topY, 0);

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
    pushPart("rail", lowRailGeo, 0, deckTopY + 0.275, pd - 0.08);

    // Dull metal side rails (no neon).
    for (const sx of [-pw + 0.1, pw - 0.1]) {
      pushPart("rail", railGeo, sx, deckTopY + B.railHeight, 0, Math.PI / 2, 0, 0, 1, B.platformDepth - 0.4, 1);
      for (const rz of [-pd + 0.2, pd - 0.2]) {
        pushPart("rail", railGeo, sx, deckTopY + B.railHeight / 2, rz, 0, 0, 0, 1, B.railHeight, 1);
      }
    }

    // Worn cardboard-box prop in the back corner.
    pushPart("box", cardboardGeo, pw - 1.0, deckTopY + 0.55, pd - 1.0, 0, 0.3, 0);
  }

  const ownedGeometries = [];
  const mergeAdd = (bucket, mat) => {
    if (bucket.length === 0) return;
    const merged = BufferGeometryUtils.mergeGeometries(bucket, false);
    bucket.forEach((g) => g.dispose());
    ownedGeometries.push(merged);
    group.add(new THREE.Mesh(merged, mat));
  };
  mergeAdd(parts.slab, slabMat);
  mergeAdd(parts.rail, railMat);
  mergeAdd(parts.box, boxMat);
  platGeo.dispose();
  lowRailGeo.dispose();
  railGeo.dispose();
  cardboardGeo.dispose();

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
 * @param {{ menuPreview?: boolean, reflectorTextureSize?: number }} [options]
 */
export function initBackroomsSupermarket(scene, world, config, options = {}) {
  const menuPreview = options.menuPreview === true;
  const floorCells = menuPreview ? FLOOR_GRID_CELLS_PREVIEW : FLOOR_GRID_CELLS_PLAY;

  // * Disable the Classic Record center-hole suck — this arena is solid at the origin.
  const prevCenterHole = config.record.centerHole;
  config.record.centerHole = { enabled: false };

  // * Deepen the fall KO threshold while this level is loaded (same save/restore pattern
  // * as centerHole above; Classic Record does the same with -30 in arena.js). Falls now
  // * ricochet down a shaft before the KO fires instead of cutting off almost immediately.
  const prevFallYThreshold = config.fall.yThreshold;
  config.fall.yThreshold = FALL_Y_THRESHOLD;

  const prevFog = scene.fog;
  const backroomsFog = config.postFx.fog.backrooms;
  // * Thick, musty warm fog — oppressive haze that swallows far walls and pit depth.
  scene.fog = new THREE.FogExp2(backroomsFog.color, backroomsFog.density);

  // ===== Floor visual (grid LOD) + cuboid physics (always full precision) =====
  const floorGeo = buildFloorGeometry(floorCells);
  const carpetTex = buildCarpetTexture();
  carpetTex.repeat.set(1, 1); // UVs already scaled in geometry by CARPET_TILE_M
  // * Matte worn carpet — roughness 0.98, no sheen, minimal IBL (envMapIntensityScale 0.08)
  const carpetEnvScale = 0.08;
  const floorMat = createPhysicalMaterial({
    map: carpetTex,
    // * Same canvas reused as a bump map — fiber dashes/seams catch the ceiling
    // * spotlights so the pile reads as texture, not paint. Near-free.
    bumpMap: carpetTex,
    bumpScale: 0.02,
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
  const floorColliders = [];

  // * Slice layout lives in computeFloorSliceRects() (shared with tests); the sloped
  // * chamfer bands the slices stop short of are covered by buildChamferColliders().
  // * REVERTED long ago: roundCuboid shrunk the flat top surface by 0.15m, creating gaps
  // * between the floor pieces and causing carts to snag on seams — keep plain cuboids.
  for (const r of computeFloorSliceRects()) {
    const desc = RAPIER.ColliderDesc.cuboid(r.hx, T_HALF, r.hz)
      .setTranslation(r.px, 0, r.pz) // Local Y is 0 because body is at -0.3
      .setFriction(FLOOR_FRICTION)
      .setRestitution(config.record.restitution);
    floorColliders.push(world.createCollider(desc, floorBody));
  }

  // Return handles array (main.js will normalize this for simulation.js)
  const recordCollider = floorColliders[0]; // Backward compat
  const recordColliderHandles = floorColliders.map(c => c.handle);

  // Sloped chamfer-lip colliders (the bands the flat slices deliberately stop short of)
  // + Cart Rave-style fall containment (shaft ricochet walls, pit backstop cap).
  const chamferBodies = buildChamferColliders(world, FLOOR_FRICTION, config.record.restitution);
  const containmentBodies = buildFallContainment(world);

  // ===== Square voids (black shafts w/ dim repeating sub-rooms at the bottom) =====
  const voidShaftMat = new THREE.MeshBasicMaterial({ color: 0x040406, side: THREE.BackSide });
  // Dim copy of the carpet — ~18% brightness so the room below reads, but stays a hint.
  // Cloned texture: the sub-floor planes use 0–1 UVs, so tiling lives on the texture.
  const subCarpetTex = carpetTex.clone();
  subCarpetTex.repeat.set(3.6, 3.6);
  subCarpetTex.needsUpdate = true;
  const subRoomMats = {
    floor: new THREE.MeshBasicMaterial({ map: subCarpetTex, color: 0x2e2a20 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x5c5544, side: THREE.DoubleSide }),
    silhouette: new THREE.MeshBasicMaterial({ color: 0x0b0a09 }),
  };
  const voidGroup = new THREE.Group();
  const voidGeometries = [];
  for (const h of HOLE_CENTERS) {
    const v = buildSquareVoid(h.x, h.z, voidShaftMat, subRoomMats);
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

  // ===== Atmosphere dressing (all non-colliding, merged, zero new dynamic lights) =====
  const pitDressing = buildPitRingDressing(scene);
  const uncanny = buildUncannyDetails(scene);
  const doorways = buildDoorways(scene);

  // ===== Ambient fill lighting (warm; compensates for thick fog while staying dim/liminal) =====
  const hemiLight = new THREE.HemisphereLight(0xd6c9a0, 0x33301f, 1.42);
  scene.add(hemiLight);
  const ambient = new THREE.AmbientLight(0x7a7358, 0.74);
  scene.add(ambient);

  // * Steel-blue rim/fill light — the arena is intentionally warm (yellowed wallpaper,
  // * beige carpet, warm fluorescents), which lets warm-neon carts (yellow/orange) blend
  // * into the backdrop. A single low-intensity cool DirectionalLight angled across the
  // * play space gives carts and the furniture pile a faint cool edge without lifting
  // * overall brightness or diluting the warm/liminal mood (kept clearly warm-dominant
  // * versus the 1.42 hemi + 0.74 ambient above). Not a key light — no shadows, no fog/
  // * material changes.
  // * Near-grazing angle (low height, lifted target) keeps the rim on vertical cart
  // * surfaces while the carpet's up-normal barely sees it — a steeper angle at 0.35
  // * intensity washed the whole carpet with a blue sheen that read as glowing.
  const coolRimLight = new THREE.DirectionalLight(0x7a8fc0, 0.2);
  coolRimLight.position.set(-ARENA_HALF * 0.6, 7, ARENA_HALF * 0.5);
  coolRimLight.target.position.set(ARENA_HALF * 0.3, 1.2, -ARENA_HALF * 0.2);
  scene.add(coolRimLight);
  scene.add(coolRimLight.target);

  // ===== Spawn booths (liminal office re-skin) =====
  const boothNeonMeshes = []; // * Intentionally empty — no rave neon to color-cycle.
  const boothColliderHandles = [];
  const booths = buildBackroomsBooths(scene, world, config, boothColliderHandles);

  // ===== Center furniture pile (Backrooms-only obstacle) =====
  const furniturePile = buildCenterFurniturePile(scene, world);
  const furnitureSpotlight = buildFurniturePileSpotlight(scene);
  let spotlightUpdateFn = furnitureSpotlight.update;
  let ceilingUpdateFn = ceiling.update;

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
    pitDressing.group, uncanny.group, doorways.group,
    furniturePile.group,
    furnitureSpotlight.spot, furnitureSpotlight.spot.target, furnitureSpotlight.fixture,
    hemiLight, ambient, coolRimLight, coolRimLight.target, spindleLight,
  ];

  const ownedGeometries = [
    floorGeo, ...voidGeometries, ...pit.geometries,
    ...walls.ownedGeometries, ...ceiling.ownedGeometries, ...booths.ownedGeometries,
    ...pitDressing.ownedGeometries, ...uncanny.ownedGeometries, ...doorways.ownedGeometries,
    ...furniturePile.ownedGeometries, ...furnitureSpotlight.ownedGeometries,
  ];
  const ownedMaterials = [
    floorMat, voidShaftMat, subRoomMats.floor, subRoomMats.glow, subRoomMats.silhouette,
    ...pit.materials,
    ...walls.ownedMaterials, ...ceiling.ownedMaterials, ...booths.ownedMaterials,
    ...pitDressing.ownedMaterials, ...uncanny.ownedMaterials, ...doorways.ownedMaterials,
    ...furniturePile.ownedMaterials, ...furnitureSpotlight.ownedMaterials,
  ];
  const ownedTextures = [
    carpetTex, subCarpetTex, wallpaperTex, ceilingTex, ...uncanny.ownedTextures,
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
    // * Neutralize the update closures so subsequent calls are no-ops,
    // * preventing any captured material references from being resurrected.
    spotlightUpdateFn = () => {};
    ceilingUpdateFn = () => {};

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

    if (world && floorBody && world.getRigidBody(floorBody.handle)) world.removeRigidBody(floorBody);
    for (const body of [...chamferBodies, ...containmentBodies]) {
      if (world && world.getRigidBody(body.handle)) world.removeRigidBody(body);
    }
    if (world && walls.wallBodies) {
      for (const body of walls.wallBodies) {
        if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
      }
    }
    if (world && ceiling.body && world.getRigidBody(ceiling.body.handle)) world.removeRigidBody(ceiling.body);
    if (world && booths.bodies) {
      for (const body of booths.bodies) {
        if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
      }
    }
    if (world && furniturePile.bodies) {
      for (const body of furniturePile.bodies) {
        if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
      }
    }

    if (scene) scene.fog = prevFog;
    config.record.centerHole = prevCenterHole;
    config.fall.yThreshold = prevFallYThreshold;
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
    update: (timeMs) => {
      spotlightUpdateFn(timeMs);
      ceilingUpdateFn(timeMs);
    },
    dispose,
  };
}
