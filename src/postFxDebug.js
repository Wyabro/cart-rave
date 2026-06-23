// postFxDebug.js — dev-only lil-gui panel for live graphics tweaks (tree-shaken in prod).
// * Cart materials still need further refinement — tune IBL/fog/shadows here first, then lock into config.js.

import * as THREE from "three";
import GUI from "lil-gui";
import {
  getContactShadowDebugParams,
  setContactShadowCartOpacity,
  setContactShadowFootprint,
  setContactShadowStaticOpacity,
  setContactShadowTextureSoftness,
  setContactShadowsEnabled,
} from "./contactShadows.js";
import {
  applyBloomSettings,
  getEnvironmentIntensity,
  getFogColor,
  getFogDensity,
  getFogEnabled,
  getMaterialEnvMapIntensityBase,
  setEnvironmentIntensity,
  setFogEnabled,
  setMaterialEnvMapIntensity,
  setSceneFog,
} from "./scene.js";

/** @type {Record<string, number>} */
const TONE_MAPPING_BY_NAME = {
  ACESFilmic: THREE.ACESFilmicToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  Linear: THREE.LinearToneMapping,
  None: THREE.NoToneMapping,
};

/** @type {Record<number, string>} */
const TONE_MAPPING_NAME_BY_VALUE = Object.fromEntries(
  Object.entries(TONE_MAPPING_BY_NAME).map(([name, value]) => [value, name]),
);

/**
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
function isTypingTarget(e) {
  const el = e.target;
  if (!el || typeof el !== "object") return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @returns {string}
 */
function getToneMappingName(renderer) {
  return TONE_MAPPING_NAME_BY_VALUE[renderer.toneMapping] ?? "ACESFilmic";
}

/**
 * Wires a lil-gui panel to renderer, IBL, fog, contact shadows, bloom, arcade FX, and FXAA.
 * Only imported dynamically when `import.meta.env.DEV` is true.
 *
 * @param {{
 *   renderer: import("three").WebGLRenderer,
 *   scene: import("three").Scene,
 *   bloomPass: import("three/examples/jsm/postprocessing/UnrealBloomPass.js").UnrealBloomPass,
 *   arcadePass: import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass,
 *   fxaaPass: import("three/examples/jsm/postprocessing/ShaderPass.js").ShaderPass,
 * }} deps
 * @returns {GUI | null}
 */
export function initPostFxDebugGui(deps) {
  const { renderer, scene, bloomPass, arcadePass, fxaaPass } = deps;
  if (!renderer || !scene || !bloomPass || !arcadePass || !fxaaPass) return null;

  const bloomLive = {
    strength: bloomPass.strength,
    radius: bloomPass.radius,
    threshold: bloomPass.threshold,
    smoothWidth: bloomPass.highPassUniforms?.smoothWidth?.value ?? 0.055,
  };

  const shadowLive = getContactShadowDebugParams();

  const fogColorUi = {
    color: `#${getFogColor().toString(16).padStart(6, "0")}`,
  };

  const params = {
    exposure: renderer.toneMappingExposure,
    toneMapping: getToneMappingName(renderer),
    environmentIntensity: getEnvironmentIntensity(),
    materialEnvMapIntensity: getMaterialEnvMapIntensityBase(),
    fogEnabled: getFogEnabled(),
    fogDensity: getFogDensity(),
    shadowsEnabled: shadowLive.enabled,
    shadowSoftness: shadowLive.textureSoftness,
    shadowCartOpacity: shadowLive.cartOpacity,
    shadowFootprintX: shadowLive.footprintRadiusX,
    shadowFootprintZ: shadowLive.footprintRadiusZ,
    shadowStaticOpacity: shadowLive.staticOpacity,
    ...bloomLive,
    bloomEnabled: bloomPass.enabled,
    aberration: arcadePass.uniforms.uAberration.value,
    scanlineDensity: arcadePass.uniforms.uScanlineDensity.value,
    vignette: arcadePass.uniforms.uVignette.value,
    arcadeEnabled: arcadePass.enabled,
    fxaaEnabled: fxaaPass.enabled,
  };

  const syncBloom = () => applyBloomSettings(bloomPass, bloomLive);

  const gui = new GUI({ title: "Graphics Debug", width: 320 });
  gui.domElement.style.zIndex = "99999";

  const urlWantsDebug = new URLSearchParams(window.location.search).has("debug");
  let guiVisible = urlWantsDebug;
  if (!guiVisible) gui.hide();

  const rendererFolder = gui.addFolder("Renderer");
  rendererFolder.add(params, "exposure", 0.4, 2.0, 0.01).name("toneMappingExposure").onChange((v) => {
    renderer.toneMappingExposure = v;
  });
  rendererFolder.add(params, "toneMapping", Object.keys(TONE_MAPPING_BY_NAME)).onChange((name) => {
    const mapping = TONE_MAPPING_BY_NAME[name];
    if (mapping !== undefined) renderer.toneMapping = mapping;
  });

  const iblFolder = gui.addFolder("Environment / IBL");
  iblFolder.add(params, "environmentIntensity", 0.0, 2.0, 0.01).name("intensity").onChange((v) => {
    setEnvironmentIntensity(scene, v);
  });
  iblFolder.add(params, "materialEnvMapIntensity", 0.0, 1.5, 0.01).name("materialReflectivity").onChange((v) => {
    setMaterialEnvMapIntensity(scene, v);
  });

  const fogFolder = gui.addFolder("Fog");
  fogFolder.add(params, "fogEnabled").name("enabled").onChange((v) => {
    setFogEnabled(scene, renderer, v);
  });
  fogFolder.add(params, "fogDensity", 0.0, 0.04, 0.0005).name("density").onChange((v) => {
    setSceneFog(scene, renderer, { density: v });
  });
  fogFolder.addColor(fogColorUi, "color").name("color").onChange((v) => {
    const hex = parseInt(v.replace("#", ""), 16);
    if (Number.isFinite(hex)) setSceneFog(scene, renderer, { color: hex });
  });

  const shadowsFolder = gui.addFolder("Contact Shadows");
  shadowsFolder.add(params, "shadowsEnabled").name("enabled").onChange((v) => {
    setContactShadowsEnabled(v);
  });
  shadowsFolder.add(params, "shadowSoftness", 0.15, 1.0, 0.01).name("softness").onChange((v) => {
    setContactShadowTextureSoftness(v, scene);
  });
  shadowsFolder.add(params, "shadowCartOpacity", 0.0, 1.0, 0.01).name("cartOpacity").onChange((v) => {
    setContactShadowCartOpacity(v);
  });
  shadowsFolder.add(params, "shadowFootprintX", 0.3, 2.0, 0.02).name("footprintX").onChange((v) => {
    setContactShadowFootprint(v, params.shadowFootprintZ);
  });
  shadowsFolder.add(params, "shadowFootprintZ", 0.3, 2.5, 0.02).name("footprintZ").onChange((v) => {
    setContactShadowFootprint(params.shadowFootprintX, v);
  });
  shadowsFolder.add(params, "shadowStaticOpacity", 0.0, 1.0, 0.01).name("staticOpacity").onChange((v) => {
    setContactShadowStaticOpacity(scene, v);
  });

  const bloomFolder = gui.addFolder("Bloom");
  bloomFolder.add(params, "bloomEnabled").name("enabled").onChange((v) => {
    bloomPass.enabled = v;
  });
  bloomFolder.add(params, "threshold", 0.0, 1.0, 0.005).onChange((v) => {
    bloomLive.threshold = v;
    syncBloom();
  });
  bloomFolder.add(params, "strength", 0.0, 3.0, 0.01).onChange((v) => {
    bloomLive.strength = v;
    syncBloom();
  });
  bloomFolder.add(params, "radius", 0.0, 1.0, 0.01).onChange((v) => {
    bloomLive.radius = v;
    syncBloom();
  });
  bloomFolder.add(params, "smoothWidth", 0.0, 0.2, 0.005).onChange((v) => {
    bloomLive.smoothWidth = v;
    syncBloom();
  });
  bloomFolder.open();

  const arcadeFolder = gui.addFolder("Arcade FX");
  arcadeFolder.add(params, "arcadeEnabled").name("enabled").onChange((v) => {
    arcadePass.enabled = v;
  });
  arcadeFolder.add(params, "aberration", 0.0, 0.02, 0.0005).onChange((v) => {
    arcadePass.uniforms.uAberration.value = v;
  });
  arcadeFolder.add(params, "scanlineDensity", 0.0, 4.0, 0.1).onChange((v) => {
    arcadePass.uniforms.uScanlineDensity.value = v;
  });
  arcadeFolder.add(params, "vignette", 0.0, 2.5, 0.05).onChange((v) => {
    arcadePass.uniforms.uVignette.value = v;
  });

  gui.addFolder("FXAA").add(params, "fxaaEnabled").name("enabled").onChange((v) => {
    fxaaPass.enabled = v;
  });

  const actions = {
    logAllValues() {
      const payload = {
        postFx: {
          toneMappingExposure: params.exposure,
          toneMapping: params.toneMapping,
          environment: {
            intensity: params.environmentIntensity,
            materialEnvMapIntensity: params.materialEnvMapIntensity,
          },
          fog: {
            enabled: params.fogEnabled,
            color: getFogColor(),
            density: params.fogDensity,
          },
          bloom: {
            enabled: params.bloomEnabled,
            ...bloomLive,
          },
          arcade: {
            enabled: params.arcadeEnabled,
            aberration: params.aberration,
            scanlineDensity: params.scanlineDensity,
            vignette: params.vignette,
          },
          fxaa: {
            enabled: params.fxaaEnabled,
          },
        },
        contactShadows: {
          enabled: params.shadowsEnabled,
          textureSoftness: params.shadowSoftness,
          cart: {
            opacity: params.shadowCartOpacity,
            footprintRadiusX: params.shadowFootprintX,
            footprintRadiusZ: params.shadowFootprintZ,
          },
          static: {
            opacity: params.shadowStaticOpacity,
          },
        },
      };
      const json = JSON.stringify(payload, null, 2);
      // eslint-disable-next-line no-console
      console.log("[Graphics Debug] Copy into src/config.js:\n", json);
      if (typeof navigator?.clipboard?.writeText === "function") {
        navigator.clipboard.writeText(json).catch(() => {});
      }
    },
  };
  gui.add(actions, "logAllValues").name("Log all values → console");

  window.addEventListener("keydown", (e) => {
    if (e.key !== "h" && e.key !== "H") return;
    if (isTypingTarget(e)) return;
    if (e.repeat) return;
    guiVisible = !guiVisible;
    if (guiVisible) gui.show();
    else gui.hide();
  });

  return gui;
}
