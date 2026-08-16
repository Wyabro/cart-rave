/**
 * cartPatterns.js — Pattern detail baked into the cart wireframe body material.
 *
 * Pattern flow (menu → state → 3D cart):
 * 1. Menu PATTERNS tab calls `savePlayerCustomization({ pattern })` (customization.js).
 * 2. `loadPlayerCustomization().pattern` is read when spawning or recoloring carts.
 * 3. `resolveCartPatternForSlot()` picks the pattern id (local human → saved; remote humans →
 *    server-synced `slot.patternId`; NPCs → name-seeded pool pick — NET-LOOK-ACC-1).
 * 4. `applyCartPattern(mesh, patternId, neonHex, opts)` injects a mask sampler into the CartFrame's
 *    own MeshPhysicalMaterial (via `onBeforeCompile`) so pattern "valleys" read as darker
 *    tinted neon while the base wireframe keeps full emissive bloom — no second draw pass.
 *    Human foil (`opts.allowFoil`) tints the CartFrame with a 1-order grating lobe.
 */

import * as THREE from "three";
import {
  cartEmissiveIntensityForHex,
  emissiveRefHexForNeonHex,
} from "../utils.js";
import {
  FOIL_LAMBDA_MIN_NM,
  FOIL_LAMBDA_SPAN_NM,
  FOIL_SIGMA,
  getFoilGroove,
  getPatternAccentHexes,
  isFoilPattern,
  isMulticolorPattern,
  normalizePatternId,
} from "./cartPatternConfig.js";

/** @typedef {import("./cartPatternConfig.js").CartPatternId} CartPatternId */

/** @type {Map<CartPatternId, THREE.CanvasTexture>} */
const maskTextureCache = new Map();

export const PATTERN_MASK_SIZE = 128;
const MASK_REPEAT = 3;

// * Tile periods divide PATTERN_MASK_SIZE exactly. That is the seam contract: the generated
// * geometry reaches the opposite texture edge in the same phase before RepeatWrapping samples it.
export const PATTERN_MASK_LAYOUTS = Object.freeze({
  dots: Object.freeze({ repeat: 1.5, periodX: 64, periodY: 64, cell: 32 }),
  honeycomb: Object.freeze({ repeat: 1.5, periodX: 32, periodY: 64, cell: 32 }),
  diamond: Object.freeze({ repeat: 1.25, periodX: 32, periodY: 32, cell: 32 }),
  cubes: Object.freeze({ repeat: 1.75, periodX: 32, periodY: 32, cell: 32 }),
});

// * Bolt is a hero motif (one dramatic forking strike), so it also tiles far fewer times.
const PATTERN_REPEAT = { bolt: 1.35 };

/** @param {string} id @returns {number} */
function repeatForPattern(id) {
  return PATTERN_MASK_LAYOUTS[id]?.repeat ?? PATTERN_REPEAT[id] ?? MASK_REPEAT;
}

// * Overlay tuning — pattern valleys read as darker tinted neon; wire bloom stays full.
// * Reproduces the retired coplanar-overlay material in-shader: valley fragments blend
// * `uPatternStrength` of the way toward a `TINT_SCALE` diffuse tint + an emissive whose
// * radiance matches the old overlay (tint colour × `EMISSIVE_BOOST` intensity curve).
// * CART-COLOR-DEPTH-1 — the deep body base makes the old valley tint read too close to black.
// * Lift the patterned area without touching the classic path or the shared cart bloom curve.
const PATTERN_OVERLAY_TINT_SCALE = 0.38;
const PATTERN_OVERLAY_EMISSIVE_BOOST = 0.40;
const PATTERN_OVERLAY_OPACITY = 0.95;

// * customProgramCacheKey values — patterned (enabled) vs unpatterned (classic) get distinct
// * programs so three never reuses one for the other. Two non-classic patterns share the ON
// * key and differ only by the uPatternMask texture uniform (no recompile on pattern swap).
const PATTERN_CACHE_KEY_ON = "cartPattern:1";
const PATTERN_CACHE_KEY_OFF = "cartPattern:0";

// * PATTERNS-FOIL-1 — luminance-preserving hue mix. Do not add HDR on wires (bloom bomb).
const FOIL_GAIN = 0.75;
const FOIL_LIGHT_DIR = new THREE.Vector3(0.35, 0.85, 0.4).normalize();

/** Injected after emissivemap so tests can lock the grating contract. */
export const FOIL_EMISSIVE_GLSL = [
  "\tif ( uFoilStrength > 0.0 ) {",
  "\t\tvec3 foilN = normalize( vFoilN ) * ( gl_FrontFacing ? 1.0 : -1.0 );",
  "\t\tvec3 foilMaskW = uPatternMulticolor > 0.5",
  "\t\t\t? cartPatternSampleEmissive",
  "\t\t\t: vec3( 1.0 - cartPatternSampleEmissive.r, cartPatternSampleEmissive.r, 0.0 );",
  "\t\tfloat foilMaskSum = foilMaskW.r + foilMaskW.g + foilMaskW.b;",
  "\t\tvec3 foilT;",
  "\t\tif ( foilMaskSum < 0.0001 ) {",
  "\t\t\tfoilT = normalize( vFoilT0 );",
  "\t\t} else {",
  "\t\t\tvec3 foilMaskN = foilMaskW / foilMaskSum;",
  "\t\t\tfoilT = normalize( foilMaskN.r * vFoilT0 + foilMaskN.g * vFoilT1 + foilMaskN.b * vFoilT2 );",
  "\t\t}",
  "\t\tvec3 foilWo = normalize( cameraPosition - vCartWorldPos );",
  "\t\tvec3 foilWi = normalize( uFoilLightDir );",
  "\t\tvec3 foilQ = foilWi + foilWo;",
  "\t\tfloat foilQAcross = abs( dot( foilQ, foilT ) );",
  `\t\tfloat foilLambda = ${FOIL_LAMBDA_MIN_NM.toFixed(1)} + ${FOIL_LAMBDA_SPAN_NM.toFixed(1)} * fract( foilQAcross * ( uFoilPitch / 1000.0 ) );`,
  "\t\tvec3 foilG = normalize( cross( foilN, foilT ) );",
  `\t\tfloat foilAlong = dot( foilQ, foilG ) / ${FOIL_SIGMA.toFixed(2)};`,
  "\t\tfloat foilDensity = exp( -0.5 * foilAlong * foilAlong );",
  "\t\tfloat foilFront = step( 0.0, dot( foilN, foilWi ) ) * step( 0.0, dot( foilN, foilWo ) );",
  "\t\tfloat foilW = foilDensity * foilFront * uFoilMask * uFoilStrength;",
  "\t\tvec3 foilSpectral = vec3(",
  "\t\t\tsmoothstep( 500.0, 600.0, foilLambda ) * ( 1.0 - smoothstep( 650.0, 720.0, foilLambda ) ),",
  "\t\t\tsmoothstep( 450.0, 530.0, foilLambda ) * ( 1.0 - smoothstep( 580.0, 650.0, foilLambda ) ),",
  "\t\t\tsmoothstep( 380.0, 440.0, foilLambda ) * ( 1.0 - smoothstep( 490.0, 560.0, foilLambda ) )",
  "\t\t);",
  "\t\tvec3 foilRgb = foilSpectral * ( 0.35 + 0.65 * uFoilNeon );",
  "\t\tvec3 foilHue = foilRgb / max( max( foilRgb.r, foilRgb.g ), max( foilRgb.b, 0.0001 ) );",
  "\t\tfloat foilEmissiveLum = max( max( totalEmissiveRadiance.r, totalEmissiveRadiance.g ), totalEmissiveRadiance.b );",
  "\t\tfloat foilDiffuseLum = max( max( diffuseColor.r, diffuseColor.g ), max( diffuseColor.b, 0.08 ) );",
  "\t\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, foilHue * foilEmissiveLum, foilW * uFoilGain );",
  "\t\tdiffuseColor.rgb = mix( diffuseColor.rgb, foilHue * foilDiffuseLum, foilW * uFoilGain );",
  "\t}",
].join("\n");

/** Object-space groove axes → world T0..T2 / N. No screen derivatives. */
export const FOIL_VERTEX_GLSL = [
  "\tvCartWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
  "\tvec3 foilN = normalize( mat3( modelMatrix ) * objectNormal );",
  "\tvec3 foilFallbackT = normalize( mat3( modelMatrix ) * vec3( 0.0, 0.0, 1.0 ) );",
  "\tvec3 foilAxis0 = normalize( mat3( modelMatrix ) * vec3( uFoilGroove0.x, 0.0, uFoilGroove0.y ) );",
  "\tvec3 foilAxis1 = normalize( mat3( modelMatrix ) * vec3( uFoilGroove1.x, 0.0, uFoilGroove1.y ) );",
  "\tvec3 foilAxis2 = normalize( mat3( modelMatrix ) * vec3( uFoilGroove2.x, 0.0, uFoilGroove2.y ) );",
  "\tvec3 foilT0 = cross( foilN, foilAxis0 );",
  "\tvec3 foilT1 = cross( foilN, foilAxis1 );",
  "\tvec3 foilT2 = cross( foilN, foilAxis2 );",
  "\tvFoilT0 = length( foilT0 ) > 1e-4 ? normalize( foilT0 ) : foilFallbackT;",
  "\tvFoilT1 = length( foilT1 ) > 1e-4 ? normalize( foilT1 ) : foilFallbackT;",
  "\tvFoilT2 = length( foilT2 ) > 1e-4 ? normalize( foilT2 ) : foilFallbackT;",
  "\tvFoilN = foilN;",
].join("\n");

/** @type {THREE.Color} */
const _patternColor = new THREE.Color();

/**
 * Small deterministic PRNG (mulberry32) so the procedural "bolt" mask is stable and cacheable
 * (never Math.random — the texture is generated once per id and reused across every cart).
 * @param {number} seed
 * @returns {() => number} next float in [0, 1)
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monochrome masks are grayscale (white = full neon glow, black = darker valley).
 * Multicolor masks encode their three accent line families in RGB on a black background.
 * @param {CartPatternId} patternId
 * @returns {HTMLCanvasElement}
 */
function renderPatternMaskCanvas(patternId) {
  const size = PATTERN_MASK_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const glow = "#ffffff";
  const dark = "#000000";

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  switch (patternId) {
    // * All masks target checker's readability: chunky ~50% coverage at a ~16px feature scale,
    // * and seamless tiling (128 = 8×16) so no edge seam reads differently across the body.
    case "stripes": {
      // * Bold diagonal bands. step 32 divides 128 (seamless at 45°); ~14px band ≈ 50/50.
      ctx.fillStyle = dark;
      const step = 32;
      const band = 15;
      for (let i = -size; i < size * 2; i += step) {
        ctx.save();
        ctx.translate(i, 0);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(0, -size, band, size * 3);
        ctx.restore();
      }
      break;
    }
    case "checker": {
      const cell = 16;
      for (let y = 0; y < size; y += cell) {
        for (let x = 0; x < size; x += cell) {
          const on = ((x / cell) + (y / cell)) % 2 === 0;
          ctx.fillStyle = on ? dark : glow;
          ctx.fillRect(x, y, cell, cell);
        }
      }
      break;
    }
    case "dots": {
      // * Historical `dots` id now renders a large Truchet maze, preserving saved choices.
      // * The alternating L turns connect across every 32px cell boundary and repeat after
      // * 64px on both axes. Six readable turns span one UV width instead of the previous 12.
      ctx.strokeStyle = dark;
      ctx.lineWidth = 8;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      const cell = PATTERN_MASK_LAYOUTS.dots.cell;
      for (let row = 0; row < size / cell; row += 1) {
        for (let col = 0; col < size / cell; col += 1) {
          const x = col * cell;
          const y = row * cell;
          const midX = x + cell / 2;
          const midY = y + cell / 2;
          ctx.beginPath();
          if ((row + col) % 2 === 0) {
            ctx.moveTo(midX, y);
            ctx.lineTo(midX, midY);
            ctx.lineTo(x + cell, midY);
          } else {
            ctx.moveTo(x, midY);
            ctx.lineTo(midX, midY);
            ctx.lineTo(midX, y + cell);
          }
          ctx.stroke();
        }
      }
      break;
    }
    case "waves": {
      // * Thick wavy ribbons (not thin lines). period 32 divides 128 (seamless vertically);
      // * 2 horizontal cycles across the tile keep the left/right seam continuous.
      ctx.fillStyle = dark;
      const period = 32;
      const bandH = 16;
      const amp = 8;
      for (let x = 0; x < size; x += 1) {
        const off = Math.sin((x / size) * Math.PI * 4) * amp;
        for (let k = -1; k * period + off < size + period; k += 1) {
          ctx.fillRect(x, k * period + off, 1, bandH);
        }
      }
      break;
    }
    case "bolt": {
      // * Procedural forking lightning that GLOWS. A jagged main channel (endpoints pinned to the
      // * tile's vertical centerline → seamless top/bottom) plus tapering side-forks kept inside
      // * the horizontal margins → seamless left/right. Drawn bright on a darkened field so the
      // * body reads like a bolt is arcing across it (white = full glow, so the field dims and the
      // * bolt stays lit). Deterministic (seeded midpoint displacement) → stable + cacheable.
      const cx = size / 2;
      const margin = 16;
      const rand = mulberry32(0x9e3779b1);
      const clampX = (x) => Math.max(margin, Math.min(size - margin, x));

      // * Dark moody field so the glowing bolt pops (near-black — keeps a whisper of neon).
      ctx.fillStyle = "#181818";
      ctx.fillRect(0, 0, size, size);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      /** Midpoint-displacement jagged polyline; endpoints stay fixed (seam-safe). */
      const jagged = (x1, y1, x2, y2, rough, iters) => {
        let pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
        for (let it = 0; it < iters; it += 1) {
          const np = [];
          for (let i = 0; i < pts.length - 1; i += 1) {
            const a = pts[i];
            const b = pts[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const d = (rand() * 2 - 1) * rough * len;
            np.push(a, { x: clampX((a.x + b.x) / 2 + (-dy / len) * d), y: (a.y + b.y) / 2 + (dx / len) * d });
          }
          np.push(pts[pts.length - 1]);
          pts = np;
        }
        return pts;
      };
      const trace = (pts, width, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };

      const main = jagged(cx, 0, cx, size, 0.34, 6);
      /** @type {Array<Array<{x:number,y:number}>>} */
      const forks = [];
      for (let i = 3; i < main.length - 3; i += 1) {
        if (rand() < 0.22) {
          const p = main[i];
          const side = rand() < 0.5 ? -1 : 1;
          forks.push(jagged(p.x, p.y, clampX(p.x + side * (22 + rand() * 26)), p.y + (18 + rand() * 26), 0.4, 4));
        }
      }

      // * Three tiers for a glowing falloff (wide faint outer → mid halo → bright core), which the
      // * scene bloom then blooms further. Forks under the main channel so junctions read cleanly.
      const outer = "#3a3a3a";
      const halo = "#858585";
      for (const f of forks) trace(f, 12, outer);
      trace(main, 22, outer);
      for (const f of forks) trace(f, 7, halo);
      trace(main, 13, halo);
      for (const f of forks) trace(f, 3, glow);
      trace(main, 6, glow);
      break;
    }
    case "honeycomb": {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, size, size);
      const colors = ["#ff0000", "#00ff00", "#0000ff"];
      const hexWidth = PATTERN_MASK_LAYOUTS.honeycomb.cell;
      const rowStep = PATTERN_MASK_LAYOUTS.honeycomb.cell;
      const halfWidth = hexWidth / 2;
      const halfHeight = rowStep * 2 / 3;
      const quarterHeight = halfHeight / 2;
      const trace = (color, a, b) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      };
      // * The 32×64 stagger repeats exactly into 128. Shared edges use the same colour family,
      // * so neighbouring cells reinforce instead of mixing into broken yellow/pink fragments.
      for (let row = -2; row <= size / rowStep + 2; row += 1) {
        const cy = row * rowStep;
        const offsetX = Math.abs(row) % 2 === 1 ? halfWidth : 0;
        for (let col = -2; col <= size / hexWidth + 2; col += 1) {
          const cx = col * hexWidth + offsetX;
          const points = [
            [cx, cy - halfHeight],
            [cx + halfWidth, cy - quarterHeight],
            [cx + halfWidth, cy + quarterHeight],
            [cx, cy + halfHeight],
            [cx - halfWidth, cy + quarterHeight],
            [cx - halfWidth, cy - quarterHeight],
          ];
          trace(colors[0], points[0], points[1]);
          trace(colors[1], points[1], points[2]);
          trace(colors[2], points[2], points[3]);
          trace(colors[0], points[3], points[4]);
          trace(colors[1], points[4], points[5]);
          trace(colors[2], points[5], points[0]);
        }
      }
      break;
    }
    case "diamond": {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, size, size);
      const colors = ["#ff0000", "#00ff00", "#0000ff"];
      const step = PATTERN_MASK_LAYOUTS.diamond.cell;
      for (let y = 0; y < size; y += step) {
        for (let x = 0; x < size; x += step) {
          const cx = x + step / 2;
          const cy = y + step / 2;
          for (let ring = 0; ring < 3; ring += 1) {
            const radius = [14, 9, 4][ring];
            ctx.strokeStyle = colors[ring];
            ctx.lineWidth = [4, 3, 2.5][ring];
            ctx.beginPath();
            ctx.moveTo(cx, cy - radius);
            ctx.lineTo(cx + radius, cy);
            ctx.lineTo(cx, cy + radius);
            ctx.lineTo(cx - radius, cy);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
      break;
    }
    case "cubes": {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, size, size);
      const colors = ["#ff0000", "#00ff00", "#0000ff"];
      const faceColors = ["#550000", "#004d00", "#000047"];
      const cubeStep = PATTERN_MASK_LAYOUTS.cubes.cell;
      const halfWidth = cubeStep / 2;
      const halfHeight = cubeStep * 2 / 3;
      const quarterHeight = halfHeight / 2;
      const fillFace = (color, face) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(face[0][0], face[0][1]);
        for (let index = 1; index < face.length; index += 1) ctx.lineTo(face[index][0], face[index][1]);
        ctx.closePath();
        ctx.fill();
      };
      const trace = (color, a, b) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      };
      // * Compact prismatic cubes: three tinted rhombi create distinct faces, while one bright
      // * glint on the top face gives a stable reflected-light read without a second material.
      for (let row = -2; row <= size / cubeStep + 2; row += 1) {
        const cy = row * cubeStep;
        const offsetX = Math.abs(row) % 2 === 1 ? halfWidth : 0;
        for (let col = -2; col <= size / cubeStep + 2; col += 1) {
          const cx = col * cubeStep + offsetX;
          const points = [
            [cx, cy - halfHeight],
            [cx + halfWidth, cy - quarterHeight],
            [cx + halfWidth, cy + quarterHeight],
            [cx, cy + halfHeight],
            [cx - halfWidth, cy + quarterHeight],
            [cx - halfWidth, cy - quarterHeight],
          ];
          const center = [cx, cy];
          fillFace(faceColors[0], [points[0], points[1], center, points[5]]);
          fillFace(faceColors[1], [points[1], points[2], points[3], center]);
          fillFace(faceColors[2], [center, points[3], points[4], points[5]]);
          trace(colors[0], points[0], points[1]);
          trace(colors[1], points[1], points[2]);
          trace(colors[2], points[2], points[3]);
          trace(colors[0], points[3], points[4]);
          trace(colors[1], points[4], points[5]);
          trace(colors[2], points[5], points[0]);
          trace(colors[1], center, points[0]);
          trace(colors[0], center, points[2]);
          trace(colors[2], center, points[4]);
          trace("#666666", [cx - halfWidth * 0.42, cy - quarterHeight * 0.58], [cx + halfWidth * 0.2, cy - halfHeight * 0.56]);
        }
      }
      break;
    }
    default:
      break;
  }

  return canvas;
}

/**
 * Cached pattern mask texture (white = glow, dark = valley). Repeat baked into the texture
 * as a fallback; the shader also multiplies UVs by {@link MASK_REPEAT} via `uPatternRepeat`.
 * @param {CartPatternId} patternId
 * @returns {THREE.CanvasTexture}
 */
function getPatternMaskTexture(patternId) {
  const id = normalizePatternId(patternId);
  const cached = maskTextureCache.get(id);
  if (cached) return cached;

  const canvas = renderPatternMaskCanvas(id);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const rep = repeatForPattern(id);
  tex.repeat.set(rep, rep);
  tex.colorSpace = THREE.NoColorSpace;
  maskTextureCache.set(id, tex);
  return tex;
}

/**
 * Injects the pattern mask sampler into a CartFrame MeshPhysicalMaterial once (idempotent).
 * Returns the persistent uniform bag so callers can retune it without recompiling.
 *
 * The injected chunk modulates the standard color / emissive pipeline (it never replaces
 * `diffuseColor` or `totalEmissiveRadiance` wholesale), so per-frame recolor / leader-glow /
 * boost-pulse mutations of `material.color` / `material.emissive` keep flowing through.
 *
 * `useUv1` selects the second UV channel (`TEXCOORD_1` → three attribute `uv1`) for mask
 * sampling. The cartrave4 body's `TEXCOORD_0` carries a fragmented Tripo unwrap (plus the baked
 * albedo + wire-emissive), which shreds oriented patterns; a clean box-unwrapped `uv1` reads
 * correctly. Meshes without a second channel (procedural CartFrame) fall back to `uv`.
 *
 * @param {THREE.Material} mat
 * @param {boolean} [useUv1] Sample the mask from `uv1` (clean channel) instead of `uv`.
 * @returns {Record<string, THREE.IUniform>}
 */
function ensureFramePatternInjection(mat, useUv1 = false) {
  const ud = /** @type {any} */ (mat.userData);
  if (ud.cartPatternUniforms) return ud.cartPatternUniforms;

  /** @type {Record<string, THREE.IUniform>} */
  const uniforms = {
    uPatternMask: { value: null },
    uPatternRepeat: { value: MASK_REPEAT },
    uPatternStrength: { value: 0 },
    uPatternMulticolor: { value: 0 },
    uPatternTint: { value: new THREE.Color(1, 1, 1) },
    uPatternEmissive: { value: new THREE.Color(0, 0, 0) },
    uPatternAccentA: { value: new THREE.Color(1, 1, 1) },
    uPatternAccentB: { value: new THREE.Color(1, 1, 1) },
    uPatternAccentC: { value: new THREE.Color(1, 1, 1) },
    uPatternAccentEmissiveA: { value: new THREE.Color(0, 0, 0) },
    uPatternAccentEmissiveB: { value: new THREE.Color(0, 0, 0) },
    uPatternAccentEmissiveC: { value: new THREE.Color(0, 0, 0) },
    uFoilStrength: { value: 0 },
    uFoilMask: { value: 1 },
    uFoilPitch: { value: 1180 },
    uFoilGain: { value: FOIL_GAIN },
    uFoilGroove0: { value: new THREE.Vector2(1, 0) },
    uFoilGroove1: { value: new THREE.Vector2(0, 1) },
    uFoilGroove2: { value: new THREE.Vector2(-1, 0) },
    uFoilLightDir: { value: FOIL_LIGHT_DIR.clone() },
    uFoilNeon: { value: new THREE.Color(1, 1, 1) },
  };
  ud.cartPatternUniforms = uniforms;
  ud.cartPatternEnabled = false;
  ud.cartPatternUv1 = !!useUv1;

  const prevOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (typeof prevOnBeforeCompile === "function") prevOnBeforeCompile(shader, renderer);

    shader.uniforms.uPatternMask = uniforms.uPatternMask;
    shader.uniforms.uPatternRepeat = uniforms.uPatternRepeat;
    shader.uniforms.uPatternStrength = uniforms.uPatternStrength;
    shader.uniforms.uPatternMulticolor = uniforms.uPatternMulticolor;
    shader.uniforms.uPatternTint = uniforms.uPatternTint;
    shader.uniforms.uPatternEmissive = uniforms.uPatternEmissive;
    shader.uniforms.uPatternAccentA = uniforms.uPatternAccentA;
    shader.uniforms.uPatternAccentB = uniforms.uPatternAccentB;
    shader.uniforms.uPatternAccentC = uniforms.uPatternAccentC;
    shader.uniforms.uPatternAccentEmissiveA = uniforms.uPatternAccentEmissiveA;
    shader.uniforms.uPatternAccentEmissiveB = uniforms.uPatternAccentEmissiveB;
    shader.uniforms.uPatternAccentEmissiveC = uniforms.uPatternAccentEmissiveC;
    shader.uniforms.uFoilStrength = uniforms.uFoilStrength;
    shader.uniforms.uFoilMask = uniforms.uFoilMask;
    shader.uniforms.uFoilPitch = uniforms.uFoilPitch;
    shader.uniforms.uFoilGain = uniforms.uFoilGain;
    shader.uniforms.uFoilGroove0 = uniforms.uFoilGroove0;
    shader.uniforms.uFoilGroove1 = uniforms.uFoilGroove1;
    shader.uniforms.uFoilGroove2 = uniforms.uFoilGroove2;
    shader.uniforms.uFoilLightDir = uniforms.uFoilLightDir;
    shader.uniforms.uFoilNeon = uniforms.uFoilNeon;

    // * Route mask sampling through the chosen UV channel. `uv` is declared in three's vertex
    // * prefix; the second channel (`uv1`) is NOT declared unless a map uses it (our body maps
    // * only use `uv`), so we declare `attribute vec2 uv1;` ourselves — three rewrites it to
    // * `in vec2 uv1;` for GLSL3. The geometry must carry a `uv1` attribute (TEXCOORD_1).
    const patternUvAttr = useUv1 ? "uv1" : "uv";
    const foilVertexPars = [
      "uniform vec2 uFoilGroove0;",
      "uniform vec2 uFoilGroove1;",
      "uniform vec2 uFoilGroove2;",
      "varying vec3 vCartWorldPos;",
      "varying vec3 vFoilT0;",
      "varying vec3 vFoilT1;",
      "varying vec3 vFoilT2;",
      "varying vec3 vFoilN;",
    ].join("\n");
    const vertexCommon = useUv1
      ? `#include <common>\nattribute vec2 uv1;\nvarying vec2 vCartPatternUv;\n${foilVertexPars}`
      : `#include <common>\nvarying vec2 vCartPatternUv;\n${foilVertexPars}`;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", vertexCommon)
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\n\tvCartPatternUv = ${patternUvAttr};`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>\n${FOIL_VERTEX_GLSL}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform sampler2D uPatternMask;",
          "uniform float uPatternRepeat;",
          "uniform float uPatternStrength;",
          "uniform float uPatternMulticolor;",
          "uniform vec3 uPatternTint;",
          "uniform vec3 uPatternEmissive;",
          "uniform vec3 uPatternAccentA;",
          "uniform vec3 uPatternAccentB;",
          "uniform vec3 uPatternAccentC;",
          "uniform vec3 uPatternAccentEmissiveA;",
          "uniform vec3 uPatternAccentEmissiveB;",
          "uniform vec3 uPatternAccentEmissiveC;",
          "uniform float uFoilStrength;",
          "uniform float uFoilMask;",
          "uniform float uFoilPitch;",
          "uniform float uFoilGain;",
          "uniform vec2 uFoilGroove0;",
          "uniform vec2 uFoilGroove1;",
          "uniform vec2 uFoilGroove2;",
          "uniform vec3 uFoilLightDir;",
          "uniform vec3 uFoilNeon;",
          "varying vec2 vCartPatternUv;",
          "varying vec3 vCartWorldPos;",
          "varying vec3 vFoilT0;",
          "varying vec3 vFoilT1;",
          "varying vec3 vFoilT2;",
          "varying vec3 vFoilN;",
          "",
        ].join("\n"),
      )
      // * Monochrome patterns retain darker valleys. RGB textures route their three line
      // * families through brand-aligned accent uniforms without a shader-program swap.
      .replace(
        "#include <color_fragment>",
        [
          "#include <color_fragment>",
          "\tvec3 cartPatternSample = texture2D( uPatternMask, vCartPatternUv * uPatternRepeat ).rgb;",
          "\tif ( uPatternMulticolor > 0.5 ) {",
          "\t\tvec3 cartPatternWeights = cartPatternSample * uPatternStrength;",
          "\t\tfloat cartPatternWeight = min( cartPatternWeights.r + cartPatternWeights.g + cartPatternWeights.b, 1.0 );",
          "\t\tvec3 cartPatternAccent = ( cartPatternWeights.r * uPatternAccentA + cartPatternWeights.g * uPatternAccentB + cartPatternWeights.b * uPatternAccentC ) / max( cartPatternWeight, 0.0001 );",
          "\t\tdiffuseColor.rgb = mix( diffuseColor.rgb, cartPatternAccent, cartPatternWeight );",
          "\t} else {",
          "\t\tfloat cartPatternValley = ( 1.0 - cartPatternSample.r ) * uPatternStrength;",
          "\t\tdiffuseColor.rgb = mix( diffuseColor.rgb, uPatternTint, cartPatternValley );",
          "\t}",
        ].join("\n"),
      )
      // * Dim monochrome valleys, or use the same RGB classification for multicolor emissive.
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "\tvec3 cartPatternSampleEmissive = texture2D( uPatternMask, vCartPatternUv * uPatternRepeat ).rgb;",
          "\tif ( uPatternMulticolor > 0.5 ) {",
          "\t\tvec3 cartPatternEmissiveWeights = cartPatternSampleEmissive * uPatternStrength;",
          "\t\tfloat cartPatternEmissiveWeight = min( cartPatternEmissiveWeights.r + cartPatternEmissiveWeights.g + cartPatternEmissiveWeights.b, 1.0 );",
          "\t\tvec3 cartPatternAccentEmissive = ( cartPatternEmissiveWeights.r * uPatternAccentEmissiveA + cartPatternEmissiveWeights.g * uPatternAccentEmissiveB + cartPatternEmissiveWeights.b * uPatternAccentEmissiveC ) / max( cartPatternEmissiveWeight, 0.0001 );",
          "\t\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, cartPatternAccentEmissive, cartPatternEmissiveWeight );",
          "\t} else {",
          "\t\tfloat cartPatternValleyEmissive = ( 1.0 - cartPatternSampleEmissive.r ) * uPatternStrength;",
          "\t\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, uPatternEmissive, cartPatternValleyEmissive );",
          "\t}",
          FOIL_EMISSIVE_GLSL,
        ].join("\n"),
      );
  };

  // * Enabled state + UV channel gate the program cache: patterned/unpatterned never collide,
  // * and a `uv`-compiled program is never reused for a `uv1` body (distinct vertex shaders).
  mat.customProgramCacheKey = () => {
    const u = /** @type {any} */ (mat.userData);
    const base = u.cartPatternEnabled ? PATTERN_CACHE_KEY_ON : PATTERN_CACHE_KEY_OFF;
    return `${base}:${u.cartPatternUv1 ? "uv1" : "uv"}`;
  };

  // * First injection on an already-compiled material must trigger a recompile.
  mat.needsUpdate = true;
  return uniforms;
}

/**
 * Applies (or clears) a pattern on a CartFrame material by retuning the injected uniforms.
 * classic → strength 0 (mask disabled). Non-classic → mask + tint uniforms swapped in place;
 * a recompile only happens when the enabled state itself flips (uses a distinct cache key).
 *
 * @param {THREE.Material} mat
 * @param {CartPatternId} patternId
 * @param {number} neonHex
 * @param {boolean} [useUv1] Sample the mask from the clean `uv1` channel (see injection docs).
 * @param {boolean} [allowFoil] Human carts only. NPCs keep the printed pattern dry.
 */
function applyPatternToFrameMaterial(mat, patternId, neonHex, useUv1 = false, allowFoil = false) {
  const uniforms = ensureFramePatternInjection(mat, useUv1);
  const id = normalizePatternId(patternId);
  const enabled = id !== "classic";
  const hex = Number.isFinite(neonHex) ? neonHex : 0xffffff;
  const ud = /** @type {any} */ (mat.userData);

  if (enabled) {
    uniforms.uPatternMask.value = getPatternMaskTexture(id);
    uniforms.uPatternRepeat.value = repeatForPattern(id);
    uniforms.uPatternStrength.value = PATTERN_OVERLAY_OPACITY;
    uniforms.uPatternMulticolor.value = isMulticolorPattern(id) ? 1 : 0;

    // * Linear-space neon; diffuse tint + emissive radiance mirror the retired overlay material.
    _patternColor.setHex(hex).convertSRGBToLinear();
    /** @type {THREE.Color} */ (uniforms.uFoilNeon.value).copy(_patternColor);
    /** @type {THREE.Color} */ (uniforms.uPatternTint.value)
      .copy(_patternColor)
      .multiplyScalar(PATTERN_OVERLAY_TINT_SCALE);

    const refHex = emissiveRefHexForNeonHex(hex);
    const emissiveIntensity = cartEmissiveIntensityForHex(refHex, PATTERN_OVERLAY_EMISSIVE_BOOST);
    /** @type {THREE.Color} */ (uniforms.uPatternEmissive.value)
      .copy(_patternColor)
      .multiplyScalar(PATTERN_OVERLAY_TINT_SCALE * emissiveIntensity);

    if (isMulticolorPattern(id)) {
      const accents = getPatternAccentHexes(id, hex);
      const accentUniforms = [
        uniforms.uPatternAccentA,
        uniforms.uPatternAccentB,
        uniforms.uPatternAccentC,
      ];
      const accentEmissiveUniforms = [
        uniforms.uPatternAccentEmissiveA,
        uniforms.uPatternAccentEmissiveB,
        uniforms.uPatternAccentEmissiveC,
      ];
      for (let i = 0; i < accents.length; i += 1) {
        _patternColor.setHex(accents[i]).convertSRGBToLinear();
        /** @type {THREE.Color} */ (accentUniforms[i].value).copy(_patternColor);
        const accentIntensity = cartEmissiveIntensityForHex(
          emissiveRefHexForNeonHex(accents[i]),
          PATTERN_OVERLAY_EMISSIVE_BOOST,
        );
        /** @type {THREE.Color} */ (accentEmissiveUniforms[i].value)
          .copy(_patternColor)
          .multiplyScalar(accentIntensity);
      }
    }
  } else {
    uniforms.uPatternStrength.value = 0;
    uniforms.uPatternMulticolor.value = 0;
  }

  const groove = allowFoil && isFoilPattern(id) ? getFoilGroove(id) : null;
  if (groove) {
    uniforms.uFoilStrength.value = 1;
    uniforms.uFoilMask.value = 1;
    uniforms.uFoilPitch.value = groove.pitchNm;
    uniforms.uFoilGain.value = FOIL_GAIN;
    const grooveUniforms = [uniforms.uFoilGroove0, uniforms.uFoilGroove1, uniforms.uFoilGroove2];
    for (let i = 0; i < 3; i += 1) {
      const angle = groove.angles[i];
      /** @type {THREE.Vector2} */ (grooveUniforms[i].value).set(Math.cos(angle), Math.sin(angle));
    }
    /** @type {THREE.Vector3} */ (uniforms.uFoilLightDir.value).copy(FOIL_LIGHT_DIR);
  } else {
    uniforms.uFoilStrength.value = 0;
  }

  if (ud.cartPatternEnabled !== enabled) {
    ud.cartPatternEnabled = enabled;
    // * Program cache key changed (classic ↔ patterned) — force a recompile.
    mat.needsUpdate = true;
  }
}

/**
 * Removes legacy pattern meshes from older builds (flat-panel overlays + the coplanar
 * CartFramePattern sibling that predated the in-material mask).
 * @param {THREE.Object3D} root
 */
function removeLegacyPatternMeshes(root) {
  for (const name of ["CartPatternOverlays", "CartFramePattern"]) {
    const legacy = root.getObjectByName(name);
    if (!legacy) continue;

    legacy.traverse((child) => {
      const c = /** @type {any} */ (child);
      if (!c.isMesh) return;
      if (!c.userData?.sharesCartFrameGeometry) c.geometry?.dispose();
      const mat = c.material;
      if (mat && !Array.isArray(mat)) mat.dispose?.();
    });
    legacy.parent?.remove(legacy);
  }
}

/**
 * Applies or clears a pattern on the merged CartFrame wireframe material.
 * The base CartFrame keeps full neon bloom; masked "valleys" read as darker tinted detail.
 *
 * @param {THREE.Object3D | null | undefined} root
 * @param {CartPatternId | string} patternId
 * @param {number} [neonHex] Cart neon hex for the valley tint (independent of base glow).
 * @param {{ allowFoil?: boolean }} [opts] `allowFoil` is human-only (menu + human slots).
 */
export function applyCartPattern(root, patternId, neonHex, opts) {
  if (!root) return;

  removeLegacyPatternMeshes(root);

  const frameMesh = root.getObjectByName("CartFrame");
  if (!(/** @type {any} */ (frameMesh)?.isMesh)) return;

  const mat = /** @type {THREE.Mesh} */ (frameMesh).material;
  if (!mat || Array.isArray(mat)) return;

  // * Prefer the clean second UV channel when the body carries one (re-UV'd cartrave4 export);
  // * meshes with only TEXCOORD_0 (procedural CartFrame, current GLB) fall back to `uv`.
  const useUv1 = !!(/** @type {THREE.Mesh} */ (frameMesh).geometry?.getAttribute?.("uv1"));

  applyPatternToFrameMaterial(
    mat,
    normalizePatternId(patternId),
    neonHex ?? 0xffffff,
    useUv1,
    opts?.allowFoil === true,
  );
}
