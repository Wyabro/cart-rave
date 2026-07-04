// postFxDebug.js — dev-only Tweakpane panel for live graphics tweaks (tree-shaken in prod).
// * Cart materials still need further refinement — tune IBL/fog/shadows here first, then lock into config.js.

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
// @ts-ignore - tweakpane v4 exports Pane as type but we use it as constructor
import { Pane } from "tweakpane";
import {
  CUSTOMIZE_STORAGE_KEY,
  invalidateCustomizationCache,
  loadPlayerCustomization,
} from "./customization.js";
import { raveGltfTuning } from "./stores/cartTuningStore.js";
import { wireRaveGltfCartDebugTweakpane } from "./raveGltfCartTweakpane.js";
import {
  getDefaultSfxVolumes,
  getSfxKeys,
  getSfxPerVolume,
  setSfxPerVolume,
} from "./audioManager.js";
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

/** Container id — single style injection. */
const CONTAINER_ID = "tweakpane-container";
const STYLE_ID = "tweakpane-runtime-styles";

/**
 * Injects runtime CSS for the Tweakpane container once.
 */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const css = document.createElement("style");
  css.id = STYLE_ID;
  css.textContent = `
    #${CONTAINER_ID} {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 99999;
      width: 360px;
      max-height: 100vh;
      overflow-y: auto;
      transition: opacity 0.15s ease;
    }
    #${CONTAINER_ID}.tp-hidden {
      opacity: 0;
      pointer-events: none;
    }
    #${CONTAINER_ID} .tp-dfwv {
      max-height: calc(100vh - 8px);
      overflow-y: auto;
    }
    /* Tweakpane theme overrides */
    #${CONTAINER_ID} .tp-fldv_t {
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    #${CONTAINER_ID} .tp-lblv_l {
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 10.5px;
    }
    #${CONTAINER_ID} .tp-sldv_i {
      height: 18px;
    }
    #${CONTAINER_ID} .tp-btnv_b {
      font-size: 10.5px;
      padding: 2px 6px;
    }
    #${CONTAINER_ID} .tp-chkv {
      min-height: 18px;
    }
    #${CONTAINER_ID} .tp-fldv {
      margin-bottom: 2px;
    }
  `;
  document.head.appendChild(css);
}

/**
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
function isTypingTarget(e) {
  const el = e.target;
  if (!el || typeof el !== "object") return false;
  // @ts-expect-error THREE duck-typing suppress
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
 * Wires a Tweakpane panel to renderer, IBL, fog, contact shadows, bloom, arcade FX, and FXAA.
 * Only imported dynamically when `import.meta.env.DEV` is true.
 */
// ! Debug export functions — exposed on window for Tweakpane buttons.
window.exportArenaFloorGLB = function () {
  const mesh = window.recordMesh;
  if (!mesh) {
    console.warn("[Debug] window.recordMesh is not set. Expose it from arena.js");
    return;
  }
  if (!mesh.geometry) {
    console.warn("[Debug] window.recordMesh has no geometry");
    return;
  }

  // * GLTFExporter doesn't support ShaderMaterial — clone and swap to MeshStandardMaterial.
  const clone = mesh.clone();
  clone.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < mats.length; i++) {
        const src = mats[i];
        mats[i] = new THREE.MeshStandardMaterial({
          color: src.color ?? 0xffffff,
          map: src.map ?? null,
          normalMap: src.normalMap ?? null,
          roughnessMap: src.roughnessMap ?? null,
          metalnessMap: src.metalnessMap ?? null,
          roughness: src.roughness ?? 0.5,
          metalness: src.metalness ?? 0,
          envMap: src.envMap ?? null,
          envMapIntensity: src.envMapIntensity ?? 1,
        });
      }
      child.material = Array.isArray(child.material) ? mats : mats[0];
    }
  });

  const exporter = new GLTFExporter();
  exporter.parse(
    clone,
    (gltf) => {
      // * gltf is an ArrayBuffer when binary: true.
      // @ts-expect-error THREE duck-typing suppress
      const blob = new Blob([gltf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "arena-floor.glb";
      a.click();
      URL.revokeObjectURL(url);

      console.log("[Debug] Exported arena-floor.glb");

      // * Cleanup clone geometry and materials after async export.
      clone.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m.dispose());
        }
      });
    },
    (err) => {
      console.warn("[Debug] GLTFExporter error:", err);
    },
    { binary: true },
  );
};

window.exportPhysicsGeometry = function () {
  const mesh = window.recordMesh;
  if (!mesh) {
    console.warn("[Debug] window.recordMesh is not set. Expose it from arena.js");
    return;
  }

  const geo = mesh.geometry;
  if (!geo) {
    console.warn("[Debug] recordMesh has no geometry");
    return;
  }

  const posAttr = geo.attributes.position;
  const verts = posAttr ? Array.from(posAttr.array) : [];
  const indices = geo.index ? Array.from(geo.index.array) : null;

  const data = {
    vertexCount: verts.length / 3,
    indexCount: indices ? indices.length : 0,
    indexed: indices !== null,
    vertices: verts,
    indices,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "arena-physics-geometry.json";
  a.click();
  URL.revokeObjectURL(url);
};

export function initPostFxDebugGui(deps) {
  const { renderer, scene, bloomPass, arcadePass, fxaaPass, suddenDeathTest } = deps;
  if (!renderer || !scene || !bloomPass || !arcadePass || !fxaaPass) return null;

  injectStyles();

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

  const pane = new Pane({
    title: "Cart Rave Debug  (H = hide/show)",
    expanded: true,
  });

  // — Move pane into a scrollable container —
  const existingContainer = document.getElementById(CONTAINER_ID);
  if (existingContainer) existingContainer.remove();
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  container.appendChild(pane.element);

  const urlWantsDebug = new URLSearchParams(window.location.search).has("debug");
  let paneVisible = urlWantsDebug;
  container.classList.toggle("tp-hidden", !paneVisible);

  // — Collapse / Expand All —
  /** @type {any[]} tweakpane v4 removed FolderApi */
  const allFolders = [];
  pane.addButton({ title: "Collapse All" }).on("click", () => {
    for (const f of allFolders) f.expanded = false;
  });
  pane.addButton({ title: "Expand All" }).on("click", () => {
    for (const f of allFolders) f.expanded = true;
  });

  // — Cart Forks & Wheels (Tweakpane version) —
  allFolders.push(wireRaveGltfCartDebugTweakpane(pane, scene));

  // — SFX Volumes (dev tuning) —
  const sfxFolder = pane.addFolder({ title: "SFX Volumes", expanded: true });
  allFolders.push(sfxFolder);
  const sfxKeys = getSfxKeys();
  if (sfxKeys.length > 0) {
    /** @type {Record<string, number>} */
    const sfxVolTarget = {};
    for (const k of sfxKeys) {
      sfxVolTarget[k] = getSfxPerVolume(k);
    }
    const defaults = getDefaultSfxVolumes();
    sfxFolder.addButton({ title: "↩ Reset all SFX to defaults" }).on("click", () => {
      for (const k of sfxKeys) {
        const dv = defaults[k] ?? 1;
        sfxVolTarget[k] = dv;
        setSfxPerVolume(k, dv);
      }
      pane.refresh();
    });
    for (const key of sfxKeys) {
      sfxFolder.addBinding(sfxVolTarget, key, { min: 0, max: 3, step: 0.05, label: key })
        .on("change", (ev) => {
          setSfxPerVolume(key, ev.value);
        });
    }
  }

  // — Renderer —
  const rendererFolder = pane.addFolder({ title: "Renderer" });
  allFolders.push(rendererFolder);
  rendererFolder.addBinding(params, "exposure", { min: 0.4, max: 2.0, step: 0.01, label: "toneMappingExposure" }).on("change", (ev) => {
    renderer.toneMappingExposure = ev.value;
  });
  rendererFolder.addBinding(params, "toneMapping", {
    options: Object.fromEntries(Object.keys(TONE_MAPPING_BY_NAME).map((n) => [n, n])),
  }).on("change", (ev) => {
    const mapping = TONE_MAPPING_BY_NAME[ev.value];
    if (mapping !== undefined) renderer.toneMapping = mapping;
  });

  // — Environment / IBL —
  const iblFolder = pane.addFolder({ title: "Environment / IBL" });
  allFolders.push(iblFolder);
  iblFolder.addBinding(params, "environmentIntensity", { min: 0.0, max: 2.0, step: 0.01, label: "intensity" }).on("change", (ev) => {
    setEnvironmentIntensity(scene, ev.value);
  });
  iblFolder.addBinding(params, "materialEnvMapIntensity", { min: 0.0, max: 1.5, step: 0.01, label: "materialReflectivity" }).on("change", (ev) => {
    setMaterialEnvMapIntensity(scene, ev.value);
  });

  // — Fog —
  const fogFolder = pane.addFolder({ title: "Fog" });
  allFolders.push(fogFolder);
  fogFolder.addBinding(params, "fogEnabled", { label: "enabled" }).on("change", (ev) => {
    setFogEnabled(scene, renderer, ev.value);
  });
  fogFolder.addBinding(params, "fogDensity", { min: 0.0, max: 0.04, step: 0.0005, label: "density" }).on("change", (ev) => {
    setSceneFog(scene, renderer, { density: ev.value });
  });
  fogFolder.addBinding(fogColorUi, "color", { label: "color", view: "color" }).on("change", (ev) => {
    const hex = parseInt(ev.value.replace("#", ""), 16);
    if (Number.isFinite(hex)) setSceneFog(scene, renderer, { color: hex });
  });

  // — Contact Shadows —
  const shadowsFolder = pane.addFolder({ title: "Contact Shadows" });
  allFolders.push(shadowsFolder);
  shadowsFolder.addBinding(params, "shadowsEnabled", { label: "enabled" }).on("change", (ev) => {
    setContactShadowsEnabled(ev.value);
  });
  shadowsFolder.addBinding(params, "shadowSoftness", { min: 0.15, max: 1.0, step: 0.01, label: "softness" }).on("change", (ev) => {
    setContactShadowTextureSoftness(ev.value, scene);
  });
  shadowsFolder.addBinding(params, "shadowCartOpacity", { min: 0.0, max: 1.0, step: 0.01, label: "cartOpacity" }).on("change", (ev) => {
    setContactShadowCartOpacity(ev.value);
  });
  shadowsFolder.addBinding(params, "shadowFootprintX", { min: 0.3, max: 2.0, step: 0.02, label: "footprintX" }).on("change", () => {
    setContactShadowFootprint(params.shadowFootprintX, params.shadowFootprintZ);
  });
  shadowsFolder.addBinding(params, "shadowFootprintZ", { min: 0.3, max: 2.5, step: 0.02, label: "footprintZ" }).on("change", () => {
    setContactShadowFootprint(params.shadowFootprintX, params.shadowFootprintZ);
  });
  shadowsFolder.addBinding(params, "shadowStaticOpacity", { min: 0.0, max: 1.0, step: 0.01, label: "staticOpacity" }).on("change", (ev) => {
    setContactShadowStaticOpacity(scene, ev.value);
  });

  // — Bloom —
  const bloomFolder = pane.addFolder({ title: "Bloom" });
  allFolders.push(bloomFolder);
  bloomFolder.addBinding(params, "bloomEnabled", { label: "enabled" }).on("change", (ev) => {
    bloomPass.enabled = ev.value;
  });
  bloomFolder.addBinding(params, "threshold", { min: 0.0, max: 1.0, step: 0.005 }).on("change", (ev) => {
    bloomLive.threshold = ev.value;
    syncBloom();
  });
  bloomFolder.addBinding(params, "strength", { min: 0.0, max: 3.0, step: 0.01 }).on("change", (ev) => {
    bloomLive.strength = ev.value;
    syncBloom();
  });
  bloomFolder.addBinding(params, "radius", { min: 0.0, max: 1.0, step: 0.01 }).on("change", (ev) => {
    bloomLive.radius = ev.value;
    syncBloom();
  });
  bloomFolder.addBinding(params, "smoothWidth", { min: 0.0, max: 0.2, step: 0.005 }).on("change", (ev) => {
    bloomLive.smoothWidth = ev.value;
    syncBloom();
  });

  // — Arcade FX —
  const arcadeFolder = pane.addFolder({ title: "Arcade FX" });
  allFolders.push(arcadeFolder);
  arcadeFolder.addBinding(params, "arcadeEnabled", { label: "enabled" }).on("change", (ev) => {
    arcadePass.enabled = ev.value;
  });
  arcadeFolder.addBinding(params, "aberration", { min: 0.0, max: 0.02, step: 0.0005 }).on("change", (ev) => {
    arcadePass.uniforms.uAberration.value = ev.value;
  });
  arcadeFolder.addBinding(params, "scanlineDensity", { min: 0.0, max: 4.0, step: 0.1 }).on("change", (ev) => {
    arcadePass.uniforms.uScanlineDensity.value = ev.value;
  });
  arcadeFolder.addBinding(params, "vignette", { min: 0.0, max: 2.5, step: 0.05 }).on("change", (ev) => {
    arcadePass.uniforms.uVignette.value = ev.value;
  });

  // — FXAA —
  const fxaaFolder = pane.addFolder({ title: "FXAA" });
  allFolders.push(fxaaFolder);
  fxaaFolder.addBinding(params, "fxaaEnabled", { label: "enabled" }).on("change", (ev) => {
    fxaaPass.enabled = ev.value;
  });

  // — Cart Color (localStorage) —
  const cartColorDebug = {
    storageKey: CUSTOMIZE_STORAGE_KEY,
    colorMode: "",
    presetColor: "",
    customHue: 0,
    hex: "",
    cssHex: "",
    reloadFromStorage() {
      invalidateCustomizationCache();
      const c = loadPlayerCustomization();
      cartColorDebug.colorMode = c.colorMode;
      cartColorDebug.presetColor = c.color;
      cartColorDebug.customHue = c.customHue;
      cartColorDebug.hex = `0x${c.hex.toString(16).padStart(6, "0")}`;
      cartColorDebug.cssHex = c.cssHex;
    },
  };
  cartColorDebug.reloadFromStorage();
  const cartColorFolder = pane.addFolder({ title: "Cart Color (localStorage)" });
  allFolders.push(cartColorFolder);
  cartColorFolder.addBinding(cartColorDebug, "storageKey", { label: "key", readonly: true });
  cartColorFolder.addBinding(cartColorDebug, "colorMode", { label: "colorMode", readonly: true });
  cartColorFolder.addBinding(cartColorDebug, "presetColor", { label: "presetId", readonly: true });
  cartColorFolder.addBinding(cartColorDebug, "customHue", { label: "customHue°", readonly: true });
  cartColorFolder.addBinding(cartColorDebug, "hex", { label: "neonHex", readonly: true });
  cartColorFolder.addBinding(cartColorDebug, "cssHex", { label: "cssHex", readonly: true });
  cartColorFolder.addButton({ title: "Reload from storage" }).on("click", () => {
    cartColorDebug.reloadFromStorage();
    pane.refresh();
  });
  window.addEventListener("cartrave:customization-changed", () => {
    cartColorDebug.reloadFromStorage();
  });

  // — Game State (dev testing) —
  if (suddenDeathTest) {
    const gameFolder = pane.addFolder({ title: "Game State", expanded: true });
    allFolders.push(gameFolder);
    gameFolder.addButton({ title: "Force Sudden Death ⚡" }).on("click", () => {
      suddenDeathTest();
    });
  }

  // — Log all values —
  pane.addButton({ title: "Log all values → console" }).on("click", () => {
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
      raveGltfTuning: { ...raveGltfTuning },
    };
    const json = JSON.stringify(payload, null, 2);
    // eslint-disable-next-line no-console
    console.log("[Graphics Debug] Copy into src/config.js:\n", json);
    if (typeof navigator?.clipboard?.writeText === "function") {
      navigator.clipboard.writeText(json).catch(() => {});
    }
  });

  // ! Debug Exports folder — temporary, for exporting arena geometry.
  const debugFolder = pane.addFolder({
    title: "Debug Exports",
    expanded: false,
  });
  allFolders.push(debugFolder);

  debugFolder.addButton({
    title: "Export Arena Floor (.glb)",
  }).on("click", () => {
    if (typeof window.exportArenaFloorGLB === "function") {
      window.exportArenaFloorGLB();
    } else {
      console.warn("[Debug] exportArenaFloorGLB() not found. Make sure the function is defined.");
    }
  });

  debugFolder.addButton({
    title: "Export Physics Geometry (.json)",
  }).on("click", () => {
    if (typeof window.exportPhysicsGeometry === "function") {
      window.exportPhysicsGeometry();
    } else {
      console.warn("[Debug] exportPhysicsGeometry() not found. Make sure the function is defined.");
    }
  });

  // — H key toggle: fade container in/out —
  window.addEventListener("keydown", (e) => {
    if (e.key !== "h" && e.key !== "H") return;
    if (isTypingTarget(e)) return;
    if (e.repeat) return;
    paneVisible = !paneVisible;
    container.classList.toggle("tp-hidden", !paneVisible);
  });

  return pane;
}
