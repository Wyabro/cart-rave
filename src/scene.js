// scene.js — Three.js scene, camera, renderer, post-processing, environment

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { CONFIG } from "./config.js";

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
  if (bloomPass.highPassUniforms?.luminosityThreshold) {
    bloomPass.highPassUniforms.luminosityThreshold.value = bloomCfg.threshold;
  }
  if (bloomPass.highPassUniforms?.smoothWidth) {
    bloomPass.highPassUniforms.smoothWidth.value = bloomCfg.smoothWidth;
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
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  // * Pass renderer so RoomEnvironment uses physical light intensities in the bake.
  const roomEnvironment = new RoomEnvironment(renderer);
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
 * Custom Arcade FX Shader: Combines Chromatic Aberration, Scanlines, and Vignette.
 */
const ArcadeFxShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAberration: { value: 0.0045 },
    uScanlineDensity: { value: 1.5 },
    uVignette: { value: 1.2 },
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
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 center = vec2(0.5, 0.5);
      vec2 dir = uv - center;
      float dist = length(dir);

      vec2 offset = normalize(dir) * dist * uAberration;
      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec4 color = vec4(r, g, b, 1.0);

      float scanline = sin(gl_FragCoord.y * uScanlineDensity) * 0.018;
      color.rgb -= scanline;

      float vig = smoothstep(0.8, 0.5 * uVignette, dist * (uVignette * 0.5 + 0.5));
      color.rgb *= vig;

      gl_FragColor = color;
    }
  `,
};

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(FOG_CONFIG.color, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.postFx.toneMappingExposure ?? 1.0;
  // * Contact grounding uses blob quads (contactShadows.js), not shadowMap — keeps GPU cost flat.
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

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    BLOOM_CONFIG.strength,
    BLOOM_CONFIG.radius,
    BLOOM_CONFIG.threshold,
  );
  applyBloomSettings(bloomPass);
  composer.addPass(bloomPass);

  const arcadeCfg = CONFIG.postFx.arcade;
  const arcadePass = new ShaderPass(ArcadeFxShader);
  arcadePass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  arcadePass.uniforms.uAberration.value = arcadeCfg.aberration;
  arcadePass.uniforms.uScanlineDensity.value = arcadeCfg.scanlineDensity;
  arcadePass.uniforms.uVignette.value = arcadeCfg.vignette;
  composer.addPass(arcadePass);

  const fxaaPass = new ShaderPass(FXAAShader);
  const pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * pixelRatio),
    1 / (window.innerHeight * pixelRatio),
  );
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
export function updateViewport(renderer, camera, composer, arcadePass, fxaaPass) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (renderer) renderer.setSize(w, h);
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (composer) composer.setSize(w, h);

  if (arcadePass) arcadePass.uniforms.uResolution.value.set(w, h);

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
 * Disposes render targets and passes owned by the effect composer.
 *
 * @param {EffectComposer|null|undefined} composer Post-processing composer to dispose.
 */
function disposeComposer(composer) {
  if (!composer) return;
  composer.dispose();
}
