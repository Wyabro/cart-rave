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
import { registerLevelLodNode } from "../utils/levelLod.js";
import { getQualityKnobs } from "../utils/qualityTiers.js";

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
// * Suction band width (meters) outside each void's floor lip — carts in it are pulled toward
// * the void (simulation.js applySquareHoleSuction). Also drives the danger-ring decal radius
// * and the NPC keep-out margins in aiHazards below. (playtest 2026-07-15)
const HOLE_SUCTION_BAND = 2.6;
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

// * Ceiling fixture grid — shared by buildCeiling() and floor light-pool baking.
const CEILING_FIXTURE_GRID = 5;
const CEILING_FIXTURE_SPAN = ARENA_HALF * 1.75; // meters
// * Missing-tile openings (world XZ). Floor drip stains bake under every entry.
const CEILING_GAP_SPOTS = [
  [-15, 24], [-24, 17], [-20, 9], [-6, 20], [10, -22], [26, -6], [4, 27.5],
];
const CEILING_SAG_SPOTS = [[-18, 13, 0.22], [8, 19, 0.16]];

// ===== Deterministic helpers =====

/**
 * Mulberry32-style seeded RNG so procedural textures match across clients / reloads.
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Deterministic fluorescent state for grid cell (gx, gz). Matches buildCeiling().
 * @param {number} gx
 * @param {number} gz
 * @returns {"lit" | "dimA" | "dimB" | "dead"}
 */
function getFixtureState(gx, gz) {
  const h = (gx * 7 + gz * 13) % 20;
  if (gx <= 1 && gz >= 3) return "dead";
  if (h < 4) return "dead";
  if (h < 9) return h % 2 === 0 ? "dimA" : "dimB";
  return "lit";
}

/**
 * @param {number} gx
 * @param {number} gz
 * @returns {{ x: number, z: number }}
 */
function fixtureWorldXZ(gx, gz) {
  const span = CEILING_FIXTURE_SPAN;
  const grid = CEILING_FIXTURE_GRID;
  return {
    x: -span / 2 + (gx + 0.5) * (span / grid),
    z: -span / 2 + (gz + 0.5) * (span / grid),
  };
}

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
      // * Cooler olive-khaki (less mustard) so cart neon pops against the carpet.
      // * Still dark enough that ceiling spots don't read as a glowing floor.
      ctx.fillStyle = lightTile ? "#7a7860" : "#6f6d57";
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
      grad.addColorStop(0, "rgba(35,30,18,0.06)");
      grad.addColorStop(1, "rgba(255,250,230,0.015)");
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
    ctx.fillStyle = "rgba(235,225,190,0.05)";
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
 * Classic Backrooms yellowed-wallpaper: mono-yellow base, soft damask dots, roll seams,
 * horizontal banding, and localized brown water-stain blotches (seeded, single-center).
 *
 * @returns {THREE.CanvasTexture}
 */
function buildWallpaperTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(0xb4c4a001);

  // * Slightly desaturated yellow — less competing with yellow/orange cart neon at wall height.
  ctx.fillStyle = "#a89a52";
  ctx.fillRect(0, 0, size, size);

  // Low-frequency damask / floral-ish dots.
  for (let y = 8; y < size; y += 16) {
    for (let x = 8; x < size; x += 16) {
      const ox = (Math.floor(y / 16) % 2) * 8;
      const px = x + ox;
      const pulse = 0.5 + 0.5 * Math.sin(px * 0.09) * Math.cos(y * 0.07);
      ctx.fillStyle = `rgba(105,88,32,${0.04 + pulse * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(px, y, 2.2 + pulse, 3.4 + pulse * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(175,155,70,${0.03 + pulse * 0.04})`;
      ctx.fillRect(px - 1, y - 4, 2, 8);
    }
  }

  // Vertical roll seams (~every 1–1.5m at tileM = 6).
  for (let x = 0; x <= size; x += 64) {
    ctx.strokeStyle = "rgba(95,78,28,0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size);
    ctx.stroke();
    ctx.strokeStyle = "rgba(210,190,100,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2.5, 0);
    ctx.lineTo(x + 2.5, size);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(150,130,70,0.1)";
  ctx.lineWidth = 1;
  for (let y = 0; y <= size; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }

  // Localized stains (single-center radials — not whole-canvas mud).
  for (let i = 0; i < 28; i += 1) {
    const r = 8 + rng() * 32;
    const sx = rng() * size;
    const sy = rng() * size;
    const grad = ctx.createRadialGradient(sx, sy, r * 0.12, sx, sy, r);
    grad.addColorStop(0, "rgba(70,50,20,0.2)");
    grad.addColorStop(0.45, "rgba(70,50,20,0.08)");
    grad.addColorStop(1, "rgba(70,50,20,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6; i += 1) {
    const sx = rng() * size;
    const len = 40 + rng() * 90;
    const grad = ctx.createLinearGradient(sx, 0, sx, len);
    grad.addColorStop(0, "rgba(55,42,18,0.18)");
    grad.addColorStop(1, "rgba(55,42,18,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(sx - 3 - rng() * 4, 0, 6 + rng() * 5, len);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Dropped-ceiling acoustic-tile texture with grout, pinhole speckle, and water rings.
 *
 * @returns {THREE.CanvasTexture}
 */
function buildCeilingTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(0xce11a001);

  ctx.fillStyle = "#cdc6ad";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i += 1) {
    ctx.fillStyle = `rgba(60,55,40,${0.04 + rng() * 0.05})`;
    ctx.fillRect(rng() * size, rng() * size, 1.5, 1.5);
  }

  for (let i = 0; i < 8; i += 1) {
    const sx = rng() * size;
    const sy = rng() * size;
    const r = 10 + rng() * 28;
    const grad = ctx.createRadialGradient(sx, sy, r * 0.15, sx, sy, r);
    grad.addColorStop(0, "rgba(90,72,40,0.14)");
    grad.addColorStop(0.5, "rgba(90,72,40,0.06)");
    grad.addColorStop(1, "rgba(90,72,40,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(70,55,30,0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
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

/**
 * Cheap cardboard / carton face for crates and shelf boxes.
 * @param {"cardboard" | "carton"} kind
 * @returns {THREE.CanvasTexture}
 */
function buildPropSurfaceTexture(kind) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(kind === "cardboard" ? 0xca2db0a5 : 0xca27001);

  if (kind === "cardboard") {
    ctx.fillStyle = "#c4a06a";
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 3) {
      ctx.fillStyle = `rgba(80,55,25,${0.04 + rng() * 0.05})`;
      ctx.fillRect(x, 0, 1, size);
    }
    ctx.strokeStyle = "rgba(220,205,160,0.55)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(12, 12);
    ctx.lineTo(size - 12, size - 12);
    ctx.moveTo(size - 12, 12);
    ctx.lineTo(12, size - 12);
    ctx.stroke();
    ctx.strokeStyle = "rgba(40,30,15,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, size - 12, size - 12);
  } else {
    ctx.fillStyle = "#d8d0b8";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(40,45,55,0.14)";
    ctx.fillRect(14, 18, size - 28, size - 44);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(20, 26, size - 40, 14);
    for (let i = 0; i < 18; i += 1) {
      const w = 1 + (rng() > 0.6 ? 2 : 0);
      ctx.fillStyle = "rgba(20,20,22,0.35)";
      ctx.fillRect(22 + i * 5, size - 36, w, 16);
    }
    for (let i = 0; i < 40; i += 1) {
      ctx.fillStyle = `rgba(50,40,25,${0.05 + rng() * 0.08})`;
      ctx.fillRect(rng() * size, rng() < 0.5 ? 0 : size - 3, 3 + rng() * 6, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Furniture surface maps — wood grain, fabric weave, painted metal, dark plastic.
 * Keeps the pile from reading as flat Lego bricks under the spotlight.
 *
 * @param {"wood" | "fabric" | "metal" | "plastic"} kind
 * @returns {THREE.CanvasTexture}
 */
function buildFurnitureTexture(kind) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(
    kind === "wood" ? 0xf00d0001
      : kind === "fabric" ? 0xfab70001
        : kind === "metal" ? 0x7e7a1001
          : 0xda700001,
  );

  if (kind === "wood") {
    ctx.fillStyle = "#7a5c38";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 48; i += 1) {
      const y = rng() * size;
      const wobble = 4 + rng() * 10;
      ctx.strokeStyle = `rgba(${40 + rng() * 30},${28 + rng() * 20},${12},${0.08 + rng() * 0.12})`;
      ctx.lineWidth = 1 + rng() * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.04 + i) * wobble * 0.15);
      }
      ctx.stroke();
    }
    // Knots
    for (let i = 0; i < 5; i += 1) {
      const sx = rng() * size;
      const sy = rng() * size;
      const r = 4 + rng() * 8;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, "rgba(50,32,14,0.35)");
      g.addColorStop(1, "rgba(50,32,14,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "fabric") {
    ctx.fillStyle = "#5a5048";
    ctx.fillRect(0, 0, size, size);
    // Weave grid
    for (let y = 0; y < size; y += 3) {
      ctx.fillStyle = `rgba(20,18,14,${0.06 + (y % 6 === 0 ? 0.05 : 0)})`;
      ctx.fillRect(0, y, size, 1);
    }
    for (let x = 0; x < size; x += 3) {
      ctx.fillStyle = `rgba(30,26,20,${0.05 + (x % 6 === 0 ? 0.04 : 0)})`;
      ctx.fillRect(x, 0, 1, size);
    }
    // Pilling / wear flecks
    for (let i = 0; i < 900; i += 1) {
      const v = 40 + Math.floor(rng() * 80);
      ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.04 + rng() * 0.06})`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
    }
    // Soft edge wear bands
    const band = ctx.createLinearGradient(0, 0, 0, size);
    band.addColorStop(0, "rgba(30,26,20,0.18)");
    band.addColorStop(0.15, "rgba(30,26,20,0)");
    band.addColorStop(0.85, "rgba(30,26,20,0)");
    band.addColorStop(1, "rgba(30,26,20,0.22)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, size, size);
  } else if (kind === "metal") {
    ctx.fillStyle = "#6e726c";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 1) {
      const a = 0.03 + rng() * 0.05;
      ctx.fillStyle = rng() < 0.5 ? `rgba(255,255,250,${a})` : `rgba(20,22,18,${a})`;
      ctx.fillRect(0, y, size, 1);
    }
    // Panel seam
    ctx.strokeStyle = "rgba(20,20,18,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, size - 16, size - 16);
    ctx.strokeStyle = "rgba(200,200,190,0.08)";
    ctx.strokeRect(10, 10, size - 20, size - 20);
    // Rivets
    for (const [rx, ry] of [[18, 18], [size - 18, 18], [18, size - 18], [size - 18, size - 18]]) {
      ctx.fillStyle = "rgba(40,42,38,0.4)";
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Dark plastic / monitor bezel
    ctx.fillStyle = "#2a2826";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 600; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.01 + rng() * 0.03})`;
      ctx.fillRect(rng() * size, rng() * size, 1, 1);
    }
    const edge = ctx.createLinearGradient(0, 0, size, size);
    edge.addColorStop(0, "rgba(255,255,255,0.06)");
    edge.addColorStop(0.5, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Painted wood for the shelf bays (STORE-PT-1). Replaces the old rack-steel map —
 * Wyatt's call: boards should read as painted warehouse wood, not detailed metal.
 * Authored at LOW spatial frequency: walls sit at 56 m, play floor ends at 38, so this
 * is never closer than ~18 m and fog has already eaten a quarter of it. Soft grain under
 * cream paint + light scuffs only; no punched slots, no rust bands. Tiles at 1 m square
 * via pushFadeBox's uvMeters. Separate from buildFurnitureTexture("wood") — that one is
 * raw brown prop-pile grain and must not be reused as-is for these boards.
 *
 * @returns {THREE.CanvasTexture}
 */
function buildShelfPaintedWoodTexture() {
  const size = 256;
  const rng = makeRng(0x5e1f5733);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Pale warehouse cream paint (not galvanised grey, not furniture brown).
  ctx.fillStyle = "#d8cfb8";
  ctx.fillRect(0, 0, size, size);

  // Soft horizontal grain under the paint — low contrast so it does not read as busy metal.
  for (let i = 0; i < 36; i += 1) {
    const y = rng() * size;
    const a = 0.03 + rng() * 0.06;
    ctx.strokeStyle = rng() < 0.5
      ? `rgba(90,72,48,${a})`
      : `rgba(255,250,238,${a})`;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.035 + i) * (2 + rng() * 3));
    }
    ctx.stroke();
  }

  // Light scuffs / edge wear — value only, no rust or chalk metal language.
  for (let i = 0; i < 18; i += 1) {
    const sx = 8 + rng() * (size - 16);
    const sy = 8 + rng() * (size - 16);
    const sw = 12 + rng() * 40;
    const sh = 2 + rng() * 5;
    ctx.fillStyle = `rgba(70,58,40,${0.04 + rng() * 0.07})`;
    ctx.fillRect(sx, sy, sw, sh);
  }
  for (let i = 0; i < 80; i += 1) {
    ctx.fillStyle = `rgba(50,42,30,${0.03 + rng() * 0.08})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Concrete pillar face: dusty base + faint pour seams + pore noise.
 * @returns {THREE.CanvasTexture}
 */
function buildConcreteTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(0xc0ec2e7e);

  ctx.fillStyle = "#9a9488";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i += 1) {
    const v = 70 + Math.floor(rng() * 50);
    ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.04 + rng() * 0.06})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let y = 40; y < size; y += 48 + Math.floor(rng() * 12)) {
    ctx.strokeStyle = "rgba(40,36,28,0.14)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rng() - 0.5) * 4);
    ctx.stroke();
    ctx.strokeStyle = "rgba(230,220,200,0.06)";
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(size, y + 2);
    ctx.stroke();
  }
  const dust = ctx.createLinearGradient(0, size * 0.55, 0, size);
  dust.addColorStop(0, "rgba(40,35,25,0)");
  dust.addColorStop(1, "rgba(40,35,25,0.22)");
  ctx.fillStyle = dust;
  ctx.fillRect(0, 0, size, size);

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

  // Soft worn-dark approach rings widen the hazard read beyond the sharp chamfer band —
  // voids and the floor edge announce themselves from a distance instead of appearing
  // as an abrupt line.
  const HOLE_APPROACH_W = 2.6; // meters — from the void lip
  const EDGE_APPROACH_W = 3.4; // meters — from the floor edge

  for (const h of HOLE_CENTERS) {
    const d = distToSquareHole(x, z, h.x, h.z);
    if (d <= HOLE_HALF) return 1;
    if (d < HOLE_HALF + HOLE_CHAMFER_W) {
      const t = 1 - (d - HOLE_HALF) / HOLE_CHAMFER_W;
      darken = Math.max(darken, t);
    } else if (d < HOLE_HALF + HOLE_APPROACH_W) {
      const t = 1 - (d - HOLE_HALF - HOLE_CHAMFER_W) / (HOLE_APPROACH_W - HOLE_CHAMFER_W);
      darken = Math.max(darken, 0.28 * smooth01(t));
    }
  }

  const edgeDist = distToArenaEdge(x, z);
  if (edgeDist < OUTER_CHAMFER_W) {
    const t = 1 - Math.max(0, edgeDist) / OUTER_CHAMFER_W;
    darken = Math.max(darken, t);
  } else if (edgeDist < EDGE_APPROACH_W) {
    const t = 1 - (edgeDist - OUTER_CHAMFER_W) / (EDGE_APPROACH_W - OUTER_CHAMFER_W);
    darken = Math.max(darken, 0.3 * smooth01(t));
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
 * Ceiling-gap drip stains on the carpet (0–1). Continues the water-damage story from
 * missing acoustic tiles down onto the play surface.
 *
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
function getCeilingDripFactor(x, z) {
  let best = 0;
  for (const [gx, gz] of CEILING_GAP_SPOTS) {
    const d = Math.hypot(x - gx, z - gz);
    // Soft blotch ~1.8m radius + faint elongated trail toward +X (gravity smear).
    const blotch = 1 - smooth01(d / 1.85);
    const trail = 1 - smooth01(Math.hypot(x - gx - 0.9, z - gz) / 2.4);
    best = Math.max(best, blotch, trail * 0.55);
  }
  for (const [sx, sz] of CEILING_SAG_SPOTS) {
    const d = Math.hypot(x - sx, z - sz);
    best = Math.max(best, (1 - smooth01(d / 1.4)) * 0.65);
  }
  return best;
}

/**
 * Soft fluorescent wash under lit/dim ceiling fixtures (0–1 brighten).
 *
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
function getLightPoolFactor(x, z) {
  let best = 0;
  for (let gx = 0; gx < CEILING_FIXTURE_GRID; gx += 1) {
    for (let gz = 0; gz < CEILING_FIXTURE_GRID; gz += 1) {
      const state = getFixtureState(gx, gz);
      if (state === "dead") continue;
      const { x: fx, z: fz } = fixtureWorldXZ(gx, gz);
      const d = Math.hypot(x - fx, z - fz);
      const radius = state === "lit" ? 5.8 : 4.2;
      const strength = state === "lit" ? 1 : 0.45;
      best = Math.max(best, (1 - smooth01(d / radius)) * strength);
    }
  }
  return best;
}

/**
 * Extra darkening under the dead fluorescent quadrant (−X / +Z).
 *
 * @param {number} x
 * @param {number} z
 * @returns {number} 0–1
 */
function getDeadZoneDarken(x, z) {
  // Approximate footprint of gx≤1, gz≥3 cells on the fixture grid.
  const nx = smooth01((-x - 4) / 18); // stronger toward −X
  const pz = smooth01((z - 4) / 18); // stronger toward +Z
  return nx * pz;
}

/**
 * Dark scuff rings approaching each corner void (0–1) — visual hazard telegraph + floor story.
 *
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
function getHoleApproachScuff(x, z) {
  let best = 0;
  for (const h of HOLE_CENTERS) {
    const d = Math.hypot(x - h.x, z - h.z);
    // Soft annulus just outside the hole lip.
    const ring = 1 - smooth01(Math.abs(d - (HOLE_HALF + 2.2)) / 1.6);
    const near = 1 - smooth01((d - HOLE_HALF) / 3.5);
    best = Math.max(best, ring * 0.85, near * 0.35);
  }
  return best;
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

  // Cooler khaki carpet tint (cart neon contrast) lerped toward worn concrete at hazard lips.
  // Kept dim so ceiling spots don't read as a glowing floor at close range.
  const baseR = 0.76;
  const baseG = 0.74;
  const baseB = 0.64;
  const lipR = 0.2;
  const lipG = 0.19;
  const lipB = 0.16;

  for (let j = 0; j <= cells; j += 1) {
    const gz = -ARENA_HALF + j * step;
    for (let i = 0; i <= cells; i += 1) {
      const gx = -ARENA_HALF + i * step;
      // * Snap vertices near a void boundary onto the exact hole edge (uniform Chebyshev
      // * scaling maps a point onto the square) so the opening is a crisp 8.5m square
      // * instead of a ragged grid-step outline with black bleeding past it.
      let x = gx;
      let z = gz;
      for (const h of HOLE_CENTERS) {
        const d = distToSquareHole(gx, gz, h.x, h.z);
        if (d > 0.001 && Math.abs(d - HOLE_HALF) < step * 0.75) {
          const k = (HOLE_HALF + 0.001) / d;
          x = h.x + (gx - h.x) * k;
          z = h.z + (gz - h.z) * k;
          break;
        }
      }
      const idx = j * verts + i;
      const surfaceY = getFloorSurfaceY(x, z);
      inVoid[idx] = surfaceY === null ? 1 : 0;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = surfaceY ?? FLOOR_BOTTOM_Y;
      positions[idx * 3 + 2] = z;
      uvs[idx * 2] = x / CARPET_TILE_M;
      uvs[idx * 2 + 1] = z / CARPET_TILE_M;
      const darken = getChamferDarkenFactor(x, z);
      // Traffic wear + ceiling drip + dead-zone murk + hole-approach scuffs, then light-pool lift.
      const wearMul = 1 - 0.14 * getTrafficWearFactor(x, z);
      const drip = getCeilingDripFactor(x, z);
      const dead = getDeadZoneDarken(x, z);
      const pool = getLightPoolFactor(x, z);
      const holeApproach = getHoleApproachScuff(x, z);
      const dripMul = 1 - 0.28 * drip;
      const deadMul = 1 - 0.14 * dead;
      const scuffMul = 1 - 0.12 * holeApproach;
      const poolMul = 1 + 0.09 * pool;
      const mul = wearMul * dripMul * deadMul * scuffMul * poolMul;
      // * Slight cool bias in light pools so warm carts get a cooler ground plate under them.
      colors[idx * 3] = (baseR * mul * (1 - 0.03 * pool)) * (1 - darken) + lipR * darken;
      colors[idx * 3 + 1] = (baseG * mul) * (1 - darken) + lipG * darken;
      colors[idx * 3 + 2] = (baseB * mul * (1 + 0.04 * pool)) * (1 - darken) + lipB * darken;
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
  // * Inner faces flush with the true hole edge — the visual shaft now hugs the opening
  // * (half ≈ 4.3), so ricochets must stay inside it or falling carts clip the walls.
  const shaftHalf = HOLE_HALF;
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
 * Builds one square corner void: black shaft + unique sub-room beat per hole.
 * Looking down (and falling in) should feel wrong in four different ways.
 *
 * Variants (by hole index):
 *   0 — shelf unit + pillar (classic liminal)
 *   1 — endless shelf corridor receding into black
 *   2 — floating dead cart silhouette (comedy horror)
 *   3 — broken escalator steps + lonely bright tube
 *
 * @param {number} cx Void center X.
 * @param {number} cz Void center Z.
 * @param {THREE.Material} shaftMat Shared black shaft material.
 * @param {{
 *   floor: THREE.Material,
 *   glow: THREE.Material,
 *   glowHot: THREE.Material,
 *   silhouette: THREE.Material,
 *   nearSilhouette: THREE.Material,
 * }} subRoomMats Shared sub-room materials.
 * @param {number} [variant=0] 0–3
 * @returns {{ group: THREE.Group, geometries: THREE.BufferGeometry[] }}
 */
function buildSquareVoid(cx, cz, shaftMat, subRoomMats, variant = 0) {
  const group = new THREE.Group();
  const geometries = [];
  const v = ((variant % 4) + 4) % 4;

  // Shaft hugs the opening: floor vertices snap onto the exact hole square (see
  // buildFloorGeometry), so the shaft only needs a small margin — and its top tucks
  // below the chamfer lip so black never bleeds over the carpet at grazing angles.
  const shaftOuter = HOLE_SIZE + 0.1;
  const shaftTopY = FLOOR_BOTTOM_Y + 0.01;
  const shaftGeo = new THREE.BoxGeometry(shaftOuter, HOLE_DEPTH, shaftOuter);
  geometries.push(shaftGeo);
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.set(cx, shaftTopY - HOLE_DEPTH / 2, cz);
  group.add(shaft);

  const bottomY = FLOOR_TOP_Y - HOLE_DEPTH;
  const inner = shaftOuter - 0.12;

  const subFloorGeo = new THREE.PlaneGeometry(inner, inner);
  geometries.push(subFloorGeo);
  const subFloor = new THREE.Mesh(subFloorGeo, subRoomMats.floor);
  subFloor.rotation.x = -Math.PI / 2;
  subFloor.position.set(cx, bottomY + 0.06, cz);
  group.add(subFloor);

  // --- Deep sub-room beats (visible during KO fall) ---
  if (v === 0) {
    const glowGeo = new THREE.PlaneGeometry(2.4, 0.16);
    geometries.push(glowGeo);
    const glow = new THREE.Mesh(glowGeo, subRoomMats.glow);
    glow.position.set(cx, bottomY + 3.4, cz - inner / 2 + 0.1);
    group.add(glow);

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
  } else if (v === 1) {
    // Endless aisle: stacked shelves receding toward −Z of the shaft.
    const shelfGeo = new THREE.BoxGeometry(2.8, 2.4, 0.45);
    geometries.push(shelfGeo);
    for (let i = 0; i < 5; i += 1) {
      const s = new THREE.Mesh(shelfGeo, subRoomMats.silhouette);
      const depth = -inner * 0.15 - i * 0.85;
      s.position.set(cx - 1.5 + (i % 2) * 3.0, bottomY + 1.2, cz + depth);
      s.scale.set(1, 1, 1 - i * 0.08);
      group.add(s);
    }
    const glowGeo = new THREE.PlaneGeometry(1.6, 0.12);
    geometries.push(glowGeo);
    const glow = new THREE.Mesh(glowGeo, subRoomMats.glow);
    glow.position.set(cx, bottomY + 4.2, cz - inner / 2 + 0.08);
    group.add(glow);
  } else if (v === 2) {
    // Floating dead cart — basket silhouette mid-shaft.
    const bodyGeo = new THREE.BoxGeometry(1.4, 0.85, 1.9);
    const basketGeo = new THREE.BoxGeometry(1.15, 0.55, 1.5);
    const wheelGeo = new THREE.BoxGeometry(0.22, 0.22, 0.08);
    geometries.push(bodyGeo, basketGeo, wheelGeo);
    const floatY = bottomY + 8.5;
    const body = new THREE.Mesh(bodyGeo, subRoomMats.silhouette);
    body.position.set(cx + 0.3, floatY, cz - 0.2);
    body.rotation.set(0.35, 0.6, 0.15);
    group.add(body);
    const basket = new THREE.Mesh(basketGeo, subRoomMats.nearSilhouette);
    basket.position.set(cx + 0.3, floatY + 0.35, cz - 0.2);
    basket.rotation.copy(body.rotation);
    group.add(basket);
    for (const [ox, oz] of [[-0.5, -0.7], [0.5, -0.7], [-0.5, 0.7], [0.5, 0.7]]) {
      const w = new THREE.Mesh(wheelGeo, subRoomMats.silhouette);
      w.position.set(cx + 0.3 + ox, floatY - 0.5, cz - 0.2 + oz);
      group.add(w);
    }
    const glowGeo = new THREE.PlaneGeometry(2.0, 0.14);
    geometries.push(glowGeo);
    const glow = new THREE.Mesh(glowGeo, subRoomMats.glow);
    glow.position.set(cx - inner / 2 + 0.1, floatY + 1.2, cz);
    glow.rotation.y = Math.PI / 2;
    group.add(glow);
  } else {
    // Broken escalator: staggered steps + one hot lonely tube.
    const stepGeo = new THREE.BoxGeometry(2.6, 0.22, 0.55);
    geometries.push(stepGeo);
    for (let i = 0; i < 7; i += 1) {
      const step = new THREE.Mesh(stepGeo, subRoomMats.silhouette);
      step.position.set(
        cx - 0.4,
        bottomY + 0.4 + i * 0.55,
        cz + 1.6 - i * 0.7,
      );
      step.rotation.x = -0.12;
      group.add(step);
    }
    const glowGeo = new THREE.PlaneGeometry(3.2, 0.22);
    geometries.push(glowGeo);
    const glow = new THREE.Mesh(glowGeo, subRoomMats.glowHot);
    glow.position.set(cx, bottomY + 5.5, cz - inner / 2 + 0.1);
    group.add(glow);
  }

  // Near-lip silhouettes — variant-tinted so looking *down* from play level previews the beat.
  const nearY = FLOOR_TOP_Y - 2.4;
  if (v === 0) {
    const nearShelfGeo = new THREE.BoxGeometry(1.15, 1.4, 0.45);
    const nearStubGeo = new THREE.BoxGeometry(0.55, 1.9, 0.55);
    geometries.push(nearShelfGeo, nearStubGeo);
    const nearShelf = new THREE.Mesh(nearShelfGeo, subRoomMats.nearSilhouette);
    nearShelf.position.set(cx + 1.4, nearY, cz - 1.1);
    nearShelf.rotation.y = -0.4;
    group.add(nearShelf);
    const nearStub = new THREE.Mesh(nearStubGeo, subRoomMats.nearSilhouette);
    nearStub.position.set(cx - 1.5, nearY - 0.2, cz + 1.3);
    group.add(nearStub);
  } else if (v === 1) {
    const nearShelfGeo = new THREE.BoxGeometry(1.3, 1.5, 0.4);
    geometries.push(nearShelfGeo);
    for (let i = 0; i < 3; i += 1) {
      const s = new THREE.Mesh(nearShelfGeo, subRoomMats.nearSilhouette);
      s.position.set(cx - 1.2 + i * 1.2, nearY - 0.1, cz - 0.8 - i * 0.35);
      group.add(s);
    }
  } else if (v === 2) {
    const cartGeo = new THREE.BoxGeometry(0.9, 0.55, 1.1);
    geometries.push(cartGeo);
    const cart = new THREE.Mesh(cartGeo, subRoomMats.nearSilhouette);
    cart.position.set(cx, nearY - 0.3, cz);
    cart.rotation.set(0.4, 0.5, 0.2);
    group.add(cart);
  } else {
    const stepGeo = new THREE.BoxGeometry(1.4, 0.18, 0.45);
    geometries.push(stepGeo);
    for (let i = 0; i < 3; i += 1) {
      const step = new THREE.Mesh(stepGeo, subRoomMats.nearSilhouette);
      step.position.set(cx, nearY - 0.5 - i * 0.35, cz + 0.6 - i * 0.4);
      group.add(step);
    }
  }

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
  // * Flush with the lip bottom — the old 0.08 gap showed a sliver of pit floor
  // * through the seam at grazing angles.
  const cliffTop = FLOOR_BOTTOM_Y;
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
function pushFadeBox(list, sx, sy, sz, px, py, pz, unitBox, baseRgb, uvMeters = 0) {
  _pushV.set(px, py, pz);
  _pushS.set(sx, sy, sz);
  _pushM.compose(_pushV, _pushQ.identity(), _pushS);
  const geo = unitBox.clone().applyMatrix4(_pushM);
  const pos = geo.attributes.position;

  // * World-scaled UVs. A unit-box clone keeps 0..1 UVs per face however big the box gets, so
  // * one shared map lands at wildly different physical sizes on a 0.16 m upright and a 114 m
  // * board. When uvMeters is given, rescale so one tile covers that many metres on every
  // * face. BoxGeometry face order is +X, -X, +Y, -Y, +Z, -Z, four verts each.
  if (uvMeters > 0 && geo.attributes.uv) {
    const uv = geo.attributes.uv;
    const spans = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let i = 0; i < uv.count; i += 1) {
      const [spanU, spanV] = spans[Math.min(5, Math.floor(i / 4))];
      uv.setXY(i, uv.getX(i) * (spanU / uvMeters), uv.getY(i) * (spanV / uvMeters));
    }
    uv.needsUpdate = true;
  }
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
 *   ownedTextures: THREE.Texture[],
 * }}
 */
function buildCenterFurniturePile(scene, world) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  // * Visual mound only — physics hull is fixed below. Scale furniture up for cart-relative
  // * size, pack placement inward so the obstacle silhouette stays about the same.
  const pileVisualGroup = new THREE.Group();
  pileVisualGroup.scale.setScalar(1);
  group.add(pileVisualGroup);

  // ~50% larger pieces than the old 0.85-group layout (1.5 / 0.85 ≈ 1.76× that look).
  // PACK pulls origins inward so pieces nest/overlap instead of floating in a sparse lattice.
  const PIECE_SCALE = 1.5;
  const PACK = 0.68;

  const parts = { wood: [], fabric: [], metal: [], dark: [] };

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

  // Piece-local → world transform (packed position + yaw/tilt/roll + uniform piece scale).
  const piece = (px, py, pz, yaw = 0, tilt = 0, roll = 0) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(px * PACK, py * PACK, pz * PACK),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, roll, "YXZ")),
      new THREE.Vector3(PIECE_SCALE, PIECE_SCALE, PIECE_SCALE),
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

  // ----- Messy stacked layout (chaotic, dense, ~6.5m tall) -----
  // Furniture only — no cardboard fill cubes (they read as bright Lego under the spot).

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
  chair(piece(-0.4, 0.0, 0.2, 0.5));
  chair(piece(1.0, 0.0, 0.0, -0.6));
  // Extra base furniture where crates used to bulk the footprint.
  chair(piece(3.0, 0.0, -0.3, 0.4));
  desk(piece(0.1, 0.0, -2.5, -0.2), 1.5, 0.9);

  // Mid layer (~0.8–1.8m) — resting on base tops, filling the gaps.
  couch(piece(0.6, 1.15, -0.5, 2.2, 0.14, 0.08), 2.4);
  desk(piece(-1.4, 1.0, 0.7, 0.2, -0.16, 0.1), 1.9, 1.0);
  desk(piece(1.5, 1.05, 1.3, 1.1, 0.1, -0.08), 1.7, 0.95);
  cabinet(piece(1.7, 1.1, 1.6, 1.1, 0.16, 0.0), 1.5);
  cabinet(piece(-1.9, 1.0, -1.1, 0.5, 0.12, 0.0), 1.2);
  chair(piece(-2.2, 0.85, -0.6, 0.6, 0.1, 0.2));
  chair(piece(2.3, 0.9, 0.2, 1.6, 0.08, 0.15));
  chair(piece(2.0, 1.15, -1.2, 0.5, 0.12, 0.1));
  desk(piece(-0.4, 1.15, 1.9, -0.4, 0.08, 0), 1.4, 0.85);
  cabinet(piece(0.7, 1.2, 1.1, 0.2, 0.1, 0), 1.0);
  chair(piece(-1.0, 1.2, -1.9, 0.7, 0.1, 0.15));

  // Upper layer (~1.9–3.4m).
  couch(piece(-0.7, 2.5, -0.5, 1.0, 0.18, 0.1), 2.0);
  desk(piece(0.4, 2.3, 0.8, 1.4, 0.22, -0.16), 1.7, 0.95);
  cabinet(piece(-1.3, 2.4, 1.0, 0.8, 0.35, 0.1), 1.2);
  cabinet(piece(1.4, 2.5, -0.7, 2.0, 0.28, 0.0), 1.1);
  chair(piece(1.2, 2.7, -0.5, 2.0, 0.28, 0.22));
  chair(piece(-1.0, 2.9, -0.2, -0.5, -0.18, 0.28));
  chair(piece(0.9, 2.6, 1.2, 0.9, 0.2, -0.2));
  desk(piece(-0.2, 2.9, -1.0, 0.2, 0.15, 0.1), 1.3, 0.8);
  chair(piece(0.0, 2.75, 0.1, 0.4, 0.2, 0.15));

  // Top layer (~3.5–5.0m).
  desk(piece(-0.2, 3.7, 0.2, 0.6, 0.24, 0.14), 1.6, 0.9);
  chair(piece(0.4, 4.1, 0.1, 0.7, 0.36, 0.28));
  chair(piece(-0.7, 4.0, -0.5, 1.8, -0.24, 0.3));
  cabinet(piece(0.7, 3.8, -0.6, 1.3, 0.4, 0.0), 1.0);
  chair(piece(-0.5, 4.2, -0.15, 0.5, 0.2, 0.1));
  monitor(piece(0.15, 4.0, 0.7, 0.3, 0.15, 0));

  // Peak (~5.0–6.5m).
  monitor(piece(0.1, 5.0, 0.2, 0.4, 0.18, 0.0));
  chair(piece(-0.3, 5.3, 0.1, 1.2, 0.45, 0.38));
  chair(piece(0.35, 5.35, -0.15, 0.6, 0.3, 0.2));

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
  const woodTex = buildFurnitureTexture("wood");
  woodTex.repeat.set(1.4, 1.4);
  const fabricTex = buildFurnitureTexture("fabric");
  fabricTex.repeat.set(2.2, 2.2);
  const metalTex = buildFurnitureTexture("metal");
  metalTex.repeat.set(1.1, 1.1);
  const plasticTex = buildFurnitureTexture("plastic");
  plasticTex.repeat.set(1.0, 1.0);

  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0xc4a06a,
    roughness: 0.88,
    metalness: 0.02,
    vertexColors: true,
  });
  const fabricMat = new THREE.MeshStandardMaterial({
    map: fabricTex,
    color: 0x9a9084,
    roughness: 0.97,
    metalness: 0.0,
    vertexColors: true,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    map: metalTex,
    color: 0xa8aca4,
    roughness: 0.72,
    metalness: 0.42,
    vertexColors: true,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    map: plasticTex,
    color: 0x6a6660,
    roughness: 0.9,
    metalness: 0.06,
    vertexColors: true,
  });

  /**
   * Bake height-based dirt into vertex colors so lower pile pieces read grimier.
   * Kept conservative at the top so the spotlight doesn't blow materials to white.
   * @param {THREE.BufferGeometry} geo
   */
  const bakePileWear = (geo) => {
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, y / 5.5));
      // 0.55 floor dirt → 0.88 peak (never full white under bloom).
      const dirt = 0.55 + 0.33 * t;
      colors[i * 3] = dirt * 0.96;
      colors[i * 3 + 1] = dirt * 0.92;
      colors[i * 3 + 2] = dirt * 0.86;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  };

  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [woodTex, fabricTex, metalTex, plasticTex];
  const mergeAdd = (bucket, mat) => {
    if (bucket.length === 0) return;
    const merged = BufferGeometryUtils.mergeGeometries(bucket, false);
    bucket.forEach((g) => g.dispose());
    bakePileWear(merged);
    ownedGeometries.push(merged);
    ownedMaterials.push(mat);
    pileVisualGroup.add(new THREE.Mesh(merged, mat));
  };

  mergeAdd(parts.wood, woodMat);
  mergeAdd(parts.fabric, fabricMat);
  mergeAdd(parts.metal, metalMat);
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
    ownedTextures,
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
  // * Hangs BELOW the tile plane. At CEILING_Y - 0.28 the emissive strip sat at y 14.22,
  // * strictly inside the dead ceiling panel for cell (2,2) — that panel is a 4.5 x 0.1 x 1.85
  // * box centred on the same y, and getFixtureState(2,2) resolves "dead" (h = 0), so the
  // * per-frame emissiveIntensity write below rendered to nobody while warm light pulsed onto
  // * the pile out of a burnt-out panel. Dropped clear of the grid; the panel stays dead,
  // * because a work light strung under a dead fixture is the better story.
  const fixtureY = CEILING_Y - 0.75;
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

  // * Housing + drop-stems, parented to the strip so the existing scene-removal entry for
  // * `fixture` tears them down too. U-CHANNEL: two sides and a top, no floor — the strip has
  // * to stay visible from below, which is the whole point of dropping it. Tone borrowed from
  // * the ceiling frame (0x3a382f); that material is scoped inside buildCeiling, so this is a
  // * new instance, tracked in ownedMaterials below.
  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x3a382f, roughness: 0.82, metalness: 0.12,
  });
  const housingTopGeo = new THREE.BoxGeometry(1.45, 0.04, 0.65);
  const housingSideGeo = new THREE.BoxGeometry(1.45, 0.16, 0.04);
  const stemGeo = new THREE.BoxGeometry(0.03, 0.31, 0.03);

  const housingTop = new THREE.Mesh(housingTopGeo, housingMat);
  housingTop.position.set(0, 0.09, 0);
  fixture.add(housingTop);
  for (const sz of [0.305, -0.305]) {
    const side = new THREE.Mesh(housingSideGeo, housingMat);
    side.position.set(0, 0.035, sz);
    fixture.add(side);
  }
  for (const sx of [0.5, -0.5]) {
    const stem = new THREE.Mesh(stemGeo, housingMat);
    stem.position.set(sx, 0.265, 0);
    fixture.add(stem);
  }

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
    ownedGeometries: [fixtureGeo, housingTopGeo, housingSideGeo, stemGeo],
    ownedMaterials: [fixtureMat, housingMat],
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
 *   ownedTextures: THREE.Texture[],
 * }}
 */
function buildWalls(scene, world, wallpaperTex) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  const baseboardParts = [];
  const voidLipParts = [];
  const pillarParts = [];
  const shelfWoodParts = [];
  const shelfBoxRedParts = [];
  const shelfBoxBlueParts = [];
  const shelfBoxBeigeParts = [];

  const group = new THREE.Group();
  const ownedGeometries = [];
  const ownedTextures = [];
  const wallBodies = [];
  const wallColliderHandles = [];

  // Drywall faces use the wallpaper texture directly (not merged, so UVs tile cleanly).
  // Dead-adjacent walls (−X / +Z) get a slightly murkier tint — local decay.
  const drywallMat = new THREE.MeshStandardMaterial({
    map: wallpaperTex, color: 0xe8e2c8, roughness: 0.96, metalness: 0.0,
    vertexColors: true, side: THREE.DoubleSide,
  });
  const drywallMatDead = drywallMat.clone();
  drywallMatDead.color.setHex(0xb8b090);
  const wallCenterY = (WALL_HEIGHT + WALL_BOTTOM_Y) / 2;
  const wallFullHeight = WALL_HEIGHT - WALL_BOTTOM_Y;
  const drywallGeo = buildWallpaperPlaneGeometry(WALL_SPAN, WALL_BOTTOM_Y, WALL_HEIGHT);
  ownedGeometries.push(drywallGeo);

  const concreteTex = buildConcreteTexture();
  concreteTex.repeat.set(1, 4);
  ownedTextures.push(concreteTex);
  const cartonTex = buildPropSurfaceTexture("carton");
  cartonTex.repeat.set(1, 1);
  ownedTextures.push(cartonTex);
  const shelfWoodTex = buildShelfPaintedWoodTexture();
  ownedTextures.push(shelfWoodTex);

  const pillarBaseRgb = /** @type {[number, number, number]} */ ([0.56, 0.54, 0.48]);
  // Pale painted-board vertex-color base — old steel fade [0.42,0.4,0.35] muddies cream paint.
  const shelfWoodBaseRgb = /** @type {[number, number, number]} */ ([0.82, 0.78, 0.68]);

  // All four walls get shelf language; sides 0/2 are full bays, 1/3 are sparse/broken.
  const FULL_SHELF_SIDES = new Set([0, 2]);
  const SPARSE_SHELF_SIDES = new Set([1, 3]);
  // +Z (0) and −X (3) face the dead fluorescent quadrant.
  const DEAD_SIDES = new Set([0, 3]);
  const SHELF_LEVELS_FULL = 5;
  const SHELF_LEVELS_SPARSE = 3;
  const SHELF_DEPTH = 2.0;
  // * One paint-wood tile per metre of real surface, so grain scale matches on a 0.16 m
  // * upright and on a 114 m board.
  const SHELF_UV_METERS = 1.0;
  const boardThickness = 0.12;
  const boxH = 0.9;
  const levelGapFull = (WALL_HEIGHT * 0.62 - 1.0) / SHELF_LEVELS_FULL;
  const levelGapSparse = (WALL_HEIGHT * 0.45 - 1.0) / SHELF_LEVELS_SPARSE;
  const SHELF_BOX_SPACING = 1.7;

  for (let side = 0; side < 4; side += 1) {
    const { toWorld, alongIsX } = wallFrame(side);
    const wDim = (along, depth) => (alongIsX ? [along, depth] : [depth, along]);

    // Drywall face (textured plane on the inner side, facing the room).
    {
      const mat = DEAD_SIDES.has(side) ? drywallMatDead : drywallMat;
      const wall = new THREE.Mesh(drywallGeo, mat);
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
    // Thicker void-lip band under the baseboard — reinforces the walls dropping into black.
    {
      const [sx, sz] = wDim(WALL_SPAN, 0.55);
      const lipH = 1.6;
      const [px, , pz] = toWorld(0, -lipH / 2, -(0.55 / 2 + WALL_DECOR_INSET));
      pushBox(voidLipParts, sx, lipH, sz, px, -lipH / 2, pz, unitBox);
    }

    // Concrete support pillars — full wall height, fading into the void at the pit floor.
    for (let a = -WALL_SPAN / 2 + 8; a <= WALL_SPAN / 2 - 8; a += 16) {
      const [sx, sz] = wDim(1.3, 1.3);
      const [px, py, pz] = toWorld(a, wallCenterY, -(1.3 / 2 + WALL_DECOR_INSET));
      pushFadeBox(pillarParts, sx, wallFullHeight, sz, px, py, pz, unitBox, pillarBaseRgb);
    }

    // Aged store-shelf bays — full density on two walls, sparse/broken on the other two.
    const fullBay = FULL_SHELF_SIDES.has(side);
    const sparseBay = SPARSE_SHELF_SIDES.has(side);
    if (fullBay || sparseBay) {
      const shelfLevels = fullBay ? SHELF_LEVELS_FULL : SHELF_LEVELS_SPARSE;
      const levelGap = fullBay ? levelGapFull : levelGapSparse;
      const shelfDepth = fullBay ? SHELF_DEPTH : SHELF_DEPTH * 0.75;
      const shelfCenterOut = -(shelfDepth / 2 + WALL_DECOR_INSET);
      const uprightStep = fullBay ? SHELF_BOX_SPACING * 3 : SHELF_BOX_SPACING * 4.5;
      const skipThreshold = fullBay ? 3 : 6; // sparse: more empty slots

      // Vertical uprights — full height, void fade at bottom.
      for (let a = -WALL_SPAN / 2 + 6; a <= WALL_SPAN / 2 - 6; a += uprightStep) {
        const [sx, sz] = wDim(0.16, shelfDepth);
        const [px, py, pz] = toWorld(a, wallCenterY, shelfCenterOut);
        pushFadeBox(shelfWoodParts, sx, wallFullHeight, sz, px, py, pz, unitBox, shelfWoodBaseRgb, SHELF_UV_METERS);
      }

      // Horizontal boards + faded product boxes per level.
      for (let lvl = 0; lvl < shelfLevels; lvl += 1) {
        const boardY = 1.0 + lvl * levelGap;
        const [bsx, bsz] = wDim(WALL_SPAN - 10, shelfDepth);
        const [bpx, bpy, bpz] = toWorld(0, boardY, shelfCenterOut);
        pushFadeBox(shelfWoodParts, bsx, boardThickness, bsz, bpx, bpy, bpz, unitBox, shelfWoodBaseRgb, SHELF_UV_METERS);

        const boxY = boardY + boardThickness / 2 + boxH / 2;
        for (let a = -WALL_SPAN / 2 + 7; a <= WALL_SPAN / 2 - 7; a += SHELF_BOX_SPACING) {
          // Leave gaps so shelves read as half-empty / abandoned.
          // * TRUE modulo, not `%`. `a` starts negative (-WALL_SPAN/2 + 7), so for the
          // * whole first half of every wall the expression went negative — and JS `%`
          // * keeps the dividend's sign, so `negative < skipThreshold` was ALWAYS true.
          // * Those slots were unstockable at any threshold: ~40% of every wall came out
          // * empty in a pinwheel (the sign flips with both `a` and `side`), which reads
          // * as a bug, not as abandonment. skipThreshold is only meaningful over 0..9.
          const slotHash = (((lvl * 7 + Math.round(a) * 13 + side * 41) % 10) + 10) % 10;
          if (slotHash < skipThreshold) continue;
          const [sx, sz] = wDim(1.1, fullBay ? 0.95 : 0.7);
          const [px, py, pz] = toWorld(a, boxY, shelfCenterOut + 0.15);
          // * Same trap as slotHash above, on the colour hash: `%` kept the dividend's sign,
          // * so wherever `lvl + Math.round(a)` went negative the result was 0/-1/-2 and only
          // * 0 matched red — every negative remainder fell through to beige, so blue cartons
          // * were absent from all but a narrow band of every wall (SHELF-PICK-1).
          const pick = (((lvl + Math.round(a)) % 3) + 3) % 3;
          const list = pick === 0
            ? shelfBoxRedParts
            : pick === 1 ? shelfBoxBlueParts : shelfBoxBeigeParts;
          pushBox(list, sx, boxH, sz, px, py, pz, unitBox);
        }
      }

      // Sparse walls: one slumped endcap as a human anomaly (must use pushFadeBox so
      // shelfWoodParts keep matching vertex-color attributes for merge).
      if (sparseBay) {
        const tipA = side === 1 ? -18 : 14;
        const [tsx, tsz] = wDim(0.95, shelfDepth * 0.9);
        const [tpx, , tpz] = toWorld(tipA, 1.1, shelfCenterOut + 0.4);
        pushFadeBox(shelfWoodParts, tsx, 0.14, tsz, tpx, 1.1, tpz, unitBox, shelfWoodBaseRgb, SHELF_UV_METERS);
        pushBox(shelfBoxBeigeParts, 0.9, 0.7, 0.7, tpx, 0.55, tpz + (alongIsX ? 0.3 : 0), unitBox);
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
  const voidLipMat = new THREE.MeshStandardMaterial({
    color: 0x12110f, roughness: 0.95, metalness: 0.0,
  });
  const pillarMat = new THREE.MeshStandardMaterial({
    map: concreteTex,
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0.0,
    vertexColors: true,
  });
  const shelfWoodMat = new THREE.MeshStandardMaterial({
    map: shelfWoodTex,
    bumpMap: shelfWoodTex,
    bumpScale: 0.006,
    color: 0xffffff, roughness: 0.92, metalness: 0.02, vertexColors: true,
  });
  const shelfRedMat = new THREE.MeshStandardMaterial({
    map: cartonTex, color: 0xb56a5c, roughness: 0.88, metalness: 0.05,
  });
  const shelfBlueMat = new THREE.MeshStandardMaterial({
    map: cartonTex, color: 0x6a7a90, roughness: 0.88, metalness: 0.05,
  });
  const shelfBeigeMat = new THREE.MeshStandardMaterial({
    map: cartonTex, color: 0xc4b998, roughness: 0.9, metalness: 0.03,
  });

  const ownedMaterials = [
    drywallMat, drywallMatDead, baseboardMat, voidLipMat, pillarMat,
    shelfWoodMat, shelfRedMat, shelfBlueMat, shelfBeigeMat,
  ];

  const mergeAdd = (parts, mat) => {
    if (parts.length === 0) return;
    const merged = BufferGeometryUtils.mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(merged, mat));
    ownedGeometries.push(merged);
  };

  mergeAdd(baseboardParts, baseboardMat);
  mergeAdd(voidLipParts, voidLipMat);
  mergeAdd(pillarParts, pillarMat);
  mergeAdd(shelfWoodParts, shelfWoodMat);
  mergeAdd(shelfBoxRedParts, shelfRedMat);
  mergeAdd(shelfBoxBlueParts, shelfBlueMat);
  mergeAdd(shelfBoxBeigeParts, shelfBeigeMat);

  scene.add(group);
  return {
    group, wallBodies, wallColliderHandles, ownedGeometries, ownedMaterials, ownedTextures,
  };
}

// ===== Pit-ring dressing (the store continues, abandoned) =====

/**
 * Fills the fog-readable band of the surrounding pit (just past the floor edge) with a
 * sparse set of abandoned-storage silhouettes: one shelf-gondola row per side receding
 * into the fog, two shrink-wrapped pallet clumps, and exactly one dead checkout lane —
 * the 90/10 rule: machine-repeated dressing with a single human anomaly. Every
 * silhouette is backed by a cuboid collider (launched carts hit them instead of
 * ghosting through), vertex-color faded to black below the lip via pushFadeBox, and
 * merged into ONE draw call.
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
function buildPitRingDressing(scene, world) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const group = new THREE.Group();
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];

  const OUT = 45.5; // meters — band center: pushed back from the floor edge (38), inside the walls (56)
  const BOTTOM = -16; // meters — silhouettes fade to near-black by here, melting into the pit
  // True silhouettes — dark enough that they read as shapes in the fog, not lit walls.
  const gondolaRgb = /** @type {[number, number, number]} */ ([0.17, 0.165, 0.15]);
  const palletRgb = /** @type {[number, number, number]} */ ([0.20, 0.22, 0.26]);
  const checkoutRgb = /** @type {[number, number, number]} */ ([0.15, 0.145, 0.135]);
  const registerRgb = /** @type {[number, number, number]} */ ([0.40, 0.36, 0.29]);

  // Colliders for every silhouette — a launched cart hits them instead of ghosting
  // through. One fixed body; cuboids reach down to the pit so nothing can slip under.
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  const addCollider = (hx, topY, hz, px, pz) => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, (topY - PIT_FLOOR_Y) / 2, hz)
        .setTranslation(px, (topY + PIT_FLOOR_Y) / 2, pz)
        .setFriction(0.4)
        .setRestitution(0.3),
      body,
    );
  };

  for (let side = 0; side < 4; side += 1) {
    const { toWorld, alongIsX } = wallFrame(side);
    const o = OUT - WALL_HALF; // negative — toward the room center
    const dim = (along, radial) => (alongIsX ? [along, radial] : [radial, along]);

    // One shelf-gondola row per side, long axis radial (receding into the fog).
    {
      const [sx, sz] = dim(1.15, 9);
      const topY = 2.0;
      const [px, , pz] = toWorld(-4, 0, o);
      pushFadeBox(parts, sx, topY - BOTTOM, sz, px, (topY + BOTTOM) / 2, pz, unitBox, gondolaRgb);
      addCollider(sx / 2, topY, sz / 2, px, pz);
    }

    // Pallet clumps on two sides only; the checkout lane owns side 1.
    if (side === 0 || side === 2) {
      const [px, , pz] = toWorld(30, 0, o);
      const [s1x, s1z] = dim(1.25, 1.25);
      pushFadeBox(parts, s1x, 1.3 - BOTTOM, s1z, px, (1.3 + BOTTOM) / 2, pz, unitBox, palletRgb);
      const [s2x, s2z] = dim(1.1, 1.1);
      pushFadeBox(parts, s2x, 1.1, s2z, px, 1.3 + 0.55, pz, unitBox, palletRgb);
      addCollider(s1x / 2, 2.4, s1z / 2, px, pz);
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
    addCollider(1.6, 1.5, 0.4, cx, cz);
    // Slumped queue stanchion leaning against the conveyor.
    const stanchion = unitBox.clone();
    stanchion.scale(0.08, 1.1, 0.08);
    stanchion.rotateZ(0.55);
    stanchion.translate(cx + 1.9, 0.45, cz + 0.3);
    const stanchionColors = new Float32Array(stanchion.attributes.position.count * 3);
    stanchionColors.fill(0.18);
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
  return { group, bodies: [body], ownedGeometries: [merged], ownedMaterials: [mat] };
}

// ===== Quiet uncanny details (EXIT to nowhere, stopped clock, painted arrows) =====

/**
 * Quiet wrongnesses: a failing EXIT on a freestanding post (readable in match) plus a
 * few faded carpet arrows at the edge band. Keeps the hole-side set clean.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @returns {{
 *   group: THREE.Group,
 *   bodies: object[],
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 *   ownedTextures: THREE.Texture[],
 * }}
 */
function buildUncannyDetails(scene, world) {
  const group = new THREE.Group();
  const bodies = [];
  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [];
  const arrowRng = makeRng(0xa2207001);

  // * The freestanding EXIT sign + post were removed entirely (run-5: "exit sign on
  // * storerooms needs to be removed"). History: it originally lived on drivable
  // * carpet with a collider and wedged carts (playtest 2026-07-15), was demoted to
  // * background dressing past the floor edge, and never earned its keep.

  // Faded painted arrows on the carpet edge band (away from the EXIT hole).
  const arrowCanvas = document.createElement("canvas");
  arrowCanvas.width = 128;
  arrowCanvas.height = 128;
  {
    const ctx = arrowCanvas.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(232,228,214,0.9)";
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
      ctx.arc(arrowRng() * 128, arrowRng() * 128, 2 + arrowRng() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  const arrowTex = new THREE.CanvasTexture(arrowCanvas);
  ownedTextures.push(arrowTex);
  const arrowGeo = new THREE.PlaneGeometry(1.45, 1.45);
  const arrowMat = new THREE.MeshStandardMaterial({
    map: arrowTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  ownedGeometries.push(arrowGeo);
  ownedMaterials.push(arrowMat);

  const arrowSpots = [
    [33.5, 6, Math.PI / 2],
    [-8, 33.5, 0],
    [27, 27, Math.PI + Math.PI / 4],
  ];
  for (const [ax, az, yaw] of arrowSpots) {
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = yaw;
    arrow.position.set(ax, 0.02, az);
    group.add(arrow);
  }

  scene.add(group);
  return { group, bodies, ownedGeometries, ownedMaterials, ownedTextures };
}

// ===== Floor storytelling decals (play surface only) =====

/**
 * World-space carpet decals: wet patches under ceiling gaps, caster tracks toward voids,
 * and faded hazard tape near hole lips. Pure visual, no physics.
 *
 * @param {THREE.Scene} scene
 * @returns {{
 *   group: THREE.Group,
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[],
 *   ownedTextures: THREE.Texture[],
 * }}
 */
function buildFloorStoryDecals(scene) {
  const group = new THREE.Group();
  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [];

  // --- Wet blotch texture (soft dark stain) ---
  const wetCanvas = document.createElement("canvas");
  wetCanvas.width = wetCanvas.height = 128;
  {
    const ctx = wetCanvas.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, "rgba(28, 32, 40, 0.55)");
    g.addColorStop(0.45, "rgba(35, 40, 48, 0.28)");
    g.addColorStop(1, "rgba(35, 40, 48, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const wetTex = new THREE.CanvasTexture(wetCanvas);
  ownedTextures.push(wetTex);
  const wetMat = new THREE.MeshBasicMaterial({
    map: wetTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  ownedMaterials.push(wetMat);
  const wetGeo = new THREE.PlaneGeometry(3.2, 3.2);
  ownedGeometries.push(wetGeo);

  for (const [gx, gz] of CEILING_GAP_SPOTS) {
    // Only stains on the play floor (inside arena half).
    if (Math.abs(gx) > ARENA_HALF - 2 || Math.abs(gz) > ARENA_HALF - 2) continue;
    if (getFloorSurfaceY(gx, gz) === null) continue;
    const m = new THREE.Mesh(wetGeo, wetMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(gx, 0.018, gz);
    m.scale.set(0.85 + (Math.abs(gx) % 3) * 0.08, 1, 0.9 + (Math.abs(gz) % 2) * 0.1);
    group.add(m);
  }

  // --- Caster wheel tracks (thin dark strips between center and holes) ---
  const trackMat = new THREE.MeshBasicMaterial({
    color: 0x1a1814,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  ownedMaterials.push(trackMat);
  const trackGeo = new THREE.PlaneGeometry(1, 1);
  ownedGeometries.push(trackGeo);

  const trackPaths = [
    { x0: 0, z0: 6, x1: HOLE_CENTER - 5, z1: HOLE_CENTER - 5 },
    { x0: 0, z0: -6, x1: -HOLE_CENTER + 5, z1: -HOLE_CENTER + 5 },
    { x0: 8, z0: 0, x1: HOLE_CENTER - 5, z1: -HOLE_CENTER + 5 },
    { x0: -8, z0: 0, x1: -HOLE_CENTER + 5, z1: HOLE_CENTER - 5 },
  ];
  for (const p of trackPaths) {
    const mx = (p.x0 + p.x1) / 2;
    const mz = (p.z0 + p.z1) / 2;
    const dx = p.x1 - p.x0;
    const dz = p.z1 - p.z0;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    // Twin wheel ruts.
    for (const side of [-0.35, 0.35]) {
      const m = new THREE.Mesh(trackGeo, trackMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = yaw;
      m.position.set(mx + Math.cos(yaw) * side, 0.015, mz - Math.sin(yaw) * side);
      m.scale.set(0.14, 1, len);
      group.add(m);
    }
  }

  // --- Hazard tape chevrons near each hole lip (yellow/black stripe plane) ---
  const tapeCanvas = document.createElement("canvas");
  tapeCanvas.width = 128;
  tapeCanvas.height = 32;
  {
    const ctx = tapeCanvas.getContext("2d");
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#c9a010" : "#1a1810";
      ctx.fillRect(i * 16, 0, 16, 32);
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 128, 32);
  }
  const tapeTex = new THREE.CanvasTexture(tapeCanvas);
  tapeTex.wrapS = THREE.RepeatWrapping;
  tapeTex.repeat.set(2, 1);
  ownedTextures.push(tapeTex);
  const tapeMat = new THREE.MeshBasicMaterial({
    map: tapeTex,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  ownedMaterials.push(tapeMat);
  const tapeGeo = new THREE.PlaneGeometry(2.4, 0.35);
  ownedGeometries.push(tapeGeo);

  // * Square voids: a circular offset from the hole center still lands INSIDE the square
  // * (Chebyshev edge is HOLE_HALF·√2 along the diagonal). Step axis-aligned past the
  // * hole half-extent + chamfer lip onto flat carpet, on the two faces toward center.
  const tapeClear = HOLE_HALF + HOLE_CHAMFER_W + 0.45;
  for (const h of HOLE_CENTERS) {
    const sx = Math.sign(h.x) || 1;
    const sz = Math.sign(h.z) || 1;
    // West/east inward face (strip runs along Z) + south/north inward face (along X).
    const faces = [
      { tx: h.x - sx * tapeClear, tz: h.z, yaw: Math.PI / 2 },
      { tx: h.x, tz: h.z - sz * tapeClear, yaw: 0 },
    ];
    for (const f of faces) {
      const surfaceY = getFloorSurfaceY(f.tx, f.tz);
      if (surfaceY === null) continue; // still in a void — skip
      const m = new THREE.Mesh(tapeGeo, tapeMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = f.yaw;
      m.position.set(f.tx, surfaceY + 0.02, f.tz);
      group.add(m);
    }
  }

  scene.add(group);
  return { group, ownedGeometries, ownedMaterials, ownedTextures };
}

// ===== Doorways to nowhere =====

/**
 * Shallow fake doorways on the walls: two dark openings — one with a
 * single dim hallway light strip receding inside — and one that has been wallpapered
 * over with only the frame left. Implies the maze continues and this room is one cell
 * of many. Pure visuals on the far side of the pit; nothing collides.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Texture} wallpaperTex Shared wallpaper map for the sealed door fill.
 * @returns {{ group: THREE.Group, ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[] }}
 */
function buildDoorways(scene, wallpaperTex) {
  const group = new THREE.Group();

  // Human-scale openings (~2× previous) — commercial door proportions at distance.
  const openW = 2.3;
  const openH = 4.4;
  const jambT = 0.18;
  const headerH = 0.2;
  const frameDepth = 0.12;
  const jambHalf = openW / 2 + jambT * 0.35;

  const openingGeo = new THREE.PlaneGeometry(openW, openH);
  const stripGeo = new THREE.PlaneGeometry(0.12, openH * 0.88);
  const jambGeo = new THREE.BoxGeometry(jambT, openH + headerH * 0.5, frameDepth);
  const headerGeo = new THREE.BoxGeometry(openW + jambT * 2.2, headerH, frameDepth);

  const openingMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
  // Sealed fill uses the real wallpaper so it doesn't read as a different material.
  const sealedMat = new THREE.MeshStandardMaterial({
    map: wallpaperTex,
    color: 0xd4c48a,
    roughness: 0.96,
    metalness: 0.0,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.85 });
  // Warm fluorescent strip — MeshBasic so it punches through fog as a "hallway continues".
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });

  const ownedGeometries = [openingGeo, stripGeo, jambGeo, headerGeo];
  const ownedMaterials = [openingMat, sealedMat, frameMat, stripMat];

  // [side, along, variant] — sides 1 (-Z) and 3 (-X) are the plain drywall walls.
  /** @type {Array<[number, number, "lit" | "sealed" | "dark"]>} */
  const doors = [
    [3, 6, "lit"], // dark opening with a dim hallway strip inside
    [1, -18, "sealed"], // wallpapered over, frame left behind
    [1, 26, "dark"], // plain dark opening
  ];

  const midY = openH / 2;
  for (const [side, along, variant] of doors) {
    const { toWorld } = wallFrame(side);
    const faceYaw = side === 1 ? 0 : Math.PI / 2; // plane normal toward the room
    const doorGroup = new THREE.Group();

    // * Offsets sit proud of the protruding baseboard strip so the doorway
    // * cuts through it visually instead of being half-buried behind it.
    const opening = new THREE.Mesh(openingGeo, variant === "sealed" ? sealedMat : openingMat);
    const [ox, , oz] = toWorld(along, 0, -0.34);
    opening.position.set(ox, midY, oz);
    opening.rotation.y = faceYaw;
    doorGroup.add(opening);

    if (variant === "lit") {
      const strip = new THREE.Mesh(stripGeo, stripMat);
      const [sx, , sz] = toWorld(along + openW * 0.32, 0, -0.36);
      strip.position.set(sx, midY, sz);
      strip.rotation.y = faceYaw;
      doorGroup.add(strip);
    }

    for (const jambOff of [-jambHalf, jambHalf]) {
      const jamb = new THREE.Mesh(jambGeo, frameMat);
      const [jx, , jz] = toWorld(along + jambOff, 0, -0.38);
      jamb.position.set(jx, midY + headerH * 0.15, jz);
      jamb.rotation.y = faceYaw;
      doorGroup.add(jamb);
    }
    const header = new THREE.Mesh(headerGeo, frameMat);
    const [hx, , hz] = toWorld(along, 0, -0.38);
    header.position.set(hx, openH + headerH * 0.35, hz);
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
 *   spots: Array<{ gx: number, gz: number, light: THREE.SpotLight }>,
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

  // * Collected for applyQualityTier() (initBackroomsSupermarket) — the panel meshes
  // * below are baked into per-state merged meshes and stay glowing regardless of which
  // * of these lights end up enabled, so budgeting this array never dims the ceiling look.
  /** @type {Array<{ gx: number, gz: number, light: THREE.SpotLight }>} */
  const spots = [];

  const grid = CEILING_FIXTURE_GRID;
  const span = CEILING_FIXTURE_SPAN;
  const fixtureY = CEILING_Y - 0.22;
  // * Soft cones aimed lower so faint elliptical pools land on carpet without hotspots.
  const spotIntensity = 11;
  const spotDistance = 34;
  const spotAngle = Math.PI / 4.8;
  const spotPenumbra = 0.82;
  const spotDecay = 2.25;
  const spotTargetY = 1.6;
  for (let gx = 0; gx < grid; gx += 1) {
    for (let gz = 0; gz < grid; gz += 1) {
      const { x: px, z: pz } = fixtureWorldXZ(gx, gz);

      // Deterministic state: ~1 in 5 dead, ~1 in 4 dimmed, rest lit — EXCEPT one fully
      // dead 2×2 corner quadrant (see getFixtureState).
      const state = getFixtureState(gx, gz);

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
        spots.push({ gx, gz, light: spot });
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
  // Water-stained sag tiles — tea-brown, matches ceiling texture rings.
  const sagMat = new THREE.MeshStandardMaterial({
    color: 0x7a6a48, roughness: 0.96, metalness: 0.0,
  });
  ownedMaterials.push(gapMat, sagMat);

  /** @type {THREE.BufferGeometry[]} */
  const gapParts = [];
  /** @type {THREE.BufferGeometry[]} */
  const sagParts = [];

  // Tile-gap positions (shared with floor drip baking); first hosts the exhaust fan.
  const gapSpots = CEILING_GAP_SPOTS;
  const gapQuad = new THREE.PlaneGeometry(1.9, 1.9);
  const cableGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
  for (let i = 0; i < gapSpots.length; i += 1) {
    const [gx2, gz2] = gapSpots[i];
    const gq = gapQuad.clone();
    gq.rotateX(Math.PI / 2); // face down
    // Sit clearly below the acoustic plane — coplanar black quads z-fought and flashed.
    gq.translate(gx2, CEILING_Y - 0.08, gz2);
    gapParts.push(gq);
    // Exposed grid rim around the opening (reads as the tile having been removed).
    const rimOffsets = [
      [0, 1.02, 2.1, 0.1], [0, -1.02, 2.1, 0.1], [1.02, 0, 0.1, 2.1], [-1.02, 0, 0.1, 2.1],
    ];
    for (const [ox, oz, sx, sz] of rimOffsets) {
      const rim = new THREE.BoxGeometry(sx, 0.06, sz);
      rim.translate(gx2 + ox, CEILING_Y - 0.06, gz2 + oz);
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
  // Material tint matches ceiling texture water rings (same leak story).
  for (const [sx2, sz2, sag] of CEILING_SAG_SPOTS) {
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

  // ----- Hero light moments (2–3 fixtures with personality beyond the even grid wash) -----
  // * Cool leak under a ceiling gap — cart-edge highlight + wet-stain story.
  const [heroGapX, heroGapZ] = gapSpots[2] ?? [-20, 9];
  const heroCool = new THREE.PointLight(0x9eb8d8, 9, 16, 2);
  heroCool.position.set(heroGapX, CEILING_Y - 0.6, heroGapZ);
  group.add(heroCool);

  // * Sick buzzing tube near dead quadrant — irregular flicker in update().
  const heroBuzz = new THREE.PointLight(0xffe2a8, 16, 20, 2);
  heroBuzz.position.set(-12, fixtureY - 0.2, 18);
  group.add(heroBuzz);

  // * Lone green-sick spill opposite the dead corner (uncanny supermarket fluorescent).
  const heroSick = new THREE.PointLight(0xb8c9a0, 7, 14, 2);
  heroSick.position.set(18, fixtureY - 0.25, -14);
  group.add(heroSick);

  // ----- Per-frame ceiling life: fan rotation + out-of-sync dim-panel flicker + hero buzz.
  const FAN_RAD_PER_SEC = (Math.PI * 2) / 5.2;
  function update(timeMs) {
    const t = timeMs * 0.001;
    fanGroup.rotation.y = t * FAN_RAD_PER_SEC;
    // Arrhythmic slow LFOs (incommensurate frequencies) with rare near-dropouts.
    const a = 0.82 + 0.18 * Math.sin(t * 0.9) * Math.sin(t * 0.53 + 1.7);
    const b = 0.85 + 0.15 * Math.sin(t * 0.71 + 4.2) * Math.sin(t * 0.41);
    dimMatA.emissiveIntensity = 0.41 * (Math.sin(t * 0.161) > 0.997 ? 0.12 : a);
    dimMatB.emissiveIntensity = 0.41 * (Math.sin(t * 0.127 + 2.1) > 0.997 ? 0.12 : b);
    // * Hero buzz: mostly stable, occasional hard brownout.
    const buzz =
      Math.sin(t * 0.37) > 0.992
        ? 0.15
        : 0.88 + 0.12 * Math.sin(t * 11.3) * Math.sin(t * 3.7 + 0.4);
    heroBuzz.intensity = 16 * buzz;
    heroCool.intensity = 8 + 2 * Math.sin(t * 0.55);
    heroSick.intensity = 6.5 + 1.5 * Math.sin(t * 0.8 + 2.0);
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
  return { group, body: ceilingBody, ownedGeometries, ownedMaterials, update, spots };
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
 *   ownedTextures: THREE.Texture[],
 * }}
 */
/**
 * STORE-DECK-1 — worn mezzanine plate for spawn booth slabs (art-audit item 6).
 * Same canvas-as-map+bump idiom as the carpet floor. The stripe is its own mesh
 * (BoxGeometry UVs would stamp it on every face).
 * @returns {THREE.CanvasTexture}
 */
function buildBoothDeckTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = makeRng(0xdec7b007);

  // Cool industrial plate base (drab — carts neon-pop against it).
  ctx.fillStyle = "#6e6a60";
  ctx.fillRect(0, 0, size, size);

  // Plate panel seams (2×2 plates).
  const half = size / 2;
  ctx.strokeStyle = "rgba(30,28,22,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, size);
  ctx.moveTo(0, half);
  ctx.lineTo(size, half);
  ctx.stroke();
  ctx.strokeStyle = "rgba(220,210,180,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(half + 2, 0);
  ctx.lineTo(half + 2, size);
  ctx.moveTo(0, half + 2);
  ctx.lineTo(size, half + 2);
  ctx.stroke();

  // Caster scuffs through the middle + dirt at rail bases.
  for (let i = 0; i < 90; i += 1) {
    const x = rng() * size;
    const y = size * 0.28 + rng() * size * 0.44;
    const len = 8 + rng() * 36;
    ctx.strokeStyle = `rgba(20,18,14,${0.04 + rng() * 0.08})`;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * (rng() > 0.5 ? 1 : -1), y + (rng() - 0.5) * 6);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i += 1) {
    const x = rng() * size;
    const y = rng() < 0.5 ? rng() * 28 : size - 28 + rng() * 28;
    ctx.fillStyle = `rgba(40,36,28,${0.05 + rng() * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + rng() * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft plate sheen variation.
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "rgba(255,250,230,0.04)");
  grad.addColorStop(0.5, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(20,18,12,0.08)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Faded yellow/black hazard stripe for the arena-facing lip (0.35-alpha wash).
 * @returns {THREE.CanvasTexture}
 */
function buildBoothStripeTexture() {
  const w = 128;
  const h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const stripeW = 14;
  for (let x = 0; x < w; x += stripeW) {
    const yellow = Math.floor(x / stripeW) % 2 === 0;
    ctx.fillStyle = yellow ? "rgba(196, 168, 64, 0.35)" : "rgba(18, 16, 12, 0.35)";
    ctx.fillRect(x, 0, stripeW, h);
  }
  // Scuff the stripe so it lands drab, not marker-bright.
  for (let i = 0; i < 24; i += 1) {
    ctx.fillStyle = "rgba(40,36,28,0.12)";
    ctx.fillRect(Math.random() * w, Math.random() * h, 4 + Math.random() * 10, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildBackroomsBooths(scene, world, config, boothColliderHandles) {
  const B = config.booth;
  const arenaR = config.record.radius;
  const boothCenterDist = arenaR + B.gapDistance + B.rampLength + B.platformDepth / 2;
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  const group = new THREE.Group();
  const bodies = [];

  const cardboardTex = buildPropSurfaceTexture("cardboard");
  const deckTex = buildBoothDeckTexture();
  const stripeTex = buildBoothStripeTexture();
  // * STORE-DECK-1: plate map + bump on the slab (audit target); divider left plain.
  const slabMat = new THREE.MeshStandardMaterial({
    map: deckTex,
    bumpMap: deckTex,
    bumpScale: 0.02,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.08,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    map: stripeTex,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    depthWrite: false,
  });
  const railMat = createPhysicalMaterial({
    color: 0x6c6a62, roughness: 0.45, metalness: 0.7,
  });
  const boxMat = new THREE.MeshStandardMaterial({
    map: cardboardTex, color: 0xffffff, roughness: 0.92, metalness: 0.0,
  });
  // Short cubicle divider panels (per-booth height variation).
  // * Divider left unmapped: plate map is oriented for the slab top, not panels.
  const dividerMat = new THREE.MeshStandardMaterial({
    color: 0x8a8474, roughness: 0.9, metalness: 0.02,
  });

  const platGeo = new THREE.BoxGeometry(B.platformWidth, B.platformThickness, B.platformDepth);
  // * Width extended by railThickness so the box end caps overlap the cylindrical side posts,
  // * closing the visible corner gap where the low back rail meets the side rails.
  const lowRailGeo = new THREE.BoxGeometry(B.platformWidth + B.railThickness, 0.55, 0.14);
  const railGeo = new THREE.CylinderGeometry(B.railThickness / 2, B.railThickness / 2, 1, 8);
  const cardboardGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const dividerGeo = new THREE.BoxGeometry(0.08, 1, B.platformDepth * 0.55);
  // * Arena-facing lip stripe (local −Z). The stencilled A–D bay letter that used to
  // * sit on the deck top was cut 08-03 on Wyatt's playtest call (STORE-DECK-1).
  const stripeGeo = new THREE.BoxGeometry(B.platformWidth * 0.92, 0.03, 0.22);

  const ownedMaterials = [slabMat, stripeMat, railMat, boxMat, dividerMat];
  const ownedTextures = [cardboardTex, deckTex, stripeTex];

  const pw = B.platformWidth / 2;
  const pd = B.platformDepth / 2;

  // * Booths never move — bake parts into merged static meshes (one per material).
  /** @type {Record<"slab" | "stripe" | "rail" | "box" | "divider", THREE.BufferGeometry[]>} */
  const parts = { slab: [], stripe: [], rail: [], box: [], divider: [] };
  /** @type {THREE.BufferGeometry[]} */
  const ownedGeometries = [];
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

  /** @type {Array<{ x: number, z: number, radiusX: number, radiusZ: number, opacity?: number }>} */
  const shadowPlacements = [];

  // Per-booth micro variation (deterministic): crate count, divider height, missing rail.
  const boothVariants = [
    { crates: 1, dividerH: 1.15, skipRail: false, crateYaw: 0.3 },
    { crates: 2, dividerH: 1.45, skipRail: false, crateYaw: -0.45 },
    { crates: 1, dividerH: 0.95, skipRail: true, crateYaw: 0.55 }, // missing one post
    { crates: 3, dividerH: 1.3, skipRail: false, crateYaw: 0.15 },
  ];

  for (let i = 0; i < 4; i += 1) {
    const angle = angles[i];
    const cx = boothCenterDist * Math.cos(angle);
    const cz = boothCenterDist * Math.sin(angle);
    const topY = B.platformY;
    const yaw = Math.PI / 2 - angle;
    const v = boothVariants[i];

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

    // * STORE-DECK-1: safety stripe on arena-facing lip (local −Z).
    pushPart("stripe", stripeGeo, 0, deckTopY + 0.02, -pd + 0.12);

    // Low back rail (local +Z = away from arena).
    pushPart("rail", lowRailGeo, 0, deckTopY + 0.275, pd - 0.08);

    // Dull metal side rails — one booth skips a rear post (abandoned staging).
    for (const sx of [-pw + 0.1, pw - 0.1]) {
      pushPart("rail", railGeo, sx, deckTopY + B.railHeight, 0, Math.PI / 2, 0, 0, 1, B.platformDepth - 0.4, 1);
      for (const rz of [-pd + 0.2, pd - 0.2]) {
        if (v.skipRail && sx > 0 && rz > 0) continue;
        pushPart("rail", railGeo, sx, deckTopY + B.railHeight / 2, rz, 0, 0, 0, 1, B.railHeight, 1);
      }
    }

    // Cubicle divider — height varies per booth.
    pushPart(
      "divider",
      dividerGeo,
      -pw + 0.35,
      deckTopY + v.dividerH / 2,
      0.15,
      0, 0, 0,
      1, v.dividerH, 1,
    );

    // Worn cardboard crates — count/placement varies.
    const crateLayouts = [
      [pw - 1.0, pd - 1.0, v.crateYaw, 1],
      [pw - 2.15, pd - 0.85, v.crateYaw + 0.7, 0.92],
      [-pw + 1.1, pd - 1.15, -v.crateYaw, 0.85],
    ];
    for (let c = 0; c < v.crates; c += 1) {
      const [bx, bz, byaw, scale] = crateLayouts[c];
      pushPart("box", cardboardGeo, bx, deckTopY + 0.55 * scale, bz, 0, byaw, 0, scale, scale, scale);
    }

    shadowPlacements.push({
      x: cx,
      z: cz,
      radiusX: B.platformWidth * 0.48,
      radiusZ: B.platformDepth * 0.48,
      opacity: 0.34,
    });
  }

  const mergeAdd = (bucket, mat) => {
    if (bucket.length === 0) return;
    const merged = BufferGeometryUtils.mergeGeometries(bucket, false);
    bucket.forEach((g) => g.dispose());
    ownedGeometries.push(merged);
    group.add(new THREE.Mesh(merged, mat));
  };
  mergeAdd(parts.slab, slabMat);
  mergeAdd(parts.stripe, stripeMat);
  mergeAdd(parts.rail, railMat);
  mergeAdd(parts.box, boxMat);
  mergeAdd(parts.divider, dividerMat);
  platGeo.dispose();
  lowRailGeo.dispose();
  railGeo.dispose();
  cardboardGeo.dispose();
  dividerGeo.dispose();
  stripeGeo.dispose();

  const boothShadows = createStaticContactShadowCluster(shadowPlacements);
  group.add(boothShadows.group);

  scene.add(group);
  return {
    group,
    bodies,
    ownedGeometries: [...ownedGeometries, ...boothShadows.ownedGeometries],
    ownedMaterials: [...ownedMaterials, ...boothShadows.ownedMaterials],
    ownedTextures,
  };
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
 *   applyQualityTier: (knobs: import("../utils/qualityTiers.js").QualityKnobs) => void,
 *   dispose: () => void,
 * }}
 * @param {{ menuPreview?: boolean, reflectorTextureSize?: number }} [options]
 */
/**
 * Danger telegraph for the void suction bands — a pulsing neon annulus on the floor around
 * each void, marking the zone where carts get dragged in (simulation.js applySquareHoleSuction).
 * Unlit + additive so it reads on Low tier and glows against the dark carpet; one shared
 * geometry + material across the four voids. Play + preview (cheap: 4 meshes, no collider).
 *
 * @returns {{ group: THREE.Group, ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[], update: (timeMs: number) => void }}
 */
function buildSuctionHazardRings() {
  const group = new THREE.Group();
  const outer = HOLE_HALF + HOLE_SUCTION_BAND;
  const inner = HOLE_HALF + 0.05; // hug the lip, a hair out so it never pokes into the open void

  // * Tessellated square annulus that FOLLOWS THE FLOOR. The old ShapeGeometry was 8 vertices
  // * on one flat plane at a constant y, while the carpet ramps down across HOLE_CHAMFER_W to
  // * the lip — so the ring floated ~0.5 m over the surface it is painted on at its inner edge.
  // * That was invisible only because the inner fade zeroed the alpha exactly there; fixing the
  // * fade without this would have exposed the float. Baked ONCE in hole-local space and shared
  // * by all four meshes: the chamfer profile is hole-relative and the voids are symmetric.
  const SIDE_SEGMENTS = 16;
  const RING_STEPS = SIDE_SEGMENTS * 4;
  const BAND_ROWS = 10;
  const [refHole] = HOLE_CENTERS;
  const positions = [];
  for (let row = 0; row <= BAND_ROWS; row += 1) {
    const r = inner + (outer - inner) * (row / BAND_ROWS);
    for (let k = 0; k < RING_STEPS; k += 1) {
      const t = (k / RING_STEPS) * 4;
      const side = Math.floor(t);
      const f = t - side;
      let x;
      let z;
      if (side === 0) { x = r; z = -r + 2 * r * f; }
      else if (side === 1) { z = r; x = r - 2 * r * f; }
      else if (side === 2) { x = -r; z = r - 2 * r * f; }
      else { z = -r; x = -r + 2 * r * f; }
      const surfaceY = getFloorSurfaceY(refHole.x + x, refHole.z + z);
      positions.push(x, (surfaceY === null ? FLOOR_TOP_Y : surfaceY) + 0.03, z);
    }
  }
  const indices = [];
  for (let row = 0; row < BAND_ROWS; row += 1) {
    for (let k = 0; k < RING_STEPS; k += 1) {
      const kNext = (k + 1) % RING_STEPS;
      const a = row * RING_STEPS + k;
      const b = row * RING_STEPS + kNext;
      const c = (row + 1) * RING_STEPS + k;
      const d = (row + 1) * RING_STEPS + kNext;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  // * Animated suction vortex (playtest 2026-07-16: the flat red fill read as a debug
  // * square and stood out too much). Spiral streaks flow INWARD toward the void so the
  // * band reads as "pull", with the motion carrying the danger signal at a lower overall
  // * brightness. Pure fragment math — no textures, cheap enough for Low tier (4 small
  // * annulus meshes). Chebyshev band mask matches the square suction band exactly.
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uInner;
      uniform float uOuter;
      varying vec2 vPos;

      void main() {
        // * Band strength: 1.0 at the void lip fading to 0 at the suction band's outer
        // * edge — Chebyshev so it hugs the square hole like the physics does.
        float cheb = max(abs(vPos.x), abs(vPos.y));
        float band = 1.0 - smoothstep(uInner, uOuter, cheb);
        // * Fade back OUT toward the void lip too (run-6: the full-strength inner edge
        // * drew a hard amber square against the black hole interior) — peak sits
        // * mid-band, zero at both boundaries.
        // * ...but do NOT fade to zero: the 0.9 m it used to erase is where suction runs
        // * 63-100% of SUCTION_PEAK_ACCEL, so the last metre before a cart is committed was
        // * the one metre with no marking on it. Floor the fade at half strength instead.
        band *= mix(0.50, 1.0, smoothstep(uInner, uInner + 0.25, cheb));
        if (band <= 0.003) discard;
        band = pow(band, 1.35);

        float r = length(vPos);
        float theta = atan(vPos.y, vPos.x);

        // * Primary spiral: crests migrate toward the void as uTime advances (arg
        // * constant => r shrinking). Secondary counter-spiral adds turbulence depth.
        // * Crest exponents pay for the lip floor above: narrowing the fade adds glow the ring
        // * did not carry, and the telegraph must not get BRIGHTER overall — only redistributed
        // * inward. Tightened here rather than via pow(band, ·), which would preferentially
        // * darken the lip (0.50^x falls away far faster than mid-band ~1.0) and undo the fix.
        float spiral = 0.5 + 0.5 * sin(theta * 5.0 + r * 2.8 + uTime * 2.1);
        spiral = pow(spiral, 3.35);
        float counter = 0.5 + 0.5 * sin(-theta * 3.0 + r * 4.6 + uTime * 1.25);
        counter = counter * counter * 0.23;

        // * Slow breathe so the standing hazard reads as alive, not strobing.
        float breathe = 0.82 + 0.18 * sin(uTime * 0.66);

        float glow = band * (spiral * 0.6 + counter + 0.07) * breathe;

        // * Run-5: the magenta-red hazard read off-palette for the Storerooms (its
        // * world is sodium fluorescents / sickly green / olive carpet — no rave
        // * neon). Recolored into that family: dim sickly-olive base → hot sodium
        // * amber crest, and the whole effect pulled ~20% softer — the motion still
        // * carries the danger signal.
        vec3 col = mix(vec3(0.14, 0.12, 0.03), vec3(1.0, 0.62, 0.18), spiral);
        // * Alpha 0.40 -> 0.36 is the second half of that payment (measured: frame mean luma
        // * +0.22% against a 0.02% capture-to-capture noise floor; strict parity would cost
        // * ~a third of the ring's output and gut the mid-band that already worked).
        gl_FragColor = vec4(col * glow * 0.85, glow * 0.36);
      }
    `,
  });

  for (const h of HOLE_CENTERS) {
    const ring = new THREE.Mesh(geo, mat);
    // * y = 0: the +0.03 float and the chamfer ramp are baked into the vertices now.
    ring.position.set(h.x, 0, h.z);
    ring.renderOrder = 2; // over the baked carpet decals
    group.add(ring);
  }

  return {
    group,
    ownedGeometries: [geo],
    ownedMaterials: [mat],
    update: (timeMs) => {
      mat.uniforms.uTime.value = timeMs * 0.001;
    },
  };
}

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
    bumpScale: 0.015,
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
    // * Hot lonely tube (escalator hole) — brighter than the shared dim glow.
    glowHot: new THREE.MeshBasicMaterial({ color: 0xd4c8a0, side: THREE.DoubleSide }),
    silhouette: new THREE.MeshBasicMaterial({ color: 0x0b0a09 }),
    // Slightly lighter than deep silhouettes so looking-down hints read before a KO fall.
    nearSilhouette: new THREE.MeshBasicMaterial({ color: 0x12110f }),
  };
  const voidGroup = new THREE.Group();
  const voidGeometries = [];
  for (let hi = 0; hi < HOLE_CENTERS.length; hi += 1) {
    const h = HOLE_CENTERS[hi];
    const v = buildSquareVoid(h.x, h.z, voidShaftMat, subRoomMats, hi);
    voidGroup.add(v.group);
    voidGeometries.push(...v.geometries);
  }
  scene.add(voidGroup);

  // ===== Suction danger rings (telegraph for the void pull-in bands) =====
  const suctionRings = buildSuctionHazardRings();
  scene.add(suctionRings.group);

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

  // ===== Atmosphere dressing (pit silhouettes, uncanny props, doorways) =====
  // * Menu preview skips these — they allocate merged geos + fixed colliders and dominate
  // * menu level-flip hitch. Play entry force-rebuilds full quality (previewNeedsFullRebuild).
  /** @returns {{ group: THREE.Group, bodies: object[], ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[], ownedTextures: THREE.Texture[] }} */
  const emptyDressing = () => {
    const group = new THREE.Group();
    scene.add(group);
    return {
      group,
      bodies: [],
      ownedGeometries: [],
      ownedMaterials: [],
      ownedTextures: [],
    };
  };
  const pitDressing = menuPreview ? emptyDressing() : buildPitRingDressing(scene, world);
  const uncanny = menuPreview ? emptyDressing() : buildUncannyDetails(scene, world);
  const doorways = menuPreview ? emptyDressing() : buildDoorways(scene, wallpaperTex);
  const floorDecals = menuPreview ? emptyDressing() : buildFloorStoryDecals(scene);

  // * Runtime distance LOD — atmosphere props only (no physics rebuild).
  if (!menuPreview) {
    registerLevelLodNode(pitDressing.group, { far: 48 });
    registerLevelLodNode(doorways.group, { far: 55 });
    // * Floor markings register PER MESH, not as the group. updateLevelLod measures
    // * getWorldPosition of the registered object, and these groups sit at the origin
    // * while every child carries world coords — so registering the group tested
    // * camera-to-arena-CENTRE and blinked all ~22 markings (hazard tape, ruts,
    // * blotches) in and out together, at the exact moment a cart nears a corner void
    // * and the chase camera passes 38 m from centre. Same far, correct anchor.
    for (const decal of floorDecals.group.children) {
      registerLevelLodNode(decal, { far: 38 });
    }
    // * The painted arrows are the same defect and the same readability argument —
    // * they are positive fall markings sitting on a ~34 m radius around a group left
    // * at the origin. buildUncannyDetails owns no physics bodies (the EXIT sign that
    // * did was deleted in run-5), so every child here is a plain mesh.
    for (const arrow of uncanny.group.children) {
      registerLevelLodNode(arrow, { far: 42 });
    }
  }

  // ===== Ambient fill lighting (warm; compensates for thick fog while staying dim/liminal) =====
  const hemiLight = new THREE.HemisphereLight(0xc8c0a0, 0x2a3028, 1.38);
  scene.add(hemiLight);
  const ambient = new THREE.AmbientLight(0x6e6c58, 0.7);
  scene.add(ambient);

  // * Steel-blue rim — stronger after cooler carpet/wallpaper retune so carts (esp. yellow/
  // * orange) keep a readable cool edge without washing the floor blue.
  // * Near-grazing angle keeps the rim on vertical cart surfaces; carpet up-normal barely sees it.
  const coolRimLight = new THREE.DirectionalLight(0x8aa0c8, 0.28);
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

  // ===== Real-time SpotLight budget (quality tiers) =====
  // * This level's dominant GPU cost is its real-time SpotLights: the 7 lit ceiling-grid
  // * cells (ceiling.spots, built deterministically by getFixtureState) plus the 1
  // * furniture-pile spot below — 8 total, matching QUALITY_KNOBS.high.ceilingSpots. Panel
  // * emissive materials are baked into per-state merged meshes (buildCeiling) and never
  // * reference these light objects, so toggling `.visible` here only removes the
  // * real-time light contribution — the fixtures keep reading as lit at every tier.
  //
  // * Priority order was chosen by farthest-point sampling over the 7 lit grid cells (so
  // * any budget prefix stays spread across the room instead of clustering in one corner),
  // * with the furniture-pile spot inserted at priority 3 — it anchors the center setpiece,
  // * so it survives medium (budget 4) and only drops out at low (budget 2).
  const CEILING_SPOT_PRIORITY_ORDER = [
    [3, 4], [0, 1], /* furniture */ null, [3, 1], [1, 2], [2, 0], [2, 3], [4, 2],
  ];
  const spotByGridKey = new Map(ceiling.spots.map((s) => [`${s.gx},${s.gz}`, s.light]));
  const prioritizedSpots = CEILING_SPOT_PRIORITY_ORDER.map((entry) => (
    entry === null ? furnitureSpotlight.spot : spotByGridKey.get(`${entry[0]},${entry[1]}`)
  )).filter((light) => light != null);

  /**
   * Enables the first `knobs.ceilingSpots` lights (priority order above) and disables the
   * rest. Safe to call repeatedly (main.js calls it after every level load and on every
   * live tier change).
   * @param {import("../utils/qualityTiers.js").QualityKnobs} knobs
   */
  function applyQualityTier(knobs) {
    const budget = knobs.ceilingSpots;
    prioritizedSpots.forEach((light, i) => {
      light.visible = i < budget;
    });
  }
  applyQualityTier(getQualityKnobs());

  // ===== Contract stand-ins =====
  // * spindleLight is a stand-in so this level satisfies the shared level-result shape.
  // * It is a dim warm ambient presence and nothing animates it.
  // *
  // * The line here used to say main.js "lerps its color each frame". It never did — main.js
  // * destructured the two colours into locals and never read them, which is why the pair
  // * below is inert. They are kept only for API shape with Classic, whose own spindle cycle
  // * is real; do not build a cycle here on their account, and do not assume any caller is
  // * reading them.
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
    pitDressing.group, uncanny.group, doorways.group, floorDecals.group,
    furniturePile.group,
    furnitureSpotlight.spot, furnitureSpotlight.spot.target, furnitureSpotlight.fixture,
    hemiLight, ambient, coolRimLight, coolRimLight.target, spindleLight,
    // ! suctionRings.group was missing here — its materials got disposed but the meshes
    // ! stayed in the scene, so the hazard squares haunted every later arena (playtest
    // ! 2026-07-16 "red squares persist and appear on other levels").
    suctionRings.group,
  ];

  const ownedGeometries = [
    floorGeo, ...voidGeometries, ...suctionRings.ownedGeometries, ...pit.geometries,
    ...walls.ownedGeometries, ...ceiling.ownedGeometries, ...booths.ownedGeometries,
    ...pitDressing.ownedGeometries, ...uncanny.ownedGeometries, ...doorways.ownedGeometries,
    ...floorDecals.ownedGeometries,
    ...furniturePile.ownedGeometries, ...furnitureSpotlight.ownedGeometries,
  ];
  const ownedMaterials = [
    floorMat, voidShaftMat, ...suctionRings.ownedMaterials,
    subRoomMats.floor, subRoomMats.glow, subRoomMats.glowHot,
    subRoomMats.silhouette, subRoomMats.nearSilhouette,
    ...pit.materials,
    ...walls.ownedMaterials, ...ceiling.ownedMaterials, ...booths.ownedMaterials,
    ...pitDressing.ownedMaterials, ...uncanny.ownedMaterials, ...doorways.ownedMaterials,
    ...floorDecals.ownedMaterials,
    ...furniturePile.ownedMaterials, ...furnitureSpotlight.ownedMaterials,
  ];
  const ownedTextures = [
    carpetTex, subCarpetTex, wallpaperTex, ceilingTex,
    ...uncanny.ownedTextures,
    ...(floorDecals.ownedTextures ?? []),
    ...(walls.ownedTextures ?? []),
    ...(booths.ownedTextures ?? []),
    ...(furniturePile.ownedTextures ?? []),
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
    if (world && uncanny.bodies) {
      for (const body of uncanny.bodies) {
        if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
      }
    }
    if (world && pitDressing.bodies) {
      for (const body of pitDressing.bodies) {
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
      // * avoidMargin + influenceBand widened to clear the suctionBand: bots must steer away
      // * BEFORE the pull grabs them (else they self-feed). Reach = half + avoidMargin +
      // * influenceBand = 8.25m > band outer edge (half + suctionBand = 6.85m). (2026-07-15)
      avoidMargin: 2.4, // * keep-out radius — routing/targets stay outside the suction band
      influenceBand: 1.6, // * steer nudge starts beyond the band so the grab never surprises a bot
      // * Inward-pull band width (meters) outside the floor lip. Consumed by simulation.js
      // * applySquareHoleSuction; makes the four voids dangerous by proximity, not just contact.
      suctionBand: HOLE_SUCTION_BAND,
      // * Center furniture pile — keep NPC patrol targets outside the convex-hull footprint.
      // * solid: center furniture is a hard obstacle, not a void — the AI-2 wedge
      // * fix (reverse-off + tangent escape) keys off this semantic, and the
      // * backrooms no-reverse gate already excludes it structurally.
      circularKeepOuts: [{ x: 0, z: 0, radius: 3.4, margin: 1.7, solid: true }],
    },
    update: (timeMs) => {
      spotlightUpdateFn(timeMs);
      ceilingUpdateFn(timeMs);
      suctionRings.update(timeMs);
    },
    applyQualityTier,
    dispose,
  };
}
