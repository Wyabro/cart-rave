// zanzibarPlatform.js — SUNDIAL STATION (level id: "zanzibar"): offshore octagonal
// research/sport platform at permanent golden hour. The deck is the dial plate, the
// center podium its gnomon, and the low drifting sun sweeps long shadows across it.
//
// Design intent (third arena — fills the slot the first two don't):
//   Classic Record  = circular, TWO kill directions (center pit + outer void), rave extras.
//   The Storerooms  = walled box, four corner holes, center obstacle, no outer fall.
//   Sundial Station = OPEN octagon — no walls, no holes. Every one of the eight edges is a
//                     kill zone, and a low drivable center podium adds verticality.
//
// Physics philosophy (July 1 collider overhaul rules): primitives only, no trimesh.
//   Deck   = FOUR overlapping cuboids whose union is exactly the regular octagon (each
//            rotated 45° from the last, half-length = apothem, half-width = apothem·tan 22.5°).
//            NOT a convex hull: resting carts (roundCuboid) visibly jitter on large
//            convex-hull faces while sitting rock-solid on the cuboid spawn booths —
//            observed directly in the 2026-07-09 feedback round. All four tops are
//            coplanar at y=0 with identical +y normals, so their manifolds agree.
//   Podium = four thin rotated cuboid CAPS (flat, stable top surface) over ONE convex
//            hull for the drivable ramp ring. The hull crest is tucked below the cap
//            plane and its base below the deck plane (PODIUM_CREST_TUCK / PODIUM_TUCK) —
//            hulls sharing an exact coplanar plane with another collider cause
//            contact-manifold flip-flop; same class of bug The Storerooms avoids with
//            CHAMFER_TUCK.
//   Corner bollards = 8 cylinder colliders. Booths = 4 cuboids.
//   Floor colliders use RestitutionCombineRule.Min so the deck's tuned 0.05 restitution
//   wins over the cart's 0.3 (Rapier's default Average produced a phantom ~0.175 bounce).

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CONFIG } from "../config.js";
import { createStaticContactShadowCluster } from "../contactShadows.js";
import { setWaterDeathEnvironment } from "../effects/waterDeathFx.js";
import { RAPIER } from "../physics/rapierInstance.js";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "../scene.js";
import { isLowQualityMode } from "../utils.js";
import { registerLevelLodNode } from "../utils/levelLod.js";

// ===== Layout constants =====

const OCT_SIDES = 8;
const HALF_ANGLE = Math.PI / OCT_SIDES; // 22.5°
const COS_HALF = Math.cos(HALF_ANGLE); // 0.9238795…
// * Flats face the four booth angles (0, π/2, π, 3π/2): first vertex at +22.5°.
const VERTEX_OFFSET = HALF_ANGLE;

const DECK_THICKNESS = 0.6; // meters — matches Classic + Storerooms floor thickness
const DECK_FRICTION = 0.62; // unitless — grippy steel; between Classic vinyl and carpet

// * Podium +20% (stabilization pass, 2026-07-11): base 7.2→8.6, top 5.0→6.0.
// * ART-4 (2026-07-14): +~10% more — base 8.6→9.5, top 6.0→6.6 (both scaled ~×1.1).
// * Rise (PODIUM_HEIGHT) is unchanged, so the run grows 2.6→2.9 m and the ramp gets
// * slightly GENTLER (~11°→~9.8°) — still fully drivable. Bigger contested zone for
// * king-of-the-hill; ONE knob (base) cascades to visual (frustum + decor rings),
// * scoring (base + 0.5, simulation.js isOnPodiumHighGround), and AI keep-out
// * (setLevelHazards circularKeepOuts radius) — all read PODIUM_BASE_R.
const PODIUM_BASE_R = 9.5; // meters — circumradius of frustum base
const PODIUM_TOP_R = 6.6; // meters — circumradius of frustum top
const PODIUM_HEIGHT = 0.5; // meters — 0.5 rise over 2.9 run ≈ 9.8°, fully drivable
// * Collider-only recess of the ramp hull's base below the deck top plane. A hull face
// * exactly coplanar with another collider makes Rapier's narrow-phase flip contact
// * ownership frame-to-frame — visible as resting-cart jitter. Mirrors CHAMFER_TUCK.
const PODIUM_TUCK = 0.02;
// * Hologram base hover above the podium. Raised 2.85 → 3.75 (run-4 playtest): carts kept
// * driving through the dial plate on podium contests — keep the lowest band clear of cart tops.
const HOLO_HOVER_Y = 3.75;
// * The ramp hull's crest sits this far below the flat cap cuboids' top plane, so carts
// * parked on the podium rest on stable cuboid faces, never on the hull. The 2 cm step
// * at the crest is far below the cart's 8 cm roundCuboid radius (never catches).
const PODIUM_CREST_TUCK = 0.02;
const PODIUM_CAP_THICKNESS = 0.12; // meters — thin flat cuboid caps on the podium crown

const BOLT_PITCH_M = 2.4; // meters between deck bolts along a seam — fixed pitch, not count
const PODIUM_PANEL_TILE_M = 1.5; // meters of real steel per panelTex tile on the podium crown
// * Inset of the polished cap plate inside the crown octagon's apothem. The plate used to be
// * CircleGeometry(PODIUM_TOP_R - 0.45, 32) = a 6.15 m circle on an octagon whose apothem is
// * PODIUM_TOP_R * COS_HALF = 6.0976 m, so it overhung the crown by 5.24 cm at every flat mid
// * and floated over nothing.
const CAP_PLATE_INSET_M = 0.07; // meters
const BOLLARD_RADIUS = 0.55; // meters
const BOLLARD_HEIGHT = 1.6; // meters
const BOLLARD_RING_SCALE = 0.97; // fraction of circumradius — fully on deck

const WATER_Y = -6.0; // meters — carts sink ~4 m before the global -10 fall respawn

/** Session-cached sunset equirect env — see the note in initZanzibarPlatform. @type {THREE.CanvasTexture | null} */
let _sunsetEnvTex = null;

/**
 * Run-6: pre-bakes the sunset environment's cubeUV (PMREM) during menu idle. The
 * renderer converts an equirect environment lazily inside the first compile/render
 * that references it, cached BY TEXTURE INSTANCE — so the first Sundial browse of a
 * session paid the bake inside a synchronous multi-second main-thread stall (the
 * 3.5–4.3s lobby longframes in the run-6 captures). A 4×4 offscreen render of a
 * one-quad scene referencing the shared texture seeds the same renderer cache.
 * @param {import("three").WebGLRenderer} renderer
 */
export function warmSunsetEnv(renderer) {
  if (!USE_SUNSET_ENV || !renderer) return;
  _sunsetEnvTex ??= buildSunsetEnvTexture();
  const scene = new THREE.Scene();
  scene.environment = _sunsetEnvTex;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
  scene.add(mesh);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  cam.position.z = 2;
  const rt = new THREE.WebGLRenderTarget(4, 4);
  const prevTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
  } finally {
    renderer.setRenderTarget(prevTarget);
    rt.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
    scene.environment = null;
  }
}
const WATER_SIZE = 900; // meters — fog swallows the far edge

const SKY_RADIUS = 480; // meters
const SUN_DISTANCE = 430; // meters
// * Single-sourced in CONFIG, not here. main.js needs this same number at :2488 to give the
// * ambient dust its sun lobe, and it must not import this lazily-chunked level to get it —
// * that would pull the arena into main's eager graph and defeat prefetchLevelChunks. Reading
// * it back keeps every call site below unchanged while there is only one copy of the value.
const SUN_AZIMUTH = CONFIG.postFx.sunAzimuthByLevel.zanzibar; // radians
const SUN_HEIGHT = 14; // meters — low over the water
// * Horizontal distance the KEY light is placed at. With SUN_HEIGHT that fixes the key's
// * elevation at atan(14/80) = 9.93°, which is the angle every raking effect must agree
// * with. Single-sourced so the light and the god-ray tilt cannot drift apart. NOTE: the sun
// * DISC sits at 1.87° (SUN_DISTANCE 430) — that 8° disagreement is OQ8, still Wyatt's call;
// * this constant records the key's angle, it does not resolve the mismatch.
const SUN_KEY_DISTANCE = 80; // meters
const SUN_DRIFT_AMPLITUDE_RAD = 0.015; // radians (~0.9°) — barely-perceptible sunset wobble
const SUN_DRIFT_SPEED = 0.00006; // rad/ms — full drift cycle ≈ 105 s

/** Matches the Storerooms convention: nominal FX radius for anything pit-scaled. */
const PIT_INNER_RADIUS = 66;

const ISLAND_HAZE_DIST_OFFSET = 35; // meters — a ridge's haze layer sits this much farther out
// meters — keeps every island (incl. its haze layer) well inside the WATER_SIZE ocean plane's
// edge, so fog swallows the plane's true edge before any silhouette appears to float past it.
const ISLAND_MAX_DIST = WATER_SIZE / 2 - 50;

// * Sunset IBL — replaces the neutral RoomEnvironment on scene.environment while this
// * level is loaded, so metals reflect ember/teal instead of a gray room. Revert switch:
// * flip to false to restore the startup environment untouched (kept trivially revertible
// * while the post-FX black-frame investigation is open — this is the only new
// * render-target-adjacent usage this level adds, and it is a one-time bake at load).
const USE_SUNSET_ENV = true;

// * Shared scratch for instanced-matrix building (construction + per-frame gull updates).
const _dummy = new THREE.Object3D();

/**
 * Walks the perimeter of the deck octagon of a given circumradius, calling back at a fixed
 * arc pitch in METERS. Used for bolt rows, which were previously laid on a circle of the
 * same radius while the seam they follow is an octagon — so every bolt drifted outboard of
 * its seam except the eight that happened to land on a vertex.
 *
 * @param {number} circumRadiusM Octagon circumradius in meters.
 * @param {number} pitchM Spacing along the edge, meters. Rounded per edge so the row starts
 *   and ends inset from each vertex by half a gap instead of doubling up at the corners.
 * @param {(x: number, z: number, edgeIndex: number) => void} visit Called in meters.
 */
function walkOctPerimeter(circumRadiusM, pitchM, visit) {
  const edgeLen = 2 * circumRadiusM * Math.sin(HALF_ANGLE);
  const perEdge = Math.max(1, Math.round(edgeLen / pitchM));
  for (let e = 0; e < OCT_SIDES; e += 1) {
    const a0 = VERTEX_OFFSET + e * (Math.PI / 4);
    const a1 = VERTEX_OFFSET + (e + 1) * (Math.PI / 4);
    const x0 = Math.cos(a0) * circumRadiusM;
    const z0 = Math.sin(a0) * circumRadiusM;
    const x1 = Math.cos(a1) * circumRadiusM;
    const z1 = Math.sin(a1) * circumRadiusM;
    for (let k = 0; k < perEdge; k += 1) {
      const t = (k + 0.5) / perEdge;
      visit(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, e);
    }
  }
}

// ===== Canvas texture builders =====

/**
 * Steel deck top: plate seams, bolt rings, wear scuffs, rust streaks, cyan energy-conduit
 * traces, hazard-yellow perimeter band traced as a true octagon (aligned to the collider
 * flats), and helipad-style podium markings.
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
  const apothem = circumR * COS_HALF;

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

  // Traffic wear — pale scuff arcs in the main driving band between podium and rim.
  for (let i = 0; i < 46; i += 1) {
    const rM = PODIUM_BASE_R + 2.5 + Math.random() * (apothem - PODIUM_BASE_R - 7);
    const a0 = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(196, 202, 214, ${0.03 + Math.random() * 0.05})`;
    ctx.lineWidth = (0.12 + Math.random() * 0.24) * pxPerM;
    ctx.beginPath();
    ctx.arc(c, c, rM * pxPerM, a0, a0 + 0.15 + Math.random() * 0.5);
    ctx.stroke();
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
  // Ring list adapts to the deck size so plate density stays even after the +20% pass.
  const seamRings = [8.5, 14.5, 20.5, 26.5].filter((rM) => rM < apothem - 2.5);
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = Math.max(2, size * 0.004);
  for (const rM of seamRings) {
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

  // Bolt dots + rust streaks along the two mid seam rings.
  const boltRings = seamRings.filter((rM) => rM > 10 && rM < apothem - 4);
  // * Bolts walk the seam's own octagon polyline at a fixed metre pitch. They used to be 48
  // * points on a CIRCLE of the seam radius while the seam itself is traced by octPath, so
  // * every bolt but the eight on vertices sat outboard of the seam it was supposed to
  // * fasten — by up to boltR * (1 - cos 22.5°) = 0.76 m of clear steel on the 20.5 m ring.
  // * Fixed pitch also makes bolt density consistent between rings instead of thinning
  // * outward, which is what a fixed COUNT per ring does.
  for (const boltR of boltRings) {
    walkOctPerimeter(boltR, BOLT_PITCH_M, (bxM, bzM) => {
      const bx = c + bxM * pxPerM;
      const by = c + bzM * pxPerM;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(bx, by, size * 0.0035, 0, Math.PI * 2);
      ctx.fill();
      // Occasional rust bleed running radially outward from a bolt.
      if (Math.random() < 0.3) {
        const outward = Math.atan2(bzM, bxM);
        const len = (0.35 + Math.random() * 0.6) * pxPerM;
        ctx.strokeStyle = "rgba(112, 58, 30, 0.22)";
        ctx.lineWidth = size * 0.0026;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(outward) * len, by + Math.sin(outward) * len);
        ctx.stroke();
      }
    });
  }

  // Energy-conduit traces: cyan service lines along the eight flat-mid lanes, drawn as a
  // soft glow pass under a crisp core line, ending on square junction pads.
  const conduitInner = PODIUM_BASE_R + 2.0;
  const conduitOuter = apothem - 4.2;
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const a = i * (Math.PI / 4);
    const x0 = c + Math.cos(a) * conduitInner * pxPerM;
    const y0 = c + Math.sin(a) * conduitInner * pxPerM;
    const x1 = c + Math.cos(a) * conduitOuter * pxPerM;
    const y1 = c + Math.sin(a) * conduitOuter * pxPerM;
    ctx.strokeStyle = "rgba(255, 178, 44, 0.10)";
    ctx.lineWidth = 0.42 * pxPerM;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 178, 44, 0.28)";
    ctx.lineWidth = 0.14 * pxPerM;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    for (const [px, py] of [[x0, y0], [x1, y1]]) {
      ctx.fillStyle = "rgba(255, 178, 44, 0.30)";
      const pad = 0.5 * pxPerM;
      ctx.fillRect(px - pad / 2, py - pad / 2, pad, pad);
    }
  }

  // Station name decals on two opposite flats, inside the hazard band (helipad read).
  ctx.fillStyle = "rgba(235, 220, 200, 0.30)";
  ctx.font = `600 ${Math.round(1.05 * pxPerM)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const flatAngle of [Math.PI / 2, (3 * Math.PI) / 2]) {
    ctx.save();
    ctx.translate(c + Math.cos(flatAngle) * (apothem - 3.6) * pxPerM, c + Math.sin(flatAngle) * (apothem - 3.6) * pxPerM);
    ctx.rotate(flatAngle - Math.PI / 2);
    ctx.fillText("SUNDIAL STATION", 0, 0);
    ctx.restore();
  }

  // Hazard-yellow edge band (readability: the rim IS the kill zone).
  // * octPath() takes a CIRCUMRADIUS — the inset has to be divided back out by COS_HALF to
  // * be measured from the flats. `octPath(apothem - 1.7)` put the band's flats at 27.716 m
  // * instead of 30.0 m, leaving 3.98 m of bare steel outboard of the line that is supposed
  // * to warn you about the edge (the lit rim strips sit at apothem - 0.45).
  const BAND_INSET_M = 1.7;
  const BAND_WIDTH_M = 1.5;
  const bandCircumR = (apothem - BAND_INSET_M) / COS_HALF;
  ctx.strokeStyle = "#d9a614";
  ctx.lineWidth = BAND_WIDTH_M * pxPerM;
  octPath(bandCircumR);
  ctx.stroke();
  // Black chevron dashes over the band.
  ctx.strokeStyle = "rgba(10,10,12,0.85)";
  ctx.lineWidth = BAND_WIDTH_M * pxPerM;
  ctx.setLineDash([1.1 * pxPerM, 1.9 * pxPerM]);
  octPath(bandCircumR);
  ctx.stroke();
  ctx.setLineDash([]);

  // Tyre rub — the band is the one painted surface every cart gets shoved across, and it
  // was the only pristine one left on the deck (Rule 1). Erode it along its own path with
  // randomized base-steel dashes: a wide faded pass, then a narrow break-through pass.
  // * Mechanical wear only. Salt bloom, sun-bleach and spray staining belong to the deck
  // * density pass, not here.
  const rubDashes = (count, onLo, onHi, offLo, offHi) => {
    const d = [];
    for (let i = 0; i < count; i += 1) {
      d.push((onLo + Math.random() * (onHi - onLo)) * pxPerM);
      d.push((offLo + Math.random() * (offHi - offLo)) * pxPerM);
    }
    return d;
  };
  ctx.strokeStyle = "rgba(38, 42, 49, 0.42)";
  ctx.lineWidth = BAND_WIDTH_M * pxPerM;
  ctx.setLineDash(rubDashes(24, 0.5, 2.2, 1.8, 5.5));
  ctx.lineDashOffset = Math.random() * 30 * pxPerM;
  octPath(bandCircumR);
  ctx.stroke();
  ctx.strokeStyle = "rgba(34, 38, 45, 0.72)";
  ctx.lineWidth = BAND_WIDTH_M * 0.45 * pxPerM;
  ctx.setLineDash(rubDashes(20, 0.2, 1.0, 3.0, 9.0));
  ctx.lineDashOffset = Math.random() * 30 * pxPerM;
  octPath(bandCircumR);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // Podium apron markings: thin amber ring + tick marks (helipad read).
  // * octPath, not ctx.arc — a circle drawn on an octagonal deck, and the emissive dial ring
  // * built over it in buildDeck() is eight straight segments at this exact circumradius.
  // * The paint is only an underlay now: measured at luminance 3.3 against a 2.6 bare plate,
  // * it does not read on its own. The dial geometry is what a player actually sees.
  ctx.strokeStyle = "rgba(255,178,44,0.5)";
  ctx.lineWidth = Math.max(2, 0.22 * pxPerM);
  octPath(PODIUM_BASE_R + 1.1);
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
 * Grayscale roughness variation for the deck top (linear space — roughnessMap multiplies
 * material.roughness, so the material sets roughness=1 and this map carries the value):
 * base brushed steel ≈0.58 with directional strokes, a smoother polished traffic band
 * where carts circulate, and rougher plate seams.
 *
 * @param {number} circumR Deck circumradius in meters.
 * @returns {THREE.CanvasTexture}
 */
function buildDeckRoughnessTexture(circumR) {
  const size = isLowQualityMode() ? 256 : 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const pxPerM = c / circumR;
  const apothem = circumR * COS_HALF;

  // Base roughness ≈ 0.58.
  ctx.fillStyle = "rgb(148,148,148)";
  ctx.fillRect(0, 0, size, size);

  // Brushed-metal strokes — fine value noise in one dominant direction.
  for (let i = 0; i < 900; i += 1) {
    const v = 128 + Math.floor(Math.random() * 56);
    ctx.strokeStyle = `rgba(${v},${v},${v},0.30)`;
    ctx.lineWidth = 1;
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 6 + Math.random() * 30;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }

  // Polished traffic band — carts burnish the main driving annulus smoother (darker).
  const bandInner = (PODIUM_BASE_R + 2.5) * pxPerM;
  const bandOuter = (apothem - 4) * pxPerM;
  const grad = ctx.createRadialGradient(c, c, bandInner, c, c, bandOuter);
  grad.addColorStop(0.0, "rgba(96,96,96,0.0)");
  grad.addColorStop(0.35, "rgba(96,96,96,0.38)");
  grad.addColorStop(0.7, "rgba(96,96,96,0.30)");
  grad.addColorStop(1.0, "rgba(96,96,96,0.0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, bandOuter, 0, Math.PI * 2);
  ctx.fill();

  // Rough weathered speckle.
  for (let i = 0; i < 320; i += 1) {
    const v = 175 + Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    const r = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Converts a canvas height field (luminance = height, brighter = proud) into an OpenGL-style
 * tangent-space normal map.
 *
 * Sign convention, derived and then confirmed in a capture: `THREE.Texture.flipY` defaults to
 * **true**, so canvas row 0 samples at `v = 1` and increasing canvas y means *decreasing* v.
 * The tangent-space normal of a height field is `normalize(-dh/du, -dh/dv, 1)`, and
 * `dh/dv = -dh/dy_canvas`, so the green channel takes the **canvas** y-gradient unnegated
 * while red takes the x-gradient negated. Getting this backwards inverts every bump into a
 * dent, which is the same class of error that shipped backwards twice earlier in this pass.
 *
 * Sampling wraps, so a tileable source yields a tileable normal map.
 *
 * @param {HTMLCanvasElement} srcCanvas Square source canvas.
 * @param {number} [strength] Gradient gain — higher = steeper relief.
 * @returns {THREE.CanvasTexture}
 */
function buildNormalMapFromCanvas(srcCanvas, strength = 1) {
  const size = srcCanvas.width;
  const srcData = srcCanvas.getContext("2d").getImageData(0, 0, size, size).data;

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const outCtx = out.getContext("2d");
  const img = outCtx.createImageData(size, size);

  /** Wrapped luminance lookup, 0..1. */
  const h = (x, y) => {
    const xi = ((x % size) + size) % size;
    const yi = ((y % size) + size) % size;
    const i = (yi * size + xi) * 4;
    return (srcData[i] * 0.299 + srcData[i + 1] * 0.587 + srcData[i + 2] * 0.114) / 255;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  outCtx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(out);
  // * Normal maps are vector data, never color — sRGB decode would bend every normal.
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Structural relief for the deck plate: plate seams and radial spokes as grooves, bolt heads
 * as bumps, the service conduits as raised strips. Deliberately mirrors the *structure* drawn
 * by `buildDeckTexture` and none of its grime — grime is albedo, not geometry, and pushing
 * stains into a normal map is how a deck starts reading as crumpled foil.
 *
 * @param {number} circumR Deck circumradius in meters.
 * @returns {THREE.CanvasTexture}
 */
function buildDeckNormalTexture(circumR) {
  const size = isLowQualityMode() ? 512 : 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const pxPerM = c / circumR;
  const apothem = circumR * COS_HALF;

  // Neutral height — mid grey is "flat plate".
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);

  const octPath = (radiusM) => {
    ctx.beginPath();
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const a = VERTEX_OFFSET + i * (Math.PI / 4);
      ctx.lineTo(c + Math.cos(a) * radiusM * pxPerM, c + Math.sin(a) * radiusM * pxPerM);
    }
    ctx.closePath();
  };

  // Plate seams + radial spokes — recessed.
  const seamRings = [8.5, 14.5, 20.5, 26.5].filter((rM) => rM < apothem - 2.5);
  ctx.strokeStyle = "#4a4a4a";
  ctx.lineWidth = Math.max(2, size * 0.004);
  for (const rM of seamRings) {
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

  // Bolt heads — proud, on the same rings buildDeckTexture dots.
  const boltRings = seamRings.filter((rM) => rM > 10 && rM < apothem - 4);
  // * Same polyline walk as the albedo, at the same pitch — the two maps have to agree or
  // * the relief lands next to the painted bolt instead of on it.
  ctx.fillStyle = "#c8c8c8";
  for (const boltR of boltRings) {
    walkOctPerimeter(boltR, BOLT_PITCH_M, (bxM, bzM) => {
      ctx.beginPath();
      ctx.arc(c + bxM * pxPerM, c + bzM * pxPerM, size * 0.0038, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Service conduits along the eight flat-mid lanes — raised strips.
  const conduitInner = PODIUM_BASE_R + 2.0;
  const conduitOuter = apothem - 4.2;
  ctx.strokeStyle = "#a6a6a6";
  ctx.lineWidth = 0.34 * pxPerM;
  ctx.lineCap = "round";
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const a = i * (Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * conduitInner * pxPerM, c + Math.sin(a) * conduitInner * pxPerM);
    ctx.lineTo(c + Math.cos(a) * conduitOuter * pxPerM, c + Math.sin(a) * conduitOuter * pxPerM);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  return buildNormalMapFromCanvas(canvas, 2.4);
}

/**
 * Tileable dark steel panel texture (beveled plate grid, rivets, value noise) shared by
 * booth slabs, pillars, and pylons — replaces the flat plastic-looking colors.
 * @returns {THREE.CanvasTexture}
 */
function buildPanelTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#272b33";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 120; i += 1) {
    const v = 26 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgba(${v},${v + 3},${v + 8},0.35)`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 4 + Math.random() * 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2×2 beveled panel grid with highlight/shadow edges and corner rivets.
  const cell = size / 2;
  for (let gx = 0; gx < 2; gx += 1) {
    for (let gy = 0; gy < 2; gy += 1) {
      const x = gx * cell;
      const y = gy * cell;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.strokeStyle = "rgba(160,170,185,0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      ctx.fillStyle = "rgba(8,9,12,0.8)";
      for (const [rx, ry] of [[10, 10], [cell - 10, 10], [10, cell - 10], [cell - 10, cell - 10]]) {
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Vent-grille strip for the podium side wall: dark slats with a faint cyan energy line
 * glowing behind them — the gnomon reads as a powered machine, not a concrete step.
 * @returns {THREE.CanvasTexture}
 */
function buildGrilleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#23262d";
  ctx.fillRect(0, 0, 256, 64);
  // Glow line low on the wall.
  const grad = ctx.createLinearGradient(0, 40, 0, 58);
  grad.addColorStop(0, "rgba(255,178,44,0)");
  grad.addColorStop(0.55, "rgba(255,178,44,0.32)");
  grad.addColorStop(1, "rgba(255,178,44,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 40, 256, 18);
  // Vertical slats.
  ctx.fillStyle = "rgba(8,9,12,0.75)";
  for (let x = 4; x < 256; x += 12) {
    ctx.fillRect(x, 6, 5, 52);
  }
  // Top rail highlight.
  ctx.fillStyle = "rgba(170,180,195,0.16)";
  ctx.fillRect(0, 2, 256, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  return tex;
}

/**
 * Radial soft-falloff texture for the sun disc and halos. The old flat-opacity
 * additive circles rendered their geometry rims as visible rings once ACES + the
 * arena exposure bump brightened the sky (07-17 run-2 photo: "circles behind the
 * sun"), and the hard flat-bright disc fed the bloom pass a saturated plate whose
 * separable blur streaks read as a cross flare. Gradient RGB multiplies the
 * material color, so each layer keeps its authored tint.
 *
 * @param {Array<[number, string]>} stops createRadialGradient color stops.
 * @returns {THREE.CanvasTexture}
 */
/**
 * Mulberry32-style seeded RNG for the alien city's window layout, so the skyline is the
 * same city on every load instead of rerolling. Same shape as backroomsSupermarket.js's
 * `makeRng`; kept local per that file's precedent — see the BACKLOG note about promoting
 * the three copies to a shared util.
 * @param {number} seed
 * @returns {() => number}
 */
function makeCityRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildSoftDiscTexture(stops) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [t, color] of stops) grad.addColorStop(t, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Vertical soft-falloff strip texture (white, alpha-graded top→bottom) for the
 * horizon haze band and god-ray shafts. Same run-2 lesson as the sun/halos: any
 * flat-opacity additive plane renders its geometry edge as a visible line under
 * ACES + the arena exposure bump — Wyatt's run-2 "cross" was the untextured haze
 * cylinder (horizontal arm) and shaft planes (vertical arm) doing exactly that.
 *
 * @param {Array<[number, string]>} stops createLinearGradient stops, v=0 → v=1.
 * @returns {THREE.CanvasTexture}
 */
function buildSoftStripTexture(stops) {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  // * Canvas y runs top-down; UV v runs bottom-up. Flip so stop 0 = v 0 (bottom).
  const grad = ctx.createLinearGradient(0, 128, 0, 0);
  for (const [t, color] of stops) grad.addColorStop(t, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Sunset gradient for the sky dome — deep indigo zenith → dusk magenta → ember horizon —
 * plus faint horizon haze bands, sparse high stars, and one fading jet contrail.
 * @returns {THREE.CanvasTexture}
 */
function buildSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  // * Moodier golden-hour: deeper indigo zenith, longer dusk magenta, softer ember melt.
  // * The dome puts the HORIZON at t = 0.5, so the whole ramp has to finish by then —
  // * authored across the full canvas it ran the ember below the waterline where the
  // * ocean hides it, leaving an indigo night sky over a lit sea.
  // * Stops are NOT a uniform rescale: the three warm ones are packed into the last
  // * ~0.065 so the ember is a band hugging the water (+10.8° / +5.4° / +1.8°) instead
  // * of a wash. The chase camera tops out near +27°, so the upper half of the play
  // * frame keeps its plum and indigo — bright horizon, dark sky, which is the point.
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#060318"); // zenith — near-black indigo
  grad.addColorStop(0.3, "#1a0a32");
  grad.addColorStop(0.395, "#4a1538");
  grad.addColorStop(0.44, "#8a2848");
  grad.addColorStop(0.47, "#c94a32");
  grad.addColorStop(0.49, "#e86830"); // ember band, tight to the waterline
  // * Must track CONFIG.postFx.fog.zanzibar.color — the ocean fogs to that hex at
  // * distance, so this is the colour the sky has to be AT the waterline (t = 0.5),
  // * not merely at the bottom of the canvas, or the two meet in a hard step.
  grad.addColorStop(0.505, "#ff5a22"); // horizon melt colour matching fog
  grad.addColorStop(1.0, "#ff5a22"); // held below the waterline — occluded by the ocean
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Stratified haze bands — thicker, more atmospheric than the first pass. Kept above
  // the waterline (y < 128) now that the ramp ends there; spacing scaled with the stops.
  for (const [y, alpha] of [[104, 0.12], [112, 0.16], [120, 0.12], [127, 0.08]]) {
    const band = ctx.createLinearGradient(0, y - 5, 0, y + 5);
    band.addColorStop(0, "rgba(30,8,28,0)");
    band.addColorStop(0.5, `rgba(50,14,36,${alpha})`);
    band.addColorStop(1, "rgba(30,8,28,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, y - 5, 256, 10);
  }

  // Sparse early stars near the zenith (colder, quieter than a rave sky).
  for (let i = 0; i < 34; i += 1) {
    ctx.fillStyle = `rgba(220, 214, 255, ${0.08 + Math.random() * 0.18})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 62, 1, 1);
  }

  // One old contrail catching the light, faded at both ends (avoids the UV wrap seam).
  const trail = ctx.createLinearGradient(50, 74, 208, 96);
  trail.addColorStop(0, "rgba(255,190,150,0)");
  trail.addColorStop(0.45, "rgba(255,190,150,0.16)");
  trail.addColorStop(0.6, "rgba(255,190,150,0.1)");
  trail.addColorStop(1, "rgba(255,190,150,0)");
  ctx.strokeStyle = trail;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(50, 74);
  ctx.lineTo(208, 96);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Small equirect sunset environment texture for scene.environment while this level is
 * loaded: ember horizon over dark teal water under an indigo sky, with a hot blob at the
 * sun azimuth. Three.js PMREMs equirect environment textures internally — this is a
 * one-time bake at load, entirely outside the composer pipeline.
 * @returns {THREE.CanvasTexture}
 */
function buildSunsetEnvTexture() {
  const w = 128;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#140a2a"); // zenith
  grad.addColorStop(0.34, "#4a1c4e");
  grad.addColorStop(0.46, "#a03a52");
  grad.addColorStop(0.5, "#ff7a36"); // horizon line
  grad.addColorStop(0.56, "#7a3a30"); // near water catching ember
  grad.addColorStop(0.75, "#123240"); // teal water
  grad.addColorStop(1.0, "#081a22"); // nadir
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // * Hot sun blob on the horizon at the sun azimuth. Phase is NOT irrelevant — three's
  // * equirectUv() is `atan(dir.z, dir.x) * RECIPROCAL_PI2 + 0.5`, and dropping that +0.5
  // * put the blob at u = 0.390 when the sun is at u = 0.890: exactly 180° out, so every
  // * specular in the arena was lit from behind the camera instead of from the sun.
  const sunU = (((SUN_AZIMUTH / (Math.PI * 2)) + 0.5) % 1) * w;
  const blob = ctx.createRadialGradient(sunU, h / 2, 0, sunU, h / 2, 14);
  blob.addColorStop(0, "rgba(255, 226, 170, 0.95)");
  blob.addColorStop(0.35, "rgba(255, 150, 70, 0.55)");
  blob.addColorStop(1, "rgba(255, 110, 50, 0)");
  ctx.fillStyle = blob;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Tileable water normal map derived from layered radial-bump height noise via a Sobel
 * pass with wrap-around sampling (keeps the tile seamless). Drifted in update() for slow
 * wave motion — no vertex animation, no extra draw calls.
 * @returns {THREE.CanvasTexture}
 */
function buildWaterNormalTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Height field: mid-gray base + soft radial bumps (drawn wrapped at the borders).
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 110; i += 1) {
    const bx = Math.random() * size;
    const by = Math.random() * size;
    const r = 10 + Math.random() * 34;
    const up = Math.random() < 0.5;
    for (const [ox, oy] of [[0, 0], [-size, 0], [size, 0], [0, -size], [0, size]]) {
      const g = ctx.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, r);
      g.addColorStop(0, up ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)");
      g.addColorStop(1, "rgba(128,128,128,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx + ox, by + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Sobel height→normal conversion with wrap-around sampling.
  const src = ctx.getImageData(0, 0, size, size);
  const out = ctx.createImageData(size, size);
  const hAt = (x, y) => src.data[(((y + size) % size) * size + ((x + size) % size)) * 4];
  const strength = 5.0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) / 255;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) / 255;
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      out.data[idx + 0] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      out.data[idx + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      out.data[idx + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      out.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 26);
  // * Higher than the file's usual 4: a 900 m plane seen from 2–6 m of eye height is the
  // * most grazing-angle surface in the arena, which is exactly where anisotropy pays.
  // * three clamps to the device max at upload, so 8 is safe on hardware that offers less.
  tex.anisotropy = 8;
  return tex;
}

/**
 * Soft annular foam band where the station structure disturbs the water.
 * @returns {THREE.CanvasTexture}
 */
function buildFoamTexture() {
  // * Sized in WORLD metres, not texels. The ring's outer radius is ~58 m, so the texture
  // * spans a ~117 m square: at 512² that is 0.23 m per texel. The old 256²/420-blob build
  // * drew blobs of radius 1.5–6 texels = 0.7–2.7 m ACROSS — metre-wide discs, which read
  // * as lily pads the moment they were opaque enough to see. Foam has to be authored at
  // * decimetre scale, so: quarter-size blobs, ~17× as many, lower per-blob alpha, and the
  // * density carries the read instead of the opacity.
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  for (let i = 0; i < 7000; i += 1) {
    const a = Math.random() * Math.PI * 2;
    // Band roughly matching the RingGeometry's inner/outer proportion.
    const rFrac = 0.46 + Math.random() * 0.28;
    const r = rFrac * c;
    const blob = 0.8 + Math.random() * 1.6; // 0.18–0.55 m radius in world space
    const fade = 1 - Math.abs(rFrac - 0.58) / 0.16;
    ctx.fillStyle = `rgba(255, 236, 220, ${Math.max(0, fade) * (0.06 + Math.random() * 0.12)})`;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, blob, 0, Math.PI * 2);
    ctx.fill();
  }
  // * The blobs are hard-edged arcs, which read as gravel up close. One filtered blit turns
  // * them into spray — far cheaper than 7000 per-blob radial gradients. Drawn through a
  // * second canvas because self-drawImage under a filter is not reliably defined; a browser
  // * without ctx.filter support just keeps the crisp dots, which degrades gracefully.
  const soft = document.createElement("canvas");
  soft.width = size;
  soft.height = size;
  const softCtx = soft.getContext("2d");
  softCtx.filter = "blur(1.5px)";
  softCtx.drawImage(canvas, 0, 0);

  const tex = new THREE.CanvasTexture(soft);
  return tex;
}

/**
 * Diagonal hazard stripes for corner bollards, with worn scratches.
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
  // Wear: chipped scratches through the paint.
  for (let i = 0; i < 14; i += 1) {
    const v = Math.random() < 0.5 ? "rgba(230,230,235,0.35)" : "rgba(20,20,26,0.4)";
    ctx.strokeStyle = v;
    ctx.lineWidth = 0.8 + Math.random();
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Dense holographic glyph band for the podium core: dual rulers, data blocks, tick
 * clusters, and soft scanlines — transparent for additive blending.
 * @returns {THREE.CanvasTexture}
 */
function buildHologlyphTexture() {
  const w = 512;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  // Soft vertical wash so the band reads as volume, not a flat strip.
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, "rgba(255,178,44,0)");
  wash.addColorStop(0.2, "rgba(255,178,44,0.08)");
  wash.addColorStop(0.5, "rgba(255,200,90,0.14)");
  wash.addColorStop(0.8, "rgba(255,178,44,0.08)");
  wash.addColorStop(1, "rgba(255,178,44,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  // Outer ruler rails.
  ctx.strokeStyle = "rgba(255,220,140,0.85)";
  ctx.lineWidth = 1.5;
  for (const y of [10, h - 10]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Inner dashed rails.
  ctx.strokeStyle = "rgba(255,180,60,0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 5]);
  for (const y of [28, h - 28]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Segment ticks (major / minor).
  for (let x = 0; x < w; x += 8) {
    const major = x % 40 === 0;
    ctx.fillStyle = major ? "rgba(255,236,190,0.9)" : "rgba(255,190,70,0.45)";
    const th = major ? 14 : 7;
    ctx.fillRect(x, 10, major ? 2 : 1, th);
    ctx.fillRect(x, h - 10 - th, major ? 2 : 1, th);
  }

  // Data histogram blocks.
  for (let x = 4; x < w; x += 7) {
    if (Math.random() < 0.22) continue;
    const bh = 8 + Math.random() * 48;
    const alpha = 0.3 + Math.random() * 0.55;
    ctx.fillStyle = `rgba(255,${160 + Math.floor(Math.random() * 60)},40,${alpha})`;
    ctx.fillRect(x, (h - bh) * 0.5, 4, bh);
  }

  // Bit-packet clusters (small rect grids).
  for (let i = 0; i < 18; i += 1) {
    const bx = Math.floor(Math.random() * (w - 40));
    const by = 32 + Math.floor(Math.random() * 40);
    ctx.fillStyle = "rgba(255,240,200,0.55)";
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        if (Math.random() < 0.35) continue;
        ctx.fillRect(bx + c * 4, by + r * 4, 3, 3);
      }
    }
  }

  // Horizontal scanlines.
  ctx.strokeStyle = "rgba(255,210,120,0.12)";
  ctx.lineWidth = 1;
  for (let y = 16; y < h - 16; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Station callsign chips.
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = "rgba(255,230,180,0.7)";
  ctx.textBaseline = "middle";
  /** @type {Array<[string, number]>} */
  const chips = [["SUNDIAL", 24], ["SOL-07", 180], ["GNOMON", 320], ["SYNC", 440]];
  for (const [label, x] of chips) {
    ctx.fillText(label, x, h * 0.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Radial dial face for the hologram gnomon plate — octant ticks + concentric rings.
 * @returns {THREE.CanvasTexture}
 */
function buildHoloDialTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);

  // Soft disc glow.
  const glow = ctx.createRadialGradient(c, c, 8, c, c, c - 4);
  glow.addColorStop(0, "rgba(255,200,90,0.35)");
  glow.addColorStop(0.55, "rgba(255,160,40,0.12)");
  glow.addColorStop(1, "rgba(255,140,30,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,220,140,0.75)";
  ctx.lineWidth = 2;
  for (const r of [0.92, 0.68, 0.42, 0.18]) {
    ctx.beginPath();
    ctx.arc(c, c, c * r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 32 radial ticks (8 major).
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * Math.PI * 2;
    const major = i % 4 === 0;
    const r0 = c * (major ? 0.5 : 0.72);
    const r1 = c * 0.92;
    ctx.strokeStyle = major ? "rgba(255,236,190,0.9)" : "rgba(255,180,70,0.4)";
    ctx.lineWidth = major ? 2.2 : 1;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Octagon outline.
  ctx.strokeStyle = "rgba(255,200,100,0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = Math.PI / 8 + i * (Math.PI / 4);
    const x = c + Math.cos(a) * c * 0.88;
    const y = c + Math.sin(a) * c * 0.88;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Center pip.
  ctx.fillStyle = "rgba(255,240,200,0.95)";
  ctx.beginPath();
  ctx.arc(c, c, 5, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
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

/**
 * Full floor-collider layout for a given deck circumradius. Exported for the floor
 * regression test (tests/zanzibarFloor.test.js).
 *
 * Deck + podium caps: a regular octagon with apothem A (flats normal to the k·45°
 * directions) is EXACTLY the union of four rectangles rotated 45° apart, each with
 * half-length A and half-width A·tan(22.5°) — so four overlapping cuboids give a
 * jitter-free all-cuboid floor whose union matches the visual octagon with zero gaps
 * and zero overhang. The podium ramp stays a convex hull, tucked below both planes it
 * meets (see PODIUM_TUCK / PODIUM_CREST_TUCK).
 *
 * @param {number} circumR Deck circumradius in meters.
 * @returns {{
 *   deckRects: { yaw: number, halfLength: number, halfWidth: number, halfHeight: number, centerY: number }[],
 *   podiumCaps: { yaw: number, halfLength: number, halfWidth: number, halfHeight: number, centerY: number }[],
 *   podiumHull: Float32Array,
 * }}
 */
export function getZanzibarFloorColliderSpec(circumR) {
  const tanHalf = Math.tan(HALF_ANGLE);
  /** Four rotated rectangles whose union is the octagon of the given apothem. */
  const octRects = (apothem, topY, halfHeight) =>
    [0, 1, 2, 3].map((k) => ({
      yaw: k * (Math.PI / 4),
      halfLength: apothem,
      halfWidth: apothem * tanHalf,
      halfHeight,
      centerY: topY - halfHeight,
    }));
  return {
    deckRects: octRects(circumR * COS_HALF, 0, DECK_THICKNESS / 2),
    podiumCaps: octRects(PODIUM_TOP_R * COS_HALF, PODIUM_HEIGHT, PODIUM_CAP_THICKNESS / 2),
    podiumHull: buildOctHullVertices(
      PODIUM_BASE_R, PODIUM_HEIGHT - PODIUM_CREST_TUCK, -PODIUM_TUCK, PODIUM_TOP_R,
    ),
  };
}

// ===== Sub-builders =====

/**
 * Ocean (with drifting ripple normals), sun-path glint strips, sun disc + halo, sky dome,
 * island silhouettes with settlement lights, distant wind turbines, gulls, and the foam
 * ring around the station's waterline.
 *
 * @param {THREE.Scene} scene
 * @param {number} circumR Deck circumradius (sizes the foam ring).
 * @returns {{ group: THREE.Group, sunDir: THREE.Vector3,
 *   update: (timeMs: number) => void, waterMat: THREE.Material | null,
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[], ownedTextures: THREE.Texture[],
 *   lodProps: (THREE.Object3D | null)[] }}
 */
function buildSeascape(scene, circumR) {
  const lowQ = isLowQualityMode();
  const group = new THREE.Group();
  /** @type {THREE.BufferGeometry[]} */
  const ownedGeometries = [];
  /** @type {THREE.Material[]} */
  const ownedMaterials = [];
  /** @type {THREE.Texture[]} */
  const ownedTextures = [];

  // Ocean plane — ripple normals drift in update() (skipped in Low Quality).
  const waterGeo = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, 1, 1);
  let waterNormalTex = null;
  if (!lowQ) {
    waterNormalTex = buildWaterNormalTexture();
    ownedTextures.push(waterNormalTex);
  }
  // * Deep ink ocean with a warm bias — pure teal under the platform read as a cold blue
  // * ring against sunset fog; slight amber in the base color keeps near-water coherent.
  // * Water is a DIELECTRIC. metalness 0.82 gave it F0 (0.0129, 0.0217, 0.0279) — below the
  // * 0.04 dielectric floor in every channel, so it reflected less than glass while metalness
  // * simultaneously killed its diffuse. ior 1.333 is water's real value (F0 ≈ 0.0203).
  const waterMat = createPhysicalMaterial({
    color: 0x14242c,
    // * Low builds no normal map, so at 0.22 its ocean was a smooth near-mirror with nothing
    // * to break it up — plastic, not water. Roughness is the one knob that fixes that at
    // * zero per-pixel cost, which is what a touch tier can afford (D-SUNDIAL-OQ6).
    roughness: lowQ ? 0.5 : 0.22,
    metalness: 0.02,
    ior: 1.333,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.58,
    ...(waterNormalTex ? { normalMap: waterNormalTex, normalScale: new THREE.Vector2(0.75, 0.75) } : {}),
  });
  waterMat.userData.envMapIntensityScale = 0.58;
  // * Own the envMap, the clampFloorEnv pattern from arena.js. Materials that merely inherit
  // * scene.environment ignore envMapIntensity (three r152+, see scene.js), so the 0.58 above
  // * was inert design intent. Assigning it here makes that scale a live knob.
  // * This is a ONE-SHOT: refreshSceneEnvironmentMaterials reapplies intensity but never
  // * assigns envMap, so a miss here fails silently forever. Safe because the caller sets
  // * scene.environment (:2705) before it calls buildSeascape (:2708).
  if (scene.environment) waterMat.envMap = scene.environment;
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

  // * Soft-limbed disc: white-hot core melting to transparent, so the bloom pass sees
  // * a falloff instead of a saturated hard-edged plate (the run-2 cross flare).
  const sunTex = buildSoftDiscTexture([
    [0.0, "#ffffff"],
    [0.62, "#fff2d8"],
    [0.78, "rgba(255,224,165,0.6)"],
    [1.0, "rgba(255,200,120,0)"],
  ]);
  const sunGeo = new THREE.CircleGeometry(34, 40);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xffe0b0,
    map: sunTex,
    transparent: true,
    // * Run-2 follow-up: "sun looks great now but a bit too bright" — uniform trim,
    // * falloff shape unchanged.
    opacity: 0.85,
    fog: false,
    depthWrite: false,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.copy(sunPos);
  sun.lookAt(0, SUN_HEIGHT, 0);
  group.add(sun);
  ownedGeometries.push(sunGeo);
  ownedMaterials.push(sunMat);
  ownedTextures.push(sunTex);

  // * Soft multi-halo — mood over sharpness (large dim outer + hot inner). Shared
  // * white-falloff texture; material color supplies each layer's tint. Peak opacity
  // * sits slightly above the old flat values because the gradient only reaches it
  // * at the center.
  const haloTex = buildSoftDiscTexture([
    [0.0, "rgba(255,255,255,1)"],
    [0.4, "rgba(255,255,255,0.45)"],
    [0.75, "rgba(255,255,255,0.12)"],
    [1.0, "rgba(255,255,255,0)"],
  ]);
  ownedTextures.push(haloTex);
  const haloGeo = new THREE.CircleGeometry(72, 40);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xff6a30,
    map: haloTex,
    transparent: true,
    opacity: 0.42,
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

  const outerHaloGeo = new THREE.CircleGeometry(120, 32);
  const outerHaloMat = new THREE.MeshBasicMaterial({
    color: 0xff4a18,
    map: haloTex,
    transparent: true,
    opacity: 0.18,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const outerHalo = new THREE.Mesh(outerHaloGeo, outerHaloMat);
  outerHalo.position.copy(sunPos).add(sunDir.clone().multiplyScalar(4));
  outerHalo.lookAt(0, SUN_HEIGHT, 0);
  group.add(outerHalo);
  ownedGeometries.push(outerHaloGeo);
  ownedMaterials.push(outerHaloMat);

  // * Soft god-ray shafts from the sun toward the deck — pure mood, no gameplay cost.
  let shaftMats = /** @type {THREE.MeshBasicMaterial[]} */ ([]);
  {
    // * Radial falloff stretched over the tall plane — the untextured flat-opacity
    // * planes rendered their long edges as a visible vertical line through the sun
    // * (run-2 "cross" report, vertical arm). Peak opacity up vs the flat values
    // * because the gradient only reaches it at the center.
    const shaftTex = buildSoftDiscTexture([
      [0.0, "rgba(255,255,255,0.9)"],
      [0.5, "rgba(255,255,255,0.34)"],
      [1.0, "rgba(255,255,255,0)"],
    ]);
    ownedTextures.push(shaftTex);

    /**
     * * Every shaft carries its own base opacity in userData, because the 500 ms sun-step
     * * block OVERWRITES material.opacity each tick. `dabdb6b` raised these constructors
     * * from 0.045 + i*0.012 to 0.085 + i*0.02, but never touched the animator, which kept
     * * writing the pre-rebalance 0.04 + i*0.01 — so the shafts have shipped at roughly 47%
     * * of their authored value ever since, and raising the constructor again would lose to
     * * the same line. Same lesson the foam pairing already carries two hundred lines down.
     */
    const addShaft = (geo, baseOpacity, yaw, tiltX, pos) => {
      const shaftMat = new THREE.MeshBasicMaterial({
        color: 0xff8a40,
        map: shaftTex,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      shaftMat.userData.baseOpacity = baseOpacity;
      ownedMaterials.push(shaftMat);
      shaftMats.push(shaftMat);
      const shaft = new THREE.Mesh(geo, shaftMat);
      shaft.rotation.order = "YXZ";
      shaft.rotation.y = yaw;
      shaft.rotation.x = tiltX;
      shaft.position.copy(pos);
      group.add(shaft);
      return shaft;
    };

    // Distant sky shafts over the water — the existing mood layer, High/Medium only.
    if (!lowQ) {
      const shaftGeo = new THREE.PlaneGeometry(18, 220, 1, 1);
      ownedGeometries.push(shaftGeo);
      for (let i = 0; i < 3; i += 1) {
        const pos = sunDir.clone().multiplyScalar(160);
        pos.y = WATER_Y + 28 + i * 4;
        // Fan slightly around the sun path.
        addShaft(shaftGeo, 0.085 + i * 0.02, -SUN_AZIMUTH + Math.PI / 2 + (i - 1) * 0.12, -0.22, pos);
      }
    }

    // * Deck-raking shafts. The three above sit at sunDir*160 and y 22-30 — 160 m out over
    // * open water and 22 m up, so nothing they do lands on the plate. These cross the arena
    // * instead, tilted to the sun key's own 9.93 deg rather than the sky layer's 12.6, so
    // * the beam angle agrees with the light that casts the shadows.
    // *
    // * Built on EVERY tier (D-SUNDIAL-OQ6). Three additive quads sharing one texture is not
    // * what makes Low slow, and raking light is most of what sells this arena.
    {
      const rakeGeo = new THREE.PlaneGeometry(15, 120, 1, 1);
      ownedGeometries.push(rakeGeo);
      const sunElevation = Math.atan2(SUN_HEIGHT, SUN_KEY_DISTANCE);
      const rakeCount = lowQ ? 2 : 3;
      for (let i = 0; i < rakeCount; i += 1) {
        const lateral = (i - (rakeCount - 1) / 2) * 0.19;
        const pos = sunDir.clone().multiplyScalar(12);
        pos.y = 4.2 + i * 1.7;
        // * tiltX is PI/2 - elevation, NOT -elevation. rakeGeo is 15 wide x 120 LONG, so its
        // * long axis is local +Y; at -elevation that axis stays near-vertical and the shaft
        // * renders as a light pillar (measured: the first build read as two vertical columns
        // * in the sky, not as anything touching the plate). Under the YXZ order used here,
        // * rotation.x = PI/2 - elevation lays local +Y down onto the sun direction, and the
        // * existing -SUN_AZIMUTH + PI/2 yaw is already exactly the azimuth term that pairs
        // * with it, so the beam runs along the light and grazes the deck.
        addShaft(rakeGeo, 0.05 + i * 0.014, -SUN_AZIMUTH + Math.PI / 2 + lateral, Math.PI / 2 - sunElevation, pos);
      }
    }
  }

  // * Horizon mood band — soft ember cylinder hugging the waterline so sea→sky melts.
  // * Alpha-graded vertically (hot at the waterline, melts upward) — the flat-opacity
  // * cylinder's hard top edge was the run-2 "cross" horizontal arm ("the distant fog
  // * ... needs to be blended like the sun is").
  {
    const hazeTex = buildSoftStripTexture([
      [0.0, "rgba(255,255,255,1)"],
      [0.35, "rgba(255,255,255,0.55)"],
      [1.0, "rgba(255,255,255,0)"],
    ]);
    ownedTextures.push(hazeTex);
    const hazeGeo = new THREE.CylinderGeometry(WATER_SIZE * 0.42, WATER_SIZE * 0.42, 28, 48, 1, true);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: 0xff5a22,
      map: hazeTex,
      transparent: true,
      opacity: 0.11,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.position.y = WATER_Y + 8;
    group.add(haze);
    ownedGeometries.push(hazeGeo);
    ownedMaterials.push(hazeMat);
  }

  // * Soft sun-path bloom on the water (replaces hard rectangular glint strips that read
  // * as a flat "wave patch"). Single radial-fade disc, no scrolling streak noise.
  // * Built on every tier including Low (D-SUNDIAL-OQ6) — one additive quad, and it is one
  // * of the two golden-hour signatures Low was stripping.
  let glintMat = null;
  {
    const glintCanvas = document.createElement("canvas");
    glintCanvas.width = glintCanvas.height = 256;
    {
      const gctx = glintCanvas.getContext("2d");
      const g = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
      g.addColorStop(0, "rgba(255, 220, 160, 0.55)");
      g.addColorStop(0.25, "rgba(255, 170, 80, 0.22)");
      g.addColorStop(0.55, "rgba(255, 120, 40, 0.08)");
      g.addColorStop(1, "rgba(255, 100, 30, 0)");
      gctx.fillStyle = g;
      gctx.fillRect(0, 0, 256, 256);

      // * Distance attenuation has to live in ALPHA, because fog cannot supply it here.
      // * three runs <fog_fragment> after <tonemapping_fragment> and fog only mixes .rgb —
      // * so toneMapped:false is downstream of the problem and flipping it changes nothing.
      // * Worse: the fog colour IS the ember hex (0xff5a22), so at the far end fog replaced
      // * ~70% of this quad's colour with the brightest thing in the palette, and
      // * AdditiveBlending then added it at full alpha, straight into bloom above 1.0.
      // * This ramp bakes FogExp2 transmittance exp(-(d*density)^2) across the plane's
      // * 90 m → 310 m span along the sun axis: 0.90 near, 0.60 mid, 0.30 far.
      // * Canvas y=0 is the NEAR end — measured, not assumed: the plane's v axis reaches
      // * world through rotation.x = -PI/2 AND rotation.z, and the first build had the ramp
      // * backwards (it dimmed the near end 18% and left the far end alone).
      const fade = gctx.createLinearGradient(0, 0, 0, 256);
      fade.addColorStop(0, "rgba(0,0,0,0.90)");
      fade.addColorStop(0.5, "rgba(0,0,0,0.60)");
      fade.addColorStop(1, "rgba(0,0,0,0.30)");
      gctx.globalCompositeOperation = "destination-in";
      gctx.fillStyle = fade;
      gctx.fillRect(0, 0, 256, 256);
      gctx.globalCompositeOperation = "source-over";
    }
    const glintTex = new THREE.CanvasTexture(glintCanvas);
    glintTex.colorSpace = THREE.SRGBColorSpace;
    ownedTextures.push(glintTex);
    glintMat = new THREE.MeshBasicMaterial({
      map: glintTex,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    // * Elongated toward the sun so it reads as a light path, not a hard rectangle.
    const glintGeo = new THREE.PlaneGeometry(95, 220, 1, 1);
    const glint = new THREE.Mesh(glintGeo, glintMat);
    glint.rotation.x = -Math.PI / 2;
    glint.rotation.z = -SUN_AZIMUTH + Math.PI / 2;
    glint.position.copy(sunDir.clone().multiplyScalar(200));
    glint.position.y = WATER_Y + 0.12;
    group.add(glint);
    ownedGeometries.push(glintGeo);
    ownedMaterials.push(glintMat);
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
  // * The four-tone haze ladder was MEASURED and cut to one. At 300-400 m this fog
  // * (FogExp2, density 0.00355, colour #ff5a22) runs 68-87%, which puts a floor of ~215
  // * red under every one of these meshes: authored #140a10 renders [215,75,29] and PURE
  // * BLACK at the same distance renders [215,74,27]. The authored colour was worth 0-1
  // * levels per layer. Atmospheric perspective here is the fog's job, not the palette's —
  // * so one material, and the ridges are differentiated by SILHOUETTE instead (below).
  const islandMat = new THREE.MeshBasicMaterial({ color: 0x140a10 });
  ownedMaterials.push(islandMat);
  // * 7 radial segments read as a faceted pyramid this close to camera-facing; 18 rounds
  // * the outline without costing anything meaningful at three ridges.
  const coneGeo = new THREE.ConeGeometry(1, 1, 18);
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
  const ridgeRng = makeCityRng(0x151a9d01);
  const addRidge = (azimuth, dist, parts, mat, yLift = 0) => {
    const island = new THREE.Group();
    island.position.set(Math.cos(azimuth) * dist, WATER_Y + yLift, Math.sin(azimuth) * dist);
    let offset = 0;
    for (const [w, h, kind] of parts) {
      const m = new THREE.Mesh(kind === 0 ? coneGeo : boxGeo, mat);
      // * Every part used to take the ridge's own rotation and a scale of (w, h, w), so all
      // * the facet seams lined up down the chain and every cone was a perfect circle in
      // * plan. Per-part yaw plus a slightly non-uniform XZ breaks both. Seeded, so this is
      // * the same skyline on every load — the alien city's Math.random() bug, not repeated.
      m.scale.set(w * (0.86 + ridgeRng() * 0.28), h, w * (0.86 + ridgeRng() * 0.28));
      m.rotation.y = ridgeRng() * Math.PI * 2;
      m.position.set(offset, h / 2, offset * 0.4);
      island.add(m);
      offset += w * 0.7; // chain spacing stays on the authored width, not the jittered one
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

  // * All three clusters take the SAME material now — the tier tones were measured to be
  // * worth 0-1 levels each under this fog (see the note above the material). Depth comes
  // * from distance, silhouette and the haze layer's yLift, which is where it was always
  // * actually coming from.
  // Closest cluster — largest silhouette.
  addIsland(
    SUN_AZIMUTH + 0.55, 300,
    [[76, 37, 0], [50, 24, 0], [64, 29, 0]], islandMat,
    [[40, 20, 0], [30, 15, 0]], islandMat,
  );
  // Mid cluster — jagged rock spires, the group that reads most as a silhouette.
  addIsland(
    SUN_AZIMUTH - 0.5, 335,
    [[11, 60, 1], [8, 88, 1], [13, 48, 1], [9, 68, 1]], islandMat,
    [[6, 40, 1], [5, 55, 1]], islandMat,
  );
  // Farthest cluster — smallest silhouette, nearly merged with the horizon glow.
  addIsland(
    SUN_AZIMUTH + 1.6, 365,
    [[28, 19, 0], [16, 32, 0]], islandMat,
    [[18, 12, 0]], islandMat,
  );

  // Settlement lights on the closest island — a handful of warm pixel dots that read as a
  // far-off harbor town (constant pixel size; unfogged so they punch through the haze).
  {
    const lightPositions = [];
    const baseAz = SUN_AZIMUTH + 0.55;
    for (let i = 0; i < 7; i += 1) {
      // * These sat at 296-306 m with only ±0.05 rad of jitter — the same azimuth and
      // * distance as the island itself, whose SMALLEST cone has a 50 m radius. Every dot
      // * landed within ±15 m of that silhouette's axis at knee height, i.e. depth-buried
      // * inside it on every RNG draw. The near ridge's largest cone is 76 m, so the
      // * island's near shore is at 300 − 76 = 224 m: put the town there, where the cone
      // * surface has fallen to ~0 m and the dots read against its lower slope instead.
      const az = baseAz + (Math.random() - 0.5) * 0.44; // ±0.22 rad ⇒ ±50 m across its face
      const d = 224 + Math.random() * 12;
      lightPositions.push(
        Math.cos(az) * d,
        WATER_Y + 1.0 + Math.random() * 9, // staggered — a hillside town, not one row
        Math.sin(az) * d,
      );
    }
    const dotsGeo = new THREE.BufferGeometry();
    dotsGeo.setAttribute("position", new THREE.Float32BufferAttribute(lightPositions, 3));
    const dotsMat = new THREE.PointsMaterial({
      color: 0xffc27a,
      size: 2.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      fog: false,
      depthWrite: false,
    });
    const dots = new THREE.Points(dotsGeo, dotsMat);
    group.add(dots);
    ownedGeometries.push(dotsGeo);
    ownedMaterials.push(dotsMat);
  }

  // Offshore wind farm — three distant turbines, fogged like the islands so they sit in
  // the same haze tier. Slow rotor motion sells the "working facility" horizon.
  const turbineMat = new THREE.MeshBasicMaterial({ color: 0x2a141d });
  ownedMaterials.push(turbineMat);
  const towerGeo = new THREE.CylinderGeometry(0.6, 1.3, 26, 6);
  // * The rotor was ONE BoxGeometry(0.9, 24, 0.3) spinning about its centre — a rectangular
  // * paddle, which is why it read as a radar dish rather than a turbine. Now three blades
  // * and a hub merged into a single geometry, so three rotor meshes still cost three draw
  // * calls. Swept radius stays ~12 m: the horizon silhouette keeps its scale, not its shape.
  const bladeGeo = new THREE.BoxGeometry(0.7, 11.5, 0.22);
  bladeGeo.translate(0, 6.15, 0); // root at the hub, tip outward
  const hubGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.2, 8);
  hubGeo.rotateX(Math.PI / 2); // axis along local Z, the spin axis
  /** @type {THREE.BufferGeometry[]} */
  const rotorParts = [hubGeo];
  for (let b = 0; b < 3; b += 1) {
    const blade = bladeGeo.clone();
    blade.rotateZ((b * Math.PI * 2) / 3);
    rotorParts.push(blade);
  }
  const rotorGeo = BufferGeometryUtils.mergeGeometries(rotorParts, false);
  for (const g of rotorParts) g.dispose();
  bladeGeo.dispose();
  const nacelleGeo = new THREE.BoxGeometry(1.6, 1.5, 4.2);
  ownedGeometries.push(towerGeo, rotorGeo, nacelleGeo);
  const rotors = [];
  // * 0.00042 rad/ms is 4.0 RPM — a slow sweep. Utility turbines run 10-20; these are
  // * 12.0 / 10.5 / 13.5 RPM, kept non-harmonic so the three never lock into step.
  const turbineSpecs = [
    { az: SUN_AZIMUTH - 1.05, dist: 290, spin: 0.00126 },
    { az: SUN_AZIMUTH + 1.15, dist: 325, spin: 0.00110 },
    { az: SUN_AZIMUTH + 2.55, dist: 350, spin: 0.00141 },
  ];
  const towers = new THREE.InstancedMesh(towerGeo, turbineMat, turbineSpecs.length);
  // * The nacelle is fixed to the tower head, so it must NOT spin with the blades — its own
  // * instanced mesh rather than part of the rotor geometry. One extra draw call, total 5.
  const nacelles = new THREE.InstancedMesh(nacelleGeo, turbineMat, turbineSpecs.length);
  for (let i = 0; i < turbineSpecs.length; i += 1) {
    const t = turbineSpecs[i];
    const x = Math.cos(t.az) * Math.min(t.dist, ISLAND_MAX_DIST);
    const z = Math.sin(t.az) * Math.min(t.dist, ISLAND_MAX_DIST);
    _dummy.position.set(x, WATER_Y + 13, z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    towers.setMatrixAt(i, _dummy.matrix);

    // Nacelle sits at hub height, long axis pointing back down the arena bearing.
    _dummy.position.set(x, WATER_Y + 26, z);
    _dummy.lookAt(0, WATER_Y + 26, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    nacelles.setMatrixAt(i, _dummy.matrix);

    const rotor = new THREE.Mesh(rotorGeo, turbineMat);
    rotor.position.set(x, WATER_Y + 26, z);
    rotor.lookAt(0, WATER_Y + 26, 0);
    rotor.translateZ(2.3); // clear of the nacelle, on the arena-facing side
    rotor.userData.spin = t.spin;
    rotor.userData.phase = i * 1.7;
    group.add(rotor);
    rotors.push(rotor);
  }
  towers.instanceMatrix.needsUpdate = true;
  nacelles.instanceMatrix.needsUpdate = true;
  group.add(towers);
  group.add(nacelles);

  // Orbital gate — a colossal half-submerged ring on the horizon, plane facing the
  // arena, with a sparse arc of slowly-pulsing guidance lights. Fogged like the islands
  // so it reads as a distant silhouette, not a prop.
  let gateDotsMat = null;
  {
    const gateGroup = new THREE.Group();
    const gateAz = SUN_AZIMUTH - 2.0;
    const gateDist = Math.min(370, ISLAND_MAX_DIST);
    gateGroup.position.set(Math.cos(gateAz) * gateDist, WATER_Y + 10, Math.sin(gateAz) * gateDist);
    gateGroup.lookAt(0, WATER_Y + 10, 0);

    const gateGeo = new THREE.TorusGeometry(48, 3, 8, 28);
    const gateMat = new THREE.MeshBasicMaterial({ color: 0x241019 });
    ownedGeometries.push(gateGeo);
    ownedMaterials.push(gateMat);
    gateGroup.add(new THREE.Mesh(gateGeo, gateMat));

    const dotPositions = [];
    for (let i = 0; i < 7; i += 1) {
      const a = Math.PI * (0.15 + (i / 6) * 0.7); // upper arc only
      dotPositions.push(Math.cos(a) * 48, Math.sin(a) * 48, 3.2);
    }
    const gateDotsGeo = new THREE.BufferGeometry();
    gateDotsGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3));
    gateDotsMat = new THREE.PointsMaterial({
      color: 0x8fd9ff,
      size: 2.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.55,
      fog: false,
      depthWrite: false,
    });
    ownedGeometries.push(gateDotsGeo);
    ownedMaterials.push(gateDotsMat);
    gateGroup.add(new THREE.Points(gateDotsGeo, gateDotsMat));
    group.add(gateGroup);
  }

  // Alien city skyline — slab skyscrapers with grids of lit floors, connected by a sky
  // bridge, opposite the sun so they hold as dark shapes against the dusk. Boxes (not
  // cones — the cone version read as "messed up mountains"), varied yaws and setbacks,
  // one needle antenna on the tallest.
  {
    const cityMat = new THREE.MeshBasicMaterial({ color: 0x1d0f1a });
    ownedMaterials.push(cityMat);
    const cityGeo = new THREE.BoxGeometry(1, 1, 1);
    ownedGeometries.push(cityGeo);
    const cityAz = SUN_AZIMUTH + 3.05;
    const cityDist = Math.min(380, ISLAND_MAX_DIST);
    const cx = Math.cos(cityAz) * cityDist;
    const cz = Math.sin(cityAz) * cityDist;
    const lateralX = -Math.sin(cityAz);
    const lateralZ = Math.cos(cityAz);

    // { off: lateral offset, w/d: footprint, h: height, yaw: twist } — the two-part
    // entries stack a setback tower on a wider base (classic arcology silhouette).
    const towerSpecs = [
      { off: -44, w: 13, d: 9, h: 62, yaw: 0.3 },
      { off: -26, w: 10, d: 10, h: 96, yaw: -0.2 },
      { off: -26, w: 16, d: 14, h: 40, yaw: -0.2 }, // base block under the 96m tower
      { off: -2, w: 12, d: 8, h: 128, yaw: 0.15 }, // the landmark
      { off: -2, w: 1.6, d: 1.6, h: 26, yaw: 0, yLift: 128 }, // its needle antenna
      { off: 20, w: 9, d: 9, h: 74, yaw: 0.5 },
      { off: 38, w: 14, d: 10, h: 52, yaw: -0.35 },
      // Sky bridge between the 96m and 128m towers, high up.
      { off: -14, w: 26, d: 2.2, h: 2.6, yaw: 0.02, yLift: 66 },
    ];
    const city = new THREE.InstancedMesh(cityGeo, cityMat, towerSpecs.length);
    const windowPositions = [];
    const windowColors = [];
    // * Seeded, not Math.random(): the skyline's lit pattern used to reroll on every level
    // * load, so the same city was a different city each time you arrived. Same mulberry32
    // * shape backroomsSupermarket.js:103 uses, with its own constant.
    const cityRng = makeCityRng(0x5c17a11d);
    for (let i = 0; i < towerSpecs.length; i += 1) {
      const t = towerSpecs[i];
      const bx = cx + lateralX * t.off;
      const bz = cz + lateralZ * t.off;
      const baseY = WATER_Y + (t.yLift ?? 0);
      _dummy.position.set(bx, baseY + t.h / 2, bz);
      _dummy.rotation.set(0, cityAz + t.yaw, 0);
      _dummy.scale.set(t.w, t.h, t.d);
      _dummy.updateMatrix();
      city.setMatrixAt(i, _dummy.matrix);
      // Lit-floor dots up the arena-facing face of the real towers (skip bridge/needle).
      if (t.h > 30) {
        const floors = Math.floor(t.h / 11);
        for (let f = 1; f <= floors; f += 1) {
          if (cityRng() < 0.35) continue; // dark floors keep it organic
          // * 3-5 windows per lit floor, not one. A single dot per floor reads as a column
          // * of pin-pricks; a short row reads as a storey with the lights on.
          const perFloor = 3 + Math.floor(cityRng() * 3);
          for (let wI = 0; wI < perFloor; wI += 1) {
            const across = (cityRng() - 0.5) * t.w * 0.8;
            windowPositions.push(
              bx + lateralX * across - Math.cos(cityAz) * (t.d / 2 + 0.5),
              baseY + f * 11 - 4,
              bz + lateralZ * across - Math.sin(cityAz) * (t.d / 2 + 0.5),
            );
            // * Static per-window brightness, written once — no per-frame cost and, unlike
            // * flicker, it survives a capture. Uniformly lit windows read as stamped; a
            // * spread reads as inhabited. Multiplies winMat.color, so the hue is unchanged.
            const b = 0.45 + cityRng() * 0.55;
            windowColors.push(b, b, b);
          }
        }
      }
    }
    city.instanceMatrix.needsUpdate = true;
    group.add(city);

    const winGeo = new THREE.BufferGeometry();
    winGeo.setAttribute("position", new THREE.Float32BufferAttribute(windowPositions, 3));
    winGeo.setAttribute("color", new THREE.Float32BufferAttribute(windowColors, 3));
    const winMat = new THREE.PointsMaterial({
      color: 0x9fe8ff,
      vertexColors: true, // per-window brightness, baked once (see the loop above)
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.45,
      fog: false,
      depthWrite: false,
    });
    ownedGeometries.push(winGeo);
    ownedMaterials.push(winMat);
    group.add(new THREE.Points(winGeo, winMat));
  }

  // Ringed planet + companion moon — the unmistakable "not on Earth" signal, hung high
  // in the dusk sky away from the sun. Unlit, unfogged, translucent so it sits IN the
  // sky gradient instead of on top of it (same treatment as the sun disc).
  {
    const planetGroup = new THREE.Group();
    const planetAz = SUN_AZIMUTH - 2.4;
    const planetDistH = 350;
    // * Elevation ~22° — the chase camera sees up to ~27° above horizontal, so any
    // * higher and the planet lives permanently above the top of the frame.
    planetGroup.position.set(
      Math.cos(planetAz) * planetDistH, 140, Math.sin(planetAz) * planetDistH,
    );
    planetGroup.lookAt(0, 0, 0);

    // Banded disc — tiny canvas keeps the gas-giant read without a real texture asset.
    const bandCanvas = document.createElement("canvas");
    bandCanvas.width = 64;
    bandCanvas.height = 64;
    const bctx = bandCanvas.getContext("2d");
    bctx.fillStyle = "#d9b3cf";
    bctx.fillRect(0, 0, 64, 64);
    const bands = [
      { y: 10, h: 6, c: "rgba(168,118,158,0.7)" },
      { y: 24, h: 4, c: "rgba(190,138,150,0.55)" },
      { y: 34, h: 8, c: "rgba(158,108,148,0.65)" },
      { y: 50, h: 5, c: "rgba(184,132,164,0.5)" },
    ];
    for (const band of bands) {
      bctx.fillStyle = band.c;
      bctx.fillRect(0, band.y, 64, band.h);
    }
    // * Limb darkening + terminator, multiplied over the bands. Without these the disc is
    // * uniformly bright to its rim, which is what made it read as a sticker rather than a
    // * sphere. CircleGeometry maps its disc into the 0-1 UV square, so a gradient centred
    // * at (32,32) with radius 32 lands exactly on the limb.
    bctx.globalCompositeOperation = "multiply";
    const limb = bctx.createRadialGradient(32, 32, 12, 32, 32, 32);
    limb.addColorStop(0, "#ffffff");
    limb.addColorStop(0.72, "#cfc4cc");
    limb.addColorStop(1, "#6b5866");
    bctx.fillStyle = limb;
    bctx.fillRect(0, 0, 64, 64);
    // * Terminator: the sun is 137° around from this planet, so one side is night. Offset
    // * the shadow centre rather than using a hard edge — a gas giant's terminator is soft.
    // * Which side was picked by CAPTURE, not derived: the planet is lookAt(0,0,0) so the
    // * texture-space direction to the sun runs through the same composition that had the
    // * glint ramp backwards on its first build.
    const term = bctx.createRadialGradient(50, 30, 6, 42, 32, 46);
    term.addColorStop(0, "#ffffff");
    term.addColorStop(0.55, "#b9a8b4");
    term.addColorStop(1, "#41323c");
    bctx.fillStyle = term;
    bctx.fillRect(0, 0, 64, 64);
    bctx.globalCompositeOperation = "source-over";
    const bandTex = new THREE.CanvasTexture(bandCanvas);
    bandTex.colorSpace = THREE.SRGBColorSpace;
    ownedTextures.push(bandTex);

    const planetGeo = new THREE.CircleGeometry(34, 40);
    // * depthWrite TRUE, unlike every other sky element here. Both this and the ring wrote
    // * no depth, so the ring's FAR half drew straight through the planet — the giveaway
    // * that nothing in this group was occluding anything. The band texture is fully
    // * opaque, so the disc writes clean depth; the ring's near half is closer and still
    // * draws over. renderOrder pins the planet first so the ring is tested against it.
    const planetMat = new THREE.MeshBasicMaterial({
      map: bandTex,
      transparent: true,
      opacity: 0.5,
      fog: false,
      depthWrite: true,
    });
    ownedGeometries.push(planetGeo);
    ownedMaterials.push(planetMat);
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.renderOrder = -1;
    planetGroup.add(planet);

    const ringGeo = new THREE.RingGeometry(42, 60, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xd9c0d4,
      transparent: true,
      opacity: 0.28,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    ownedGeometries.push(ringGeo);
    ownedMaterials.push(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = 1.25; // tilt the ring plane out of the disc plane
    planetGroup.add(ring);

    // * The moon had no map at all — a flat uniform circle next to a planet that now has a
    // * limb. Its own small canvas, same treatment at moon scale: limb darkening plus a
    // * terminator on the same side as the planet's, since they share a sun.
    const moonCanvas = document.createElement("canvas");
    moonCanvas.width = 32;
    moonCanvas.height = 32;
    const mctx = moonCanvas.getContext("2d");
    mctx.fillStyle = "#d8ccd8";
    mctx.fillRect(0, 0, 32, 32);
    mctx.globalCompositeOperation = "multiply";
    const moonLimb = mctx.createRadialGradient(16, 16, 5, 16, 16, 16);
    moonLimb.addColorStop(0, "#ffffff");
    moonLimb.addColorStop(0.7, "#cdc2ca");
    moonLimb.addColorStop(1, "#5f4f5b");
    mctx.fillStyle = moonLimb;
    mctx.fillRect(0, 0, 32, 32);
    const moonTerm = mctx.createRadialGradient(25, 15, 3, 21, 16, 23);
    moonTerm.addColorStop(0, "#ffffff");
    moonTerm.addColorStop(0.55, "#b5a5b1");
    moonTerm.addColorStop(1, "#3d2f39");
    mctx.fillStyle = moonTerm;
    mctx.fillRect(0, 0, 32, 32);
    mctx.globalCompositeOperation = "source-over";
    const moonTex = new THREE.CanvasTexture(moonCanvas);
    moonTex.colorSpace = THREE.SRGBColorSpace;
    ownedTextures.push(moonTex);

    const moonGeo = new THREE.CircleGeometry(6.5, 24);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xd8ccd8,
      map: moonTex,
      transparent: true,
      opacity: 0.45,
      fog: false,
      depthWrite: false,
    });
    ownedGeometries.push(moonGeo);
    ownedMaterials.push(moonMat);
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(64, -30, 0);
    planetGroup.add(moon);

    group.add(planetGroup);
  }

  // Spaceships — three distant craft on slow orbits around the station, each trailing a
  // cool engine glow (skipped in Low Quality; matrices rebuilt per frame, no allocations).
  // * Built on every tier including Low (D-SUNDIAL-OQ6). Three box instances plus a
  // * three-point glow cloud — the first OQ6 item with ongoing rather than one-off cost,
  // * and small enough to be worth it: the ships are what make this horizon feel inhabited.
  let ships = null;
  let shipGlowGeo = null;
  const shipStates = [];
  {
    const shipGeo = new THREE.BoxGeometry(7, 0.7, 2.4);
    const shipMat = new THREE.MeshBasicMaterial({ color: 0x1c0f16 });
    ownedGeometries.push(shipGeo);
    ownedMaterials.push(shipMat);
    ships = new THREE.InstancedMesh(shipGeo, shipMat, 3);
    for (let i = 0; i < 3; i += 1) {
      shipStates.push({
        radius: 255 + i * 38,
        height: 52 + i * 17,
        speed: (0.000020 + i * 0.000007) * (i === 1 ? -1 : 1),
        phase: i * 2.3,
      });
    }
    group.add(ships);

    shipGlowGeo = new THREE.BufferGeometry();
    shipGlowGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    // * A mapless PointsMaterial draws a hard square — these engine glows were flat 3×3 px
    // * additive plates. That is precisely the shape buildSoftDiscTexture exists to avoid
    // * (see its docstring: a flat-opacity additive shape hands bloom a saturated plate, the
    // * run-2 cross flare). White stops so the material's 0x7ad9ff multiplies through, same
    // * as the sun and halo layers. Size goes 3 → 6 in the SAME change on purpose: a
    // * gradient needs pixels to resolve in, and at 3 px a soft disc is still a square.
    const shipGlowTex = buildSoftDiscTexture([
      [0.0, "#ffffff"],
      [0.35, "rgba(255,255,255,0.45)"],
      [1.0, "rgba(255,255,255,0)"],
    ]);
    ownedTextures.push(shipGlowTex);
    const shipGlowMat = new THREE.PointsMaterial({
      color: 0x7ad9ff,
      map: shipGlowTex,
      size: 6.0,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    ownedGeometries.push(shipGlowGeo);
    ownedMaterials.push(shipGlowMat);
    group.add(new THREE.Points(shipGlowGeo, shipGlowMat));
  }

  // Gulls — a handful of dark silhouettes circling the station (skipped in Low Quality).
  let gulls = null;
  const gullStates = [];
  if (!lowQ) {
    const gullGeo = new THREE.PlaneGeometry(1.7, 0.5);
    const gullMat = new THREE.MeshBasicMaterial({ color: 0x1c0f16, side: THREE.DoubleSide });
    ownedGeometries.push(gullGeo);
    ownedMaterials.push(gullMat);
    gulls = new THREE.InstancedMesh(gullGeo, gullMat, 5);
    for (let i = 0; i < 5; i += 1) {
      gullStates.push({
        radius: 52 + Math.random() * 34,
        height: 13 + Math.random() * 9,
        speed: (0.00009 + Math.random() * 0.00005) * (Math.random() < 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        flapPhase: Math.random() * Math.PI * 2,
      });
    }
    group.add(gulls);
  }

  // Foam wake at the station waterline — warm cream (not cool blue) so it melts into sunset.
  // * Built on every tier including Low (D-SUNDIAL-OQ6): one draw call and a 48-segment ring,
  // * and it is the waterline read that sells the station sitting IN the water, not on it.
  let foamMat = null;
  let foam = null;
  {
    const foamTex = buildFoamTexture();
    foamMat = new THREE.MeshBasicMaterial({
      map: foamTex,
      color: 0xffd2a8, // warm multiply — avoids icy blue ring under the deck
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const foamGeo = new THREE.RingGeometry(circumR * 0.78, circumR * 1.7, 48);
    foam = new THREE.Mesh(foamGeo, foamMat);
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = WATER_Y + 0.08;
    group.add(foam);
    ownedGeometries.push(foamGeo);
    ownedMaterials.push(foamMat);
    ownedTextures.push(foamTex);
  }

  // * Stepped sunset budget — continuous sunDir/water; sun color + far decor stepped.
  let _lastSunStepMs = -1e9;
  let _lastDecorStepMs = -1e9;
  const SUN_STEP_MS = 500;
  const DECOR_STEP_MS = isLowQualityMode() ? 2000 : 0;

  // Per-frame seascape animation — sun drift (mutates sunDir/sun/halo in place, zero
  // allocations; initZanzibarPlatform reads sunDir afterward to keep sunLight coherent),
  // glint scroll, ripple-normal drift, rotor spin, gull orbits, foam breathing.
  function update(timeMs) {
    const azimuth = SUN_AZIMUTH + Math.sin(timeMs * SUN_DRIFT_SPEED) * SUN_DRIFT_AMPLITUDE_RAD;
    sunDir.set(Math.cos(azimuth), 0, Math.sin(azimuth));
    sun.position.set(sunDir.x * SUN_DISTANCE, SUN_HEIGHT, sunDir.z * SUN_DISTANCE);
    sun.lookAt(0, SUN_HEIGHT, 0);
    halo.position.set(sun.position.x + sunDir.x * 2, SUN_HEIGHT, sun.position.z + sunDir.z * 2);
    halo.lookAt(0, SUN_HEIGHT, 0);
    outerHalo.position.set(sun.position.x + sunDir.x * 4, SUN_HEIGHT, sun.position.z + sunDir.z * 4);
    outerHalo.lookAt(0, SUN_HEIGHT, 0);

    if (timeMs - _lastSunStepMs >= SUN_STEP_MS) {
      _lastSunStepMs = timeMs;
      const sunPulse = 0.92 + 0.08 * Math.sin(timeMs * 0.00055);
      sunMat.color.setRGB(1.0 * sunPulse, 0.88 * sunPulse, 0.69 * sunPulse);
      haloMat.opacity = 0.28 + 0.08 * Math.sin(timeMs * 0.0007);
      outerHaloMat.opacity = 0.1 + 0.04 * Math.sin(timeMs * 0.00045 + 1.0);
      for (let i = 0; i < shaftMats.length; i += 1) {
        // * Read the per-material base, do NOT re-derive from i. This line used to write
        // * 0.04 + i*0.01 while the constructors said 0.085 + i*0.02, and this line wins —
        // * so the shafts shipped at ~47% of their authored value from dabdb6b onward. It
        // * would also have mis-scaled the deck-raking shafts, which share this array.
        const base = shaftMats[i].userData.baseOpacity ?? 0.04;
        shaftMats[i].opacity = base * (0.85 + 0.15 * Math.sin(timeMs * 0.0006 + i));
      }
      if (glintMat) glintMat.opacity = 0.32 + 0.08 * Math.sin(timeMs * 0.0007);
      // * This line OVERWRITES the constructor opacity every 500 ms — raising only the
      // * constructor loses to it, which is why both move together.
      if (foamMat) foamMat.opacity = 0.26 + Math.sin(timeMs * 0.00055) * 0.08;
    }

    // * Per-frame, NOT in the 500 ms block above: this sine's period is 2π/0.0009 ≈ 7 s, so
    // * stepping it every 500 ms gave 14 samples per cycle — jumps of up to 0.09 opacity at
    // * the steepest part, which staircases instead of breathing. One sin and one write.
    if (gateDotsMat) gateDotsMat.opacity = 0.45 + Math.sin(timeMs * 0.0009) * 0.2;

    if (waterNormalTex) {
      // * repeat 26 over WATER_SIZE 900 ⇒ one tile = 34.6 m, so an offset rate of 1e-6/ms is
      // * 0.0346 m/s. These give 0.675 + 0.388 ⇒ 0.78 m/s, up from a near-static 0.19.
      // * Rates stay non-harmonic so the two axes never re-phase into a visible pulse.
      waterNormalTex.offset.x = (timeMs * 0.0000195) % 1;
      waterNormalTex.offset.y = (timeMs * 0.0000112) % 1;
    }
    for (let i = 0; i < rotors.length; i += 1) {
      const rotor = rotors[i];
      rotor.rotation.z = rotor.userData.phase + timeMs * rotor.userData.spin;
    }

    // * Ships run PER FRAME, outside the decor step, on every tier. Low sets DECOR_STEP_MS
    // * to 2000, and at these orbit speeds a 2 s step moves the nearest craft ~10 m across
    // * a 255 m radius — a visible teleport rather than a glide. Three instance matrices
    // * and three point positions is the whole per-frame cost, which is what Low can afford.
    if (ships && shipGlowGeo && ships.visible !== false) {
      const glowPos = shipGlowGeo.attributes.position;
      for (let i = 0; i < shipStates.length; i += 1) {
        const s = shipStates[i];
        const a = s.phase + timeMs * s.speed;
        const x = Math.cos(a) * s.radius;
        const z = Math.sin(a) * s.radius;
        const y = s.height + Math.sin(timeMs * 0.0002 + s.phase) * 3;
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(0, -a - Math.sign(s.speed) * (Math.PI / 2), Math.sign(s.speed) * 0.12);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        ships.setMatrixAt(i, _dummy.matrix);
        const tx = -Math.sin(a) * Math.sign(s.speed);
        const tz = Math.cos(a) * Math.sign(s.speed);
        glowPos.setXYZ(i, x - tx * 4.2, y, z - tz * 4.2);
      }
      ships.instanceMatrix.needsUpdate = true;
      glowPos.needsUpdate = true;
    }

    const runDecor = DECOR_STEP_MS === 0 || timeMs - _lastDecorStepMs >= DECOR_STEP_MS;
    if (runDecor) {
      _lastDecorStepMs = timeMs;
      if (gulls && gulls.visible !== false) {
        for (let i = 0; i < gullStates.length; i += 1) {
          const g = gullStates[i];
          const a = g.phase + timeMs * g.speed;
          _dummy.position.set(
            Math.cos(a) * g.radius,
            g.height + Math.sin(timeMs * 0.0004 + g.phase) * 1.2,
            Math.sin(a) * g.radius,
          );
          _dummy.rotation.set(
            -Math.PI / 2,
            0,
            -a + (g.speed > 0 ? 0 : Math.PI),
          );
          _dummy.rotation.y = Math.sin(timeMs * 0.009 + g.flapPhase) * 0.45;
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          gulls.setMatrixAt(i, _dummy.matrix);
        }
        gulls.instanceMatrix.needsUpdate = true;
      }
      if (foam) foam.rotation.z = timeMs * 0.000012;
    }
  }

  scene.add(group);
  return {
    group,
    sunDir,
    update,
    waterMat,
    ownedGeometries,
    ownedMaterials,
    ownedTextures,
    lodProps: [ships, gulls, foam].filter(Boolean),
  };
}

/**
 * The octagonal deck: visual slab, fascia trim, under-skirt, perimeter truss ring, corner
 * pylons down to the water, support pillars, podium (grille walls, cap plate, hologram,
 * guide lights), beacon masts, deck + podium convex-hull colliders, and eight corner
 * bollards.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config
 * @param {number} circumR
 * @returns {{ group: THREE.Group, body: import("@dimforge/rapier3d").RigidBody,
 *   floorColliderHandles: number[], deckTex: THREE.CanvasTexture,
 *   neonStripMeshes: THREE.Mesh[],
 *   neonYellowMat: THREE.Material, panelTex: THREE.CanvasTexture, blinkMat: THREE.Material,
 *   update: (timeMs: number) => void,
 *   ownedGeometries: THREE.BufferGeometry[],
 *   ownedMaterials: THREE.Material[], ownedTextures: THREE.Texture[] }}
 */
function buildDeck(scene, world, config, circumR) {
  const lowQ = isLowQualityMode();
  const group = new THREE.Group();
  /** @type {THREE.BufferGeometry[]} */
  const ownedGeometries = [];
  /** @type {THREE.Material[]} */
  const ownedMaterials = [];
  /** @type {THREE.Texture[]} */
  const ownedTextures = [];
  const apothem = circumR * COS_HALF;

  // --- Visual: deck slab ---
  const deckTex = buildDeckTexture(circumR);
  const deckRoughTex = buildDeckRoughnessTexture(circumR);
  // * Structural relief for the plate. Shares the deck's planar cap UVs, so it registers
  // * with the albedo's seams and bolts without any extra UV work.
  const deckNormalTex = buildDeckNormalTexture(circumR);
  ownedTextures.push(deckTex, deckRoughTex, deckNormalTex);
  const deckTopMat = createPhysicalMaterial({
    map: deckTex,
    color: 0xffffff,
    roughness: 1.0, // roughnessMap carries the value (base ≈ 0.58 + variation)
    roughnessMap: deckRoughTex,
    normalMap: deckNormalTex,
    // * Restrained: the deck is a machined plate, not a rock face. This is enough to catch
    // * the low sun on a bolt head and lose it in a seam, and no more.
    normalScale: new THREE.Vector2(0.55, 0.55),
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

  // Shared engineered-panel texture (booth slabs, pillars, pylons, podium bottom trim).
  const panelTex = buildPanelTexture();
  ownedTextures.push(panelTex);

  // Fascia trim — a slightly proud dark-metal band at the deck's top edge, so the neon
  // rim strips read as mounted hardware instead of floating paint.
  const fasciaGeo = new THREE.CylinderGeometry(
    circumR + 0.09, circumR + 0.09, 0.34, OCT_SIDES, 1, true, VERTEX_OFFSET,
  );
  ownedGeometries.push(fasciaGeo);
  // * The fascia was bare 0x2e333d across 8 faces of 26.33 m — the longest continuous line in
  // * the arena and the one directly under the lit rim strips, with nothing on it. panelTex is
  // * already built two statements up; it only needed UVs that are not a lie.
  // *
  // * CylinderGeometry maps u across the WHOLE perimeter and v across the height, so a single
  // * tile was stretched over 210.6 m x 0.34 m — an aspect ratio of 620:1. Deriving both
  // * repeats from one meters-per-tile constant keeps the texels square instead.
  const FASCIA_TILE_M = 1.15; // meters of real steel per panelTex tile
  const fasciaHeightM = 0.34;
  const fasciaPerimeterM = OCT_SIDES * 2 * (circumR + 0.09) * Math.sin(HALF_ANGLE);
  const fasciaTex = panelTex.clone();
  fasciaTex.wrapS = THREE.RepeatWrapping;
  fasciaTex.wrapT = THREE.RepeatWrapping;
  fasciaTex.repeat.set(fasciaPerimeterM / FASCIA_TILE_M, fasciaHeightM / FASCIA_TILE_M);
  fasciaTex.needsUpdate = true;
  // * Built once from panelTex and cloned per use — the Sobel pass is the expensive part and
  // * clones share the image, so the podium crown gets machined relief for free.
  const panelNormalTex = buildNormalMapFromCanvas(panelTex.image, 1.5);
  panelNormalTex.wrapS = THREE.RepeatWrapping;
  panelNormalTex.wrapT = THREE.RepeatWrapping;
  const fasciaNormalTex = panelNormalTex.clone();
  fasciaNormalTex.wrapS = THREE.RepeatWrapping;
  fasciaNormalTex.wrapT = THREE.RepeatWrapping;
  fasciaNormalTex.repeat.copy(fasciaTex.repeat);
  fasciaNormalTex.needsUpdate = true;
  ownedTextures.push(fasciaTex, panelNormalTex, fasciaNormalTex);
  const fasciaMat = createPhysicalMaterial({
    map: fasciaTex,
    normalMap: fasciaNormalTex,
    normalScale: new THREE.Vector2(0.8, 0.8),
    // * WHITE, not the old 0x2e333d. `map` MULTIPLIES `color`, and panelTex's own base is
    // * #272b33 — already dark steel of almost exactly the value this fascia had. Keeping
    // * both cost 70% of the band's luminance (measured 8.8 -> 2.6 on the sun-side rim),
    // * which is the "make the raking light read" -> "take light away" failure the handover
    // * forbids. The texture now carries the value and the color stops double-darkening it.
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.85,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.6,
    side: THREE.DoubleSide,
  });
  fasciaMat.userData.envMapIntensityScale = 0.6;
  ownedMaterials.push(fasciaMat);
  const fascia = new THREE.Mesh(fasciaGeo, fasciaMat);
  fascia.position.y = -0.13;
  group.add(fascia);

  // Under-skirt.
  const skirtGeo = new THREE.CylinderGeometry(
    circumR - 0.25, circumR - 1.4, 2.2, OCT_SIDES, 1, true, VERTEX_OFFSET,
  );
  ownedGeometries.push(skirtGeo);
  const skirt = new THREE.Mesh(skirtGeo, deckBottomMat);
  skirt.position.y = -DECK_THICKNESS - 1.1;
  group.add(skirt);

  // Perimeter truss ring — instanced diagonal struts between the deck rim and the skirt
  // base, one X-brace pair per half-edge. Reads as engineered offshore construction.
  const structMat = createPhysicalMaterial({
    color: 0x30353f,
    roughness: 0.55,
    metalness: 0.75,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.4,
  });
  structMat.userData.envMapIntensityScale = 0.4;
  ownedMaterials.push(structMat);
  {
    const strutLen = 2.6;
    const strutGeo = new THREE.BoxGeometry(0.16, strutLen, 0.16);
    ownedGeometries.push(strutGeo);
    const strutCount = OCT_SIDES * 4;
    const truss = new THREE.InstancedMesh(strutGeo, structMat, strutCount);
    const edgeLen = 2 * circumR * Math.sin(HALF_ANGLE);
    let idx = 0;
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const mid = i * (Math.PI / 4);
      const yaw = -mid + Math.PI / 2;
      for (let s = 0; s < 4; s += 1) {
        // Along-edge offset: four struts alternating lean (X-brace pattern).
        const t = (s + 0.5) / 4 - 0.5;
        const along = t * (edgeLen - 2.2);
        const lean = (s % 2 === 0 ? 1 : -1) * 0.62;
        _dummy.position.set(
          Math.cos(mid) * (apothem - 0.75) - Math.sin(mid) * along,
          -DECK_THICKNESS - 1.15,
          Math.sin(mid) * (apothem - 0.75) + Math.cos(mid) * along,
        );
        _dummy.rotation.set(0, yaw, lean);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        truss.setMatrixAt(idx, _dummy.matrix);
        idx += 1;
      }
    }
    truss.instanceMatrix.needsUpdate = true;
    group.add(truss);
  }

  // Corner pylons — one at each octagon vertex, dropping from the skirt to below the
  // waterline so the platform visibly stands on legs instead of floating.
  {
    const pylonH = 6.8;
    const pylonGeo = new THREE.BoxGeometry(1.5, pylonH, 1.5);
    ownedGeometries.push(pylonGeo);
    const pylonMat = createPhysicalMaterial({
      map: panelTex,
      color: 0x9aa0ab,
      roughness: 0.68,
      metalness: 0.6,
      envMapIntensity: getMaterialEnvMapIntensity() * 0.35,
    });
    pylonMat.userData.envMapIntensityScale = 0.35;
    ownedMaterials.push(pylonMat);
    const pylons = new THREE.InstancedMesh(pylonGeo, pylonMat, OCT_SIDES);
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const a = VERTEX_OFFSET + i * (Math.PI / 4);
      _dummy.position.set(
        Math.cos(a) * (circumR - 1.8),
        -DECK_THICKNESS - 0.4 - pylonH / 2,
        Math.sin(a) * (circumR - 1.8),
      );
      _dummy.rotation.set(0, -a, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      pylons.setMatrixAt(i, _dummy.matrix);
    }
    pylons.instanceMatrix.needsUpdate = true;
    group.add(pylons);
  }

  // Support pillars (center cluster, under the podium load path).
  const pillarGeo = new THREE.BoxGeometry(5.2, 7.5, 5.2);
  ownedGeometries.push(pillarGeo);
  const pillarMat = createPhysicalMaterial({
    map: panelTex,
    color: 0x8f959f,
    roughness: 0.7,
    metalness: 0.5,
  });
  pillarMat.userData.envMapIntensityScale = 1;
  ownedMaterials.push(pillarMat);
  for (let i = 0; i < 4; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 2);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(Math.cos(a) * 15, -DECK_THICKNESS - 3.7, Math.sin(a) * 15);
    group.add(pillar);
  }

  // Center podium — the station's gnomon. Grille side walls, brushed top, polished cap.
  const grilleTex = buildGrilleTexture();
  ownedTextures.push(grilleTex);
  const podiumSideMat = createPhysicalMaterial({
    map: grilleTex,
    color: 0xffffff,
    roughness: 0.45,
    metalness: 0.8,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.55,
  });
  podiumSideMat.userData.envMapIntensityScale = 0.55;
  // * OQ3: this was a bare color + roughness + metalness call on a surface the art-direction
  // * allowlist names as hero ("Sundial Station — deck plate, center podium"), i.e. a Rule 1
  // * defect while the doc claimed every allowlisted surface passed. panelTex is the same
  // * engineered steel the booths and pylons use, world-scaled so the crown is not wearing a
  // * stretched tile. Colour goes WHITE because map multiplies color and panelTex's own base
  // * (#272b33) is already almost exactly the 0x2c313a this used — keeping both would have
  // * darkened the crown, the same trap the fascia hit in item 14.
  const podiumTopTex = panelTex.clone();
  podiumTopTex.wrapS = THREE.RepeatWrapping;
  podiumTopTex.wrapT = THREE.RepeatWrapping;
  podiumTopTex.repeat.set((PODIUM_TOP_R * 2) / PODIUM_PANEL_TILE_M, (PODIUM_TOP_R * 2) / PODIUM_PANEL_TILE_M);
  podiumTopTex.needsUpdate = true;
  const podiumTopNormalTex = panelNormalTex.clone();
  podiumTopNormalTex.wrapS = THREE.RepeatWrapping;
  podiumTopNormalTex.wrapT = THREE.RepeatWrapping;
  podiumTopNormalTex.repeat.copy(podiumTopTex.repeat);
  podiumTopNormalTex.needsUpdate = true;
  ownedTextures.push(podiumTopTex, podiumTopNormalTex);
  const podiumTopMat = createPhysicalMaterial({
    map: podiumTopTex,
    normalMap: podiumTopNormalTex,
    normalScale: new THREE.Vector2(0.6, 0.6),
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.7,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.5,
  });
  podiumTopMat.userData.envMapIntensityScale = 0.5;
  ownedMaterials.push(podiumSideMat, podiumTopMat);
  const podiumGeo = new THREE.CylinderGeometry(
    PODIUM_TOP_R, PODIUM_BASE_R, PODIUM_HEIGHT, OCT_SIDES, 1, false, VERTEX_OFFSET,
  );
  ownedGeometries.push(podiumGeo);
  const podium = new THREE.Mesh(podiumGeo, [podiumSideMat, podiumTopMat, deckBottomMat]);
  podium.position.y = PODIUM_HEIGHT / 2;
  group.add(podium);

  // Polished cap plate on the podium crown — a contrasting glossier disc.
  // * Octagon, inset inside the crown's own apothem — a CircleGeometry with OCT_SIDES
  // * segments IS a regular octagon, and VERTEX_OFFSET aligns its vertices with the crown's.
  const capPlateCircumR = (PODIUM_TOP_R * COS_HALF - CAP_PLATE_INSET_M) / COS_HALF;
  const capPlateGeo = new THREE.CircleGeometry(capPlateCircumR, OCT_SIDES, VERTEX_OFFSET);
  ownedGeometries.push(capPlateGeo);
  // * Second Rule 1 defect on this allowlisted surface — bare color + roughness + metalness.
  // * A polished plate gets RELIEF, not an albedo grid: the panel normal at a tight repeat
  // * reads as machined steel, where painting a panel grid onto a 0.22-roughness disc would
  // * just look like a decal on a mirror.
  const capPlateNormalTex = panelNormalTex.clone();
  capPlateNormalTex.wrapS = THREE.RepeatWrapping;
  capPlateNormalTex.wrapT = THREE.RepeatWrapping;
  capPlateNormalTex.repeat.set(6, 6);
  capPlateNormalTex.needsUpdate = true;
  ownedTextures.push(capPlateNormalTex);
  const capPlateMat = createPhysicalMaterial({
    normalMap: capPlateNormalTex,
    normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0x1d2027,
    roughness: 0.22,
    metalness: 0.9,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.8,
  });
  capPlateMat.userData.envMapIntensityScale = 0.8;
  ownedMaterials.push(capPlateMat);
  const capPlate = new THREE.Mesh(capPlateGeo, capPlateMat);
  capPlate.rotation.x = -Math.PI / 2;
  capPlate.position.y = PODIUM_HEIGHT + 0.012;
  group.add(capPlate);

  // * Unified amber hazard scheme — moody golden-hour intensity (quieter than arcade neon).
  // * Yellow's high luma still blooms; keep intensity moderate so dusk remains the star.
  const neonYellowMat = new THREE.MeshStandardMaterial({
    color: 0xffb400,
    emissive: 0xffb400,
    emissiveIntensity: 0.92,
    roughness: 0.42,
    metalness: 0.12,
  });
  neonYellowMat.userData.baseEmissiveIntensity = 0.92;
  ownedMaterials.push(neonYellowMat);

  // * Raised service conduits along flat mid-lanes — micro-structure so steel isn't a pancake.
  if (!lowQ) {
    const conduitGeo = new THREE.BoxGeometry(0.38, 0.1, apothem - PODIUM_BASE_R - 5.5);
    ownedGeometries.push(conduitGeo);
    const conduitMat = createPhysicalMaterial({
      map: panelTex,
      color: 0x6a707c,
      roughness: 0.45,
      metalness: 0.75,
      envMapIntensity: getMaterialEnvMapIntensity() * 0.4,
    });
    conduitMat.userData.envMapIntensityScale = 0.4;
    ownedMaterials.push(conduitMat);
    const conduits = new THREE.InstancedMesh(conduitGeo, conduitMat, OCT_SIDES);
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const a = i * (Math.PI / 4);
      const midR = (PODIUM_BASE_R + 3.2 + apothem - 5.5) * 0.5;
      _dummy.position.set(Math.cos(a) * midR, 0.05, Math.sin(a) * midR);
      _dummy.rotation.set(0, -a + Math.PI / 2, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      conduits.setMatrixAt(i, _dummy.matrix);
    }
    conduits.instanceMatrix.needsUpdate = true;
    group.add(conduits);
  }

  // * Gnomon shadow — long soft radial stripe opposite the sun so the podium sells "sundial".
  // * Visual-only; does not track sun drift (subtle enough that static is fine at ±0.9°).
  {
    const shadowLen = apothem - PODIUM_BASE_R - 2.5;
    const shadowGeo = new THREE.PlaneGeometry(2.8, shadowLen, 1, 1);
    ownedGeometries.push(shadowGeo);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x06080e,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    ownedMaterials.push(shadowMat);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    // Away from sun azimuth.
    const shadowAz = SUN_AZIMUTH + Math.PI;
    const midR = PODIUM_BASE_R + 1.2 + shadowLen * 0.5;
    shadow.position.set(
      Math.cos(shadowAz) * midR,
      0.025,
      Math.sin(shadowAz) * midR,
    );
    shadow.rotation.z = -shadowAz + Math.PI / 2;
    group.add(shadow);
  }
  const edgeLen = 2 * circumR * Math.sin(HALF_ANGLE);
  const stripGeo = new THREE.BoxGeometry(edgeLen - 1.6, 0.14, 0.22);
  ownedGeometries.push(stripGeo);
  const neonStripMeshes = [];
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const mid = i * (Math.PI / 4);
    const strip = new THREE.Mesh(stripGeo, neonYellowMat);
    strip.position.set(Math.cos(mid) * (apothem - 0.45), 0.08, Math.sin(mid) * (apothem - 0.45));
    strip.rotation.y = -mid + Math.PI / 2;
    group.add(strip);
    neonStripMeshes.push(strip);
  }

  // * Under-deck rim glow — warm light spill under the edge (fall danger beauty + mood).
  {
    const underGlowGeo = new THREE.CylinderGeometry(
      circumR - 0.3, circumR - 1.1, 0.35, OCT_SIDES, 1, true, VERTEX_OFFSET,
    );
    ownedGeometries.push(underGlowGeo);
    const underGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff7a28,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    underGlowMat.userData.baseOpacity = 0.16;
    ownedMaterials.push(underGlowMat);
    const underGlow = new THREE.Mesh(underGlowGeo, underGlowMat);
    underGlow.position.y = -DECK_THICKNESS - 0.35;
    underGlow.userData.isUnderGlow = true;
    group.add(underGlow);
    neonStripMeshes.push(underGlow);
  }
  // * Crown ring: eight straight segments, not a 32-segment torus. The podium crown is an
  // * octagon (podiumCaps = octRects(PODIUM_TOP_R * COS_HALF)), so a round ring on it
  // * overhung the crown's flats by PODIUM_TOP_R * 0.18 * (1 - cos 22.5°) everywhere except
  // * the vertices. This is the sanctioned direction for the fix — round things become
  // * octagonal, never the reverse — and it is emissive, so unlike the painted half of this
  // * item it will actually read.
  {
    const crownCircumR = PODIUM_TOP_R - 0.18;
    const crownApothem = crownCircumR * COS_HALF;
    const crownEdge = 2 * crownCircumR * Math.sin(HALF_ANGLE);
    const crownSegGeo = new THREE.BoxGeometry(crownEdge, 0.18, 0.18);
    ownedGeometries.push(crownSegGeo);
    const crown = new THREE.InstancedMesh(crownSegGeo, neonYellowMat, OCT_SIDES);
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const mid = i * (Math.PI / 4);
      _dummy.position.set(Math.cos(mid) * crownApothem, PODIUM_HEIGHT + 0.05, Math.sin(mid) * crownApothem);
      _dummy.rotation.set(0, -mid + Math.PI / 2, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      crown.setMatrixAt(i, _dummy.matrix);
    }
    crown.instanceMatrix.needsUpdate = true;
    group.add(crown);
    neonStripMeshes.push(crown);
  }

  // Podium base guide lights — small emissive blocks at the frustum's base vertices,
  // matching the arena's warm scheme.
  {
    const guideGeo = new THREE.BoxGeometry(0.4, 0.16, 0.2);
    ownedGeometries.push(guideGeo);
    const guides = new THREE.InstancedMesh(guideGeo, neonYellowMat, OCT_SIDES);
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const a = VERTEX_OFFSET + i * (Math.PI / 4);
      _dummy.position.set(Math.cos(a) * (PODIUM_BASE_R - 0.25), 0.1, Math.sin(a) * (PODIUM_BASE_R - 0.25));
      _dummy.rotation.set(0, -a + Math.PI / 2, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      guides.setMatrixAt(i, _dummy.matrix);
    }
    guides.instanceMatrix.needsUpdate = true;
    group.add(guides);
  }

  // * Dial face — the podium apron rebuilt as EMISSIVE geometry rather than paint.
  // *
  // * Measured on this deck: the neon rim strips read at median luminance 153, the painted
  // * hazard band at 16, and the painted apron ring at 3.3 against a bare-plate median of
  // * 2.6 — i.e. the apron was indistinguishable from unpainted steel. Paint does not read
  // * on Sundial; only emissive does. So the dial is built from the same neonYellowMat as
  // * the rim strips, which also means it inherits their dusk breath for free (the breath
  // * drives the shared material's emissiveIntensity, not per-mesh state).
  // *
  // * This is additive — it puts light on the plate rather than taking any away — and it is
  // * the sanctioned direction for a circle-on-octagon fix: the ring was ctx.arc, and it is
  // * now eight straight segments. That absorbs item 15's "octPath apron" sub-item.
  // *
  // * The arena is Sundial Station and the podium is its gnomon; the apron is where a dial
  // * face belongs. 24 graduations, every third major, plus one heavier datum bar at
  // * SUN_AZIMUTH for the gnomon shadow to read against.
  {
    const DIAL_CIRCUM_R = PODIUM_BASE_R + 1.1; // where the painted ring was
    const dialApothem = DIAL_CIRCUM_R * COS_HALF;
    const dialEdge = 2 * DIAL_CIRCUM_R * Math.sin(HALF_ANGLE);
    const DIAL_Y = 0.025;

    const dialSegGeo = new THREE.BoxGeometry(dialEdge - 0.5, 0.04, 0.13);
    ownedGeometries.push(dialSegGeo);
    const dialRing = new THREE.InstancedMesh(dialSegGeo, neonYellowMat, OCT_SIDES);
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const mid = i * (Math.PI / 4);
      _dummy.position.set(Math.cos(mid) * dialApothem, DIAL_Y, Math.sin(mid) * dialApothem);
      // * Same tangential convention as the rim strips at the deck edge.
      _dummy.rotation.set(0, -mid + Math.PI / 2, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      dialRing.setMatrixAt(i, _dummy.matrix);
    }
    dialRing.instanceMatrix.needsUpdate = true;
    group.add(dialRing);

    // Graduations: unit-length bars along local +X, scaled per instance.
    const GRAD_COUNT = 24;
    const gradGeo = new THREE.BoxGeometry(1, 0.04, 0.1);
    ownedGeometries.push(gradGeo);
    const grads = new THREE.InstancedMesh(gradGeo, neonYellowMat, GRAD_COUNT + 1);
    /**
     * Boundary radius of the dial octagon in a given direction. The ring is an octagon, so
     * a graduation has to start at the edge *in its own direction* — anchoring them all at
     * a fixed radius would leave every mark that is not on a flat mid floating off the ring.
     */
    const octEdgeRadius = (a) => dialApothem / Math.cos(((a + HALF_ANGLE) % (Math.PI / 4)) - HALF_ANGLE);
    const placeGrad = (idx, a, len, widthScale) => {
      const r0 = octEdgeRadius(a);
      const rMid = r0 + len / 2;
      _dummy.position.set(Math.cos(a) * rMid, DIAL_Y, Math.sin(a) * rMid);
      // * rotation.y = -a maps the bar's local +X onto (cos a, 0, sin a) — radially outward.
      _dummy.rotation.set(0, -a, 0);
      _dummy.scale.set(len, 1, widthScale);
      _dummy.updateMatrix();
      grads.setMatrixAt(idx, _dummy.matrix);
    };
    for (let i = 0; i < GRAD_COUNT; i += 1) {
      const a = (i / GRAD_COUNT) * Math.PI * 2;
      const major = i % 3 === 0;
      placeGrad(i, a, major ? 1.1 : 0.55, major ? 1.35 : 1);
    }
    // Datum bar — longer and heavier, pointing at the sun.
    placeGrad(GRAD_COUNT, SUN_AZIMUTH, 1.85, 2.1);
    grads.instanceMatrix.needsUpdate = true;
    group.add(grads);
  }

  // Podium hologram — layered station core: dial plate, dual glyph bands, counter-spin
  // rings, crystal core (skipped in Low Quality).
  /** @type {THREE.Group | null} */
  let holoGroup = null;
  /** @type {THREE.Mesh | null} */
  let holoRing = null;
  /** @type {THREE.Mesh | null} */
  let holoRingOuter = null;
  /** @type {THREE.Mesh | null} */
  let holoRingTilt = null;
  /** @type {THREE.Mesh | null} */
  let holoBand = null;
  /** @type {THREE.Mesh | null} */
  let holoBandInner = null;
  /** @type {THREE.Mesh | null} */
  let holoDial = null;
  /** @type {THREE.Mesh | null} */
  let holoCore = null;
  /** @type {THREE.MeshBasicMaterial | null} */
  let holoBandMat = null;
  /** @type {THREE.MeshBasicMaterial | null} */
  let holoBandInnerMat = null;
  /** @type {THREE.MeshBasicMaterial | null} */
  let holoCoreMat = null;
  /** @type {THREE.MeshBasicMaterial | null} */
  let holoDialMat = null;
  if (!lowQ) {
    holoGroup = new THREE.Group();
    holoGroup.position.y = PODIUM_HEIGHT + HOLO_HOVER_Y;

    const holoAdd = (color, opacity) => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      ownedMaterials.push(mat);
      return mat;
    };

    // --- Crystal core ---
    const coreGeo = new THREE.OctahedronGeometry(0.55, 0);
    ownedGeometries.push(coreGeo);
    holoCoreMat = holoAdd(0xffe6b0, 0.85);
    holoCore = new THREE.Mesh(coreGeo, holoCoreMat);
    holoCore.position.y = 0.15;
    holoGroup.add(holoCore);
    // Inner spark.
    const sparkGeo = new THREE.SphereGeometry(0.18, 10, 8);
    ownedGeometries.push(sparkGeo);
    const sparkMat = holoAdd(0xffffff, 0.75);
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    spark.position.y = 0.15;
    holoGroup.add(spark);

    // --- Sundial dial plate (horizontal) ---
    const dialTex = buildHoloDialTexture();
    ownedTextures.push(dialTex);
    holoDialMat = new THREE.MeshBasicMaterial({
      map: dialTex,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    ownedMaterials.push(holoDialMat);
    const dialGeo = new THREE.CircleGeometry(2.9, 48);
    ownedGeometries.push(dialGeo);
    holoDial = new THREE.Mesh(dialGeo, holoDialMat);
    holoDial.rotation.x = -Math.PI / 2;
    holoDial.position.y = -0.15;
    holoGroup.add(holoDial);

    // Gnomon fin on the dial (triangle edge pointing sun-ward for identity).
    const finGeo = new THREE.PlaneGeometry(0.12, 2.4);
    ownedGeometries.push(finGeo);
    const finMat = holoAdd(0xffd090, 0.7);
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.rotation.x = -Math.PI / 2;
    fin.position.set(
      Math.cos(SUN_AZIMUTH) * 1.1,
      -0.12,
      Math.sin(SUN_AZIMUTH) * 1.1,
    );
    fin.rotation.z = -SUN_AZIMUTH + Math.PI / 2;
    holoGroup.add(fin);

    // --- Dual glyph bands ---
    const glyphTex = buildHologlyphTexture();
    ownedTextures.push(glyphTex);
    holoBandMat = new THREE.MeshBasicMaterial({
      map: glyphTex,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    ownedMaterials.push(holoBandMat);
    const holoBandGeo = new THREE.CylinderGeometry(2.25, 2.25, 1.05, 40, 1, true);
    ownedGeometries.push(holoBandGeo);
    holoBand = new THREE.Mesh(holoBandGeo, holoBandMat);
    holoBand.position.y = 0.55;
    holoGroup.add(holoBand);

    // * Clone so outer/inner bands can scroll UVs in opposite directions independently.
    const glyphTexInner = glyphTex.clone();
    glyphTexInner.needsUpdate = true;
    ownedTextures.push(glyphTexInner);
    holoBandInnerMat = new THREE.MeshBasicMaterial({
      map: glyphTexInner,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    ownedMaterials.push(holoBandInnerMat);
    const holoBandInnerGeo = new THREE.CylinderGeometry(1.55, 1.55, 0.7, 32, 1, true);
    ownedGeometries.push(holoBandInnerGeo);
    holoBandInner = new THREE.Mesh(holoBandInnerGeo, holoBandInnerMat);
    holoBandInner.position.y = -0.55;
    holoGroup.add(holoBandInner);

    // --- Counter-rotating rings (3) ---
    const ringMatA = holoAdd(0xffc25e, 0.7);
    const ringMatB = holoAdd(0xff9a40, 0.55);
    const ringMatC = holoAdd(0xffe0a0, 0.45);

    const holoRingGeo = new THREE.TorusGeometry(2.7, 0.055, 8, 48);
    ownedGeometries.push(holoRingGeo);
    holoRing = new THREE.Mesh(holoRingGeo, ringMatA);
    holoRing.rotation.x = Math.PI / 2;
    holoRing.position.y = 0.55;
    holoGroup.add(holoRing);

    const outerRingGeo = new THREE.TorusGeometry(3.25, 0.04, 8, 48);
    ownedGeometries.push(outerRingGeo);
    holoRingOuter = new THREE.Mesh(outerRingGeo, ringMatB);
    holoRingOuter.rotation.x = Math.PI / 2;
    holoRingOuter.position.y = -0.45;
    holoGroup.add(holoRingOuter);

    // Tilted orbital ring for 3D silhouette (not just stacked flat discs).
    const tiltRingGeo = new THREE.TorusGeometry(2.95, 0.035, 8, 40);
    ownedGeometries.push(tiltRingGeo);
    holoRingTilt = new THREE.Mesh(tiltRingGeo, ringMatC);
    holoRingTilt.rotation.x = Math.PI / 2.6;
    holoRingTilt.rotation.z = 0.35;
    holoRingTilt.position.y = 0.1;
    holoGroup.add(holoRingTilt);

    // Octagon wire rim (station plate language).
    const octPts = [];
    for (let i = 0; i <= OCT_SIDES; i += 1) {
      const a = VERTEX_OFFSET + (i % OCT_SIDES) * (Math.PI / 4);
      octPts.push(new THREE.Vector3(Math.cos(a) * 3.05, 0, Math.sin(a) * 3.05));
    }
    const octGeo = new THREE.BufferGeometry().setFromPoints(octPts);
    ownedGeometries.push(octGeo);
    const octMat = new THREE.LineBasicMaterial({
      color: 0xffd080,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    ownedMaterials.push(octMat);
    const octLine = new THREE.Line(octGeo, octMat);
    octLine.position.y = 0.55;
    holoGroup.add(octLine);

    // Floating radial spokes (8) — sundial hour marks in 3D.
    const spokeGeo = new THREE.BoxGeometry(0.06, 0.06, 1.6);
    ownedGeometries.push(spokeGeo);
    const spokeMat = holoAdd(0xffc070, 0.5);
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const a = VERTEX_OFFSET + i * (Math.PI / 4);
      const spoke = new THREE.Mesh(spokeGeo, spokeMat);
      spoke.position.set(Math.cos(a) * 1.9, 0.55, Math.sin(a) * 1.9);
      spoke.rotation.y = -a;
      holoGroup.add(spoke);
    }

    // Vertical tick pillars around the outer ring.
    const tickGeo = new THREE.BoxGeometry(0.08, 0.55, 0.08);
    ownedGeometries.push(tickGeo);
    const tickMat = holoAdd(0xffb050, 0.6);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.position.set(Math.cos(a) * 3.25, -0.45, Math.sin(a) * 3.25);
      holoGroup.add(tick);
    }

    group.add(holoGroup);
  }

  // Beacon masts — slim aviation-light masts on the fascia at the four flat midpoints
  // between booth lanes; shared blinking emissive material (also used by booth antennas).
  const blinkMat = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xffb347,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    metalness: 0.1,
  });
  ownedMaterials.push(blinkMat);
  {
    const mastGeo = new THREE.CylinderGeometry(0.07, 0.13, 5.2, 6);
    const beaconGeo = new THREE.SphereGeometry(0.17, 8, 6);
    ownedGeometries.push(mastGeo, beaconGeo);
    const mastAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const masts = new THREE.InstancedMesh(mastGeo, structMat, mastAngles.length);
    const beacons = new THREE.InstancedMesh(beaconGeo, blinkMat, mastAngles.length);
    for (let i = 0; i < mastAngles.length; i += 1) {
      const a = mastAngles[i];
      const mx = Math.cos(a) * (apothem + 0.28);
      const mz = Math.sin(a) * (apothem + 0.28);
      _dummy.position.set(mx, 2.35, mz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      masts.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(mx, 5.05, mz);
      _dummy.updateMatrix();
      beacons.setMatrixAt(i, _dummy.matrix);
    }
    masts.instanceMatrix.needsUpdate = true;
    beacons.instanceMatrix.needsUpdate = true;
    group.add(masts);
    group.add(beacons);
  }

  // Corner bollards.
  const stripeTex = buildHazardStripeTexture();
  ownedTextures.push(stripeTex);
  const bollardMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, metalness: 0.3 });
  ownedMaterials.push(bollardMat);
  // * 18 radial segments, not 10. At BOLLARD_RADIUS 0.55 a 10-gon has 34 cm facets that read
  // * as a faceted prism from the chase camera; 18 halves the facet to 19 cm and the
  // * silhouette goes round. These are the closest props to a player at the rim.
  const BOLLARD_SEGMENTS = 18;
  const bollardGeo = new THREE.CylinderGeometry(BOLLARD_RADIUS, BOLLARD_RADIUS, BOLLARD_HEIGHT, BOLLARD_SEGMENTS);
  const capGeo = new THREE.CylinderGeometry(BOLLARD_RADIUS * 0.7, BOLLARD_RADIUS * 0.7, 0.12, BOLLARD_SEGMENTS);
  // * Base flange — a bolted foot, so the post meets the deck instead of intersecting it.
  const flangeGeo = new THREE.CylinderGeometry(BOLLARD_RADIUS * 1.32, BOLLARD_RADIUS * 1.5, 0.11, BOLLARD_SEGMENTS);
  ownedGeometries.push(bollardGeo, capGeo, flangeGeo);
  const bollardRing = circumR * BOLLARD_RING_SCALE;
  const bollardPositions = [];
  // * Seeded, so the eight posts are the same eight posts on every load. mulberry32-style
  // * generator shared with the alien city's window layout — generic despite the name.
  const bollardRng = makeCityRng(0x50d1a1);
  for (let i = 0; i < OCT_SIDES; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 4);
    const x = Math.cos(a) * bollardRing;
    const z = Math.sin(a) * bollardRing;
    bollardPositions.push({ x, z });

    // * Per-instance jitter so eight posts do not read as one post stamped eight times.
    // * Yaw is free — the collider is a cylinder, so spinning the stripe wrap costs nothing.
    // * Scale is deliberately tiny: the colliders below still use the unjittered
    // * BOLLARD_RADIUS / BOLLARD_HEIGHT, so a visual-only offset has to stay under a couple
    // * of centimetres or the post you see stops being the post you hit.
    const yawJitter = bollardRng() * Math.PI * 2;
    const radialScale = 0.97 + bollardRng() * 0.06; // +/-3% => +/-1.65 cm
    const heightScale = 0.95 + bollardRng() * 0.10; // +/-5% => +/-8 cm at the cap

    const bollard = new THREE.Mesh(bollardGeo, bollardMat);
    bollard.position.set(x, (BOLLARD_HEIGHT * heightScale) / 2, z);
    bollard.rotation.y = yawJitter;
    bollard.scale.set(radialScale, heightScale, radialScale);
    group.add(bollard);

    const flange = new THREE.Mesh(flangeGeo, bollardMat);
    flange.position.set(x, 0.055, z);
    flange.rotation.y = yawJitter;
    flange.scale.set(radialScale, 1, radialScale);
    group.add(flange);

    const cap = new THREE.Mesh(capGeo, neonYellowMat);
    cap.position.set(x, BOLLARD_HEIGHT * heightScale + 0.06, z);
    cap.rotation.y = yawJitter;
    cap.scale.set(radialScale, 1, radialScale);
    group.add(cap);
    neonStripMeshes.push(cap);
  }

  // * Prop grounding — static contact blobs so the bollards and the podium sit ON the plate
  // * instead of hovering on it. Two placements per bollard: a tight round foot patch, plus
  // * a longer fainter streak offset along -sunDir. The podium gets a tangential band on
  // * each of its eight base edges, opacity biased toward the anti-sun side; its long cast
  // * shadow is already a separate quad above, so this ring is contact darkening only.
  // *
  // * LEVEL PROPS ONLY. Carts keep the same flat centered circle on every arena — no
  // * ellipse, no height shrink, no per-arena light bias (Run-6 ruling, contactShadows.js
  // * cart config). Directional static shadows are a scenery affordance, not a cart one.
  // *
  // * The masts and the booth legs are NOT in here and cannot be: the masts stand at
  // * apothem + 0.28 = 31.98 m with their base at y = -0.25, i.e. mounted on the fascia
  // * below the deck plane, and the booths sit at 36.45 m over open water on 7 m legs.
  // * Neither foot is on the play surface, so neither can take a deck contact shadow.
  // *
  // * Streak length is stylised, not solved: at the sun key's 9.93 deg elevation a 1.6 m
  // * bollard throws 9.1 m, and at the sun disc's 1.87 deg it throws 49 m. Both would run
  // * off the deck. This grounds the prop; it does not simulate the cast. See OQ8.
  {
    const shadowAz = SUN_AZIMUTH + Math.PI;
    const sdx = Math.cos(shadowAz);
    const sdz = Math.sin(shadowAz);
    // * yaw is applied as rotation.z inside the cluster, and rotation.z = -shadowAz maps
    // * the quad's local +X exactly onto (cos shadowAz, 0, sin shadowAz) with the normal
    // * still (0,1,0) — verified numerically, not derived. Sign errors in this exact shape
    // * shipped backwards twice earlier in this pass.
    const streakYaw = -shadowAz;
    /** @type {Array<{x: number, z: number, radiusX?: number, radiusZ?: number, yaw?: number, opacity?: number}>} */
    const placements = [];
    for (const p of bollardPositions) {
      placements.push({
        x: p.x, z: p.z,
        radiusX: BOLLARD_RADIUS * 1.55, radiusZ: BOLLARD_RADIUS * 1.55,
        opacity: 0.5,
      });
      // * Offset 0.9 m, not the 1.45 m that reads better in isolation: at 1.45 the streak
      // * centers for the bollards at 292.5 deg and 337.5 deg score 32.19 against the
      // * 31.9 m play-surface ceiling and get dropped, and the 22.5 deg one clears by 3 cm.
      // * 0.9 m puts all eight on the deck with at least 25 cm of margin.
      placements.push({
        x: p.x + sdx * 0.9, z: p.z + sdz * 0.9,
        radiusX: 1.9, radiusZ: 0.68,
        yaw: streakYaw,
        opacity: 0.19,
      });
    }
    const podiumApothem = PODIUM_BASE_R * COS_HALF;
    for (let i = 0; i < OCT_SIDES; i += 1) {
      const a = i * (Math.PI / 4);
      placements.push({
        x: Math.cos(a) * (podiumApothem + 0.62),
        z: Math.sin(a) * (podiumApothem + 0.62),
        // * Half-edge of the base octagon plus overlap, so the eight bands meet at corners.
        radiusX: PODIUM_BASE_R * Math.sin(HALF_ANGLE) + 0.35,
        radiusZ: 1.05,
        yaw: -(a + Math.PI / 2),
        opacity: 0.2 + 0.24 * Math.max(0, Math.cos(a - shadowAz)),
      });
    }
    // * Pass the octagon explicitly. main.js does not call setContactShadowHazards until
    // * after this builder returns, so a cluster built here would otherwise be tested
    // * against the circular fallback (r > config.record.radius) and drop every placement
    // * outboard of the apothem — measured: 8 of 24 survived, exactly the podium ring,
    // * with all sixteen bollard placements silently gone.
    const propShadows = createStaticContactShadowCluster(placements, {
      hazards: { isOctagon: true, arenaHalf: config.record.radius },
    });
    group.add(propShadows.group);
    ownedGeometries.push(...propShadows.ownedGeometries);
    ownedMaterials.push(...propShadows.ownedMaterials);
  }

  scene.add(group);

  // --- Physics ---
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  const floorColliderHandles = [];

  // * All-cuboid flat surfaces (see header): resting carts jitter on convex-hull faces
  // * but are rock-stable on cuboids (the spawn booths proved it), so the deck and the
  // * podium crown are rotated cuboids whose union is the exact visual octagon.
  // * RestitutionCombineRule.Min keeps the deck's tuned 0.05 restitution over the
  // * cart's 0.3 (default Average yielded an unintended ~0.175 bounce).
  const spec = getZanzibarFloorColliderSpec(circumR);
  const addRectCollider = (rect) => {
    const half = rect.yaw / 2;
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(rect.halfLength, rect.halfHeight, rect.halfWidth)
        .setTranslation(0, rect.centerY, 0)
        .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })
        .setFriction(DECK_FRICTION)
        .setRestitution(config.record.restitution)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
      body,
    );
    floorColliderHandles.push(collider.handle);
  };
  spec.deckRects.forEach(addRectCollider);
  spec.podiumCaps.forEach(addRectCollider);

  // * Drivable ramp ring — the one remaining hull, tucked below the cap plane at its
  // * crest and below the deck plane at its base so it is never coplanar with a cuboid.
  const podiumCollider = world.createCollider(
    RAPIER.ColliderDesc.convexHull(spec.podiumHull)
      .setFriction(DECK_FRICTION)
      .setRestitution(config.record.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
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

  // Per-frame deck animation: hologram choreography + bob, beacon blink, dusk breath.
  function update(timeMs) {
    if (holoGroup) {
      const t = timeMs * 0.001;
      holoGroup.position.y = PODIUM_HEIGHT + HOLO_HOVER_Y + Math.sin(t * 1.15) * 0.16;
      // Counter-rotating layers sell depth and "live instrument" energy.
      if (holoRing) holoRing.rotation.z = t * 0.55;
      if (holoRingOuter) holoRingOuter.rotation.z = -t * 0.38;
      if (holoRingTilt) {
        holoRingTilt.rotation.z = t * 0.42;
        holoRingTilt.rotation.x = Math.PI / 2.6 + Math.sin(t * 0.35) * 0.08;
      }
      if (holoBand) holoBand.rotation.y = -t * 0.32;
      if (holoBandInner) holoBandInner.rotation.y = t * 0.48;
      if (holoDial) holoDial.rotation.z = t * 0.12;
      if (holoCore) {
        holoCore.rotation.y = t * 0.9;
        holoCore.rotation.x = t * 0.55;
        holoCore.scale.setScalar(0.92 + 0.1 * Math.sin(t * 2.4));
      }
      // Opacity breathe — hot core, readable bands, soft rings.
      if (holoBandMat) holoBandMat.opacity = 0.68 + 0.14 * Math.sin(t * 1.7);
      if (holoBandInnerMat) holoBandInnerMat.opacity = 0.4 + 0.12 * Math.sin(t * 2.1 + 1.0);
      if (holoCoreMat) holoCoreMat.opacity = 0.75 + 0.18 * Math.sin(t * 2.6);
      if (holoDialMat) holoDialMat.opacity = 0.62 + 0.12 * Math.sin(t * 1.1);
      // Scroll glyph UV for living data stream.
      // * No `needsUpdate` here, deliberately. `offset` reaches the shader through the
      // * texture's own matrix (matrixAutoUpdate) as the `uvTransform` uniform — the
      // * image never changes, only where it is sampled. `needsUpdate = true` re-uploads
      // * all 512x128 RGBA pixels of BOTH bands (they are separate textures, the inner
      // * one is a clone) every update tick, ~30 MB/s at 60fps, to move two floats.
      // * Measured: 44 re-uploads per 90 rAF frames before this was removed. Do not add
      // * it back — the scroll still runs without it.
      // * Rates stay non-harmonic (8:11) so the two bands never re-phase into a visible
      // * pulse — same reasoning as waterNormalTex above. Halving both keeps that ratio:
      // * one wrap every 25.0 s and 18.2 s, re-aligning every 200 s. That is longer than
      // * a 150 s round, so a player never sees the bands agree. At the old 0.08/0.11
      // * they re-aligned every 100 s, once per round.
      if (holoBandMat?.map) {
        holoBandMat.map.offset.x = (t * 0.04) % 1;
      }
      if (holoBandInnerMat?.map) {
        holoBandInnerMat.map.offset.x = (-t * 0.055) % 1;
      }
    }
    // Sharp aviation-style blink: short hot pulse, long dim tail.
    const blink = Math.pow(Math.max(0, Math.sin(timeMs * 0.0035)), 14);
    blinkMat.emissiveIntensity = 0.4 + blink * 2.8;
    // * Slow dusk breath on hazard amber — living station, not static paint.
    const baseE = neonYellowMat.userData.baseEmissiveIntensity ?? 0.92;
    neonYellowMat.emissiveIntensity = baseE * (0.88 + 0.12 * Math.sin(timeMs * 0.0007));
    for (const mesh of neonStripMeshes) {
      if (mesh.userData.isUnderGlow && mesh.material) {
        const m = /** @type {THREE.MeshBasicMaterial} */ (mesh.material);
        const base = m.userData.baseOpacity ?? 0.16;
        m.opacity = base * (0.85 + 0.15 * Math.sin(timeMs * 0.0009 + 0.5));
      }
    }
  }

  return {
    group, body, floorColliderHandles, deckTex, neonStripMeshes,
    neonYellowMat, panelTex, blinkMat, update, ownedGeometries, ownedMaterials, ownedTextures,
  };
}

/**
 * Spawn booths — engineered launch bays: paneled slabs, canopy roofs with antenna masts,
 * holographic banners, and pink/cyan rail neon alternating per booth.
 *
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 * @param {object} config
 * @param {number[]} boothColliderHandles
 * @param {THREE.Mesh[]} boothNeonMeshes
 * @param {THREE.Material} railNeonMat Caution-yellow rail material (shared with the deck).
 * @param {THREE.Texture} panelTex
 * @param {THREE.Material} blinkTipMat Shared blinking beacon material (deck masts).
 * @returns {{ group: THREE.Group, bodies: import("@dimforge/rapier3d").RigidBody[],
 *   ownedGeometries: THREE.BufferGeometry[], ownedMaterials: THREE.Material[],
 *   ownedTextures: THREE.Texture[] }}
 */
function buildZanzibarBooths(
  scene, world, config, boothColliderHandles, boothNeonMeshes, railNeonMat,
  panelTex, blinkTipMat,
) {
  const B = config.booth;
  const arenaR = config.record.radius;
  const boothCenterDist = arenaR + B.gapDistance + B.rampLength + B.platformDepth / 2;
  const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

  const group = new THREE.Group();
  const bodies = [];

  const slabMat = createPhysicalMaterial({
    map: panelTex,
    color: 0xa7adb8,
    roughness: 0.55,
    metalness: 0.65,
  });
  slabMat.userData.envMapIntensityScale = 1;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.75, metalness: 0.4 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd9a614, roughness: 0.6, metalness: 0.25 });

  const platGeo = new THREE.BoxGeometry(B.platformWidth, B.platformThickness, B.platformDepth);
  const trimGeo = new THREE.BoxGeometry(B.platformWidth, 0.1, 0.3);
  const legGeo = new THREE.BoxGeometry(0.5, B.platformY + 7, 0.5);
  const braceGeo = new THREE.BoxGeometry(0.28, 0.28, B.platformDepth - 0.6);
  const railGeo = new THREE.CylinderGeometry(B.railThickness / 2, B.railThickness / 2, 1, 8);

  /** @type {THREE.BufferGeometry[]} */
  const ownedGeometries = [platGeo, trimGeo, legGeo, braceGeo, railGeo];
  /** @type {THREE.Material[]} */
  const ownedMaterials = [slabMat, legMat, trimMat];
  /** @type {THREE.Texture[]} */
  const ownedTextures = [];

  const pw = B.platformWidth / 2;
  const pd = B.platformDepth / 2;
  const canopyY = B.platformY + B.platformThickness / 2 + 3.0;

  // Instanced canopy hardware shared across the four booths.
  const canopyGeo = new THREE.BoxGeometry(B.platformWidth * 0.94, 0.12, B.platformDepth * 0.72);
  const canopyPostGeo = new THREE.BoxGeometry(0.14, 3.0, 0.14);
  const antennaGeo = new THREE.CylinderGeometry(0.04, 0.07, 2.4, 6);
  const antennaTipGeo = new THREE.SphereGeometry(0.11, 8, 6);
  ownedGeometries.push(canopyGeo, canopyPostGeo, antennaGeo, antennaTipGeo);

  const canopies = new THREE.InstancedMesh(canopyGeo, slabMat, 4);
  const canopyPosts = new THREE.InstancedMesh(canopyPostGeo, legMat, 8);
  const antennas = new THREE.InstancedMesh(antennaGeo, legMat, 4);
  const antennaTips = new THREE.InstancedMesh(antennaTipGeo, blinkTipMat, 4);

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
      const rail = new THREE.Mesh(railGeo, railNeonMat);
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
    const backRail = new THREE.Mesh(railGeo, railNeonMat);
    backRail.scale.set(1, B.platformWidth - 0.2, 1);
    backRail.rotation.z = Math.PI / 2;
    backRail.position.set(0, deckTopY + B.railHeight, pd - 0.2);
    boothGroup.add(backRail);
    boothNeonMeshes.push(backRail);

    group.add(boothGroup);

    // Instanced canopy hardware in world space (matches boothGroup transform).
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    /** Local booth-space → world for the instanced pieces. */
    const place = (lx, ly, lz) => {
      _dummy.position.set(
        cx + lx * cosY + lz * sinY,
        ly,
        cz - lx * sinY + lz * cosY,
      );
      _dummy.rotation.set(0, yaw, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
    };

    place(0, canopyY, 0.35);
    canopies.setMatrixAt(i, _dummy.matrix);
    place(-pw + 0.35, canopyY - 1.55, pd - 0.35);
    canopyPosts.setMatrixAt(i * 2, _dummy.matrix);
    place(pw - 0.35, canopyY - 1.55, pd - 0.35);
    canopyPosts.setMatrixAt(i * 2 + 1, _dummy.matrix);
    place(pw - 0.7, canopyY + 1.26, pd - 0.7);
    antennas.setMatrixAt(i, _dummy.matrix);
    place(pw - 0.7, canopyY + 2.52, pd - 0.7);
    antennaTips.setMatrixAt(i, _dummy.matrix);
  }

  canopies.instanceMatrix.needsUpdate = true;
  canopyPosts.instanceMatrix.needsUpdate = true;
  antennas.instanceMatrix.needsUpdate = true;
  antennaTips.instanceMatrix.needsUpdate = true;
  group.add(canopies);
  group.add(canopyPosts);
  group.add(antennas);
  group.add(antennaTips);

  scene.add(group);
  return { group, bodies, ownedGeometries, ownedMaterials, ownedTextures };
}

// ===== Level entry point =====

/**
 * Builds the Sundial Station arena (level id "zanzibar").
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

  // Sunset IBL — swap the neutral startup RoomEnvironment for a warm equirect bake while
  // this level is loaded (restored in dispose). See USE_SUNSET_ENV for the revert switch.
  const prevEnvironment = scene.environment;
  if (USE_SUNSET_ENV) {
    // * Session-cached: the renderer PMREMs an equirect environment lazily inside the
    // * first compile that references it and caches the result BY TEXTURE INSTANCE.
    // * Rebuilding a fresh CanvasTexture per load (and disposing it on teardown) threw
    // * that cache away, so every Sundial load re-paid the equirect→cubeUV bake inside
    // * the synchronous play-shader compile (part of the 6.5s frozen-overlay stall in
    // * the 07-17 run-2 F8 captures). One texture for the session keeps repeat loads on
    // * the cached PMREM; ~few MB VRAM held while the game runs — deliberate.
    _sunsetEnvTex ??= buildSunsetEnvTexture();
    scene.environment = _sunsetEnvTex;
  }

  const seascape = buildSeascape(scene, circumR);
  const deck = buildDeck(scene, world, config, circumR);

  // Water-death FX: entry splashes + surface-clamped underwater detonations + ocean
  // plane ripple distortion (see effects/waterDeathFx.js). Cleared in dispose.
  setWaterDeathEnvironment({
    scene,
    waterY: WATER_Y,
    waterMat: seascape.waterMat ?? null,
  });

  // Sun light tracks the seascape's sun disc direction (see buildSeascape's update) so
  // the lighting stays coherent with the drifting sunset visual each frame.
  // * Moodier golden hour: warmer key, cooler ground hemi, lower fill — longer "shadows".
  const sunLight = new THREE.DirectionalLight(0xff9440, 1.95);
  sunLight.position.copy(seascape.sunDir).multiplyScalar(SUN_KEY_DISTANCE).setY(SUN_HEIGHT);
  scene.add(sunLight);
  const hemiLight = new THREE.HemisphereLight(0xff8a50, 0x061018, 0.78);
  scene.add(hemiLight);
  const ambient = new THREE.AmbientLight(0x2e2438, 0.48);
  scene.add(ambient);

  // * Soft fill from the anti-sun side (cool teal) so carts get a moody rim without
  // * lifting overall brightness — pure atmosphere.
  const coolFill = new THREE.DirectionalLight(0x3a6088, 0.22);
  coolFill.position.copy(seascape.sunDir).multiplyScalar(-50).setY(18);
  scene.add(coolFill);

  const boothNeonMeshes = [...deck.neonStripMeshes];
  const boothColliderHandles = [];
  // blinkMat shared with the deck's beacon masts so all aviation lights blink together;
  // rails share the deck's caution-yellow perimeter material.
  const booths = buildZanzibarBooths(
    scene, world, config, boothColliderHandles, boothNeonMeshes,
    deck.neonYellowMat, deck.panelTex, deck.blinkMat,
  );

  // * Center light matches the arena's warm amber scheme (2026-07-09 feedback: the old
  // * pink/cyan center clashed with the caution-yellow perimeter). The two returned
  // * colors still feed main.js's spindle color cycle — now a subtle amber↔gold breath.
  // * Slightly softer for mood — gnomon glow, not a rave spindle.
  const spindleLight = new THREE.PointLight(0xffb400, 28, 50, 2);
  const spindleLightColorPink = new THREE.Color(0xffc14e);
  const spindleLightColorCyan = new THREE.Color(0xff9226);
  spindleLight.position.set(0, 7, 0);
  scene.add(spindleLight);

  const recordMesh = new THREE.Group();
  const pitWallColliderHandle = -1;

  if (Array.isArray(seascape.lodProps)) {
    for (const prop of seascape.lodProps) {
      registerLevelLodNode(prop, { far: 95 });
    }
  }

  function update(timeMs) {
    seascape.update(timeMs);
    sunLight.position.copy(seascape.sunDir).multiplyScalar(SUN_KEY_DISTANCE).setY(SUN_HEIGHT);
    // * Key intensity breathes with the seascape sun pulse (same slow period).
    sunLight.intensity = 1.85 + 0.2 * Math.sin(timeMs * 0.00055);
    coolFill.position.copy(seascape.sunDir).multiplyScalar(-50).setY(18);
    deck.update(timeMs);
  }

  const sceneRoots = [
    seascape.group, deck.group, booths.group,
    sunLight, hemiLight, ambient, coolFill, spindleLight,
  ];
  const ownedGeometries = [
    ...seascape.ownedGeometries, ...deck.ownedGeometries, ...booths.ownedGeometries,
  ];
  const ownedMaterials = [
    ...seascape.ownedMaterials, ...deck.ownedMaterials, ...booths.ownedMaterials,
  ];
  const ownedTextures = [
    ...seascape.ownedTextures, ...deck.ownedTextures, ...booths.ownedTextures,
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

    setWaterDeathEnvironment(null);
    if (scene) {
      scene.fog = prevFog;
      if (USE_SUNSET_ENV) scene.environment = prevEnvironment;
    }
    // * _sunsetEnvTex deliberately NOT disposed — see the session-cache note at assignment.
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
      // * solid: the podium is a drivable frustum, not a death void — bots may
      // * reverse off it when wedged (simulation.js no-reverse gate skips solid).
      circularKeepOuts: [{ x: 0, z: 0, radius: PODIUM_BASE_R, margin: 1.2, solid: true }],
    },
    update,
    dispose,
  };
}
