// scene.js — Three.js scene, camera, renderer, post-processing, environment

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { EffectComposer } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.164.1/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "https://unpkg.com/three@0.164.1/examples/jsm/shaders/FXAAShader.js";
import { CONFIG } from "./config.js";

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
  renderer.setClearColor(0x0a0520, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

/**
 * Creates the root Three.js scene with exponential fog.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0520, 0.006);
  return scene;
}

/**
 * Creates the perspective chase camera at the current window aspect ratio.
 *
 * @returns {THREE.PerspectiveCamera}
 */
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  return camera;
}

/**
 * Builds the post-processing pipeline (render -> bloom -> arcade fx -> fxaa).
 *
 * @param {THREE.WebGLRenderer} renderer Active WebGL renderer.
 * @param {THREE.Scene} scene Root scene to render.
 * @param {THREE.PerspectiveCamera} camera Active camera.
 * @returns {{ composer: EffectComposer, bloomPass: UnrealBloomPass, arcadePass: ShaderPass, fxaaPass: ShaderPass }}
 */
export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const { bloomStrength, bloomRadius, bloomThreshold } = CONFIG.postFx;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomStrength,
    bloomRadius,
    bloomThreshold,
  );
  composer.addPass(bloomPass);

  const arcadePass = new ShaderPass(ArcadeFxShader);
  arcadePass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
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
export function disposeRenderer(renderer) {
  if (!renderer) return;
  renderer.dispose();
}

/**
 * Disposes render targets and passes owned by the effect composer.
 *
 * @param {EffectComposer|null|undefined} composer Post-processing composer to dispose.
 */
export function disposeComposer(composer) {
  if (!composer) return;
  composer.dispose();
}
