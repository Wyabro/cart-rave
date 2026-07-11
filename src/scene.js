// scene.js — Three.js scene, camera, renderer, post-processing, environment

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { CONFIG } from "./config.js";
import { QUALITY_KNOBS, getQualityKnobs } from "./utils/qualityTiers.js";

/** Bloom tuning — edit CONFIG.postFx.bloom in config.js; applied in createComposer(). */
const BLOOM_CONFIG = CONFIG.postFx.bloom;

/**
 * Applies bloom pass settings from CONFIG.postFx.bloom (or an override object).
 *
 * @param {UnrealBloomPass} bloomPass
 * @param {typeof BLOOM_CONFIG} [bloomCfg]
 */
export function applyBloomSettings(bloomPass, bloomCfg = BLOOM_CONFIG) {
  if (!bloomPass || !bloomCfg) return;
  bloomPass.strength = bloomCfg.strength;
  bloomPass.radius = bloomCfg.radius;
  bloomPass.threshold = bloomCfg.threshold;
  const bp = /** @type {any} */ (bloomPass);
  if (bp.highPassUniforms?.luminosityThreshold) {
    bp.highPassUniforms.luminosityThreshold.value = bloomCfg.threshold;
  }
  if (bp.highPassUniforms?.smoothWidth) {
    bp.highPassUniforms.smoothWidth.value = bloomCfg.smoothWidth;
  }
}

// === IMAGE-BASED LIGHTING (IBL) ===
// RoomEnvironment is baked once via PMREMGenerator and assigned to scene.environment.
// Both levels share the same map — level swaps do not rebuild IBL.
// Adjust CONFIG.postFx.environment.intensity (default 0.6) or use the Post FX debug GUI.

/** @type {number} Live IBL multiplier — synced from CONFIG on setup, tweakable via GUI. */
let environmentIntensity = CONFIG.postFx.environment.intensity;

/** @type {number} Per-material IBL base scale — tweakable via graphics debug GUI. */
let materialEnvMapIntensityLive = CONFIG.postFx.environment.materialEnvMapIntensity;

/**
 * Per-material envMapIntensity = materialEnvMapIntensity × environmentIntensity.
 * Used by cart frame glow and scene-wide material refresh.
 *
 * @returns {number}
 */
export function getMaterialEnvMapIntensity() {
  return materialEnvMapIntensityLive * environmentIntensity;
}

/**
 * @returns {number}
 */
export function getMaterialEnvMapIntensityBase() {
  return materialEnvMapIntensityLive;
}

/**
 * Sets per-material IBL base scale and reapplies to existing scene materials.
 *
 * @param {THREE.Scene} scene
 * @param {number} value
 */
export function setMaterialEnvMapIntensity(scene, value) {
  materialEnvMapIntensityLive = value;
  refreshSceneEnvironmentMaterials(scene);
}

/**
 * MeshPhysicalMaterial with scene IBL envMapIntensity pre-applied.
 * Override envMapIntensity in params when a surface needs a custom scale.
 *
 * @param {THREE.MeshPhysicalMaterialParameters} [params]
 * @returns {THREE.MeshPhysicalMaterial}
 */
export function createPhysicalMaterial(params = {}) {
  return new THREE.MeshPhysicalMaterial({
    envMapIntensity: getMaterialEnvMapIntensity(),
    ...params,
  });
}

/**
 * @returns {number}
 */
export function getEnvironmentIntensity() {
  return environmentIntensity;
}

/**
 * Updates envMapIntensity on all scene materials that support it.
 *
 * @param {THREE.Scene} scene
 */
export function refreshSceneEnvironmentMaterials(scene) {
  if (!scene) return;
  const envMapIntensity = getMaterialEnvMapIntensity();
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (mat && typeof mat.envMapIntensity === "number") {
        const scale = mat.userData?.envMapIntensityScale ?? 1;
        mat.envMapIntensity = envMapIntensity * scale;
      }
    }
  });
}

/**
 * Sets the global IBL intensity and reapplies it to existing scene materials.
 *
 * @param {THREE.Scene} scene
 * @param {number} intensity
 */
export function setEnvironmentIntensity(scene, intensity) {
  environmentIntensity = intensity;
  refreshSceneEnvironmentMaterials(scene);
}

/**
 * Bakes a RoomEnvironment PMREM and assigns it to scene.environment.
 * Call once at startup — before or after level load (level-agnostic).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @returns {{ envTexture: THREE.Texture, dispose: () => void }}
 */
export function setupSceneEnvironment(renderer, scene) {
  // * Suppress ANGLE/HLSL X4122 precision warnings from the PMREM convolution shader.
  // * These are harmless float-to-double warnings on Windows/DirectX (Three.js issue #32692).
  // * The patch filters only X4122; real shader compile/link errors are still logged.
  const gl = /** @type {(WebGLRenderingContext | WebGL2RenderingContext) & { _x4122Suppressed?: boolean }} */ (renderer.getContext());
  if (gl && !gl._x4122Suppressed) {
    const origGetProgramInfoLog = gl.getProgramInfoLog.bind(gl);
    gl.getProgramInfoLog = function (program) {
      const log = origGetProgramInfoLog(program);
      if (!log || !log.includes('warning X4122')) return log;
      return log
        .split('\n')
        .filter((l) => !l.includes('warning X4122'))
        .join('\n')
        .trim();
    };
    gl._x4122Suppressed = true;
  }

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const roomEnvironment = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnvironment).texture;
  pmremGenerator.dispose();

  scene.environment = envTexture;
  environmentIntensity = CONFIG.postFx.environment.intensity;
  refreshSceneEnvironmentMaterials(scene);

  return {
    envTexture,
    dispose() {
      envTexture?.dispose?.();
    },
  };
}

// === SCENE FOG (FogExp2) ===
// Applied on the root scene — Classic uses CONFIG.postFx.fog; Backrooms overrides on level load.
// Adjust CONFIG.postFx.fog or use the Post FX debug GUI.

/** @type {typeof CONFIG.postFx.fog} */
const FOG_CONFIG = CONFIG.postFx.fog;

/** @type {number} */
let fogColorLive = FOG_CONFIG.color;
/** @type {number} */
let fogDensityLive = FOG_CONFIG.density;
/** @type {boolean} */
let fogEnabledLive = true;

/**
 * @returns {number}
 */
export function getFogColor() {
  return fogColorLive;
}

/**
 * @returns {number}
 */
export function getFogDensity() {
  return fogDensityLive;
}

/**
 * @returns {boolean}
 */
export function getFogEnabled() {
  return fogEnabledLive;
}

/**
 * Toggles FogExp2 on the root scene without losing stored color/density.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {boolean} enabled
 */
export function setFogEnabled(scene, renderer, enabled) {
  fogEnabledLive = enabled;
  if (!scene) return;
  if (!enabled) {
    scene.fog = null;
    return;
  }
  setupSceneFog(scene, fogColorLive, fogDensityLive);
  if (renderer) renderer.setClearColor(fogColorLive, 1);
}

/**
 * Assigns or updates FogExp2 on the root scene.
 *
 * @param {THREE.Scene} scene
 * @param {number} [color]
 * @param {number} [density]
 * @returns {THREE.FogExp2 | null}
 */
function setupSceneFog(scene, color = FOG_CONFIG.color, density = FOG_CONFIG.density) {
  if (!scene) return null;
  fogColorLive = color;
  fogDensityLive = density;
  if (!(scene.fog instanceof THREE.FogExp2)) {
    scene.fog = new THREE.FogExp2(color, density);
  } else {
    scene.fog.color.setHex(color);
    scene.fog.density = density;
  }
  return scene.fog;
}

/**
 * Live-tweaks fog and optionally syncs the renderer clear color.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {{ color?: number, density?: number }} [options]
 */
export function setSceneFog(scene, renderer, options = {}) {
  const color = options.color ?? fogColorLive;
  const density = options.density ?? fogDensityLive;
  fogColorLive = color;
  fogDensityLive = density;
  if (fogEnabledLive) setupSceneFog(scene, color, density);
  if (renderer) renderer.setClearColor(color, 1);
}

/**
 * Custom Arcade FX Shader: Combines Chromatic Aberration, Scanlines, and Vignette,
 * plus an optional VHS/security-camera layer (uVhsAmount, level-gated — currently only
 * The Storerooms enables it via applyLoadedLevelSideEffects in main.js). The VHS feel is
 * "cheap always-on CCTV feed", not glitch-horror: per-line micro-jitter, a faint
 * luminance-only tape-noise floor, a slow chroma-aberration wobble, and a soft tracking
 * band that sweeps the frame once every uVhsTrackPeriod seconds. Amplitudes are kept
 * small so competitive readability is untouched.
 *
 * Event juice (all early-out when idle):
 * - KO: uFlash + uShock radial prism shockwave
 * - Hard ram: uHitStrength + uHitShock (smaller/weaker ring)
 * - Sudden Death: uSuddenDeath edge heat / danger rays
 * Nitro trail juice lives on world-space streak shaders in effects.js (not here).
 */
const ArcadeFxShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAberration: { value: 0.0045 },
    uScanlineDensity: { value: 1.5 },
    uVignette: { value: 1.2 },
    uFlash: { value: 0.0 },
    // * 0 at KO start → 1 at end of kill-flash window (expanding shock ring).
    uShock: { value: 0.0 },
    // * Local hard-hit mini-shock (impact pulse) — weaker than KO.
    uHitStrength: { value: 0.0 },
    uHitShock: { value: 0.0 },
    // * 0..1 while Sudden Death is live (edge danger heat).
    uSuddenDeath: { value: 0.0 },
    uVhsAmount: { value: 0.0 },
    uVhsNoise: { value: 0.028 },
    uVhsTrackPeriod: { value: 26.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAberration;
    uniform float uScanlineDensity;
    uniform float uVignette;
    uniform float uFlash;
    uniform float uShock;
    uniform float uHitStrength;
    uniform float uHitShock;
    uniform float uSuddenDeath;
    uniform float uVhsAmount;
    uniform float uVhsNoise;
    uniform float uVhsTrackPeriod;
    varying vec2 vUv;

    float hash(float n) {
      return fract(sin(n) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5, 0.5);
      // * Aspect-correct radial distance so shock rings stay circular on widescreen.
      vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
      vec2 dirA = (uv - center) * aspect;
      float distA = length(dirA);
      vec2 dir = uv - center;
      float dist = length(dir);
      vec2 dirN = distA > 1e-4 ? dirA / distA : vec2(0.0, 1.0);

      // * KO shockwave (Shadertoy-style): expanding ring warps sample UVs + later prism edge.
      float shockRing = 0.0;
      if (uFlash > 0.001 && uShock < 0.999) {
        float radius = uShock * uShock * 0.92;
        float band = abs(distA - radius);
        float width = 0.028 + uShock * 0.04;
        shockRing = exp(-band * band / (width * width));
        float shockWarp = shockRing * uFlash * (0.012 * (1.0 - uShock * 0.55));
        uv += dirN * shockWarp / aspect;
      }

      // * Hard-hit mini-shock — smaller radius, cyan-white, no heavy warp.
      float hitRing = 0.0;
      if (uHitStrength > 0.001 && uHitShock < 0.999) {
        float radius = uHitShock * uHitShock * 0.58;
        float band = abs(distA - radius);
        float width = 0.022 + uHitShock * 0.03;
        hitRing = exp(-band * band / (width * width));
        float hitWarp = hitRing * uHitStrength * (0.006 * (1.0 - uHitShock * 0.5));
        uv += dirN * hitWarp / aspect;
      }

      // VHS: per-scanline micro-jitter + tracking band + rare hard "tear" (Storerooms).
      float trackBand = 0.0;
      float tear = 0.0;
      if (uVhsAmount > 0.001) {
        float line = floor(vUv.y * uResolution.y);
        float lineNoise = hash(line * 0.137 + floor(uTime * 47.0) * 3.117);
        uv.x += (lineNoise - 0.5) * (1.4 / uResolution.x) * uVhsAmount;

        float phase = mod(uTime, uVhsTrackPeriod);
        if (phase < 1.1) {
          float bandY = 1.0 - phase / 1.1;
          trackBand = (1.0 - smoothstep(0.0, 0.035, abs(vUv.y - bandY))) * uVhsAmount;
          uv.x += trackBand * (7.0 / uResolution.x);
        }

        // * Rare tracking tear: wider slice, bigger hold-frame displace (not always-on).
        // * Fires briefly ~3× less often than the soft tracking band.
        float tearClock = mod(uTime * 0.31 + 7.3, uVhsTrackPeriod * 1.65);
        if (tearClock < 0.28) {
          float tearY = fract(sin(floor(uTime * 0.31 + 7.3) * 12.9898) * 43758.5453);
          float tearW = 0.045 + 0.03 * hash(floor(uTime * 2.0));
          tear = (1.0 - smoothstep(0.0, tearW, abs(vUv.y - tearY))) * uVhsAmount;
          float tearAge = tearClock / 0.28;
          uv.x += tear * (22.0 / uResolution.x) * (1.0 - tearAge * 0.7);
          // * Mild vertical roll inside the tear.
          uv.y += tear * (3.0 / uResolution.y) * sin(uTime * 40.0);
        }
      }

      // VHS: slow chroma wobble rides the aberration strength (~±35% on a ~6s cycle).
      float aberration = uAberration * (1.0 + uVhsAmount * 0.35 * sin(uTime * 1.05));
      aberration += shockRing * uFlash * 0.018;
      aberration += hitRing * uHitStrength * 0.01;
      // * Tear gets a touch more prism (security cam glitch).
      aberration += tear * 0.012;
      vec2 offset = dist > 1e-4 ? normalize(dir) * dist * aberration : vec2(0.0);
      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec4 color = vec4(r, g, b, 1.0);

      float scanline = sin(gl_FragCoord.y * uScanlineDensity) * 0.018;
      color.rgb -= scanline;

      // VHS: faint luminance-only tape-noise floor + a soft lift inside the tracking band.
      if (uVhsAmount > 0.001) {
        float n = hash(dot(vUv * uResolution, vec2(0.129898, 0.78233)) + uTime * 60.0);
        color.rgb += (n - 0.5) * uVhsNoise * uVhsAmount;
        color.rgb += trackBand * 0.06;
        color.rgb += tear * 0.08;
      }

      // * KO static burst on Storerooms — only while kill-flash is live (not always-on noise).
      if (uVhsAmount > 0.001 && uFlash > 0.001) {
        float sn = hash(dot(vUv * uResolution, vec2(0.271, 0.593)) + floor(uTime * 90.0));
        float lineSn = hash(floor(vUv.y * uResolution.y * 0.5) + floor(uTime * 30.0) * 1.7);
        float staticMix = uFlash * uVhsAmount * 0.72;
        color.rgb = mix(color.rgb, vec3(sn), staticMix * 0.55);
        // * Horizontal hold-lines during the KO static.
        color.rgb += (lineSn - 0.5) * staticMix * 0.12;
        // * Brief desat so it reads as tape, not rainbow noise.
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(color.rgb, vec3(luma), staticMix * 0.35);
      }

      float vig = smoothstep(0.8, 0.5 * uVignette, dist * (uVignette * 0.5 + 0.5));
      color.rgb *= vig;

      // Kill-confirm flash — brief lift toward white, strongest at screen center.
      float flashFalloff = 1.0 - smoothstep(0.15, 0.75, dist);
      color.rgb = mix(color.rgb, vec3(1.0), uFlash * 0.2 * flashFalloff);

      // * Thin magenta/cyan prism edge on the expanding KO shock.
      if (shockRing > 0.01) {
        vec3 prism = mix(vec3(1.0, 0.25, 0.85), vec3(0.25, 0.9, 1.0), fract(distA * 3.0 + uShock));
        color.rgb += prism * shockRing * uFlash * 0.55 * (1.0 - uShock * 0.35);
      }

      // * Hit ring — cooler cyan-white (reads as impact, not KO score).
      if (hitRing > 0.01) {
        vec3 hitPrism = mix(vec3(0.85, 0.95, 1.0), vec3(0.35, 0.85, 1.0), fract(distA * 4.0 + uHitShock));
        color.rgb += hitPrism * hitRing * uHitStrength * 0.42 * (1.0 - uHitShock * 0.4);
      }

      // * Sudden Death — edge-only red/magenta heat + slow danger rays (center stays clean).
      if (uSuddenDeath > 0.001) {
        float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float edgeGlow = 1.0 - smoothstep(0.0, 0.16, edgeDist);
        float pulse = 0.55 + 0.45 * sin(uTime * 3.4);
        float ang = atan(dirA.y, dirA.x);
        float rays = 0.5 + 0.5 * sin(ang * 10.0 + uTime * 2.2);
        rays = pow(clamp(rays, 0.0, 1.0), 3.0);
        float heat = edgeGlow * (0.55 + 0.45 * rays) * pulse * uSuddenDeath;
        color.rgb += vec3(1.0, 0.1, 0.32) * heat * 0.28;
        // * Very soft center desat lift so the frame holds its breath without hiding carts.
        color.rgb = mix(color.rgb, color.rgb * vec3(1.05, 0.92, 0.95), uSuddenDeath * 0.08 * (1.0 - edgeGlow));
      }

      gl_FragColor = color;
    }
  `,
};

/**
 * Applies the game's tone mapping + exposure to a renderer. Single source of truth so
 * the in-game composer (via OutputPass, which reads renderer.toneMapping) and the
 * customization cart preview (direct render) grade colors identically.
 *
 * @param {THREE.WebGLRenderer} renderer
 */
export function applyRendererColorGrading(renderer) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = CONFIG.postFx.toneMappingExposure ?? 1.0;
}

/**
 * Latched composer-bypass state for the frame loop's render path.
 *
 * Deliberately NOT read live from the quality knobs: flipping the render path
 * (composer RT vs direct-to-canvas) changes three.js's program cache key (tone
 * mapping moves in/out of the shaders), so the first frame on the new path
 * recompiles every scene program — a multi-second main-thread stall if it
 * happens on the game loop's next tick, before the quality-apply overlay has
 * painted. main.js flips this inside rebuildForQualityChange() after warming
 * the target path behind the overlay.
 */
let composerBypassActive = getQualityKnobs().composerBypass;

/** @returns {boolean} Whether the frame loop should skip the composer and render direct. */
export function isComposerBypassActive() {
  return composerBypassActive;
}

/** @param {boolean} active */
export function setComposerBypassActive(active) {
  composerBypassActive = active === true;
}

/**
 * Creates the WebGL renderer bound to the game canvas.
 *
 * @param {HTMLCanvasElement} canvas Target canvas element.
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getQualityKnobs().pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(FOG_CONFIG.color, 1);
  applyRendererColorGrading(renderer);
  // * Contact grounding uses blob quads (contactShadows.js), not shadowMap — keeps GPU cost flat.
  if (import.meta.env.DEV) {
    // * Dev-only perf probe: lets console tooling read renderer.info (draw calls, textures, programs).
    /** @type {any} */ (window).__cartRavePerf = { renderer };
  }
  return renderer;
}

/**
 * Creates the root Three.js scene with exponential fog.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  setupSceneFog(scene);
  return scene;
}

/**
 * Creates the perspective chase camera at the current window aspect ratio.
 *
 * @returns {THREE.PerspectiveCamera}
 */
function createCamera() {
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  return camera;
}

/**
 * Applies a quality tier's composer/renderer knobs for runtime quality changes
 * without rebuilding the physics world. The user's Post-FX toggle still gates
 * bloom/arcade on tiers that allow them.
 *
 * @param {import("three/examples/jsm/postprocessing/UnrealBloomPass.js").UnrealBloomPass | null} bloomPass
 * @param {import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass | null} arcadePass
 * @param {import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass | null} fxaaPass
 * @param {THREE.WebGLRenderer | null} renderer
 * @param {import("./utils/qualityMode.js").QualityTier} tier
 * @param {EffectComposer | null} [composer]
 * @param {{ bloomEnabled?: boolean, fxPassEnabled?: boolean }} [userFx] User Post-FX toggle state.
 */
export function applyComposerQualityTier(bloomPass, arcadePass, fxaaPass, renderer, tier, composer = null, userFx = {}) {
  const knobs = QUALITY_KNOBS[tier] ?? QUALITY_KNOBS.high;
  if (bloomPass) bloomPass.enabled = knobs.postFx && (userFx.bloomEnabled ?? true);
  if (arcadePass) arcadePass.enabled = knobs.postFx && (userFx.fxPassEnabled ?? true);
  if (fxaaPass) fxaaPass.enabled = knobs.fxaa;
  if (renderer) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, knobs.pixelRatioCap);
    renderer.setPixelRatio(pixelRatio);
    if (composer) {
      composer.setSize(window.innerWidth, window.innerHeight);
    }
    // * FXAA resolution must match the new pixel ratio.
    if (fxaaPass) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      fxaaPass.material.uniforms.resolution.value.set(
        1 / (w * pixelRatio),
        1 / (h * pixelRatio),
      );
    }
  }
}

/**
 * Builds the post-processing pipeline (render -> bloom -> arcade fx -> fxaa).
 *
 * POST-PROCESSING — recommended starting values (lock in CONFIG.postFx after tuning):
 * Pipeline order: RenderPass → UnrealBloomPass → Arcade FX → FXAA
 * toneMappingExposure: 0.88
 * bloom.strength: 0.67 | bloom.radius: 0.34 | bloom.threshold: 0.86 | bloom.smoothWidth: 0.055
 * arcade.aberration: 0.003 | arcade.scanlineDensity: 1.8 | arcade.vignette: 0.5
 * environment.intensity: 0.6 | environment.materialEnvMapIntensity: 0.4
 * fog.color: 0x0a0520 | fog.density: 0.0065
 * Dev live-tweak: npm run dev → add ?debug to URL or press H (see postFxDebug.js)
 *
 * @param {THREE.WebGLRenderer} renderer Active WebGL renderer.
 * @param {THREE.Scene} scene Root scene to render.
 * @param {THREE.PerspectiveCamera} camera Active camera.
 * @returns {{ composer: EffectComposer, bloomPass: UnrealBloomPass, arcadePass: ShaderPass, fxaaPass: ShaderPass }}
 */
export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearColor = new THREE.Color(getFogColor());
  composer.addPass(renderPass);

  // * Half-res bloom RTs (major bandwidth win). Strength compensated so the composite
  // * still reads like full-res neon. Arcade/VHS/flash already share one ShaderPass.
  const bloomScale = CONFIG.postFx?.bloomHalfRes === false ? 1 : 0.5;
  const bloomStrengthMul = bloomScale < 1 ? (CONFIG.postFx?.bloomHalfResStrengthMul ?? 1.2) : 1;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(
      Math.max(1, Math.floor(window.innerWidth * bloomScale)),
      Math.max(1, Math.floor(window.innerHeight * bloomScale)),
    ),
    BLOOM_CONFIG.strength * bloomStrengthMul,
    BLOOM_CONFIG.radius,
    BLOOM_CONFIG.threshold,
  );
  applyBloomSettings(bloomPass);
  // * Re-apply strength with half-res compensation (applyBloomSettings overwrites strength).
  if (bloomScale < 1) {
    bloomPass.strength = BLOOM_CONFIG.strength * bloomStrengthMul;
  }
  bloomPass.enabled = getQualityKnobs().postFx;
  // * Stash scale so updateViewport can resize internal RTs.
  /** @type {any} */ (bloomPass).userData = { ...(/** @type {any} */ (bloomPass).userData || {}), bloomScale };
  composer.addPass(bloomPass);

  // * OutputPass performs tone mapping + sRGB encoding. Without it the composer wrote
  // * linear working-space values straight to the canvas: renderer.toneMapping and
  // * toneMappingExposure were silent no-ops (three skips both when rendering into a
  // * render target), and mid-tones displayed darker/more saturated than authored.
  // * Order: bloom thresholds linear HDR, then tone-map+encode, then the CRT-style
  // * arcade FX and FXAA operate on the final display-referred LDR image.
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const arcadeCfg = CONFIG.postFx.arcade;
  const arcadePass = new ShaderPass(ArcadeFxShader);
  arcadePass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  arcadePass.uniforms.uAberration.value = arcadeCfg.aberration;
  arcadePass.uniforms.uScanlineDensity.value = arcadeCfg.scanlineDensity;
  arcadePass.uniforms.uVignette.value = arcadeCfg.vignette;
  arcadePass.enabled = getQualityKnobs().postFx;
  composer.addPass(arcadePass);

  const fxaaPass = new ShaderPass(FXAAShader);
  const pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * pixelRatio),
    1 / (window.innerHeight * pixelRatio),
  );
  fxaaPass.enabled = getQualityKnobs().fxaa;
  composer.addPass(fxaaPass);

  return { composer, bloomPass, arcadePass, fxaaPass };
}

/**
 * Resizes renderer, camera projection, and composer to the current window dimensions.
 *
 * @param {THREE.WebGLRenderer|null|undefined} renderer WebGL renderer.
 * @param {THREE.PerspectiveCamera|null|undefined} camera Perspective camera.
 * @param {EffectComposer|null|undefined} composer Post-processing composer.
 * @param {ShaderPass|null|undefined} arcadePass Arcade FX shader pass.
 * @param {ShaderPass|null|undefined} fxaaPass FXAA shader pass.
 */
export function updateViewport(renderer, camera, composer, arcadePass, fxaaPass, bloomPass = null) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (renderer) renderer.setSize(w, h);
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (composer) composer.setSize(w, h);

  if (arcadePass) arcadePass.uniforms.uResolution.value.set(w, h);

  // * Keep half-res bloom RTs in sync with the window (UnrealBloomPass.resolution).
  if (bloomPass) {
    const scale = /** @type {any} */ (bloomPass).userData?.bloomScale ?? 0.5;
    if (bloomPass.resolution) {
      bloomPass.resolution.set(
        Math.max(1, Math.floor(w * scale)),
        Math.max(1, Math.floor(h * scale)),
      );
    }
  }

  if (fxaaPass && renderer) {
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms.resolution.value.set(
      1 / (w * pixelRatio),
      1 / (h * pixelRatio),
    );
  }
}

/**
 * Disposes WebGL resources held by the renderer.
 *
 * @param {THREE.WebGLRenderer|null|undefined} renderer WebGL renderer to dispose.
 */
function disposeRenderer(renderer) {
  if (!renderer) return;
  renderer.dispose();
}

/**
 * ! REQUIRED VRAM cleanup utility — intentionally retained for future use.
 *   Not currently called in any codepath, but must be available when
 *   post-processing teardown (quality toggles, scene disposal) is wired up.
 *
 * Disposes render targets and passes owned by the effect composer.
 *
 * @public Excluded from knip's unused-export report (see comment above).
 * @param {EffectComposer|null|undefined} composer Post-processing composer to dispose.
 */
export function disposeComposer(composer) {
  if (!composer) return;
  if (Array.isArray(composer.passes)) {
    for (const pass of composer.passes) {
      const p = /** @type {any} */ (pass);
      if (p.material) p.material.dispose?.();
      if (p.dispose) p.dispose();
    }
  }
  composer.renderTarget1?.dispose();
  composer.renderTarget2?.dispose();
  composer.dispose();
}
