// waterDeathFx.js — splash + underwater-detonation VFX (plus procedural splash/boom
// audio via sfxSynth) for arenas with a water plane (Sundial Station).
// Client-local, no physics, no network traffic.
//
// The ocean plane is OPAQUE, so nothing can literally render below it — every
// "underwater" read is faked just above the surface, which is also how a detonation
// under water looks from above: a bloom of light through the surface, a foam boil,
// and bubbles. Three pieces:
//
//   1. Entry splash — when a falling cart crosses the waterline: multi-ring soft
//      foam, a mist sheet, crown droplets, spray sprites, and ballistic secondary
//      mist. Detected per frame from cart mesh positions (works for local, host,
//      and net-interpolated remote carts).
//   2. Depth burst — called by cartShatter when a cart explodes below the waterline:
//      hot neon bloom through the surface, dual shock rings, geyser spray column,
//      delayed foam boil sprites, and rising bubble churn. cartShatter also clamps
//      its own core/ring explosion to the surface so the two read as one event.
//
// Lifecycle mirrors cartShatter: shared geometries/textures live at module level;
// per-effect materials/geometries are created on spawn and disposed when the effect
// ends. The level registers the environment in its init and clears it in dispose(),
// which also tears down any effects still running.

import * as THREE from "three";
import { CONFIG } from "../config.js";
import { playWaterSplash, playWaterDeathBoom } from "../sfxSynth.js";
import { isLowQualityMode } from "../utils.js";
import { getQualityTier } from "../utils/qualityMode.js";

/**
 * Ambient ocean caustic strength by quality tier (0 = off on low).
 * @returns {number}
 */
function resolveAmbientCausticStrength() {
  const tier = getQualityTier();
  if (tier === "low") return 0;
  if (tier === "medium") return 0.45;
  return 0.85;
}

const MAX_ACTIVE_EFFECTS = 16; // hard cap — splash + overlays + burst layers can stack
const TELEPORT_JUMP_M = 8; // per-frame Y jump larger than this is a respawn, not a fall

// ---------------------------------------------------------------------------
// Shared procedural textures + geometries (never disposed)
// ---------------------------------------------------------------------------

/**
 * Soft radial disc texture.
 * @param {number} size
 * @param {{ inner?: string, mid?: string, outer?: string }} stops
 * @returns {THREE.Texture} CanvasTexture, or 1×1 DataTexture if 2d context is unavailable
 */
function makeSoftDiscTexture(size, stops) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  const c = size * 0.5;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, stops.inner ?? "rgba(255,255,255,1)");
  g.addColorStop(0.4, stops.mid ?? "rgba(255,255,255,0.45)");
  g.addColorStop(0.75, stops.outer ?? "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft annular ring — foam / shockwave.
 * @param {number} size
 * @returns {THREE.Texture} CanvasTexture, or 1×1 DataTexture if 2d context is unavailable
 */
function makeSoftRingTexture(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  const c = size * 0.5;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, c * 0.38, c, c, c * 0.95);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.3, "rgba(255,255,255,0.2)");
  g.addColorStop(0.52, "rgba(255,255,255,1)");
  g.addColorStop(0.78, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // * Soft center knock-out so the ring reads as foam edge, not a filled disc.
  const hole = ctx.createRadialGradient(c, c, 0, c, c, c * 0.45);
  hole.addColorStop(0, "rgba(0,0,0,1)");
  hole.addColorStop(0.8, "rgba(0,0,0,1)");
  hole.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = hole;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  // * Mild noise flecks for foam grain (cheap, once at module load).
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 48; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = c * (0.5 + Math.random() * 0.38);
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Droplet / bubble soft point.
 * @returns {THREE.Texture}
 */
function makeDropletTexture() {
  return makeSoftDiscTexture(32, {
    inner: "rgba(255,255,255,1)",
    mid: "rgba(255,255,255,0.55)",
    outer: "rgba(255,255,255,0.05)",
  });
}

/**
 * Vertical spray streak (for Points size-attenuation streaks-as-dots fallback
 * and spray sprites stretched on Y).
 * @returns {THREE.Texture} CanvasTexture, or 1×1 DataTexture if 2d context is unavailable
 */
function makeSprayStreakTexture() {
  const w = 32;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  // * Soft vertical plume.
  for (let y = 0; y < h; y += 1) {
    const t = y / (h - 1);
    // * Brighter near bottom (base of spray), tapering upward.
    const along = Math.sin(t * Math.PI) * (1 - t * 0.35);
    for (let x = 0; x < w; x += 1) {
      const across = 1 - Math.abs(x - cx) / cx;
      const a = Math.pow(Math.max(0, across), 1.8) * along;
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// * Lazy textures — module-level canvas work breaks Node test imports
// * (no document / getContext("2d") === null). Built on first splash/burst.
/** @type {{
 *   foamRing: THREE.Texture,
 *   mist: THREE.Texture,
 *   bloom: THREE.Texture,
 *   droplet: THREE.Texture,
 *   spray: THREE.Texture,
 *   bubble: THREE.Texture,
 *   foamSheet: THREE.Texture,
 * } | null} */
let _tex = null;

/**
 * @returns {{
 *   foamRing: THREE.Texture,
 *   mist: THREE.Texture,
 *   bloom: THREE.Texture,
 *   droplet: THREE.Texture,
 *   spray: THREE.Texture,
 *   bubble: THREE.Texture,
 *   foamSheet: THREE.Texture,
 * }}
 */
function getWaterTextures() {
  if (_tex) return _tex;
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    _tex = {
      foamRing: fallback,
      mist: fallback,
      bloom: fallback,
      droplet: fallback,
      spray: fallback,
      bubble: fallback,
      foamSheet: fallback,
    };
    return _tex;
  }
  _tex = {
    foamRing: makeSoftRingTexture(128),
    mist: makeSoftDiscTexture(64, {
      inner: "rgba(255,255,255,0.7)",
      mid: "rgba(255,255,255,0.28)",
      outer: "rgba(255,255,255,0.03)",
    }),
    bloom: makeSoftDiscTexture(64, {
      inner: "rgba(255,255,255,1)",
      mid: "rgba(255,255,255,0.5)",
      outer: "rgba(255,255,255,0.04)",
    }),
    droplet: makeDropletTexture(),
    spray: makeSprayStreakTexture(),
    bubble: makeSoftDiscTexture(32, {
      inner: "rgba(255,255,255,0.95)",
      mid: "rgba(255,255,255,0.35)",
      outer: "rgba(255,255,255,0)",
    }),
    // * Multi-band foam sheet for crown curtains / thicker splash body.
    foamSheet: makeSoftDiscTexture(64, {
      inner: "rgba(255,255,255,0.85)",
      mid: "rgba(255,255,255,0.4)",
      outer: "rgba(255,255,255,0.05)",
    }),
  };
  return _tex;
}

const _planeGeo = new THREE.PlaneGeometry(1, 1);
const _columnGeo = new THREE.ConeGeometry(0.42, 1.6, 12, 1, true);

const _tmpColor = new THREE.Color();
const _warmGlow = new THREE.Color(0xff9040); // sunset-water tint mixed into neon blooms
const _foamWhite = new THREE.Color(0xfff6ec);
const _deepFoam = new THREE.Color(0xd8ecf5);

// ---------------------------------------------------------------------------
// Water-plane impact ripple distortion (shader injection on ocean material)
// ---------------------------------------------------------------------------

const MAX_WATER_RIPPLES = 4;

/**
 * Active surface-ripple slots driving the ocean material's normal crests.
 * @type {{ x: number, z: number, startMs: number, strength: number, durationMs: number }[]}
 */
const rippleSlots = Array.from({ length: MAX_WATER_RIPPLES }, () => ({
  x: 0,
  z: 0,
  startMs: -1e9,
  strength: 0,
  durationMs: 1,
}));

/** Shared Vector4 array bound into the water material (xy=origin, z=startSec, w=strength). */
const rippleDataVecs = [
  new THREE.Vector4(0, 0, -1000, 0),
  new THREE.Vector4(0, 0, -1000, 0),
  new THREE.Vector4(0, 0, -1000, 0),
  new THREE.Vector4(0, 0, -1000, 0),
];

/**
 * @type {{
 *   uRippleData: { value: THREE.Vector4[] },
 *   uRippleTime: { value: number },
 *   uAmbientCaustic: { value: number },
 * } | null}
 */
let waterRippleUniforms = null;

/**
 * Injects concentric impact-ripple normal crests into a MeshPhysicalMaterial ocean.
 * Safe to call once per material; subsequent calls no-op.
 *
 * @param {THREE.Material | null | undefined} mat
 * @returns {void}
 */
function patchWaterMaterialForRipples(mat) {
  if (!mat || mat.userData?.waterRipplePatched) return;
  mat.userData.waterRipplePatched = true;

  waterRippleUniforms = {
    uRippleData: { value: rippleDataVecs },
    uRippleTime: { value: 0 },
    uAmbientCaustic: { value: resolveAmbientCausticStrength() },
  };
  mat.userData.waterRippleUniforms = waterRippleUniforms;

  const prevOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (typeof prevOnBeforeCompile === "function") prevOnBeforeCompile(shader, renderer);

    // * Refresh caustic strength at compile time from current tier.
    const causticStr = resolveAmbientCausticStrength();
    waterRippleUniforms.uAmbientCaustic.value = causticStr;

    shader.uniforms.uRippleData = waterRippleUniforms.uRippleData;
    shader.uniforms.uRippleTime = waterRippleUniforms.uRippleTime;
    shader.uniforms.uAmbientCaustic = waterRippleUniforms.uAmbientCaustic;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWaterWorldPos;",
      )
      .replace(
        "#include <project_vertex>",
        [
          "#include <project_vertex>",
          "\tvWaterWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
        ].join("\n"),
      );

    // * Perturb normals after the standard normal-map pass so impact crests stack on
    // * the drifting ocean normals instead of replacing them.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "uniform vec4 uRippleData[4];",
          "uniform float uRippleTime;",
          "uniform float uAmbientCaustic;",
          "varying vec3 vWaterWorldPos;",
        ].join("\n"),
      )
      .replace(
        "#include <normal_fragment_maps>",
        [
          "#include <normal_fragment_maps>",
          "{",
          "\tvec2 wXZ = vWaterWorldPos.xz;",
          "\tvec3 rippleN = vec3( 0.0 );",
          "\tfloat sheen = 0.0;",
          "\tfor ( int i = 0; i < 4; i ++ ) {",
          "\t\tfloat str = uRippleData[ i ].w;",
          "\t\tif ( str < 0.001 ) continue;",
          "\t\tfloat age = uRippleTime - uRippleData[ i ].z;",
          "\t\tif ( age < 0.0 || age > 4.0 ) continue;",
          "\t\tvec2 d = wXZ - uRippleData[ i ].xy;",
          "\t\tfloat dist = length( d );",
          "\t\tfloat speed = 12.0 + str * 8.0;",
          "\t\tfloat waveR = age * speed;",
          "\t\t// * Three trailing crests behind the front for multi-band detail.",
          "\t\tfloat crest = 0.0;",
          "\t\tfor ( int k = 0; k < 3; k ++ ) {",
          "\t\t\tfloat rk = waveR - float( k ) * 1.45;",
          "\t\t\tfloat band = dist - rk;",
          "\t\t\tfloat width = 0.48 + float( k ) * 0.18;",
          "\t\t\tcrest += exp( -band * band / ( width * width ) ) * ( 1.0 - float( k ) * 0.3 );",
          "\t\t}",
          "\t\tfloat envelope = str * exp( -age * 0.72 ) * ( 1.0 - smoothstep( waveR * 0.15, waveR + 3.5, dist ) );",
          "\t\tenvelope *= smoothstep( 0.0, 0.9, dist );",
          "\t\tfloat amp = crest * envelope;",
          "\t\tsheen += amp;",
          "\t\tvec2 dir = dist > 1e-4 ? d / dist : vec2( 0.0 );",
          "\t\trippleN += vec3( dir.x, 0.0, dir.y ) * amp * 2.2;",
          "\t}",
          "\t// * Always-on ambient caustic lace (cheap multi-sine; quality-scaled).",
          "\tfloat caust = 0.0;",
          "\tif ( uAmbientCaustic > 0.01 ) {",
          "\t\tfloat ct = uRippleTime * 0.55;",
          "\t\tvec2 cp = wXZ * 0.085;",
          "\t\tfloat c1 = sin( cp.x * 3.1 + ct ) * sin( cp.y * 2.7 - ct * 0.8 );",
          "\t\tfloat c2 = sin( ( cp.x * 0.75 - cp.y ) * 4.0 + ct * 1.25 );",
          "\t\tfloat c3 = sin( cp.x * 5.2 + cp.y * 3.4 - ct * 0.55 );",
          "\t\tcaust = c1 * 0.45 + c2 * 0.35 + c3 * 0.25;",
          "\t\tcaust = pow( clamp( caust * 0.5 + 0.5, 0.0, 1.0 ), 2.4 );",
          "\t\t// * Mild normal tilt so highlights crawl (not a second normal map).",
          "\t\trippleN += vec3( c1, 0.0, c2 ) * ( 0.12 * uAmbientCaustic );",
          "\t\tsheen += caust * 0.35 * uAmbientCaustic;",
          "\t}",
          "\tif ( dot( rippleN, rippleN ) > 0.0 ) {",
          "\t\tnormal = normalize( normal + rippleN );",
          "\t}",
          "\tdiffuseColor.a = clamp( diffuseColor.a + sheen * 0.01, 0.0, 1.0 );",
          "\tdiffuseColor.rgb += vec3( 0.14, 0.18, 0.2 ) * sheen * 0.55;",
          "\t// * Warm sun-kissed caustic flecks (subtle).",
          "\tif ( caust > 0.01 ) {",
          "\t\tdiffuseColor.rgb += vec3( 0.12, 0.16, 0.14 ) * caust * 0.22 * uAmbientCaustic;",
          "\t}",
          "}",
        ].join("\n"),
      );
  };

  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => {
    const base = typeof prevKey === "function" ? prevKey() : "";
    return `${base}|waterRippleV2caustic`;
  };
  mat.needsUpdate = true;
}

/**
 * Pushes a surface-ripple impulse into the next free (or oldest) slot.
 *
 * @param {number} x World X
 * @param {number} z World Z
 * @param {number} strength 0..1.5 peak normal amplitude scale
 * @param {number} [durationMs=2200]
 * @returns {void}
 */
function pushSurfaceRipple(x, z, strength, durationMs = 2200) {
  const now = performance.now();
  let idx = 0;
  let oldest = Infinity;
  for (let i = 0; i < MAX_WATER_RIPPLES; i += 1) {
    const age = now - rippleSlots[i].startMs;
    if (age > rippleSlots[i].durationMs) {
      idx = i;
      oldest = -1;
      break;
    }
    if (rippleSlots[i].startMs < oldest) {
      oldest = rippleSlots[i].startMs;
      idx = i;
    }
  }
  rippleSlots[idx] = {
    x,
    z,
    startMs: now,
    strength: Math.min(1.5, Math.max(0.2, strength)),
    durationMs,
  };
}

/**
 * Syncs ripple slot state into the ocean material uniforms. Call once per frame.
 * @param {number} nowMs
 * @returns {void}
 */
function updateRippleUniforms(nowMs) {
  if (!waterRippleUniforms) return;
  const nowSec = nowMs * 0.001;
  waterRippleUniforms.uRippleTime.value = nowSec;
  for (let i = 0; i < MAX_WATER_RIPPLES; i += 1) {
    const s = rippleSlots[i];
    const age = nowMs - s.startMs;
    const live = age >= 0 && age < s.durationMs && s.strength > 0;
    // * Fade strength in the uniform so the shader envelope doesn't hard-cut.
    const fade = live ? s.strength * (1 - age / s.durationMs) : 0;
    rippleDataVecs[i].set(s.x, s.z, s.startMs * 0.001, live ? Math.max(fade, s.strength * 0.15) : 0);
  }
}

function clearRippleSlots() {
  for (let i = 0; i < MAX_WATER_RIPPLES; i += 1) {
    rippleSlots[i].startMs = -1e9;
    rippleSlots[i].strength = 0;
    rippleDataVecs[i].set(0, 0, -1000, 0);
  }
  delayedRipples.length = 0;
  if (waterRippleUniforms) waterRippleUniforms.uRippleTime.value = 0;
}

/**
 * Delayed ripple impulses (e.g. depth-charge secondary pulse). Fired from the
 * per-frame driver so dispose/clear never leaves a stray setTimeout behind.
 * @type {{ fireAtMs: number, x: number, z: number, strength: number, durationMs: number }[]}
 */
const delayedRipples = [];

/**
 * @param {number} delayMs
 * @param {number} x
 * @param {number} z
 * @param {number} strength
 * @param {number} [durationMs=1600]
 * @returns {void}
 */
function scheduleSurfaceRipple(delayMs, x, z, strength, durationMs = 1600) {
  delayedRipples.push({
    fireAtMs: performance.now() + delayMs,
    x,
    z,
    strength,
    durationMs,
  });
}

/**
 * @param {number} nowMs
 * @returns {void}
 */
function flushDelayedRipples(nowMs) {
  for (let i = delayedRipples.length - 1; i >= 0; i -= 1) {
    if (nowMs >= delayedRipples[i].fireAtMs) {
      const d = delayedRipples[i];
      pushSurfaceRipple(d.x, d.z, d.strength, d.durationMs);
      delayedRipples.splice(i, 1);
    }
  }
}

/**
 * Multi-band expanding ripple disc (visual complement to the water-normal distortion).
 * Reads at grazing angles where normal crests alone can disappear.
 *
 * @param {THREE.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} intensity
 * @param {number} [neonHex]
 * @returns {void}
 */
function spawnRippleOverlay(scene, x, y, z, intensity, neonHex = 0xc8e8ff) {
  const lowQ = isLowQualityMode();
  const startMs = performance.now();
  const durationMs = 1400 + intensity * 600;
  const endScale = 6.5 + intensity * 5.5;

  _tmpColor.setHex(neonHex).lerp(new THREE.Color(0xd8f0ff), 0.65);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uProgress: { value: 0 },
      uIntensity: { value: 0.55 + intensity * 0.55 },
      uColor: { value: _tmpColor.clone() },
      uBands: { value: lowQ ? 2.0 : 4.0 },
      // * 1 = full Shadertoy-style caustic lace; 0 = ring crests only (low quality).
      uCaustic: { value: lowQ ? 0.0 : 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform float uIntensity;
      uniform vec3 uColor;
      uniform float uBands;
      uniform float uCaustic;
      varying vec2 vUv;

      // * Cheap multi-lobe water caustic (Shadertoy-flavored FBM-of-sines, no textures).
      // * Always returns [0,1] — pow() on negatives is undefined in GLSL and can NaN
      // * the whole framebuffer when this large additive disc covers the view.
      float causticField(vec2 p, float t) {
        float a = 0.0;
        // * Two rotated lattices + a slower envelope — reads as light through chop.
        vec2 q = p * 9.0;
        a += sin(q.x + t * 2.1) * sin(q.y * 1.3 - t * 1.7);
        a += sin(q.x * 1.4 - q.y + t * 2.8) * 0.65;
        vec2 r = vec2(
          q.x * 0.8 - q.y * 0.6,
          q.x * 0.6 + q.y * 0.8
        );
        a += sin(r.x * 1.7 + t * 1.9) * sin(r.y * 1.5 - t * 2.4) * 0.55;
        return clamp(a * 0.5 + 0.5, 0.0, 1.0);
      }

      void main() {
        vec2 p = vUv - 0.5;
        float d = length(p) * 2.0;
        float ang = atan(p.y, p.x);
        // * Soft edge of the disc so the overlay doesn't clip as a hard square.
        float disc = 1.0 - smoothstep(0.92, 1.0, d);
        float rings = 0.0;
        for (float i = 0.0; i < 4.0; i += 1.0) {
          if (i >= uBands) break;
          // * Rings born at center and expand with staggered phase.
          float phase = clamp(uProgress * 1.15 - i * 0.12, 0.0, 1.0);
          float ringR = phase;
          float band = abs(d - ringR);
          float width = 0.035 + i * 0.012 + phase * 0.02;
          float crest = exp(-band * band / (width * width));
          // * Trailing half-crest for thickness (mul, not pow — avoids undefined pow(neg, 2.0)).
          float trailOff = band - width * 1.4;
          float trail = exp(-(trailOff * trailOff) / (width * width * 2.5)) * 0.35;
          rings += (crest + trail) * (1.0 - phase) * (1.0 - i * 0.18);
        }
        // * Inner damp so the center isn't a solid glow after the crest leaves.
        rings *= smoothstep(0.0, 0.12, d) * disc;

        // * Caustic lace rides the ring energy (not a solid disc fill).
        float caust = 0.0;
        if (uCaustic > 0.5) {
          float t = uProgress * 6.5;
          float field = causticField(p * (1.0 + uProgress * 0.8), t);
          // * Angular sparkle so crests break into wet highlights.
          float spokes = 0.55 + 0.45 * sin(ang * 7.0 - t * 1.4 + d * 10.0);
          caust = pow(field, 2.4) * spokes * rings;
        }

        float energy = rings + caust * 0.85;
        float alpha = clamp(energy * uIntensity * (1.0 - uProgress * 0.55), 0.0, 1.0);
        vec3 col = uColor * (0.7 + rings * 0.8 + caust * 0.9);
        // * Cool white hotspots on caustic peaks.
        col = mix(col, vec3(0.85, 0.95, 1.0), clamp(caust * 0.35, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(_planeGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y + 0.03, z);
  mesh.scale.setScalar(0.8);
  // * Avoid z-fighting with foam rings slightly above.
  mesh.renderOrder = 2;
  scene.add(mesh);

  addEffect({
    step(now) {
      const t = Math.min(1, (now - startMs) / durationMs);
      const e = 1 - (1 - t) * (1 - t) * (1 - t) * (1 - t);
      mat.uniforms.uProgress.value = t;
      mesh.scale.setScalar(0.8 + (endScale - 0.8) * e);
      return t < 1;
    },
    teardown() {
      scene.remove(mesh);
      mat.dispose();
    },
  });
}

/** @type {{ scene: THREE.Scene, waterY: number, waterMat?: THREE.Material | null } | null} */
let env = null;

/**
 * Live effects. Each entry owns its scene objects and disposables and exposes a
 * step(now, dt) that returns false when finished.
 * @type {{ step: (now: number, dt: number) => boolean, teardown: () => void }[]}
 */
const active = [];

/**
 * Registers (or clears) the active level's water plane for death FX. Clearing tears
 * down any effects still playing. Call from level init / dispose.
 *
 * When `waterMat` is provided, impact ripples inject concentric normal crests into
 * the ocean shader so the plane itself distorts (not just overlay rings).
 *
 * @param {{ scene: THREE.Scene, waterY: number, waterMat?: THREE.Material | null } | null} params
 * @returns {void}
 */
export function setWaterDeathEnvironment(params) {
  if (!params) {
    for (const fx of active) fx.teardown();
    active.length = 0;
    clearRippleSlots();
    waterRippleUniforms = null;
    env = null;
    return;
  }
  env = params;
  if (params.waterMat) {
    patchWaterMaterialForRipples(params.waterMat);
  }
}

/**
 * Water surface height of the active level, or null when the level has no water.
 * Used by cartShatter to clamp underwater explosion origins to the surface.
 *
 * @returns {number | null}
 */
export function getWaterDeathSurfaceY() {
  return env ? env.waterY : null;
}

/**
 * Diagnostic: number of splash/burst effects currently animating. A count that never
 * drains back to zero means the per-frame driver (frameVisuals) is not running.
 * Reached via the window.CartClashWaterFx console handle (not exported — no in-code callers).
 *
 * @returns {number}
 */
function getActiveWaterFxCount() {
  return active.length;
}

// * Agent-facing console API (same convention as CartClashDevUnlocks): dynamic imports
// * from the console get a different Vite module instance, so debugging must go
// * through this handle to reach the instance the game actually uses.
if (typeof window !== "undefined") {
  window.CartClashWaterFx = {
    getActiveWaterFxCount,
    getWaterDeathSurfaceY,
    spawnWaterDeathBurst,
  };
}

/** Pushes an effect, dropping the request when at the cap (never the oldest — an
 * in-flight teardown mid-step would corrupt the update loop's iteration). */
function addEffect(fx) {
  if (active.length >= MAX_ACTIVE_EFFECTS) {
    fx.teardown();
    return;
  }
  active.push(fx);
}

/**
 * @param {number} t 0..1
 * @returns {number}
 */
function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * @param {number} t 0..1
 * @returns {number}
 */
function easeOutQuart(t) {
  const u = 1 - t;
  return 1 - u * u * u * u;
}

/**
 * Entry splash at (x, waterY, z): multi-ring soft foam + mist sheet + spray crown
 * + ballistic droplets. Intensity scales size, particle counts, and spray energy.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} intensity 0..1 — scales ring size and droplet count/speed.
 * @returns {void}
 */
function spawnSplash(x, z, intensity) {
  if (!env) return;
  const { scene, waterY } = env;
  const startMs = performance.now();
  const lowQ = isLowQualityMode();
  const tex = getWaterTextures();
  playWaterSplash(intensity);

  // * True ocean-plane distortion + multi-band visual ripple overlay.
  pushSurfaceRipple(x, z, 0.45 + intensity * 0.85, 2000 + intensity * 800);
  spawnRippleOverlay(scene, x, waterY, z, intensity, 0xd8f0ff);

  const group = new THREE.Group();
  group.position.set(x, waterY + 0.04, z);

  const disposables = [];

  // --- Concentric soft foam rings (primary + delayed secondary) ---
  const ringSpecs = lowQ
    ? [{ delayMs: 0, lifeMs: 720, start: 0.9, end: 4.2 + intensity * 2.2, peak: 0.9 }]
    : [
      { delayMs: 0, lifeMs: 680, start: 0.75, end: 4.0 + intensity * 2.5, peak: 0.95 },
      { delayMs: 70, lifeMs: 900, start: 1.1, end: 6.0 + intensity * 3.2, peak: 0.55 },
      { delayMs: 160, lifeMs: 1100, start: 1.4, end: 7.5 + intensity * 2.8, peak: 0.32 },
      { delayMs: 280, lifeMs: 1300, start: 1.8, end: 9.0 + intensity * 2.2, peak: 0.18 },
    ];
  /** @type {{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, delayMs: number, lifeMs: number, start: number, end: number, peak: number }[]} */
  const rings = [];
  for (const spec of ringSpecs) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex.foamRing,
      color: _foamWhite,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(_planeGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(spec.start);
    group.add(mesh);
    rings.push({ mesh, mat, ...spec });
    disposables.push(mat);
  }

  // --- Soft impact disc (white-blue contact flash under the cart) ---
  const discMat = new THREE.MeshBasicMaterial({
    map: tex.mist,
    color: 0xe8f4ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(_planeGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  disc.scale.setScalar(0.8);
  group.add(disc);
  disposables.push(discMat);

  // --- Vertical spray plumes (billboard sprites, not a hard cone) ---
  const plumeCount = lowQ ? 3 : 5;
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, delayMs: number, lifeMs: number, peakH: number, peakW: number, x: number, z: number }[]} */
  const plumes = [];
  for (let i = 0; i < plumeCount; i += 1) {
    const a = (i / plumeCount) * Math.PI * 2 + Math.random() * 0.35;
    const r = 0.15 + Math.random() * 0.35;
    const mat = new THREE.SpriteMaterial({
      map: tex.spray,
      color: 0xf2f8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0); // * Grow upward from the waterline.
    sprite.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
    sprite.scale.set(0.4, 0.2, 1);
    group.add(sprite);
    plumes.push({
      sprite,
      mat,
      delayMs: i * 18,
      lifeMs: 480 + Math.random() * 220,
      peakH: 1.4 + intensity * 1.8 + Math.random() * 0.8,
      peakW: 0.55 + Math.random() * 0.45 + intensity * 0.35,
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
    });
    disposables.push(mat);
  }

  // --- Soft mist cloud hanging over the impact ---
  const mistCount = lowQ ? 3 : 6;
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, vx: number, vy: number, vz: number, startS: number, endS: number, delayMs: number, lifeMs: number }[]} */
  const mists = [];
  for (let i = 0; i < mistCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const mat = new THREE.SpriteMaterial({
      map: tex.mist,
      color: i % 2 === 0 ? 0xffffff : 0xd8ecf8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const startS = 0.5 + Math.random() * 0.4;
    sprite.scale.setScalar(startS);
    sprite.position.set(Math.cos(a) * 0.2, 0.15, Math.sin(a) * 0.2);
    group.add(sprite);
    mists.push({
      sprite,
      mat,
      vx: Math.cos(a) * (0.4 + Math.random() * 0.9),
      vy: 0.35 + Math.random() * 0.7,
      vz: Math.sin(a) * (0.4 + Math.random() * 0.9),
      startS,
      endS: startS * (2.4 + Math.random() * 1.8 + intensity),
      delayMs: 40 + Math.random() * 100,
      lifeMs: 700 + Math.random() * 400,
    });
    disposables.push(mat);
  }

  // --- Crown / ballistic droplets ---
  const count = lowQ ? 12 + Math.round(intensity * 8) : 18 + Math.round(intensity * 16);
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i += 1) {
    // * Crown: biased into a ring of launch angles (not pure random sphere).
    const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const elev = 0.55 + Math.random() * 0.85; // * Upward-heavy
    const vHoriz = 1.1 + Math.random() * (2.6 + intensity * 2.8);
    const vUp = 3.8 + Math.random() * (5.5 + intensity * 5);
    positions[i * 3 + 0] = Math.cos(a) * 0.35;
    positions[i * 3 + 1] = 0.12;
    positions[i * 3 + 2] = Math.sin(a) * 0.35;
    velocities.push({
      x: Math.cos(a) * vHoriz * Math.cos(elev * 0.35),
      y: vUp,
      z: Math.sin(a) * vHoriz * Math.cos(elev * 0.35),
    });
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dropMat = new THREE.PointsMaterial({
    map: tex.droplet,
    color: 0xf4faff,
    size: lowQ ? 0.16 : 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const drops = new THREE.Points(dropGeo, dropMat);
  group.add(drops);
  disposables.push(dropMat, dropGeo);

  // --- Secondary fine mist points (smaller, slower, hang longer) ---
  const fineCount = lowQ ? 0 : 14 + Math.round(intensity * 10);
  let fineGeo = null;
  let fineMat = null;
  let fineVel = [];
  if (fineCount > 0) {
    const finePos = new Float32Array(fineCount * 3);
    fineVel = [];
    for (let i = 0; i < fineCount; i += 1) {
      const a = Math.random() * Math.PI * 2;
      finePos[i * 3 + 0] = Math.cos(a) * 0.2;
      finePos[i * 3 + 1] = 0.2 + Math.random() * 0.3;
      finePos[i * 3 + 2] = Math.sin(a) * 0.2;
      fineVel.push({
        x: Math.cos(a) * (0.3 + Math.random() * 1.2),
        y: 1.2 + Math.random() * 2.5,
        z: Math.sin(a) * (0.3 + Math.random() * 1.2),
      });
    }
    fineGeo = new THREE.BufferGeometry();
    fineGeo.setAttribute("position", new THREE.BufferAttribute(finePos, 3));
    fineMat = new THREE.PointsMaterial({
      map: tex.mist,
      color: 0xffffff,
      size: 0.38,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    group.add(new THREE.Points(fineGeo, fineMat));
    disposables.push(fineMat, fineGeo);
  }

  // --- Crown sheet curtains (wide short foam walls in a ring) ---
  const sheetCount = lowQ ? 4 : 8;
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, delayMs: number, lifeMs: number, peakH: number, peakW: number, angle: number }[]} */
  const sheets = [];
  for (let i = 0; i < sheetCount; i += 1) {
    const a = (i / sheetCount) * Math.PI * 2 + Math.random() * 0.15;
    const mat = new THREE.SpriteMaterial({
      map: tex.foamSheet,
      color: i % 2 === 0 ? 0xf4faff : 0xdceef8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    sprite.position.set(Math.cos(a) * 0.45, 0.02, Math.sin(a) * 0.45);
    sprite.scale.set(0.9, 0.15, 1);
    group.add(sprite);
    sheets.push({
      sprite,
      mat,
      delayMs: 20 + i * 12,
      lifeMs: 420 + Math.random() * 180,
      peakH: 0.55 + intensity * 0.7 + Math.random() * 0.35,
      peakW: 0.9 + Math.random() * 0.55 + intensity * 0.3,
      angle: a,
    });
    disposables.push(mat);
  }

  // --- Surface foam chunks (thicker lingering white patches) ---
  const chunkCount = lowQ ? 2 : 5;
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, vx: number, vz: number, startS: number, endS: number, delayMs: number, lifeMs: number }[]} */
  const chunks = [];
  for (let i = 0; i < chunkCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const mat = new THREE.SpriteMaterial({
      map: tex.foamSheet,
      color: 0xfff8f0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const startS = 0.35 + Math.random() * 0.25;
    sprite.scale.setScalar(startS);
    sprite.position.set(Math.cos(a) * 0.25, 0.05, Math.sin(a) * 0.25);
    group.add(sprite);
    chunks.push({
      sprite,
      mat,
      vx: Math.cos(a) * (0.35 + Math.random() * 0.7),
      vz: Math.sin(a) * (0.35 + Math.random() * 0.7),
      startS,
      endS: startS * (2.2 + Math.random() * 1.4),
      delayMs: 80 + Math.random() * 120,
      lifeMs: 850 + Math.random() * 350,
    });
    disposables.push(mat);
  }

  scene.add(group);
  const durationMs = 1150 + intensity * 250;

  addEffect({
    step(now, dt) {
      const elapsed = now - startMs;
      const t = Math.min(1, elapsed / durationMs);

      // Foam rings.
      for (const ring of rings) {
        const local = (elapsed - ring.delayMs) / ring.lifeMs;
        if (local < 0) {
          ring.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        const e = easeOutQuart(lt);
        ring.mesh.scale.setScalar(ring.start + (ring.end - ring.start) * e);
        // * Soft foam: bright early edge, long milky fade.
        ring.mat.opacity = ring.peak * (1 - lt) * (1 - lt * 0.4);
      }

      // Contact disc flash.
      const discT = Math.min(1, elapsed / 380);
      disc.scale.setScalar(0.8 + easeOutCubic(discT) * (2.8 + intensity * 1.5));
      discMat.opacity = 0.7 * Math.max(0, 1 - discT) * (discT < 0.12 ? discT / 0.12 : 1);

      // Spray plumes — erupt then collapse.
      for (const p of plumes) {
        const local = (elapsed - p.delayMs) / p.lifeMs;
        if (local < 0) {
          p.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        const rise = lt < 0.32 ? lt / 0.32 : 1 - (lt - 0.32) / 0.68;
        const h = 0.15 + rise * p.peakH;
        const w = p.peakW * (0.55 + rise * 0.7) * (1 + lt * 0.35);
        p.sprite.scale.set(w, h, 1);
        p.sprite.position.y = 0.02;
        p.mat.opacity = 0.75 * rise * (1 - lt * 0.35);
      }

      // Crown sheet curtains — outward expand + collapse.
      for (const s of sheets) {
        const local = (elapsed - s.delayMs) / s.lifeMs;
        if (local < 0) {
          s.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        const rise = lt < 0.28 ? lt / 0.28 : 1 - (lt - 0.28) / 0.72;
        const out = 0.45 + lt * (1.1 + intensity * 0.6);
        s.sprite.position.x = Math.cos(s.angle) * out;
        s.sprite.position.z = Math.sin(s.angle) * out;
        s.sprite.scale.set(s.peakW * (0.7 + rise * 0.6), 0.12 + rise * s.peakH, 1);
        s.mat.opacity = 0.7 * rise * (1 - lt * 0.4);
      }

      // Foam chunks.
      for (const c of chunks) {
        const local = (elapsed - c.delayMs) / c.lifeMs;
        if (local < 0) {
          c.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        c.sprite.position.x += c.vx * dt;
        c.sprite.position.z += c.vz * dt;
        c.vx *= 1 - 1.5 * dt;
        c.vz *= 1 - 1.5 * dt;
        const sc = c.startS + (c.endS - c.startS) * easeOutCubic(lt);
        c.sprite.scale.setScalar(sc);
        c.mat.opacity = 0.48 * Math.sin(Math.min(1, lt) * Math.PI) * (1 - lt * 0.3);
      }

      // Mist sprites.
      for (const m of mists) {
        const local = (elapsed - m.delayMs) / m.lifeMs;
        if (local < 0) {
          m.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        m.sprite.position.x += m.vx * dt;
        m.sprite.position.y += m.vy * dt;
        m.sprite.position.z += m.vz * dt;
        m.vx *= 1 - 1.2 * dt;
        m.vy *= 1 - 0.5 * dt;
        m.vz *= 1 - 1.2 * dt;
        const sc = m.startS + (m.endS - m.startS) * easeOutCubic(lt);
        m.sprite.scale.setScalar(sc);
        m.mat.opacity = 0.42 * Math.sin(Math.min(1, lt) * Math.PI);
      }

      // Crown droplets — light surface bounce for lingering detail.
      const pos = dropGeo.attributes.position;
      for (let i = 0; i < velocities.length; i += 1) {
        const v = velocities[i];
        v.y -= 22 * dt;
        pos.array[i * 3 + 0] += v.x * dt;
        pos.array[i * 3 + 1] += v.y * dt;
        pos.array[i * 3 + 2] += v.z * dt;
        if (pos.array[i * 3 + 1] < 0.02 && v.y < 0) {
          pos.array[i * 3 + 1] = 0.02;
          v.y *= -0.28;
          v.x *= 0.7;
          v.z *= 0.7;
        }
      }
      pos.needsUpdate = true;
      const dropT = Math.min(1, elapsed / 950);
      dropMat.opacity = 0.95 * Math.max(0, 1 - dropT * dropT);
      dropMat.size = (lowQ ? 0.14 : 0.2) * (1 - dropT * 0.4);

      // Fine mist points.
      if (fineGeo && fineMat) {
        const fp = fineGeo.attributes.position;
        for (let i = 0; i < fineVel.length; i += 1) {
          const v = fineVel[i];
          v.y -= 8 * dt;
          fp.array[i * 3 + 0] += v.x * dt;
          fp.array[i * 3 + 1] += v.y * dt;
          fp.array[i * 3 + 2] += v.z * dt;
        }
        fp.needsUpdate = true;
        fineMat.opacity = 0.5 * Math.max(0, 1 - t);
      }

      return t < 1;
    },
    teardown() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  });
}

/**
 * Underwater-detonation surface dressing at (x, waterY, z): neon-tinted light bloom,
 * dual shock rings, geyser spray column, delayed foam boil sprites, and rising bubble
 * churn. cartShatter calls this alongside its (surface-clamped) core/ring explosion.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} neonHex Victim's neon color — tinted toward warm sunset water.
 * @returns {void}
 */
export function spawnWaterDeathBurst(x, z, neonHex) {
  if (!env) return;
  const { scene, waterY } = env;
  const startMs = performance.now();
  const lowQ = isLowQualityMode();
  const tex = getWaterTextures();
  playWaterDeathBoom();

  // * Stronger surface distortion for depth charges + multi-band overlay.
  pushSurfaceRipple(x, z, 1.15, 2800);
  // * Secondary delayed pulse (shock returns to surface) — frame-driven, not setTimeout.
  scheduleSurfaceRipple(220, x, z, 0.55, 1600);
  spawnRippleOverlay(scene, x, waterY, z, 1.0, neonHex);
  spawnRippleOverlay(scene, x, waterY, z, 0.7, 0xffe0c0);

  const group = new THREE.Group();
  group.position.set(x, waterY + 0.05, z);

  _tmpColor.setHex(neonHex).lerp(_warmGlow, 0.45);
  const neonWarm = _tmpColor.clone();
  const hotFlash = neonWarm.clone().lerp(new THREE.Color(0xffffff), 0.55);

  const disposables = [];

  // --- Light bloom through the surface (soft disc, not a hard circle) ---
  const bloomMat = new THREE.MeshBasicMaterial({
    map: tex.bloom,
    color: neonWarm,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bloom = new THREE.Mesh(_planeGeo, bloomMat);
  bloom.rotation.x = -Math.PI / 2;
  bloom.scale.setScalar(1.2);
  group.add(bloom);
  disposables.push(bloomMat);

  // --- Secondary wider residual heat glow ---
  const residualMat = new THREE.MeshBasicMaterial({
    map: tex.mist,
    color: neonHex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const residual = new THREE.Mesh(_planeGeo, residualMat);
  residual.rotation.x = -Math.PI / 2;
  residual.position.y = 0.01;
  residual.scale.setScalar(1.5);
  group.add(residual);
  disposables.push(residualMat);

  // --- Dual sharp shock rings ---
  const shockSpecs = lowQ
    ? [{ delayMs: 0, lifeMs: 320, start: 0.8, end: 5.5, peak: 0.95 }]
    : [
      { delayMs: 0, lifeMs: 300, start: 0.7, end: 5.2, peak: 1.0 },
      { delayMs: 70, lifeMs: 480, start: 1.0, end: 8.0, peak: 0.65 },
      { delayMs: 160, lifeMs: 700, start: 1.3, end: 10.5, peak: 0.35 },
    ];
  /** @type {{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, delayMs: number, lifeMs: number, start: number, end: number, peak: number }[]} */
  const shocks = [];
  for (const spec of shockSpecs) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex.foamRing,
      color: hotFlash,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(_planeGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.scale.setScalar(spec.start);
    group.add(mesh);
    shocks.push({ mesh, mat, ...spec });
    disposables.push(mat);
  }

  // --- Geyser: soft spray sprites + thin additive cone core ---
  const geyserMat = new THREE.MeshBasicMaterial({
    color: neonWarm,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geyser = new THREE.Mesh(_columnGeo, geyserMat);
  geyser.position.y = 0.8;
  geyser.scale.set(1.4, 0.4, 1.4);
  group.add(geyser);
  disposables.push(geyserMat);

  const plumeCount = lowQ ? 3 : 6;
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, delayMs: number, lifeMs: number, peakH: number, peakW: number }[]} */
  const plumes = [];
  for (let i = 0; i < plumeCount; i += 1) {
    const a = (i / plumeCount) * Math.PI * 2 + Math.random() * 0.3;
    const r = 0.1 + Math.random() * 0.35;
    const mat = new THREE.SpriteMaterial({
      map: tex.spray,
      color: i % 2 === 0 ? neonWarm : hotFlash,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    sprite.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r);
    sprite.scale.set(0.5, 0.25, 1);
    group.add(sprite);
    plumes.push({
      sprite,
      mat,
      delayMs: 40 + i * 22,
      lifeMs: 620 + Math.random() * 280,
      peakH: 2.2 + Math.random() * 1.6,
      peakW: 0.7 + Math.random() * 0.55,
    });
    disposables.push(mat);
  }

  // --- Delayed foam boil (soft ring + drifting boil sprites) ---
  const boilMat = new THREE.MeshBasicMaterial({
    map: tex.foamRing,
    color: _foamWhite,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const boil = new THREE.Mesh(_planeGeo, boilMat);
  boil.rotation.x = -Math.PI / 2;
  boil.position.y = 0.04;
  boil.scale.setScalar(1);
  group.add(boil);
  disposables.push(boilMat);

  const boilSpriteCount = lowQ ? 3 : 7;
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, vx: number, vz: number, startS: number, endS: number, delayMs: number, lifeMs: number }[]} */
  const boilSprites = [];
  for (let i = 0; i < boilSpriteCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const mat = new THREE.SpriteMaterial({
      map: tex.mist,
      color: i % 2 === 0 ? _foamWhite : _deepFoam,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const startS = 0.4 + Math.random() * 0.35;
    sprite.scale.setScalar(startS);
    sprite.position.set(Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3);
    group.add(sprite);
    boilSprites.push({
      sprite,
      mat,
      vx: Math.cos(a) * (0.5 + Math.random() * 1.4),
      vz: Math.sin(a) * (0.5 + Math.random() * 1.4),
      startS,
      endS: startS * (2.6 + Math.random() * 2),
      delayMs: 180 + Math.random() * 160,
      lifeMs: 700 + Math.random() * 350,
    });
    disposables.push(mat);
  }

  // --- Bubble churn (soft points rising + spreading) ---
  const bubbleCount = lowQ ? 12 : 24;
  const bubblePositions = new Float32Array(bubbleCount * 3);
  const bubbleVel = [];
  for (let i = 0; i < bubbleCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.6;
    bubblePositions[i * 3 + 0] = Math.cos(a) * r;
    bubblePositions[i * 3 + 1] = 0.06 + Math.random() * 0.12;
    bubblePositions[i * 3 + 2] = Math.sin(a) * r;
    bubbleVel.push({
      x: Math.cos(a) * (0.5 + Math.random() * 1.1),
      y: 0.25 + Math.random() * 0.55,
      z: Math.sin(a) * (0.5 + Math.random() * 1.1),
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 4 + Math.random() * 6,
    });
  }
  const bubbleGeo = new THREE.BufferGeometry();
  bubbleGeo.setAttribute("position", new THREE.BufferAttribute(bubblePositions, 3));
  const bubbleMat = new THREE.PointsMaterial({
    map: tex.bubble,
    color: 0xfff6e8,
    size: lowQ ? 0.14 : 0.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
  group.add(bubbles);
  disposables.push(bubbleMat, bubbleGeo);

  // --- Water-ejected sparks / spray droplets (neon-tinted) ---
  const sprayCount = lowQ ? 10 : 20;
  const sprayPos = new Float32Array(sprayCount * 3);
  const sprayVel = [];
  for (let i = 0; i < sprayCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const elev = 0.5 + Math.random() * 1.0;
    const speed = 3.5 + Math.random() * 7;
    sprayPos[i * 3] = 0;
    sprayPos[i * 3 + 1] = 0.1;
    sprayPos[i * 3 + 2] = 0;
    sprayVel.push({
      x: Math.cos(a) * Math.cos(elev) * speed,
      y: Math.sin(elev) * speed + 2,
      z: Math.sin(a) * Math.cos(elev) * speed,
    });
  }
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute("position", new THREE.BufferAttribute(sprayPos, 3));
  const sprayMat = new THREE.PointsMaterial({
    map: tex.droplet,
    color: hotFlash,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  group.add(new THREE.Points(sprayGeo, sprayMat));
  disposables.push(sprayMat, sprayGeo);

  // --- Steam / vapor sheets rising after the boil ---
  const steamCount = lowQ ? 2 : 5;
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, vx: number, vy: number, vz: number, startS: number, endS: number, delayMs: number, lifeMs: number }[]} */
  const steams = [];
  for (let i = 0; i < steamCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const mat = new THREE.SpriteMaterial({
      map: tex.mist,
      color: neonWarm.clone().lerp(new THREE.Color(0xffffff), 0.55),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const startS = 0.5 + Math.random() * 0.4;
    sprite.scale.setScalar(startS);
    sprite.position.set(Math.cos(a) * 0.2, 0.15, Math.sin(a) * 0.2);
    group.add(sprite);
    steams.push({
      sprite,
      mat,
      vx: Math.cos(a) * (0.2 + Math.random() * 0.5),
      vy: 0.6 + Math.random() * 0.9,
      vz: Math.sin(a) * (0.2 + Math.random() * 0.5),
      startS,
      endS: startS * (3 + Math.random() * 2),
      delayMs: 200 + Math.random() * 200,
      lifeMs: 800 + Math.random() * 400,
    });
    disposables.push(mat);
  }

  // --- Secondary surface foam ring cascade (white, non-neon) ---
  const foamCascadeSpecs = lowQ
    ? []
    : [
      { delayMs: 120, lifeMs: 900, start: 1.2, end: 7.5, peak: 0.4 },
      { delayMs: 280, lifeMs: 1100, start: 1.8, end: 10.0, peak: 0.22 },
    ];
  /** @type {{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, delayMs: number, lifeMs: number, start: number, end: number, peak: number }[]} */
  const foamCascades = [];
  for (const spec of foamCascadeSpecs) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex.foamRing,
      color: _foamWhite,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(_planeGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.035;
    mesh.scale.setScalar(spec.start);
    group.add(mesh);
    foamCascades.push({ mesh, mat, ...spec });
    disposables.push(mat);
  }

  scene.add(group);
  const durationMs = 1400;
  const boilDelayMs = 180;

  addEffect({
    step(now, dt) {
      const elapsed = now - startMs;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);

      // Bloom: hard flash in the first ~90ms, then long decay while expanding.
      const flash = Math.min(1, elapsed / 80);
      bloomMat.opacity = 0.98 * flash * Math.max(0, 1 - t * t);
      bloom.scale.setScalar(1.2 + eased * 9.5);

      // Residual heat sheet.
      residual.scale.setScalar(1.5 + eased * 7);
      residualMat.opacity = 0.4 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.3);

      // Shock rings.
      for (const s of shocks) {
        const local = (elapsed - s.delayMs) / s.lifeMs;
        if (local < 0) {
          s.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        const e = easeOutQuart(lt);
        s.mesh.scale.setScalar(s.start + (s.end - s.start) * e);
        s.mat.opacity = s.peak * (1 - lt) * (1 - lt * 0.3);
      }

      // Geyser cone core.
      const gT = Math.min(1, Math.max(0, (elapsed - 50) / 720));
      const gRise = gT < 0.32 ? gT / 0.32 : 1 - (gT - 0.32) / 0.68;
      geyser.scale.set(1.4 + gT * 1.4, 0.4 + gRise * 2.8, 1.4 + gT * 1.4);
      geyser.position.y = 0.75 * geyser.scale.y;
      geyserMat.opacity = 0.7 * gRise;

      // Spray plumes.
      for (const p of plumes) {
        const local = (elapsed - p.delayMs) / p.lifeMs;
        if (local < 0) {
          p.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        const rise = lt < 0.3 ? lt / 0.3 : 1 - (lt - 0.3) / 0.7;
        p.sprite.scale.set(p.peakW * (0.6 + rise * 0.8), 0.2 + rise * p.peakH, 1);
        p.mat.opacity = 0.85 * rise;
      }

      // Foam boil ring (delayed).
      const boilT = Math.min(1, Math.max(0, (elapsed - boilDelayMs) / (durationMs - boilDelayMs)));
      boilMat.opacity = 0.6 * Math.sin(Math.min(1, boilT) * Math.PI);
      boil.scale.setScalar(1 + boilT * 8.2);

      // Boil sprites.
      for (const b of boilSprites) {
        const local = (elapsed - b.delayMs) / b.lifeMs;
        if (local < 0) {
          b.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        b.sprite.position.x += b.vx * dt;
        b.sprite.position.z += b.vz * dt;
        b.sprite.position.y = 0.08 + lt * 0.25;
        b.vx *= 1 - 1.4 * dt;
        b.vz *= 1 - 1.4 * dt;
        const sc = b.startS + (b.endS - b.startS) * easeOutCubic(lt);
        b.sprite.scale.setScalar(sc);
        b.mat.opacity = 0.5 * Math.sin(Math.min(1, lt) * Math.PI);
      }

      // Steam.
      for (const s of steams) {
        const local = (elapsed - s.delayMs) / s.lifeMs;
        if (local < 0) {
          s.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        s.sprite.position.x += s.vx * dt;
        s.sprite.position.y += s.vy * dt;
        s.sprite.position.z += s.vz * dt;
        s.vx *= 1 - 0.8 * dt;
        s.vz *= 1 - 0.8 * dt;
        const sc = s.startS + (s.endS - s.startS) * easeOutCubic(lt);
        s.sprite.scale.setScalar(sc);
        s.mat.opacity = 0.4 * Math.sin(Math.min(1, lt) * Math.PI);
      }

      // White foam cascade rings.
      for (const f of foamCascades) {
        const local = (elapsed - f.delayMs) / f.lifeMs;
        if (local < 0) {
          f.mat.opacity = 0;
          continue;
        }
        const lt = Math.min(1, Math.max(0, local));
        const e = easeOutQuart(lt);
        f.mesh.scale.setScalar(f.start + (f.end - f.start) * e);
        f.mat.opacity = f.peak * (1 - lt) * (1 - lt * 0.35);
      }

      // Bubbles with slight lateral wobble.
      const pos = bubbleGeo.attributes.position;
      for (let i = 0; i < bubbleVel.length; i += 1) {
        const v = bubbleVel[i];
        v.wobble += v.wobbleSpeed * dt;
        pos.array[i * 3 + 0] += (v.x + Math.sin(v.wobble) * 0.15) * dt;
        pos.array[i * 3 + 1] += v.y * dt;
        pos.array[i * 3 + 2] += (v.z + Math.cos(v.wobble * 0.9) * 0.15) * dt;
      }
      pos.needsUpdate = true;
      bubbleMat.opacity = 0.85 * Math.sin(boilT * Math.PI);

      // Neon spray droplets.
      const sp = sprayGeo.attributes.position;
      for (let i = 0; i < sprayVel.length; i += 1) {
        const v = sprayVel[i];
        v.y -= 16 * dt;
        sp.array[i * 3 + 0] += v.x * dt;
        sp.array[i * 3 + 1] += v.y * dt;
        sp.array[i * 3 + 2] += v.z * dt;
      }
      sp.needsUpdate = true;
      const sprayT = Math.min(1, elapsed / 850);
      sprayMat.opacity = Math.max(0, 1 - sprayT * sprayT);

      return t < 1;
    },
    teardown() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  });
}

/**
 * Per-frame driver: detects falling carts crossing the waterline (spawning entry
 * splashes) and advances all live effects. No-ops instantly when the active level
 * has no water. Call once per rendered frame.
 *
 * @param {object[]} allCarts Slot carts (entries may be null).
 * @param {number} now Current time in milliseconds (performance.now() clock).
 * @param {number} dt Frame delta in seconds.
 * @returns {void}
 */
export function updateWaterDeathFx(allCarts, now, dt) {
  if (!env) return;

  // * Drive ocean-plane ripple distortion uniforms every frame.
  flushDelayedRipples(now);
  updateRippleUniforms(now);

  const visualOffset = CONFIG.cart.visualOffset;
  for (let i = 0; i < (allCarts?.length ?? 0); i += 1) {
    const cart = allCarts[i];
    if (!cart?.mesh) continue;
    const bodyY = cart.mesh.position.y - visualOffset;
    const lastY = cart._waterFxLastY;
    cart._waterFxLastY = bodyY;
    if (lastY == null) continue;
    const drop = lastY - bodyY;
    // Downward waterline crossing at falling speed — teleports (respawns, sudden-death
    // spectator parking) jump farther than any real fall can in one frame.
    if (lastY >= env.waterY && bodyY < env.waterY && drop > 0 && drop < TELEPORT_JUMP_M) {
      const vy = drop / Math.max(dt, 1 / 240);
      if (vy > 2.5) {
        spawnSplash(cart.mesh.position.x, cart.mesh.position.z, Math.min(1, (vy - 2.5) / 16));
      }
    }
  }

  for (let i = active.length - 1; i >= 0; i -= 1) {
    if (!active[i].step(now, dt)) {
      active[i].teardown();
      active.splice(i, 1);
    }
  }
}
