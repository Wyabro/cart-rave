// koHitmarkerFx.js — world-space KO hit pop: expanding neon ring + spark shards.
// Client-local VFX at the victim (or fall) position so every peer sees where the KO landed.
// No physics, no network.

import * as THREE from "three";
import { isLowQualityMode } from "../utils.js";

const MAX_ACTIVE = 8;
const _planeGeo = new THREE.PlaneGeometry(1, 1);
const _color = new THREE.Color();

/** @type {{ step: (now: number, dt: number) => boolean, teardown: () => void }[]} */
const active = [];

/**
 * @param {{ step: (now: number, dt: number) => boolean, teardown: () => void }} fx
 */
function addFx(fx) {
  // * Cap is a soft pool: drop the oldest still-playing hitmarker so a fresh KO
  // * always gets feedback. (Previously dropped the newest after full alloc —
  // * wasted WebGL objects and hid the hit that mattered.)
  if (active.length >= MAX_ACTIVE) {
    active.shift().teardown();
  }
  active.push(fx);
}

/**
 * Soft radial ring shader (expanding hitmarker).
 * @param {THREE.Color} color
 * @returns {THREE.ShaderMaterial}
 */
function makeRingMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uProgress: { value: 0 },
      uColor: { value: color.clone() },
      uIntensity: { value: 1 },
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
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float d = length(p) * 2.0;
        float disc = 1.0 - smoothstep(0.92, 1.0, d);
        // * Expanding crest + thin inner trail.
        float r = clamp(uProgress * 1.05, 0.0, 1.0);
        float band = abs(d - r);
        float width = 0.04 + uProgress * 0.03;
        float crest = exp(-band * band / (width * width));
        float trail = exp(-pow(max(band - width * 1.2, 0.0), 2.0) / (width * width * 2.0)) * 0.4;
        float core = exp(-d * d * 18.0) * (1.0 - uProgress) * 0.85;
        float a = (crest + trail + core) * disc * uIntensity * (1.0 - uProgress * 0.65);
        vec3 col = mix(uColor, vec3(1.0), crest * 0.45 + core * 0.35);
        gl_FragColor = vec4(col * (0.7 + crest * 0.8), clamp(a, 0.0, 1.0));
      }
    `,
  });
}

/**
 * World-space KO hitmarker: dual rings + spark points at (x,y,z).
 *
 * @param {THREE.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [neonHex=0xff2bd6]
 * @param {number} [intensity=1] 0.4..1.2
 * @returns {void}
 */
export function spawnKoWorldHitmarker(scene, x, y, z, neonHex = 0xff2bd6, intensity = 1) {
  if (!scene) return;
  const lowQ = isLowQualityMode();
  const startMs = performance.now();
  const durationMs = 520 + intensity * 180;
  const I = Math.min(1.2, Math.max(0.35, intensity));

  _color.setHex(neonHex >>> 0);

  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);

  /** @type {(THREE.Material | THREE.BufferGeometry)[]} */
  const disposables = [];

  // --- Dual expanding rings (horizontal + slight camera-facing second ring) ---
  const ringSpecs = lowQ
    ? [{ delay: 0, life: durationMs * 0.9, endScale: 3.2 * I, peak: 1 }]
    : [
      { delay: 0, life: durationMs * 0.85, endScale: 3.6 * I, peak: 1 },
      { delay: 45, life: durationMs, endScale: 5.2 * I, peak: 0.55 },
    ];
  /** @type {{ mesh: THREE.Mesh, mat: THREE.ShaderMaterial, delay: number, life: number, endScale: number, peak: number }[]} */
  const rings = [];
  for (const spec of ringSpecs) {
    const mat = makeRingMaterial(_color);
    mat.uniforms.uIntensity.value = spec.peak * (0.85 + I * 0.35);
    const mesh = new THREE.Mesh(_planeGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(0.35);
    mesh.renderOrder = 8;
    group.add(mesh);
    rings.push({ mesh, mat, ...spec });
    disposables.push(mat);
  }

  // --- Ballistic spark shards ---
  const sparkCount = lowQ ? 10 : 18;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  const sparkVel = [];
  for (let i = 0; i < sparkCount; i += 1) {
    sparkPos[i * 3] = 0;
    sparkPos[i * 3 + 1] = 0;
    sparkPos[i * 3 + 2] = 0;
    const a = Math.random() * Math.PI * 2;
    const elev = 0.25 + Math.random() * 0.75;
    const spd = (4 + Math.random() * 9) * I;
    sparkVel.push({
      x: Math.cos(a) * spd * (0.6 + Math.random() * 0.5),
      y: elev * spd * 0.9,
      z: Math.sin(a) * spd * (0.6 + Math.random() * 0.5),
    });
  }
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: _color.clone().lerp(new THREE.Color(0xffffff), 0.35),
    size: 0.14 + I * 0.06,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.renderOrder = 9;
  group.add(sparks);
  disposables.push(sparkMat, sparkGeo);

  // --- Hot core flash (brief) ---
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const core = new THREE.Mesh(_planeGeo, coreMat);
  core.rotation.x = -Math.PI / 2;
  core.scale.setScalar(0.55 * I);
  group.add(core);
  disposables.push(coreMat);

  addFx({
    step(now, dt) {
      const elapsed = now - startMs;
      const t = Math.min(1, elapsed / durationMs);
      if (t >= 1) return false;

      for (const r of rings) {
        const local = (elapsed - r.delay) / r.life;
        if (local < 0) {
          r.mesh.visible = false;
          continue;
        }
        r.mesh.visible = true;
        const u = Math.min(1, Math.max(0, local));
        const e = 1 - (1 - u) * (1 - u) * (1 - u);
        r.mat.uniforms.uProgress.value = u;
        r.mesh.scale.setScalar(0.35 + (r.endScale - 0.35) * e);
      }

      const pos = sparkGeo.attributes.position;
      for (let i = 0; i < sparkCount; i += 1) {
        const v = sparkVel[i];
        v.y -= 14 * dt;
        pos.array[i * 3] += v.x * dt;
        pos.array[i * 3 + 1] += v.y * dt;
        pos.array[i * 3 + 2] += v.z * dt;
      }
      pos.needsUpdate = true;
      sparkMat.opacity = Math.max(0, 1 - t * t) * (0.7 + I * 0.3);
      sparkMat.size = (0.14 + I * 0.06) * (1 - t * 0.4);

      coreMat.opacity = Math.max(0, 1 - t * 4.5) * 0.95;
      core.scale.setScalar(0.55 * I * (1 + t * 2.2));

      return true;
    },
    teardown() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  });
}

/**
 * Advance hitmarkers. Call once per frame from frameVisuals.
 * @param {number} now
 * @param {number} dt
 */
export function updateKoHitmarkers(now, dt) {
  for (let i = active.length - 1; i >= 0; i -= 1) {
    if (!active[i].step(now, dt)) {
      active[i].teardown();
      active.splice(i, 1);
    }
  }
}

/**
 * Tear down all live hitmarkers (level dispose / menu).
 */
export function clearKoHitmarkers() {
  for (const fx of active) fx.teardown();
  active.length = 0;
}

/** @type {THREE.Group | null} */
let _programWarmupGroup = null;

/**
 * Parks one live instance of each hitmarker material archetype in the scene
 * (invisible — renderer.compile() traverses invisible objects, render skips them).
 *
 * Per-KO materials dispose to refcount zero, which deletes their GL programs and
 * forces a synchronous shader recompile on the NEXT KO — a visible mid-round hitch.
 * The anchor keeps the programs referenced forever so every spawn is a cache hit.
 * Program-relevant params (material class, map, side, toneMapped, fog) must match
 * spawnKoWorldHitmarker's materials; color/blending/opacity don't affect the program.
 *
 * @param {THREE.Scene} scene
 */
export function installKoHitmarkerProgramWarmup(scene) {
  if (!scene) return;
  if (_programWarmupGroup) {
    if (_programWarmupGroup.parent !== scene) scene.add(_programWarmupGroup);
    return;
  }
  const group = new THREE.Group();
  group.name = "koHitmarkerProgramWarmup";
  group.visible = false;
  group.position.set(0, -500, 0);

  // Ring (ShaderMaterial — unique source; nothing else in the scene holds it alive).
  _color.setHex(0xff2bd6);
  group.add(new THREE.Mesh(_planeGeo, makeRingMaterial(_color)));

  // Spark points (PointsMaterial, no map, sizeAttenuation, toneMapped false).
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  group.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    toneMapped: false,
  })));

  // Core flash (MeshBasicMaterial, no map, toneMapped false).
  group.add(new THREE.Mesh(_planeGeo, new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })));

  _programWarmupGroup = group;
  scene.add(group);
}
