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
import { wireGameplayTunePane } from "./gameplayTunePane.js";
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
import { getDebugParams } from "./utils/debugParams.js";
import { getCurrentLevelId } from "./levels/levelManager.js";
import { getQualityTier } from "./utils/qualityMode.js";
import { applyQualityTier } from "./ui/graphicsToggles.js";
import { announce, resetAnnouncerRound, stopAnnouncer } from "./announcer/announcerManager.js";
import { ANNOUNCER_EVENTS } from "./announcer/announcerEvents.js";
import { initDevPanel } from "./dev/index.js";

/** @type {Record<string, number>} */
const TONE_MAPPING_BY_NAME = {
  Neutral: THREE.NeutralToneMapping,
  ACESFilmic: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
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

/**
 * Builds the "[Graphics Debug] Copy into src/config.js" payload.
 *
 * ART-EXPO-1 retired the global `toneMappingExposure` key from CONFIG.postFx — exposure
 * is now a per-arena budget (`CONFIG.postFx.arenaExposure[levelId]`, read via
 * resolveArenaExposure() in scene.js). The dump emits the live value keyed by the current
 * arena id, so pasting the snippet back is a real config change, not a silent no-op.
 *
 * @param {object} params Live panel snapshot (exposure, bloom, arcade, shadows, ...).
 * @param {string} levelId Current arena id — getCurrentLevelId() at the call site.
 * @param {object} fogColor Live scene fog color — getFogColor() at the call site.
 * @returns {object} Payload object; JSON.stringify happens in the caller.
 */
export function buildPostFxDump(params, levelId, fogColor) {
  return {
    postFx: {
      arenaExposure: { [levelId]: params.exposure },
      toneMapping: params.toneMapping,
      environment: {
        intensity: params.environmentIntensity,
        materialEnvMapIntensity: params.materialEnvMapIntensity,
      },
      fog: {
        enabled: params.fogEnabled,
        color: fogColor,
        density: params.fogDensity,
      },
      bloom: {
        enabled: params.bloomEnabled,
        strength: params.strength,
        radius: params.radius,
        threshold: params.threshold,
        smoothWidth: params.smoothWidth,
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
}

export function initPostFxDebugGui(deps) {
  const {
    renderer,
    scene,
    camera,
    bloomPass,
    arcadePass,
    fxaaPass,
    control,
    getStatus,
  } = deps;
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
    vhsAmount: arcadePass.uniforms.uVhsAmount?.value ?? 0,
    vhsNoise: arcadePass.uniforms.uVhsNoise?.value ?? 0.028,
    vhsTrackPeriod: arcadePass.uniforms.uVhsTrackPeriod?.value ?? 26,
    fxaaEnabled: fxaaPass.enabled,
  };

  const syncBloom = () => applyBloomSettings(bloomPass, bloomLive);

  const pane = new Pane({
    title: "Cart Clash Debug  (H = hide/show · ?tune = feel)",
    expanded: true,
  });

  // — Move pane into a scrollable container —
  const existingContainer = document.getElementById(CONTAINER_ID);
  if (existingContainer) existingContainer.remove();
  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  document.body.appendChild(container);
  container.appendChild(pane.element);

  const urlParams = new URLSearchParams(window.location.search);
  const urlWantsTune = urlParams.has("tune");
  const urlWantsDebug = urlParams.has("debug") || urlWantsTune;
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

  // — Stats: FPS / frame-ms + renderer.info (readonly, self-refreshing monitors) —
  // * renderer.info.render.* is per-render-call (EffectComposer resets it each pass), so
  // * draw calls/tris reflect the LAST pass, matching how visualHarness reads them.
  const statsFolder = pane.addFolder({ title: "Stats", expanded: true });
  allFolders.push(statsFolder);
  const stats = {
    fps: 0,
    ms: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  };
  const intFmt = (v) => String(Math.round(v));
  statsFolder.addBinding(stats, "fps", { readonly: true, view: "graph", min: 0, max: 144, interval: 100, format: (v) => v.toFixed(0) });
  statsFolder.addBinding(stats, "ms", { readonly: true, view: "graph", min: 0, max: 50, interval: 100, label: "frame ms", format: (v) => v.toFixed(1) });
  statsFolder.addBinding(stats, "drawCalls", { readonly: true, interval: 250, label: "draw calls", format: intFmt });
  statsFolder.addBinding(stats, "triangles", { readonly: true, interval: 250, format: intFmt });
  statsFolder.addBinding(stats, "geometries", { readonly: true, interval: 500, format: intFmt });
  statsFolder.addBinding(stats, "textures", { readonly: true, interval: 500, format: intFmt });
  statsFolder.addBinding(stats, "programs", { readonly: true, interval: 500, format: intFmt });

  // — Camera: live pose readout + copy for ?cam= / VISUAL_BOOKMARKS authoring —
  // * pose = "x,y,z,lx,ly,lz"; the look target is along the camera's forward ray, so it
  // * reproduces the exact orientation under debugParams.applyDebugCameraPose (lookAt).
  const camObj = { pose: "" };
  if (camera) {
    const camFolder = pane.addFolder({ title: "Camera", expanded: false });
    allFolders.push(camFolder);
    camFolder.addBinding(camObj, "pose", { readonly: true, interval: 150, label: "?cam=" });
    camFolder.addButton({ title: "Copy ?cam= URL → clipboard" }).on("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.set("cam", camObj.pose);
      const str = url.toString();
      if (typeof navigator?.clipboard?.writeText === "function") {
        navigator.clipboard.writeText(str).catch(() => {});
      }
      // eslint-disable-next-line no-console
      console.log(`[Camera] cam="${camObj.pose}"\n${str}`);
    });
  }

  // — Arena / Level — reloads into the chosen arena via ?level= (needs a fresh world) —
  const LEVEL_LABELS = {
    classicRecord: "Classic Record",
    backrooms: "Storerooms",
    zanzibar: "Sundial Station",
    testArena: "Test Arena (dev)",
  };
  const levelFolder = pane.addFolder({ title: "Arena / Level (reload)", expanded: false });
  allFolders.push(levelFolder);
  let currentLevel = getDebugParams().level;
  if (!currentLevel) {
    try {
      currentLevel = localStorage.getItem("cartRaveLevel");
    } catch {
      /* privacy mode */
    }
  }
  if (!currentLevel || !LEVEL_LABELS[currentLevel]) currentLevel = "classicRecord";
  const levelUi = { level: currentLevel };
  levelFolder.addBinding(levelUi, "level", {
    options: Object.fromEntries(Object.entries(LEVEL_LABELS).map(([id, label]) => [label, id])),
    label: "arena",
  }).on("change", (ev) => {
    const url = new URL(window.location.href);
    url.searchParams.set("level", ev.value);
    window.location.href = url.toString();
  });

  // — Gameplay feel (live CONFIG tuning; ?tune focuses this) —
  const gameplayFolder = wireGameplayTunePane(pane);
  allFolders.push(gameplayFolder);

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

  // — Announcer (test): audition PA lines/stings without engineering the game state —
  // * Runs the real announce() pipeline. resetAnnouncerRound() first clears cooldown /
  // * once-per-round gates so a line re-fires on every click (it also resets the live
  // * match's announcer gates — fine for a dev tool). Voice audio needs the announcer
  // * voice toggle on; on-screen callouts need an in-match presenter, so they only show
  // * during play. A few events are chance-gated (<1) and may need a second click.
  const announcerFolder = pane.addFolder({ title: "Announcer (test)", expanded: false });
  allFolders.push(announcerFolder);
  const announcerUi = { eventId: Object.keys(ANNOUNCER_EVENTS)[0] };
  announcerFolder.addBinding(announcerUi, "eventId", {
    options: Object.fromEntries(Object.keys(ANNOUNCER_EVENTS).map((id) => [id, id])),
    label: "event",
  });
  announcerFolder.addButton({ title: "▶ Announce selected" }).on("click", () => {
    resetAnnouncerRound();
    announce(announcerUi.eventId);
  });
  announcerFolder.addButton({ title: "◼ Stop announcer" }).on("click", () => {
    stopAnnouncer();
  });

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

  // — Quality Tier (live in-place rebuild; persists, same path as the settings menu) —
  const qualityFolder = pane.addFolder({ title: "Quality Tier", expanded: false });
  allFolders.push(qualityFolder);
  const qualityUi = { tier: getQualityTier() };
  qualityFolder.addBinding(qualityUi, "tier", {
    options: { low: "low", medium: "medium", high: "high" },
    label: "tier (rebuilds)",
  }).on("change", (ev) => {
    applyQualityTier(ev.value);
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

  // — VHS / CCTV (Storerooms-only layer on the arcade pass) —
  const vhsFolder = pane.addFolder({ title: "VHS / CCTV (Storerooms)" });
  allFolders.push(vhsFolder);
  vhsFolder.addBinding(params, "vhsAmount", { min: 0.0, max: 1.0, step: 0.05, label: "amount" }).on("change", (ev) => {
    if (arcadePass.uniforms.uVhsAmount) arcadePass.uniforms.uVhsAmount.value = ev.value;
  });
  vhsFolder.addBinding(params, "vhsNoise", { min: 0.0, max: 0.1, step: 0.002, label: "noise" }).on("change", (ev) => {
    if (arcadePass.uniforms.uVhsNoise) arcadePass.uniforms.uVhsNoise.value = ev.value;
  });
  vhsFolder.addBinding(params, "vhsTrackPeriod", { min: 4, max: 60, step: 1, label: "track period s" }).on("change", (ev) => {
    if (arcadePass.uniforms.uVhsTrackPeriod) arcadePass.uniforms.uVhsTrackPeriod.value = ev.value;
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

  // — Developer actions: command registry + categorized folders share one result path. —
  const devPanel = initDevPanel({ pane, allFolders, control, getStatus });

  // — Log all values —
  pane.addButton({ title: "Log all values → console" }).on("click", () => {
    const payload = buildPostFxDump(params, getCurrentLevelId(), getFogColor());
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

  // — ?tune: this session is about gameplay feel, not graphics. Collapse everything
  // * else and leave only the gameplay folder open so Wyatt lands on the sliders. —
  if (urlWantsTune) {
    for (const f of allFolders) {
      if (f !== gameplayFolder) f.expanded = false;
    }
    gameplayFolder.expanded = true;
    gameplayFolder.element?.scrollIntoView?.({ block: "start" });
  }

  // — H key toggle: fade container in/out —
  window.addEventListener("keydown", (e) => {
    if (e.key !== "h" && e.key !== "H") return;
    if (isTypingTarget(e)) return;
    if (e.repeat) return;
    paneVisible = !paneVisible;
    container.classList.toggle("tp-hidden", !paneVisible);
    devPanel.setVisible(paneVisible);
  });
  devPanel.setVisible(paneVisible);

  // — Live readout pump (dev-only, page-lifetime): drives the Stats + Camera monitors.
  // * The readonly bindings self-poll their bound object at their interval; this rAF loop
  // * just keeps that object current with a smoothed FPS and the latest camera pose.
  const _fwd = new THREE.Vector3();
  let _lastReadoutT = performance.now();
  let _fpsEma = 0;
  const _r2 = (n) => Math.round(n * 100) / 100;
  const pumpReadouts = () => {
    const now = performance.now();
    const dt = now - _lastReadoutT;
    _lastReadoutT = now;
    if (dt > 0 && dt < 1000) {
      const inst = 1000 / dt;
      _fpsEma = _fpsEma ? _fpsEma * 0.9 + inst * 0.1 : inst;
      stats.fps = _fpsEma;
      stats.ms = dt;
    }
    const info = renderer.info;
    stats.drawCalls = info?.render?.calls ?? 0;
    stats.triangles = info?.render?.triangles ?? 0;
    stats.geometries = info?.memory?.geometries ?? 0;
    stats.textures = info?.memory?.textures ?? 0;
    stats.programs = info?.programs?.length ?? 0;
    if (camera) {
      camera.getWorldDirection(_fwd);
      const p = camera.position;
      camObj.pose =
        `${_r2(p.x)},${_r2(p.y)},${_r2(p.z)},` +
        `${_r2(p.x + _fwd.x * 10)},${_r2(p.y + _fwd.y * 10)},${_r2(p.z + _fwd.z * 10)}`;
    }
    requestAnimationFrame(pumpReadouts);
  };
  requestAnimationFrame(pumpReadouts);

  return pane;
}
