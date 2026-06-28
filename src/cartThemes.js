/**
 * cartThemes.js — Runtime cart theme application (materials, wheel modules, props).
 *
 * Flow:
 * 1. `buildCart(colorHex)` creates the wireframe skeleton (cart.js).
 * 2. `applyCartTheme(root, themeId, neonHex)` applies theme presets, modules, and props.
 * 3. `buildCartThemeMaterialCache(mesh)` tags frame vs accent mats for sync.
 * 4. `applyThemeColorToCache(cache, themeId, neonHex)` re-tints without clobbering theme PBR.
 */

import * as THREE from "three";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "./scene.js";
import { getCartTheme, normalizeThemeId } from "./cartThemeConfig.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex } from "./utils.js";
import { applyRaveGltfColorToCache, applyRaveGltfLeaderGlow, buildRaveGltfMaterialCache } from "./cartRaveGltf.js";

/** @typedef {import("./cartThemeConfig.js").CartThemeId} CartThemeId */
/** @typedef {import("./cartThemeConfig.js").CartThemeDef} CartThemeDef */

const PROPS_GROUP_NAME = "CartThemeProps";

const CHROME_ENV_SCALE = 1.35;
const CART_BLACK = 0x111111;

// === Sci-Fi Procedural Textures ===

/**
 * Creates the sci-fi plaque texture with eagle logo and text.
 * @returns {THREE.CanvasTexture}
 */
function createSciFiPlaqueTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  // Dark metal background
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, 256, 128);

  // Tech border
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 228, 100);

  // Eagle silhouette (simplified geometric)
  ctx.fillStyle = "#00e5ff";
  // Wings
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(80, 65);
  ctx.lineTo(100, 65);
  ctx.lineTo(128, 55);
  ctx.lineTo(156, 65);
  ctx.lineTo(176, 65);
  ctx.closePath();
  ctx.fill();
  // Body
  ctx.fillRect(124, 55, 8, 25);
  // Head
  ctx.beginPath();
  ctx.arc(128, 38, 6, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.font = "bold 16px monospace";
  ctx.fillStyle = "#00e5ff";
  ctx.textAlign = "center";
  ctx.fillText("SECTOR 7 - HRC", 128, 100);

  // Sub-text
  ctx.font = "10px monospace";
  ctx.fillText("MK-IV MOD 0", 128, 114);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// === Vintage Procedural Textures ===

/**
 * Creates a rich woodgrain texture for the handle and basket floor.
 * @returns {THREE.CanvasTexture}
 */
function createVintageWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#6b4226";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = `rgba(${40 + Math.random() * 30}, ${25 + Math.random() * 20}, ${15}, ${0.4 + Math.random() * 0.4})`;
    ctx.lineWidth = 1 + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * 256);
    ctx.bezierCurveTo(80, Math.random() * 256, 160, Math.random() * 256, 256, Math.random() * 256);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Creates an engraved brass texture with atomic age motifs.
 * @returns {THREE.CanvasTexture}
 */
function createVintageBrassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "#d4af37");
  grad.addColorStop(0.5, "#b89b4e");
  grad.addColorStop(1, "#8a6a20");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = "rgba(80, 50, 10, 0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 232, 232);
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, 220, 220);

  ctx.strokeStyle = "rgba(80, 50, 10, 0.6)";
  ctx.lineWidth = 3;
  const drawStar = (cx, cy, r) => {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  };

  drawStar(64, 64, 30);
  drawStar(192, 64, 30);
  drawStar(64, 192, 30);
  drawStar(192, 192, 30);
  drawStar(128, 128, 40);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

/**
 * Creates the "SUPERMART MAY 1953" brass plaque texture.
 * @returns {THREE.CanvasTexture}
 */
function createVintagePlaqueTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#e6c95c");
  grad.addColorStop(0.5, "#d4af37");
  grad.addColorStop(1, "#a8862e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = "#5a4210";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, 224, 96);

  ctx.fillStyle = "#2a1d05";
  ctx.textAlign = "center";
  ctx.font = "bold 32px Georgia, serif";
  ctx.fillText("SUPERMART", 128, 56);
  ctx.font = "bold 24px Georgia, serif";
  ctx.fillText("MAY 1953", 128, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates an atomic star emblem texture for the sides of the cart.
 * @returns {THREE.CanvasTexture}
 */
function createVintageStarEmblemTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 128, 128);

  ctx.fillStyle = "#d4af37";
  ctx.strokeStyle = "#5a4210";
  ctx.lineWidth = 4;

  ctx.beginPath();
  const cx = 64;
  const cy = 64;
  const r = 50;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.4;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// === Liminal Procedural Textures ===

/**
 * Creates heavy oxidized rust texture for liminal decayed metal surfaces.
 * @returns {THREE.CanvasTexture}
 */
function createLiminalRustTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2a2418";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 90; i++) {
    const r = 100 + Math.random() * 80;
    const g = 35 + Math.random() * 40;
    const b = 15 + Math.random() * 25;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.25 + Math.random() * 0.55})`;
    const w = 8 + Math.random() * 40;
    const h = 8 + Math.random() * 40;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${60 + Math.random() * 40}, ${55 + Math.random() * 35}, ${40 + Math.random() * 30}, ${0.15 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 16, 2 + Math.random() * 8);
  }

  ctx.strokeStyle = "rgba(30, 20, 10, 0.45)";
  for (let i = 0; i < 25; i++) {
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < steps; j++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

/**
 * Creates a cracked, peeling, ambiguous industrial signage texture.
 * @returns {THREE.CanvasTexture}
 */
function createLiminalSignageTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#8a7a2a";
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = "#1e1c18";
  for (let i = -128; i < 256; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 20, 0);
    ctx.lineTo(i + 40, 128);
    ctx.lineTo(i + 20, 128);
    ctx.closePath();
    ctx.fill();
  }

  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(20, 15, 10, ${Math.random() * 0.6})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 128, 10, 10);
  }

  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 15; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, Math.random() * 128);
    ctx.lineTo(Math.random() * 256, Math.random() * 128);
    ctx.lineTo(Math.random() * 256, Math.random() * 128);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 128;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// === Tropical Procedural Textures ===

/**
 * Creates carved tropical wood texture with Polynesian tribal engravings.
 * @returns {THREE.CanvasTexture}
 */
function createTropicalWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 25; i++) {
    ctx.strokeStyle = `rgba(${60 + Math.random() * 30}, ${35 + Math.random() * 25}, ${15 + Math.random() * 15}, ${0.3 + Math.random() * 0.5})`;
    ctx.lineWidth = 2 + Math.random() * 6;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + (Math.random() - 0.5) * 40, 160, y + (Math.random() - 0.5) * 40, 256, y + (Math.random() - 0.5) * 40);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(10, 5, 0, 0.85)";
  ctx.fillStyle = "rgba(10, 5, 0, 0.85)";

  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 32) {
    ctx.moveTo(x, 40);
    ctx.lineTo(x + 16, 20);
    ctx.lineTo(x + 32, 40);
  }
  ctx.stroke();

  for (let x = 0; x < 256; x += 16) {
    ctx.beginPath();
    ctx.arc(x, 120, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let x = 0; x <= 256; x += 40) {
    ctx.moveTo(x, 180);
    ctx.lineTo(x + 20, 160);
    ctx.lineTo(x + 40, 180);
    ctx.lineTo(x + 20, 200);
    ctx.lineTo(x, 180);
  }
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Creates a plumeria (frangipani) flower texture with alpha.
 * @returns {THREE.CanvasTexture}
 */
function createTropicalPlumeriaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);

  const cx = 64;
  const cy = 64;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * 24;
    const py = cy + Math.sin(angle) * 24;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 2);

    const petalGrad = ctx.createLinearGradient(0, -20, 0, 20);
    petalGrad.addColorStop(0, "#ffffff");
    petalGrad.addColorStop(1, "#ffe680");
    ctx.fillStyle = petalGrad;

    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// === Ghost Procedural Textures ===

/**
 * Creates a jagged, creepy spiderweb texture with alpha.
 * @returns {THREE.CanvasTexture}
 */
function createGhostWebTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);

  ctx.strokeStyle = "rgba(220, 240, 255, 0.7)";
  ctx.lineWidth = 1.5;

  const cx = 64;
  const cy = 64;

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * 64, cy + Math.sin(angle) * 64);
    ctx.stroke();
  }

  for (let r = 15; r <= 60; r += 12) {
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 6;
      const x = cx + Math.cos(angle) * (r + jitter);
      const y = cy + Math.sin(angle) * (r + jitter);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a soft, ethereal smoke puff texture.
 * @returns {THREE.CanvasTexture}
 */
function createGhostSmokeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.8)");
  grad.addColorStop(0.4, "rgba(200, 255, 255, 0.4)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.2})`;
    ctx.lineWidth = 2 + Math.random() * 4;
    ctx.beginPath();
    ctx.arc(64, 64, 20 + Math.random() * 40, Math.random() * Math.PI, Math.random() * Math.PI);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// === Construction Procedural Textures ===

/**
 * Creates heavy industrial rust with concrete dust and oil grime.
 * @returns {THREE.CanvasTexture}
 */
function createConstructionRustTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#3a3830";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 45; i++) {
    const r = 45 + Math.random() * 40;
    const g = 75 + Math.random() * 45;
    const b = 35 + Math.random() * 30;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.2 + Math.random() * 0.45})`;
    const w = 12 + Math.random() * 50;
    const h = 12 + Math.random() * 50;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 100; i++) {
    const r = 90 + Math.random() * 70;
    const g = 40 + Math.random() * 35;
    const b = 20 + Math.random() * 20;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + Math.random() * 0.5})`;
    const w = 10 + Math.random() * 45;
    const h = 10 + Math.random() * 45;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${70 + Math.random() * 40}, ${65 + Math.random() * 35}, ${55 + Math.random() * 30}, ${0.2 + Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 14, 2 + Math.random() * 10);
  }

  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = `rgba(15, 12, 8, ${0.15 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 20, 6 + Math.random() * 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(25, 20, 15, 0.5)";
  for (let i = 0; i < 30; i++) {
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(Math.random() * 5);
    for (let j = 0; j < steps; j++) {
      x += (Math.random() - 0.5) * 55;
      y += (Math.random() - 0.5) * 55;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

/**
 * Creates an "UNDER CONSTRUCTION - HARD HAT AREA" worn safety sign texture.
 * @returns {THREE.CanvasTexture}
 */
function createConstructionSignTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4c430";
  ctx.fillRect(6, 6, 244, 116);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, 232, 104);

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "bold 24px Arial Black, Arial, sans-serif";
  ctx.fillText("UNDER", 128, 44);
  ctx.font = "bold 30px Arial Black, Arial, sans-serif";
  ctx.fillText("CONSTRUCTION", 128, 76);
  ctx.font = "bold 14px Arial, sans-serif";
  ctx.fillText("- HARD HAT AREA -", 128, 102);

  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(20, 15, 10, ${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 128, 5, 5);
  }

  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.2})`;
    ctx.lineWidth = 0.5 + Math.random();
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, Math.random() * 128);
    ctx.lineTo(Math.random() * 256, Math.random() * 128);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates diagonal caution-tape stripe texture.
 * @returns {THREE.CanvasTexture}
 */
function createConstructionCautionTapeTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4c430";
  ctx.fillRect(0, 0, 64, 64);

  ctx.fillStyle = "#1a1a1a";
  for (let i = -64; i < 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 8, 0);
    ctx.lineTo(i + 24, 64);
    ctx.lineTo(i + 16, 64);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a worn rubber grip texture for the construction handle.
 * @returns {THREE.CanvasTexture}
 */
function createConstructionGripTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#6e6e6c";
  ctx.fillRect(0, 0, 128, 128);

  for (let y = 0; y < 128; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? "#5a5a58" : "#787876";
    ctx.fillRect(0, y, 128, 3);
  }

  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(20, 18, 15, ${0.05 + Math.random() * 0.2})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 1 + Math.random() * 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a caked-mud tire texture for construction cart wheels.
 * @returns {THREE.CanvasTexture}
 */
function createConstructionMudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1a1612";
  ctx.fillRect(0, 0, 128, 128);

  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${35 + Math.random() * 30}, ${28 + Math.random() * 22}, ${20 + Math.random() * 18}, ${0.25 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 18, 3 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(90, 80, 65, ${0.15 + Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 8, 1 + Math.random() * 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

// === Corpo Procedural Textures ===

/**
 * Creates a brushed dark metal corporate badge texture with a subtle blue emblem.
 * @returns {THREE.CanvasTexture}
 */
function createCorpoAccentTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, "#181a1f");
  grad.addColorStop(0.5, "#0f1116");
  grad.addColorStop(1, "#181a1f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  for (let i = 0; i < 200; i++) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.04})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * 128);
    ctx.lineTo(256, Math.random() * 128);
    ctx.stroke();
  }

  ctx.strokeStyle = "#4a90e2";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 240, 112);
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, 228, 100);

  ctx.strokeStyle = "#6ab0ff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(108, 70);
  ctx.lineTo(128, 64);
  ctx.lineTo(148, 70);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#6ab0ff";
  ctx.font = "bold 14px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("OMNICORP", 128, 96);
  ctx.font = "10px Arial, sans-serif";
  ctx.fillText("EXECUTIVE DIVISION", 128, 112);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// === Luxury Procedural Textures ===

/**
 * Creates a highly polished gold texture with ornate filigree patterns.
 * @returns {THREE.CanvasTexture}
 */
function createLuxuryGoldTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "#f7e98e");
  grad.addColorStop(0.4, "#d4af37");
  grad.addColorStop(0.5, "#b89b4e");
  grad.addColorStop(0.6, "#d4af37");
  grad.addColorStop(1, "#8a6a20");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = "rgba(80, 50, 10, 0.6)";
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, 232, 232);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 216, 216);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1.5;
  for (let i = -256; i < 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 256);
    ctx.lineTo(i + 256, 0);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(80, 50, 10, 0.8)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 128, 45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(128, 128, 38, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

/**
 * Creates a luxury royal crest emblem texture with alpha.
 * @returns {THREE.CanvasTexture}
 */
function createLuxuryCrestTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);

  ctx.fillStyle = "#f7e98e";
  ctx.beginPath();
  ctx.moveTo(40, 40);
  ctx.lineTo(50, 25);
  ctx.lineTo(58, 38);
  ctx.lineTo(64, 20);
  ctx.lineTo(70, 38);
  ctx.lineTo(78, 25);
  ctx.lineTo(88, 40);
  ctx.lineTo(88, 50);
  ctx.lineTo(40, 50);
  ctx.closePath();
  ctx.fill();

  const shieldGrad = ctx.createLinearGradient(0, 50, 0, 110);
  shieldGrad.addColorStop(0, "#ffe680");
  shieldGrad.addColorStop(1, "#b89b4e");
  ctx.fillStyle = shieldGrad;
  ctx.strokeStyle = "#8a6a20";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(44, 50);
  ctx.lineTo(84, 50);
  ctx.lineTo(84, 75);
  ctx.quadraticCurveTo(84, 105, 64, 112);
  ctx.quadraticCurveTo(44, 105, 44, 75);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#8a6a20";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 55);
  ctx.lineTo(64, 100);
  ctx.moveTo(48, 75);
  ctx.lineTo(80, 75);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// === Prop Helpers ===

/**
 * @param {THREE.Material} mat
 * @returns {THREE.Group}
 */
function makeConstructionSunglasses(mat) {
  const glasses = new THREE.Group();
  const lensGeo = new THREE.BoxGeometry(0.055, 0.028, 0.006);
  lensGeo.userData.isThemeGeometry = true;

  for (const x of [-0.032, 0.032]) {
    const lens = new THREE.Mesh(lensGeo, mat);
    lens.position.x = x;
    lens.userData.isThemeProp = true;
    lens.userData.isThemeGeometry = true;
    glasses.add(lens);
  }

  const bridgeGeo = new THREE.BoxGeometry(0.02, 0.01, 0.006);
  bridgeGeo.userData.isThemeGeometry = true;
  const bridge = new THREE.Mesh(bridgeGeo, mat);
  bridge.userData.isThemeProp = true;
  bridge.userData.isThemeGeometry = true;
  glasses.add(bridge);

  const armGeo = new THREE.BoxGeometry(0.008, 0.06, 0.006);
  armGeo.userData.isThemeGeometry = true;
  const arm = new THREE.Mesh(armGeo, mat);
  arm.position.set(0.03, -0.04, 0);
  arm.rotation.z = 0.25;
  arm.userData.isThemeProp = true;
  arm.userData.isThemeGeometry = true;
  glasses.add(arm);

  return glasses;
}

/**
 * @param {THREE.Material} mat
 * @param {number} scale
 * @returns {THREE.Group}
 */
function makeConstructionWrench(mat, scale) {
  const wrench = new THREE.Group();
  const handleGeo = new THREE.BoxGeometry(0.012, 0.09 * scale, 0.012);
  handleGeo.userData.isThemeGeometry = true;
  const handle = new THREE.Mesh(handleGeo, mat);
  handle.position.y = -0.045 * scale;
  handle.userData.isThemeProp = true;
  handle.userData.isThemeGeometry = true;
  wrench.add(handle);

  const headGeo = new THREE.BoxGeometry(0.045 * scale, 0.014, 0.018);
  headGeo.userData.isThemeGeometry = true;
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 0.01;
  head.userData.isThemeProp = true;
  head.userData.isThemeGeometry = true;
  wrench.add(head);

  const jawGeo = new THREE.BoxGeometry(0.02 * scale, 0.008, 0.022);
  jawGeo.userData.isThemeGeometry = true;
  for (const x of [-1, 1]) {
    const jaw = new THREE.Mesh(jawGeo, mat);
    jaw.position.set(x * 0.018 * scale, 0.018, 0);
    jaw.userData.isThemeProp = true;
    jaw.userData.isThemeGeometry = true;
    wrench.add(jaw);
  }

  return wrench;
}

/**
 * @typedef {Object} CartThemeMaterialCache
 * @property {THREE.Material[]} frameMats — all tintable body/accent materials
 * @property {THREE.Material[]} frameBodyMats — basket/chassis frame
 * @property {THREE.Material[]} accentMats — hubs, pads, emissive trim
 * @property {THREE.Material[]} frameGlowMats — materials with emissive (leader/boost loop)
 */

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} material
 * @param {(m: THREE.Material) => void} add
 */
function forEachMaterial(material, add) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((m) => m && add(m));
    return;
  }
  add(material);
}

/**
 * @param {THREE.Object3D} root
 * @param {string} name
 * @returns {THREE.Object3D | null}
 */
function getNamedChild(root, name) {
  if (!root) return null;
  return root.getObjectByName(name);
}

/**
 * @param {THREE.Object3D} root
 * @param {string} name
 */
function removeNamedGroup(root, name) {
  const existing = getNamedChild(root, name);
  if (!existing) return;
  disposeThemeSubtree(existing);
  root.remove(existing);
}

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} material
 * @param {Set<THREE.Material>} disposedMats
 */
function disposeMaterialOnce(material, disposedMats) {
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (!mat || disposedMats.has(mat)) continue;
    disposedMats.add(mat);
    mat.dispose?.();
  }
}

/**
 * @param {THREE.Object3D} node
 */
function disposeThemeSubtree(node) {
  const disposedGeos = new Set();
  const disposedMats = new Set();
  node.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.isSharedGeometry) return;
    if (child.userData?.isThemeGeometry && child.geometry) {
      if (!disposedGeos.has(child.geometry)) {
        disposedGeos.add(child.geometry);
        child.geometry.dispose?.();
      }
    }
    if (child.userData?.isThemeProp && child.material) {
      disposeMaterialOnce(child.material, disposedMats);
    }
  });
}

/**
 * @param {THREE.Material | null | undefined} mat
 * @param {import("./cartThemeConfig.js").CartFrameMaterialPreset} preset
 * @param {import("./cartThemeConfig.js").CartGhostMaterialPreset} [ghost]
 */
function applyFrameMaterialPreset(mat, preset, ghost) {
  if (!mat) return;
  mat.userData.themeLocked = true;
  if (typeof mat.metalness === "number") mat.metalness = preset.metalness;
  if (typeof mat.roughness === "number") mat.roughness = preset.roughness;
  if (typeof mat.clearcoat === "number") mat.clearcoat = preset.clearcoat;
  if (typeof mat.clearcoatRoughness === "number") mat.clearcoatRoughness = preset.clearcoatRoughness;
  if (typeof mat.toneMapped === "boolean") mat.toneMapped = preset.toneMapped;
  if (typeof mat.envMapIntensity === "number") {
    mat.envMapIntensity = getMaterialEnvMapIntensity() * (preset.metalness > 0.7 ? CHROME_ENV_SCALE : 0.85);
  }
  if (ghost && "transmission" in mat) {
    const phys = /** @type {THREE.MeshPhysicalMaterial} */ (mat);
    phys.transparent = true;
    phys.opacity = ghost.opacity;
    phys.transmission = ghost.transmission;
    phys.ior = ghost.ior;
    phys.thickness = 0.35;
    phys.depthWrite = false;
  }
}

/**
 * @param {THREE.Material | null | undefined} mat
 * @param {number} hex
 * @param {CartThemeDef} theme
 * @param {number} [intensityMul=1]
 */
function applyTintToMaterial(mat, hex, theme, intensityMul = 1) {
  if (!mat) return;
  const refHex = emissiveRefHexForNeonHex(hex);
  const emMul = (theme.frameMaterial.emissiveMul ?? 1) * intensityMul;
  if (mat.color) mat.color.setHex(hex);
  if (mat.emissive) mat.emissive.setHex(hex);
  if (typeof mat.emissiveIntensity === "number") {
    mat.emissiveIntensity = cartEmissiveIntensityForHex(refHex, emMul);
  }
}

/**
 * @param {THREE.Object3D} root
 */
function tagFrameAndAccentMeshes(root) {
  const frameMesh = getNamedChild(root, "CartFrame");
  if (frameMesh) {
    frameMesh.traverse((child) => {
      if (child.isMesh) child.userData.cartMatRole = "frame";
    });
  }

  const cartVisual = root.userData.cartVisual;
  const pitchGroups = cartVisual?.wheelPitchObjects || [];
  for (const pitchGroup of pitchGroups) {
    pitchGroup?.traverse((child) => {
      if (!child.isMesh || child.userData?.isWheel) return;
      child.userData.cartMatRole = "accent";
    });
  }

  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.receivesPlayerAccent || child.userData?.cartMatRole === "accent") {
      child.userData.cartMatRole = "accent";
    }
  });
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyHandleStyle(root, theme) {
  const handleMesh = getNamedChild(root, "CartHandle");
  if (!handleMesh?.isMesh || !handleMesh.material) return;

  /** @type {THREE.MeshPhysicalMaterial} */
  let mat;

  if (theme.id === "ghost") {
    mat = createPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.1,
      transmission: 0.9,
      transparent: true,
      opacity: 0.4,
      ior: 1.2,
      thickness: 0.2,
      emissive: new THREE.Color(theme.accentHex),
      emissiveIntensity: 0.2,
      envMapIntensity: getMaterialEnvMapIntensity() * 1.5,
      toneMapped: false,
    });
  } else if (theme.id === "sci-fi") {
    mat = createPhysicalMaterial({
      color: 0x0a0a12,
      metalness: 0.9,
      roughness: 0.3,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1,
      envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
    });
  } else if (theme.id === "vintage") {
    const woodTex = createVintageWoodTexture();
    mat = createPhysicalMaterial({
      map: woodTex,
      color: 0x8b5a2b,
      metalness: 0.05,
      roughness: 0.65,
      clearcoat: 0.15,
      clearcoatRoughness: 0.3,
      envMapIntensity: getMaterialEnvMapIntensity() * 0.5,
    });
  } else if (theme.id === "construction") {
    const gripTex = createConstructionGripTexture();
    mat = createPhysicalMaterial({
      map: gripTex,
      color: 0x7a7a78,
      metalness: 0.12,
      roughness: 0.88,
      clearcoat: 0.04,
      clearcoatRoughness: 0.55,
      envMapIntensity: getMaterialEnvMapIntensity() * 0.35,
    });
  } else {
    switch (theme.handleStyle) {
      case "welded": {
        const liminalRustTex = createLiminalRustTexture();
        mat = createPhysicalMaterial({
          map: liminalRustTex,
          color: 0x4a4035,
          metalness: 0.6,
          roughness: 0.92,
          clearcoat: 0.05,
          envMapIntensity: getMaterialEnvMapIntensity() * 0.5,
        });
        break;
      }
      case "wood": {
        const tropWoodTex = createTropicalWoodTexture();
        mat = createPhysicalMaterial({
          map: tropWoodTex,
          color: 0x8b5a2b,
          metalness: 0.05,
          roughness: 0.65,
          clearcoat: 0.2,
          clearcoatRoughness: 0.4,
          envMapIntensity: getMaterialEnvMapIntensity() * 0.5,
        });
        break;
      }
      case "brass":
        mat = createPhysicalMaterial({
          color: 0xc9a227,
          metalness: 0.9,
          roughness: 0.32,
          clearcoat: 0.4,
          clearcoatRoughness: 0.15,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        break;
      default:
        mat = createPhysicalMaterial({
          color: 0x18181f,
          metalness: 0.95,
          roughness: 0.28,
          clearcoat: 0.55,
          clearcoatRoughness: 0.12,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        break;
    }
  }
  mat.userData.themeLocked = true;
  const oldMat = handleMesh.material;
  handleMesh.material = mat;
  if (oldMat && !Array.isArray(oldMat) && oldMat !== mat) oldMat.dispose?.();
}

// === Wheel Modules ===

/**
 * @param {THREE.Object3D} root
 */
function removeHoverPads(root) {
  const toRemove = [];
  root.traverse((child) => {
    if (child.isMesh && child.userData?.isHoverPad) toRemove.push(child);
  });
  const disposedGeos = new Set();
  const disposedMats = new Set();
  for (const mesh of toRemove) {
    mesh.parent?.remove(mesh);
    if (mesh.geometry?.userData?.isThemeGeometry && !disposedGeos.has(mesh.geometry)) {
      disposedGeos.add(mesh.geometry);
      mesh.geometry.dispose?.();
    }
    disposeMaterialOnce(mesh.material, disposedMats);
  }
}

/**
 * @param {THREE.Object3D} root
 */
function removeWhitewallRings(root) {
  const toRemove = [];
  root.traverse((child) => {
    if (child.isMesh && child.userData?.isWhitewallRing) toRemove.push(child);
  });
  const disposedGeos = new Set();
  const disposedMats = new Set();
  for (const mesh of toRemove) {
    mesh.parent?.remove(mesh);
    if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
      disposedGeos.add(mesh.geometry);
      mesh.geometry.dispose?.();
    }
    disposeMaterialOnce(mesh.material, disposedMats);
  }
}

/**
 * @param {THREE.Object3D} root
 * @param {boolean} visible
 */
function setCasterVisualVisibility(root, visible) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.isWheel) child.visible = visible;
  });

  const cartVisual = root.userData.cartVisual;
  for (const pitchGroup of cartVisual?.wheelPitchObjects || []) {
    for (const child of pitchGroup.children) {
      if (child.isMesh && !child.userData?.isWheel && !child.userData?.isWhitewallRing) {
        child.visible = visible;
      }
    }
  }
}

/**
 * Builds advanced, high-tech hover pads for the Sci-fi theme.
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 * @param {number} neonHex
 */
function applyHoverPads(root, theme, neonHex) {
  removeHoverPads(root);
  setCasterVisualVisibility(root, false);

  const cartVisual = root.userData.cartVisual;
  const yawGroups = cartVisual?.casterYawGroups || [];
  if (yawGroups.length === 0) return;

  // Dark metallic housing material
  const housingMat = createPhysicalMaterial({
    color: theme.baseHex,
    metalness: 0.9,
    roughness: 0.4,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
  });
  housingMat.userData.themeLocked = true;

  // Bright cyan electromagnetic emitter material
  const emitterMat = createPhysicalMaterial({
    color: theme.accentHex,
    emissive: new THREE.Color(theme.accentHex),
    emissiveIntensity: cartEmissiveIntensityForHex(theme.accentHex, 3.0),
    roughness: 0.2,
    metalness: 0.1,
    toneMapped: false,
  });
  emitterMat.userData.themeLocked = true;
  emitterMat.userData.receivesPlayerAccent = true;
  emitterMat.userData.cartMatRole = "accent";

  for (const yawGroup of yawGroups) {
    const mount = yawGroup.parent;
    if (!mount) continue;

    // Hexagonal housing
    const housingGeo = new THREE.CylinderGeometry(0.26, 0.2, 0.12, 6);
    housingGeo.userData.isThemeGeometry = true;
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.copy(yawGroup.position);
    housing.position.y -= 0.02;
    housing.userData.isThemeProp = true;
    housing.userData.isHoverPad = true;
    housing.userData.isThemeGeometry = true;
    mount.add(housing);

    // Inner dark coil
    const coilGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 12);
    coilGeo.userData.isThemeGeometry = true;
    const coil = new THREE.Mesh(coilGeo, housingMat);
    coil.position.copy(housing.position);
    coil.position.y -= 0.01;
    coil.userData.isThemeProp = true;
    coil.userData.isHoverPad = true;
    coil.userData.isThemeGeometry = true;
    mount.add(coil);

    // Glowing Emitter
    const emitterGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.06, 12);
    emitterGeo.userData.isThemeGeometry = true;
    const emitter = new THREE.Mesh(emitterGeo, emitterMat);
    emitter.position.copy(housing.position);
    emitter.position.y -= 0.06;
    emitter.userData.isThemeProp = true;
    emitter.userData.isHoverPad = true;
    emitter.userData.isThemeGeometry = true;
    emitter.userData.receivesPlayerAccent = true;
    emitter.userData.cartMatRole = "accent";
    mount.add(emitter);
  }

  void neonHex;
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyWhitewalls(root, theme) {
  removeWhitewallRings(root);
  setCasterVisualVisibility(root, true);

  const wallMat = createPhysicalMaterial({
    color: 0xf2f0e8,
    metalness: 0.08,
    roughness: 0.55,
    clearcoat: 0.2,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.75,
  });
  wallMat.userData.themeLocked = true;

  const hubMat = theme.id === "vintage" ? createPhysicalMaterial({
    color: 0xd4af37,
    metalness: 1.0,
    roughness: 0.25,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
  }) : null;
  if (hubMat) hubMat.userData.themeLocked = true;

  const cartVisual = root.userData.cartVisual;
  for (const pitchGroup of cartVisual?.wheelPitchObjects || []) {
    pitchGroup?.traverse((child) => {
      if (!child.isMesh || !child.userData?.isWheel) return;
      const cyl = child.geometry;
      if (!cyl || cyl.type !== "CylinderGeometry") return;
      const params = /** @type {THREE.CylinderGeometry} */ (cyl).parameters;
      if (!params || params.height < 0.15) return;

      const radius = params.radiusTop ?? 0.27;

      const wallThickness = theme.id === "vintage" ? 0.045 : 0.028;
      const torusGeo = new THREE.TorusGeometry(radius * 1.02, wallThickness, 8, 24);
      torusGeo.userData.isThemeGeometry = true;
      const ring = new THREE.Mesh(torusGeo, wallMat.clone());
      ring.rotation.z = Math.PI / 2;
      ring.userData.isThemeProp = true;
      ring.userData.isWhitewallRing = true;
      ring.userData.isThemeGeometry = true;
      child.add(ring);

      if (hubMat) {
        const hubGeo = new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, 0.02, 12);
        hubGeo.userData.isThemeGeometry = true;
        const hub = new THREE.Mesh(hubGeo, hubMat.clone());
        hub.rotation.z = Math.PI / 2;
        hub.position.x = (params.height / 2) + 0.01;
        hub.userData.isThemeProp = true;
        hub.userData.isThemeGeometry = true;
        hub.userData.isWhitewallRing = true;
        child.add(hub);
      }
    });
  }
}

/**
 * @param {THREE.Object3D} root
 */
function removeWoodHubs(root) {
  const toRemove = [];
  root.traverse((child) => {
    if (child.isMesh && child.userData?.isWoodHub) toRemove.push(child);
  });
  const disposedGeos = new Set();
  const disposedMats = new Set();
  for (const mesh of toRemove) {
    mesh.parent?.remove(mesh);
    if (mesh.geometry && !disposedGeos.has(mesh.geometry)) {
      disposedGeos.add(mesh.geometry);
      mesh.geometry.dispose?.();
    }
    disposeMaterialOnce(mesh.material, disposedMats);
  }
}

/**
 * Adds carved wooden hubs and spokes to wheels for the Tropical theme.
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyWoodHubs(root, theme) {
  removeWoodHubs(root);
  setCasterVisualVisibility(root, true);

  const woodTex = createTropicalWoodTexture();
  const hubMat = createPhysicalMaterial({
    map: woodTex,
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.65,
    clearcoat: 0.2,
  });
  hubMat.userData.themeLocked = true;

  const cartVisual = root.userData.cartVisual;
  for (const pitchGroup of cartVisual?.wheelPitchObjects || []) {
    pitchGroup?.traverse((child) => {
      if (!child.isMesh || !child.userData?.isWheel) return;
      const cyl = child.geometry;
      if (!cyl || cyl.type !== "CylinderGeometry") return;
      const params = /** @type {THREE.CylinderGeometry} */ (cyl).parameters;
      if (!params || params.height < 0.15) return;

      const radius = params.radiusTop ?? 0.27;

      const hubGeo = new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.06, 12);
      hubGeo.userData.isThemeGeometry = true;
      const hub = new THREE.Mesh(hubGeo, hubMat.clone());
      hub.rotation.z = Math.PI / 2;
      hub.position.x = (params.height / 2) + 0.01;
      hub.userData.isThemeProp = true;
      hub.userData.isThemeGeometry = true;
      hub.userData.isWoodHub = true;
      child.add(hub);

      const spokeMat = hubMat.clone();
      for (let i = 0; i < 2; i++) {
        const spokeGeo = new THREE.BoxGeometry(0.02, radius * 1.0, 0.02);
        spokeGeo.userData.isThemeGeometry = true;
        const spoke = new THREE.Mesh(spokeGeo, spokeMat);
        spoke.rotation.x = i * Math.PI / 2;
        spoke.position.x = (params.height / 2) + 0.04;
        spoke.userData.isThemeProp = true;
        spoke.userData.isThemeGeometry = true;
        spoke.userData.isWoodHub = true;
        child.add(spoke);
      }
    });
  }

  void theme;
}

/**
 * @param {THREE.Object3D} root
 */
function removeConstructionTires(root) {
  const disposedMats = new Set();
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.constructionPrevScale) {
      child.scale.copy(child.userData.constructionPrevScale);
      delete child.userData.constructionPrevScale;
    } else if (child.userData?.constructionWheelScaled) {
      child.scale.set(1, 1, 1);
      delete child.userData.constructionWheelScaled;
    }
    if (!child.userData?.isConstructionWheelOverride) return;
    const prev = child.userData.constructionPrevMaterial;
    const cur = child.material;
    if (cur && cur !== prev) disposeMaterialOnce(cur, disposedMats);
    if (prev) child.material = prev;
    delete child.userData.constructionPrevMaterial;
    delete child.userData.isConstructionWheelOverride;
  });
}

/**
 * Swaps standard casters for oversized mud-caked pneumatic tires.
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyConstructionTires(root, theme) {
  removeConstructionTires(root);
  setCasterVisualVisibility(root, true);

  const mudTex = createConstructionMudTexture();
  const tireMat = createPhysicalMaterial({
    map: mudTex,
    color: 0x2a2420,
    metalness: 0.04,
    roughness: 0.96,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.25,
  });
  tireMat.userData.themeLocked = true;

  const rimMat = createPhysicalMaterial({
    color: 0x4a4438,
    metalness: 0.72,
    roughness: 0.88,
    envMapIntensity: getMaterialEnvMapIntensity() * 0.35,
  });
  rimMat.userData.themeLocked = true;

  const cartVisual = root.userData.cartVisual;
  for (const pitchGroup of cartVisual?.wheelPitchObjects || []) {
    pitchGroup?.traverse((child) => {
      if (!child.isMesh || child.geometry?.type !== "CylinderGeometry") return;
      const params = /** @type {THREE.CylinderGeometry} */ (child.geometry).parameters;
      if (!params) return;

      if (!child.userData.constructionPrevMaterial) {
        child.userData.constructionPrevMaterial = child.material;
      }
      child.userData.isConstructionWheelOverride = true;

      if (child.userData?.isWheel) {
        if ((params.radiusTop ?? 0) > 0.2) {
          child.material = tireMat.clone();
          if (!child.userData.constructionPrevScale) {
            child.userData.constructionPrevScale = child.scale.clone();
          }
          child.scale.set(1.34, 1.34, 1.34);
          child.userData.constructionWheelScaled = true;
        } else {
          child.material = rimMat.clone();
        }
        return;
      }

      child.material = rimMat.clone();
      if (!child.userData.constructionPrevScale) {
        child.userData.constructionPrevScale = child.scale.clone();
      }
      child.scale.set(0.9, 0.9, 0.9);
    });
  }

  void theme;
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 * @param {number} neonHex
 */
function applyWheelModule(root, theme, neonHex) {
  removeHoverPads(root);
  removeWhitewallRings(root);
  removeWoodHubs(root);
  removeConstructionTires(root);

  if (theme.wheelModule === "hoverPad") {
    applyHoverPads(root, theme, neonHex);
    return;
  }

  setCasterVisualVisibility(root, true);
  if (theme.wheelModule === "whitewall") {
    applyWhitewalls(root, theme);
  } else if (theme.wheelModule === "woodHub") {
    applyWoodHubs(root, theme);
  } else if (theme.wheelModule === "constructionTires") {
    applyConstructionTires(root, theme);
  }
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyFacePolicy(root, theme) {
  const faceGroup = getNamedChild(root, "BasketFace");
  if (!faceGroup) return;

  const hideFace = theme.facePolicy === "hidden" || theme.facePolicy === "themed";
  faceGroup.visible = !hideFace;
}

/**
 * @param {THREE.Material} mat
 * @param {number} colorHex
 * @returns {THREE.Mesh}
 */
function makePropMesh(mat, colorHex) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), mat);
  mesh.userData.isThemeProp = true;
  mesh.userData.isThemeGeometry = true;
  if (mat.color) mat.color.setHex(colorHex);
  return mesh;
}

/**
 * Creates a detailed spider mesh.
 * @param {THREE.Material} mat
 * @param {number} scale
 * @returns {THREE.Group}
 */
function makeSpider(mat, scale) {
  const spider = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(0.04, 8, 8);
  bodyGeo.userData.isThemeGeometry = true;
  const body = new THREE.Mesh(bodyGeo, mat);
  body.scale.set(1, 0.8, 1.2);
  body.userData.isThemeProp = true;
  body.userData.isThemeGeometry = true;
  spider.add(body);

  const headGeo = new THREE.SphereGeometry(0.025, 8, 8);
  headGeo.userData.isThemeGeometry = true;
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 0, -0.05);
  head.userData.isThemeProp = true;
  head.userData.isThemeGeometry = true;
  spider.add(head);

  const legGeo = new THREE.BoxGeometry(0.005, 0.005, 0.06);
  legGeo.userData.isThemeGeometry = true;
  for (let i = 0; i < 8; i++) {
    const leg = new THREE.Mesh(legGeo, mat);
    const angle = (i / 8) * Math.PI * 2;
    leg.position.set(Math.cos(angle) * 0.035, 0, Math.sin(angle) * 0.035);
    leg.rotation.y = angle;
    leg.rotation.x = Math.PI / 3;
    leg.userData.isThemeProp = true;
    leg.userData.isThemeGeometry = true;
    spider.add(leg);
  }

  spider.scale.setScalar(scale);
  return spider;
}

/**
 * @param {THREE.Object3D} root
 * @param {THREE.Group} group
 * @param {CartThemeDef} theme
 * @param {number} neonHex
 */
function buildThemeProps(root, group, theme, neonHex) {
  for (const propId of theme.propIds) {
    switch (propId) {
      case "flowers":
      case "tropicalProps": {
        const frameMesh = getNamedChild(root, "CartFrame");
        if (frameMesh?.material) {
          const woodTex = createTropicalWoodTexture();
          forEachMaterial(frameMesh.material, (mat) => {
            mat.map = woodTex;
            mat.color.setHex(0xffffff);
            mat.roughness = 0.75;
            mat.metalness = 0.05;
            mat.needsUpdate = true;
          });
        }

        const trimMat = createPhysicalMaterial({
          color: theme.accentHex,
          emissive: new THREE.Color(theme.accentHex),
          emissiveIntensity: cartEmissiveIntensityForHex(theme.accentHex, 0.6),
          roughness: 0.8,
          metalness: 0.0,
        });
        trimMat.userData.themeLocked = true;
        trimMat.userData.receivesPlayerAccent = true;
        trimMat.userData.cartMatRole = "accent";

        const trimGeo = new THREE.TorusGeometry(0.55, 0.025, 8, 32, Math.PI);
        trimGeo.userData.isThemeGeometry = true;
        const trim = new THREE.Mesh(trimGeo, trimMat);
        trim.rotation.x = Math.PI / 2;
        trim.position.set(0, 0.52, 0);
        trim.userData.isThemeProp = true;
        trim.userData.isThemeGeometry = true;
        trim.userData.receivesPlayerAccent = true;
        trim.userData.cartMatRole = "accent";
        group.add(trim);

        const plumeriaTex = createTropicalPlumeriaTexture();
        const flowerMat = createPhysicalMaterial({
          map: plumeriaTex,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.DoubleSide,
          roughness: 0.8,
          metalness: 0.0,
        });
        flowerMat.userData.themeLocked = true;

        const spots = [
          [-0.35, 0.52, -0.2],
          [0.28, 0.55, 0.05],
          [-0.05, 0.52, 0.35],
          [0.42, 0.54, -0.35],
        ];
        for (const [x, y, z] of spots) {
          const flowerGroup = new THREE.Group();
          flowerGroup.position.set(x, y, z);

          const planeGeo = new THREE.PlaneGeometry(0.16, 0.16);
          planeGeo.userData.isThemeGeometry = true;

          const f1 = new THREE.Mesh(planeGeo, flowerMat);
          f1.userData.isThemeProp = true;
          f1.userData.isThemeGeometry = true;
          flowerGroup.add(f1);

          const f2 = new THREE.Mesh(planeGeo, flowerMat);
          f2.rotation.y = Math.PI / 2;
          f2.userData.isThemeProp = true;
          f2.userData.isThemeGeometry = true;
          flowerGroup.add(f2);

          flowerGroup.rotation.x = Math.PI / 2;
          flowerGroup.rotation.z = Math.random() * Math.PI;
          group.add(flowerGroup);
        }
        break;
      }
      case "webs":
      case "spiders":
      case "ghostProps": {
        const ghostAccent = neonHex || theme.accentHex;

        const smokeTex = createGhostSmokeTexture();
        const smokeMat = createPhysicalMaterial({
          map: smokeTex,
          color: ghostAccent,
          emissive: new THREE.Color(ghostAccent),
          emissiveMap: smokeTex,
          emissiveIntensity: cartEmissiveIntensityForHex(ghostAccent, 1.5),
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          roughness: 1.0,
          metalness: 0.0,
          toneMapped: false,
        });
        smokeMat.userData.themeLocked = false;
        smokeMat.userData.receivesPlayerAccent = true;
        smokeMat.userData.cartMatRole = "accent";

        const smokeGeo = new THREE.PlaneGeometry(1.2, 1.2);
        smokeGeo.userData.isThemeGeometry = true;

        for (let i = 0; i < 4; i++) {
          const smokePlaneGeo = smokeGeo.clone();
          smokePlaneGeo.userData.isThemeGeometry = true;
          const smoke = new THREE.Mesh(smokePlaneGeo, smokeMat.clone());
          const angle = (i / 4) * Math.PI * 2;
          smoke.position.set(Math.cos(angle) * 0.4, -0.3 + Math.random() * 0.2, Math.sin(angle) * 0.4);
          smoke.rotation.x = -Math.PI / 2;
          smoke.rotation.z = Math.random() * Math.PI;
          smoke.scale.setScalar(0.8 + Math.random() * 0.4);
          smoke.userData.isThemeProp = true;
          smoke.userData.isThemeGeometry = true;
          smoke.userData.receivesPlayerAccent = true;
          smoke.userData.cartMatRole = "accent";
          group.add(smoke);
        }

        const webTex = createGhostWebTexture();
        const webMat = createPhysicalMaterial({
          map: webTex,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.DoubleSide,
          roughness: 0.9,
          metalness: 0.0,
          depthWrite: false,
        });
        webMat.userData.themeLocked = true;

        const webGeo = new THREE.PlaneGeometry(0.7, 0.7);
        webGeo.userData.isThemeGeometry = true;
        const web1 = new THREE.Mesh(webGeo, webMat);
        web1.position.set(0, 0.2, -0.6);
        web1.rotation.y = Math.PI * 0.1;
        web1.userData.isThemeProp = true;
        web1.userData.isThemeGeometry = true;
        group.add(web1);

        const web2 = new THREE.Mesh(webGeo, webMat);
        web2.position.set(0.3, 0.1, -0.2);
        web2.rotation.y = Math.PI * 0.6;
        web2.scale.setScalar(0.6);
        web2.userData.isThemeProp = true;
        web2.userData.isThemeGeometry = true;
        group.add(web2);

        const spiderMat = createPhysicalMaterial({
          color: 0x050505,
          roughness: 0.4,
          metalness: 0.2,
          emissive: new THREE.Color(0x000000),
        });
        spiderMat.userData.themeLocked = true;

        const spider1 = makeSpider(spiderMat, 1.0);
        spider1.position.set(0.15, 0.55, -0.85);
        spider1.rotation.y = -0.5;
        spider1.userData.isThemeProp = true;
        group.add(spider1);

        const spider2 = makeSpider(spiderMat, 0.7);
        spider2.position.set(0.35, 0.15, -0.4);
        spider2.rotation.y = 1.2;
        spider2.userData.isThemeProp = true;
        group.add(spider2);

        const spider3 = makeSpider(spiderMat, 0.5);
        spider3.position.set(-0.2, 0.45, -0.55);
        spider3.rotation.y = 2.5;
        spider3.userData.isThemeProp = true;
        group.add(spider3);

        break;
      }
      case "liminalProps":
      case "rustWelds": {
        const rustTex = createLiminalRustTexture();
        const signTex = createLiminalSignageTexture();

        const frameMesh = getNamedChild(root, "CartFrame");
        if (frameMesh?.material) {
          forEachMaterial(frameMesh.material, (mat) => {
            mat.map = rustTex;
            mat.color.setHex(0xffffff);
            mat.needsUpdate = true;
          });
        }

        const darkMetalMat = createPhysicalMaterial({
          map: rustTex,
          color: 0x5a4a38,
          metalness: 0.65,
          roughness: 0.9,
          clearcoat: 0.02,
          envMapIntensity: getMaterialEnvMapIntensity() * 0.45,
        });
        darkMetalMat.userData.themeLocked = true;

        const signMat = createPhysicalMaterial({
          map: signTex,
          color: 0xffffff,
          metalness: 0.2,
          roughness: 0.85,
          clearcoat: 0.05,
          envMapIntensity: getMaterialEnvMapIntensity() * 0.4,
        });
        signMat.userData.themeLocked = true;

        const weldMat = createPhysicalMaterial({
          color: 0x6b5a42,
          metalness: 0.75,
          roughness: 0.95,
          emissive: new THREE.Color(0x2a2015),
          emissiveIntensity: 0.05,
        });
        weldMat.userData.themeLocked = true;

        const patches = [
          { pos: [-0.48, 0.25, 0.35], rot: [0, -0.3, 0.1], size: [0.22, 0.18], broken: false },
          { pos: [0.38, -0.1, -0.42], rot: [0.15, 0.4, -0.05], size: [0.2, 0.16], broken: false },
          { pos: [0.05, 0.45, -0.78], rot: [-0.1, 0, 0], size: [0.35, 0.2], broken: true },
        ];

        patches.forEach((p, index) => {
          let patchGeo;
          if (p.broken) {
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(p.size[0], 0);
            shape.lineTo(p.size[0], p.size[1] * 0.6);
            shape.lineTo(p.size[0] * 0.7, p.size[1]);
            shape.lineTo(0, p.size[1]);
            patchGeo = new THREE.ShapeGeometry(shape);
          } else {
            patchGeo = new THREE.PlaneGeometry(p.size[0], p.size[1]);
          }

          patchGeo.userData.isThemeGeometry = true;
          const patch = new THREE.Mesh(patchGeo, index === 2 ? signMat : darkMetalMat);
          patch.position.set(...p.pos);
          patch.rotation.set(...p.rot);
          patch.userData.isThemeProp = true;
          patch.userData.isThemeGeometry = true;
          group.add(patch);

          if (index < 2) {
            for (const dx of [-1, 1]) {
              for (const dy of [-1, 1]) {
                const beadGeo = new THREE.SphereGeometry(0.025, 6, 6);
                beadGeo.userData.isThemeGeometry = true;
                const bead = new THREE.Mesh(beadGeo, weldMat);
                bead.position.set(dx * (p.size[0] / 2 * 0.9), dy * (p.size[1] / 2 * 0.9), 0.01);
                patch.add(bead);
                bead.userData.isThemeProp = true;
                bead.userData.isThemeGeometry = true;
              }
            }
          }
        });

        const keyMat = createPhysicalMaterial({
          color: 0x8a8a8a,
          metalness: 0.9,
          roughness: 0.4,
        });
        keyMat.userData.themeLocked = true;

        const keyGroup = new THREE.Group();
        keyGroup.position.set(0.42, 0.55, 0.65);

        const ringGeo = new THREE.TorusGeometry(0.04, 0.008, 6, 12);
        ringGeo.userData.isThemeGeometry = true;
        const ring = new THREE.Mesh(ringGeo, keyMat);
        ring.rotation.x = Math.PI / 2;
        keyGroup.add(ring);

        const shaftGeo = new THREE.BoxGeometry(0.015, 0.12, 0.01);
        shaftGeo.userData.isThemeGeometry = true;
        const shaft = new THREE.Mesh(shaftGeo, keyMat);
        shaft.position.y = -0.1;
        keyGroup.add(shaft);

        const teethGeo = new THREE.BoxGeometry(0.035, 0.02, 0.01);
        teethGeo.userData.isThemeGeometry = true;
        const teeth = new THREE.Mesh(teethGeo, keyMat);
        teeth.position.set(0.01, -0.16, 0);
        keyGroup.add(teeth);

        keyGroup.rotation.z = Math.PI * 0.15;
        keyGroup.rotation.x = -Math.PI * 0.1;

        keyGroup.children.forEach((c) => {
          c.userData.isThemeProp = true;
          c.userData.isThemeGeometry = true;
        });
        group.add(keyGroup);

        break;
      }
      case "cyanEdgeStrips": {
        const stripMat = createPhysicalMaterial({
          color: theme.accentHex,
          emissive: new THREE.Color(theme.accentHex),
          emissiveIntensity: cartEmissiveIntensityForHex(theme.accentHex, theme.frameMaterial.emissiveMul * 2.5),
          metalness: 0.7,
          roughness: 0.2,
          toneMapped: false,
        });
        stripMat.userData.themeLocked = true;
        stripMat.userData.receivesPlayerAccent = true;
        stripMat.userData.cartMatRole = "accent";

        const stripGeo = new THREE.BoxGeometry(0.03, 0.03, 1.5);
        stripGeo.userData.isThemeGeometry = true;
        for (const x of [-0.52, 0.52]) {
          const strip = new THREE.Mesh(stripGeo, stripMat);
          strip.position.set(x, 0.48, 0);
          strip.rotation.z = -0.1;
          strip.userData.isThemeProp = true;
          strip.userData.isThemeGeometry = true;
          strip.userData.receivesPlayerAccent = true;
          strip.userData.cartMatRole = "accent";
          group.add(strip);
        }

        const handleGlowGeo = new THREE.BoxGeometry(0.42, 0.025, 0.025);
        handleGlowGeo.userData.isThemeGeometry = true;
        const handleGlow = new THREE.Mesh(handleGlowGeo, stripMat);
        handleGlow.position.set(0, 0.72, 0.68);
        handleGlow.userData.isThemeProp = true;
        handleGlow.userData.isThemeGeometry = true;
        handleGlow.userData.receivesPlayerAccent = true;
        handleGlow.userData.cartMatRole = "accent";
        group.add(handleGlow);

        const plaqueTex = createSciFiPlaqueTexture();
        const plaqueMat = createPhysicalMaterial({
          map: plaqueTex,
          emissive: new THREE.Color(theme.accentHex),
          emissiveMap: plaqueTex,
          emissiveIntensity: 1.2,
          roughness: 0.3,
          metalness: 0.8,
          toneMapped: false,
        });
        plaqueMat.userData.themeLocked = true;

        const plaqueGeo = new THREE.PlaneGeometry(0.7, 0.35);
        plaqueGeo.userData.isThemeGeometry = true;
        const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
        plaque.position.set(0, 0.15, -0.82);
        plaque.userData.isThemeProp = true;
        plaque.userData.isThemeGeometry = true;
        group.add(plaque);
        break;
      }
      case "atomicFins": {
        const frameMesh = getNamedChild(root, "CartFrame");
        if (frameMesh?.material) {
          const brassTex = createVintageBrassTexture();
          forEachMaterial(frameMesh.material, (mat) => {
            mat.map = brassTex;
            mat.color.setHex(0xffffff);
            mat.needsUpdate = true;
          });
        }

        const woodTex = createVintageWoodTexture();
        const floorMat = createPhysicalMaterial({
          map: woodTex,
          color: 0x8b5a2b,
          roughness: 0.7,
          metalness: 0.1,
          clearcoat: 0.1,
          clearcoatRoughness: 0.4,
          envMapIntensity: getMaterialEnvMapIntensity() * 0.4,
        });
        floorMat.userData.themeLocked = true;

        const floorGeo = new THREE.PlaneGeometry(1.0, 1.5);
        floorGeo.userData.isThemeGeometry = true;
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.38;
        floor.userData.isThemeProp = true;
        floor.userData.isThemeGeometry = true;
        group.add(floor);

        const plaqueTex = createVintagePlaqueTexture();
        const plaqueMat = createPhysicalMaterial({
          map: plaqueTex,
          metalness: 1.0,
          roughness: 0.25,
          clearcoat: 0.5,
          clearcoatRoughness: 0.1,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        plaqueMat.userData.themeLocked = true;

        const handlePlaqueGeo = new THREE.PlaneGeometry(0.4, 0.2);
        handlePlaqueGeo.userData.isThemeGeometry = true;
        const handlePlaque = new THREE.Mesh(handlePlaqueGeo, plaqueMat);
        handlePlaque.position.set(0, 0.74, 0.65);
        handlePlaque.rotation.x = -0.2;
        handlePlaque.userData.isThemeProp = true;
        handlePlaque.userData.isThemeGeometry = true;
        group.add(handlePlaque);

        const starTex = createVintageStarEmblemTexture();
        const starMat = createPhysicalMaterial({
          map: starTex,
          transparent: true,
          metalness: 1.0,
          roughness: 0.3,
          clearcoat: 0.4,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        starMat.userData.themeLocked = true;

        const starGeo = new THREE.PlaneGeometry(0.35, 0.35);
        starGeo.userData.isThemeGeometry = true;
        for (const x of [-0.58, 0.58]) {
          const star = new THREE.Mesh(starGeo, starMat);
          star.position.set(x, 0.35, 0);
          star.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
          star.userData.isThemeProp = true;
          star.userData.isThemeGeometry = true;
          group.add(star);
        }
        break;
      }
      case "constructionProps": {
        const rustTex = createConstructionRustTexture();
        const frameMesh = getNamedChild(root, "CartFrame");
        if (frameMesh?.material) {
          forEachMaterial(frameMesh.material, (mat) => {
            mat.map = rustTex;
            mat.color.setHex(0xffffff);
            mat.roughness = 0.92;
            mat.metalness = 0.78;
            mat.needsUpdate = true;
          });
        }

        const safetyYellow = neonHex || theme.accentHex;
        const tapeTex = createConstructionCautionTapeTexture();
        const safetyYellowMat = createPhysicalMaterial({
          map: tapeTex,
          color: safetyYellow,
          emissive: new THREE.Color(safetyYellow),
          emissiveIntensity: cartEmissiveIntensityForHex(safetyYellow, 0.25),
          roughness: 0.85,
          metalness: 0.0,
        });
        safetyYellowMat.userData.themeLocked = true;
        safetyYellowMat.userData.receivesPlayerAccent = true;
        safetyYellowMat.userData.cartMatRole = "accent";

        const hatMat = createPhysicalMaterial({
          color: safetyYellow,
          emissive: new THREE.Color(safetyYellow),
          emissiveIntensity: cartEmissiveIntensityForHex(safetyYellow, 0.3),
          roughness: 0.55,
          metalness: 0.05,
        });
        hatMat.userData.themeLocked = true;
        hatMat.userData.receivesPlayerAccent = true;
        hatMat.userData.cartMatRole = "accent";

        const hatGroup = new THREE.Group();
        hatGroup.position.set(-0.58, 0.72, 1.14);
        hatGroup.rotation.x = -0.1;
        hatGroup.rotation.z = 0.15;

        const domeGeo = new THREE.SphereGeometry(0.085, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        domeGeo.userData.isThemeGeometry = true;
        const dome = new THREE.Mesh(domeGeo, hatMat);
        dome.userData.isThemeProp = true;
        dome.userData.isThemeGeometry = true;
        dome.userData.receivesPlayerAccent = true;
        dome.userData.cartMatRole = "accent";
        hatGroup.add(dome);

        const brimGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.018, 16);
        brimGeo.userData.isThemeGeometry = true;
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.y = -0.012;
        brim.userData.isThemeProp = true;
        brim.userData.isThemeGeometry = true;
        brim.userData.receivesPlayerAccent = true;
        brim.userData.cartMatRole = "accent";
        hatGroup.add(brim);

        hatGroup.userData.isThemeProp = true;
        group.add(hatGroup);

        const glassesMat = createPhysicalMaterial({
          color: CART_BLACK,
          metalness: 0.4,
          roughness: 0.35,
        });
        glassesMat.userData.themeLocked = true;
        const glasses = makeConstructionSunglasses(glassesMat);
        glasses.position.set(0.02, 0.64, 1.16);
        glasses.rotation.x = 0.35;
        glasses.rotation.y = Math.PI;
        glasses.userData.isThemeProp = true;
        group.add(glasses);

        const tagCanvas = document.createElement("canvas");
        tagCanvas.width = 64;
        tagCanvas.height = 128;
        const tagCtx = tagCanvas.getContext("2d");
        if (tagCtx) {
          tagCtx.fillStyle = "#a8a090";
          tagCtx.fillRect(0, 0, 64, 128);
          tagCtx.fillStyle = "#2a2218";
          tagCtx.font = "bold 18px Arial Black, Arial, sans-serif";
          tagCtx.textAlign = "center";
          tagCtx.fillText("S", 32, 38);
          tagCtx.fillText("I", 32, 62);
          tagCtx.fillText("T", 32, 86);
          tagCtx.fillText("E", 32, 110);
        }
        const tagTex = new THREE.CanvasTexture(tagCanvas);
        tagTex.needsUpdate = true;
        const tagFaceMat = createPhysicalMaterial({
          map: tagTex,
          color: 0xffffff,
          metalness: 0.7,
          roughness: 0.5,
        });
        tagFaceMat.userData.themeLocked = true;
        const tagGeo = new THREE.BoxGeometry(0.035, 0.09, 0.004);
        tagGeo.userData.isThemeGeometry = true;
        const tag = new THREE.Mesh(tagGeo, tagFaceMat);
        tag.position.set(-0.08, 0.58, 1.14);
        tag.rotation.y = Math.PI;
        tag.rotation.z = 0.08;
        tag.userData.isThemeProp = true;
        tag.userData.isThemeGeometry = true;
        group.add(tag);

        const chainMat = createPhysicalMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.4 });
        chainMat.userData.themeLocked = true;
        const chainGeo = new THREE.TorusGeometry(0.012, 0.002, 4, 8, Math.PI);
        chainGeo.userData.isThemeGeometry = true;
        const chain = new THREE.Mesh(chainGeo, chainMat);
        chain.position.set(-0.08, 0.64, 1.14);
        chain.rotation.y = Math.PI / 2;
        chain.userData.isThemeProp = true;
        chain.userData.isThemeGeometry = true;
        group.add(chain);

        const signTex = createConstructionSignTexture();
        const signMat = createPhysicalMaterial({
          map: signTex,
          roughness: 0.75,
          metalness: 0.12,
        });
        signMat.userData.themeLocked = true;

        const signGeo = new THREE.PlaneGeometry(0.58, 0.3);
        signGeo.userData.isThemeGeometry = true;
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, 0.38, -0.86);
        sign.rotation.y = Math.PI;
        sign.userData.isThemeProp = true;
        sign.userData.isThemeGeometry = true;
        group.add(sign);

        const wireMat = createPhysicalMaterial({ color: 0x444444, metalness: 0.85, roughness: 0.55 });
        wireMat.userData.themeLocked = true;
        for (const [x, y] of [[-0.22, 0.28], [0.22, 0.28], [-0.22, 0.48], [0.22, 0.48]]) {
          const wireGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.14, 4);
          wireGeo.userData.isThemeGeometry = true;
          const wire = new THREE.Mesh(wireGeo, wireMat);
          wire.position.set(x * 0.5, y, -0.78);
          wire.rotation.x = 0.55;
          wire.userData.isThemeProp = true;
          wire.userData.isThemeGeometry = true;
          group.add(wire);
        }

        const tapeStripGeo = new THREE.BoxGeometry(0.22, 0.025, 0.025);
        tapeStripGeo.userData.isThemeGeometry = true;
        const tapeStrip = new THREE.Mesh(tapeStripGeo, safetyYellowMat);
        tapeStrip.position.set(0.15, -0.47, -0.55);
        tapeStrip.rotation.y = 0.35;
        tapeStrip.userData.isThemeProp = true;
        tapeStrip.userData.isThemeGeometry = true;
        tapeStrip.userData.receivesPlayerAccent = true;
        tapeStrip.userData.cartMatRole = "accent";
        group.add(tapeStrip);

        const toolMat = createPhysicalMaterial({
          color: 0x9a9a9a,
          metalness: 0.92,
          roughness: 0.35,
        });
        toolMat.userData.themeLocked = true;

        const toolGroup = new THREE.Group();
        toolGroup.position.set(0.48, 0.22, 0.42);
        toolGroup.rotation.z = 0.15;

        const wrench1 = makeConstructionWrench(toolMat, 1.0);
        wrench1.position.set(-0.04, 0, 0);
        wrench1.rotation.z = -0.4;
        wrench1.userData.isThemeProp = true;
        toolGroup.add(wrench1);

        const wrench2 = makeConstructionWrench(toolMat, 0.85);
        wrench2.position.set(0.05, -0.06, 0.02);
        wrench2.rotation.z = 0.55;
        wrench2.userData.isThemeProp = true;
        toolGroup.add(wrench2);

        const measureMat = createPhysicalMaterial({
          color: safetyYellow,
          emissive: new THREE.Color(safetyYellow),
          emissiveIntensity: cartEmissiveIntensityForHex(safetyYellow, 0.15),
          roughness: 0.7,
          metalness: 0.1,
        });
        measureMat.userData.themeLocked = true;
        measureMat.userData.receivesPlayerAccent = true;
        measureMat.userData.cartMatRole = "accent";
        const measureGeo = new THREE.BoxGeometry(0.04, 0.025, 0.025);
        measureGeo.userData.isThemeGeometry = true;
        const measure = new THREE.Mesh(measureGeo, measureMat);
        measure.position.set(0.08, 0.04, 0);
        measure.rotation.z = 0.2;
        measure.userData.isThemeProp = true;
        measure.userData.isThemeGeometry = true;
        measure.userData.receivesPlayerAccent = true;
        measure.userData.cartMatRole = "accent";
        toolGroup.add(measure);

        toolGroup.userData.isThemeProp = true;
        group.add(toolGroup);

        const coneMat = createPhysicalMaterial({
          color: 0xff5500,
          roughness: 0.6,
          metalness: 0.1,
          emissive: new THREE.Color(0xff2200),
          emissiveIntensity: 0.08,
        });
        coneMat.userData.themeLocked = true;

        const stripeMat = createPhysicalMaterial({
          color: 0xf2f0e8,
          roughness: 0.5,
          metalness: 0.05,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.05,
        });
        stripeMat.userData.themeLocked = true;

        const conePositions = [
          { x: -0.28, z: -0.38 },
          { x: 0.3, z: 0.42 },
        ];
        for (const { x, z } of conePositions) {
          const coneGeo = new THREE.ConeGeometry(0.075, 0.14, 12);
          coneGeo.userData.isThemeGeometry = true;
          const cone = new THREE.Mesh(coneGeo, coneMat);
          cone.position.set(x, -0.32, z);
          cone.userData.isThemeProp = true;
          cone.userData.isThemeGeometry = true;
          group.add(cone);

          const stripeGeo = new THREE.CylinderGeometry(0.078, 0.078, 0.025, 12);
          stripeGeo.userData.isThemeGeometry = true;
          const stripe = new THREE.Mesh(stripeGeo, stripeMat);
          stripe.position.set(x, -0.28, z);
          stripe.userData.isThemeProp = true;
          stripe.userData.isThemeGeometry = true;
          group.add(stripe);

          const baseGeo = new THREE.BoxGeometry(0.11, 0.015, 0.11);
          baseGeo.userData.isThemeGeometry = true;
          const coneBase = new THREE.Mesh(baseGeo, coneMat);
          coneBase.position.set(x, -0.39, z);
          coneBase.userData.isThemeProp = true;
          coneBase.userData.isThemeGeometry = true;
          group.add(coneBase);
        }

        break;
      }
      case "corpoProps": {
        const accentHex = neonHex || theme.accentHex;

        const stripMat = createPhysicalMaterial({
          color: accentHex,
          emissive: new THREE.Color(accentHex),
          emissiveIntensity: cartEmissiveIntensityForHex(accentHex, theme.frameMaterial.emissiveMul * 2.0),
          metalness: 0.85,
          roughness: 0.18,
          clearcoat: 0.45,
          clearcoatRoughness: 0.12,
          toneMapped: false,
        });
        stripMat.userData.themeLocked = true;
        stripMat.userData.receivesPlayerAccent = true;
        stripMat.userData.cartMatRole = "accent";

        const chromeMat = createPhysicalMaterial({
          color: theme.baseHex,
          metalness: 0.95,
          roughness: 0.14,
          clearcoat: 0.6,
          clearcoatRoughness: 0.08,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        chromeMat.userData.themeLocked = true;

        const stripGeo = new THREE.BoxGeometry(0.025, 0.025, 1.5);
        stripGeo.userData.isThemeGeometry = true;
        for (const x of [-0.52, 0.52]) {
          const strip = new THREE.Mesh(stripGeo, stripMat);
          strip.position.set(x, 0.48, 0);
          strip.rotation.z = -0.08;
          strip.userData.isThemeProp = true;
          strip.userData.isThemeGeometry = true;
          strip.userData.receivesPlayerAccent = true;
          strip.userData.cartMatRole = "accent";
          group.add(strip);
        }

        const pinGeo = new THREE.BoxGeometry(1.05, 0.008, 0.008);
        pinGeo.userData.isThemeGeometry = true;
        for (const z of [-0.72, 0.72]) {
          const pin = new THREE.Mesh(pinGeo, stripMat.clone());
          pin.position.set(0, 0.28, z);
          pin.userData.isThemeProp = true;
          pin.userData.isThemeGeometry = true;
          pin.userData.receivesPlayerAccent = true;
          pin.userData.cartMatRole = "accent";
          group.add(pin);
        }

        const handleStripeGeo = new THREE.BoxGeometry(0.42, 0.02, 0.02);
        handleStripeGeo.userData.isThemeGeometry = true;
        const handleStripe = new THREE.Mesh(handleStripeGeo, stripMat);
        handleStripe.position.set(0, 0.72, 0.68);
        handleStripe.userData.isThemeProp = true;
        handleStripe.userData.isThemeGeometry = true;
        handleStripe.userData.receivesPlayerAccent = true;
        handleStripe.userData.cartMatRole = "accent";
        group.add(handleStripe);

        const badgeTex = createCorpoAccentTexture();
        const badgeMat = createPhysicalMaterial({
          map: badgeTex,
          emissive: new THREE.Color(accentHex),
          emissiveMap: badgeTex,
          emissiveIntensity: cartEmissiveIntensityForHex(accentHex, 0.9),
          metalness: 0.9,
          roughness: 0.22,
          clearcoat: 0.5,
          clearcoatRoughness: 0.1,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        badgeMat.userData.themeLocked = true;

        const badgeGeo = new THREE.PlaneGeometry(0.62, 0.32);
        badgeGeo.userData.isThemeGeometry = true;
        const badge = new THREE.Mesh(badgeGeo, badgeMat);
        badge.position.set(0, 0.32, -0.84);
        badge.rotation.y = Math.PI;
        badge.userData.isThemeProp = true;
        badge.userData.isThemeGeometry = true;
        group.add(badge);

        const idDiscGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16);
        idDiscGeo.userData.isThemeGeometry = true;
        const idDisc = new THREE.Mesh(idDiscGeo, chromeMat);
        idDisc.position.set(0.38, 0.58, -0.82);
        idDisc.rotation.x = Math.PI / 2;
        idDisc.userData.isThemeProp = true;
        idDisc.userData.isThemeGeometry = true;
        group.add(idDisc);

        const idEmblemGeo = new THREE.PlaneGeometry(0.05, 0.05);
        idEmblemGeo.userData.isThemeGeometry = true;
        const idEmblem = new THREE.Mesh(idEmblemGeo, stripMat.clone());
        idEmblem.position.set(0.38, 0.58, -0.826);
        idEmblem.rotation.y = Math.PI;
        idEmblem.userData.isThemeProp = true;
        idEmblem.userData.isThemeGeometry = true;
        idEmblem.userData.receivesPlayerAccent = true;
        idEmblem.userData.cartMatRole = "accent";
        group.add(idEmblem);

        const rimGeo = new THREE.TorusGeometry(0.55, 0.012, 8, 32, Math.PI);
        rimGeo.userData.isThemeGeometry = true;
        const rim = new THREE.Mesh(rimGeo, stripMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.set(0, 0.52, 0);
        rim.userData.isThemeProp = true;
        rim.userData.isThemeGeometry = true;
        rim.userData.receivesPlayerAccent = true;
        rim.userData.cartMatRole = "accent";
        group.add(rim);

        const chromeCapGeo = new THREE.BoxGeometry(0.06, 0.06, 0.04);
        chromeCapGeo.userData.isThemeGeometry = true;
        for (const [x, z] of [[-0.5, -0.7], [0.5, -0.7], [-0.5, 0.7], [0.5, 0.7]]) {
          const cap = new THREE.Mesh(chromeCapGeo, chromeMat);
          cap.position.set(x, 0.54, z);
          cap.userData.isThemeProp = true;
          cap.userData.isThemeGeometry = true;
          group.add(cap);
        }

        const skirtGeo = new THREE.BoxGeometry(1.12, 0.014, 0.02);
        skirtGeo.userData.isThemeGeometry = true;
        const skirt = new THREE.Mesh(skirtGeo, chromeMat);
        skirt.position.set(0, -0.36, -0.78);
        skirt.userData.isThemeProp = true;
        skirt.userData.isThemeGeometry = true;
        group.add(skirt);

        break;
      }
      case "luxuryProps": {
        const goldTex = createLuxuryGoldTexture();
        const frameMesh = getNamedChild(root, "CartFrame");
        if (frameMesh?.material) {
          forEachMaterial(frameMesh.material, (mat) => {
            mat.map = goldTex;
            mat.color.setHex(0xffffff);
            mat.metalness = 0.95;
            mat.roughness = 0.15;
            mat.clearcoat = 0.6;
            mat.needsUpdate = true;
          });
        }

        const accentHex = neonHex || theme.accentHex;
        const trimMat = createPhysicalMaterial({
          color: accentHex,
          emissive: new THREE.Color(accentHex),
          emissiveIntensity: cartEmissiveIntensityForHex(accentHex, theme.frameMaterial.emissiveMul * 0.6),
          metalness: 0.95,
          roughness: 0.12,
          clearcoat: 0.65,
          clearcoatRoughness: 0.08,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        trimMat.userData.themeLocked = true;
        trimMat.userData.receivesPlayerAccent = true;
        trimMat.userData.cartMatRole = "accent";

        const trimGeo = new THREE.TorusGeometry(0.55, 0.022, 8, 32, Math.PI);
        trimGeo.userData.isThemeGeometry = true;
        const trim = new THREE.Mesh(trimGeo, trimMat);
        trim.rotation.x = Math.PI / 2;
        trim.position.set(0, 0.52, 0);
        trim.userData.isThemeProp = true;
        trim.userData.isThemeGeometry = true;
        trim.userData.receivesPlayerAccent = true;
        trim.userData.cartMatRole = "accent";
        group.add(trim);

        const innerTrimGeo = new THREE.TorusGeometry(0.48, 0.01, 8, 32, Math.PI);
        innerTrimGeo.userData.isThemeGeometry = true;
        const innerTrim = new THREE.Mesh(innerTrimGeo, trimMat.clone());
        innerTrim.rotation.x = Math.PI / 2;
        innerTrim.position.set(0, 0.5, 0);
        innerTrim.userData.isThemeProp = true;
        innerTrim.userData.isThemeGeometry = true;
        innerTrim.userData.receivesPlayerAccent = true;
        innerTrim.userData.cartMatRole = "accent";
        group.add(innerTrim);

        const pinGeo = new THREE.BoxGeometry(0.006, 0.9, 0.006);
        pinGeo.userData.isThemeGeometry = true;
        for (const x of [-0.54, 0.54]) {
          const pin = new THREE.Mesh(pinGeo, trimMat.clone());
          pin.position.set(x, 0.1, 0);
          pin.userData.isThemeProp = true;
          pin.userData.isThemeGeometry = true;
          pin.userData.receivesPlayerAccent = true;
          pin.userData.cartMatRole = "accent";
          group.add(pin);
        }

        const lipGeo = new THREE.BoxGeometry(1.08, 0.012, 0.012);
        lipGeo.userData.isThemeGeometry = true;
        for (const z of [-0.74, 0.74]) {
          const lip = new THREE.Mesh(lipGeo, trimMat.clone());
          lip.position.set(0, 0.56, z);
          lip.userData.isThemeProp = true;
          lip.userData.isThemeGeometry = true;
          lip.userData.receivesPlayerAccent = true;
          lip.userData.cartMatRole = "accent";
          group.add(lip);
        }

        const crestTex = createLuxuryCrestTexture();
        const crestMat = createPhysicalMaterial({
          map: crestTex,
          transparent: true,
          metalness: 1.0,
          roughness: 0.2,
          clearcoat: 0.55,
          clearcoatRoughness: 0.08,
          envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
        });
        crestMat.userData.themeLocked = true;

        const crestGeo = new THREE.PlaneGeometry(0.32, 0.32);
        crestGeo.userData.isThemeGeometry = true;
        for (const x of [-0.58, 0.58]) {
          const crest = new THREE.Mesh(crestGeo, crestMat);
          crest.position.set(x, 0.38, 0);
          crest.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
          crest.userData.isThemeProp = true;
          crest.userData.isThemeGeometry = true;
          group.add(crest);
        }

        const rearCrestGeo = new THREE.PlaneGeometry(0.42, 0.42);
        rearCrestGeo.userData.isThemeGeometry = true;
        const rearCrest = new THREE.Mesh(rearCrestGeo, crestMat);
        rearCrest.position.set(0, 0.42, -0.84);
        rearCrest.rotation.y = Math.PI;
        rearCrest.userData.isThemeProp = true;
        rearCrest.userData.isThemeGeometry = true;
        group.add(rearCrest);

        const handleCrestGeo = new THREE.PlaneGeometry(0.22, 0.22);
        handleCrestGeo.userData.isThemeGeometry = true;
        const handleCrest = new THREE.Mesh(handleCrestGeo, crestMat);
        handleCrest.position.set(0, 0.74, 0.66);
        handleCrest.rotation.x = -0.2;
        handleCrest.userData.isThemeProp = true;
        handleCrest.userData.isThemeGeometry = true;
        group.add(handleCrest);

        const finialGeo = new THREE.SphereGeometry(0.028, 8, 8);
        finialGeo.userData.isThemeGeometry = true;
        for (const [x, z] of [[-0.52, -0.72], [0.52, -0.72], [-0.52, 0.72], [0.52, 0.72]]) {
          const finial = new THREE.Mesh(finialGeo, trimMat.clone());
          finial.position.set(x, 0.58, z);
          finial.userData.isThemeProp = true;
          finial.userData.isThemeGeometry = true;
          finial.userData.receivesPlayerAccent = true;
          finial.userData.cartMatRole = "accent";
          group.add(finial);
        }

        const handleBandGeo = new THREE.TorusGeometry(0.05, 0.008, 6, 16);
        handleBandGeo.userData.isThemeGeometry = true;
        for (const z of [0.62, 0.74]) {
          const band = new THREE.Mesh(handleBandGeo, trimMat.clone());
          band.position.set(0, 0.72, z);
          band.rotation.y = Math.PI / 2;
          band.userData.isThemeProp = true;
          band.userData.isThemeGeometry = true;
          band.userData.receivesPlayerAccent = true;
          band.userData.cartMatRole = "accent";
          group.add(band);
        }

        break;
      }
      default:
        break;
    }
  }

  void neonHex;
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 * @param {number} neonHex
 */
function rebuildThemeProps(root, theme, neonHex) {
  removeNamedGroup(root, PROPS_GROUP_NAME);
  if (!theme.propIds.length) return;

  const group = new THREE.Group();
  group.name = PROPS_GROUP_NAME;
  buildThemeProps(root, group, theme, neonHex);
  root.add(group);
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyPatternPolicy(root, theme) {
  if (theme.patternPolicy !== "disable") return;
  const patternMesh = getNamedChild(root, "CartFramePattern");
  if (patternMesh) patternMesh.visible = false;
}

/**
 * @param {THREE.Object3D} cartMesh
 * @returns {CartThemeMaterialCache}
 */
export function buildCartThemeMaterialCache(cartMesh) {
  if (cartMesh?.userData?.isRaveGltf) {
    return buildRaveGltfMaterialCache(cartMesh);
  }

  const frameMats = [];
  const frameBodyMats = [];
  const accentMats = [];
  const frameGlowMats = [];
  const seen = new Set();

  cartMesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const ud = child.userData || {};
    if (ud.isFace || ud.isHandle || ud.isWheel || ud.isCartPatternLayer) return;
    if (ud.isThemeProp && ud.cartMatRole !== "accent" && !ud.receivesPlayerAccent) return;

    forEachMaterial(child.material, (mat) => {
      if (seen.has(mat)) return;
      seen.add(mat);
      if (ud.cartMatRole === "accent") accentMats.push(mat);
      else frameBodyMats.push(mat);
      frameMats.push(mat);
      if (mat.emissive) frameGlowMats.push(mat);
    });
  });

  return { frameMats, frameBodyMats, accentMats, frameGlowMats };
}

/**
 * Theme-aware color tint — does not overwrite theme-owned PBR params.
 *
 * @param {CartThemeMaterialCache | null | undefined} cache
 * @param {CartThemeId | string} themeId
 * @param {number} neonHex
 * @param {number} [intensityMul=1]
 */
export function applyThemeColorToCache(cache, themeId, neonHex, intensityMul = 1) {
  if (!cache) return;

  if (cache.isRaveGltf) {
    applyRaveGltfColorToCache(cache, neonHex, intensityMul);
    return;
  }

  const theme = getCartTheme(themeId);
  const { colorPolicy, baseHex, accentHex } = theme;
  const bodyMul = intensityMul;
  const accentMul = intensityMul;

  if (colorPolicy === "neonFull") {
    for (const mat of cache.frameMats) applyTintToMaterial(mat, neonHex, theme, bodyMul);
    return;
  }

  const bodyEmMul = bodyMul * 0.3;
  for (const mat of cache.frameBodyMats) applyTintToMaterial(mat, baseHex, theme, bodyEmMul);

  if (colorPolicy === "accentTint") {
    for (const mat of cache.accentMats) applyTintToMaterial(mat, neonHex, theme, accentMul);
  } else if (colorPolicy === "fixedBase") {
    for (const mat of cache.accentMats) applyTintToMaterial(mat, accentHex, theme, accentMul * 0.5);
  }
}

/**
 * Leader pulse that respects theme color roles.
 *
 * @param {CartThemeMaterialCache} cache
 * @param {CartThemeId | string} themeId
 * @param {number} neonHex
 * @param {number} glowPulse 0–1
 * @param {number} glowIntensity
 */
export function applyThemeLeaderGlow(cache, themeId, neonHex, glowPulse, glowIntensity) {
  const theme = getCartTheme(themeId);
  const whiteMix = glowPulse ** 3;
  const baseIntensity = cartEmissiveIntensityForHex(emissiveRefHexForNeonHex(neonHex));

  const pulseMat = (mat, hex) => {
    if (!mat?.emissive) return;
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    mat.emissive.setRGB(
      r + (1 - r) * whiteMix,
      g + (1 - g) * whiteMix,
      b + (1 - b) * whiteMix,
    );
    if (mat.color) mat.color.setHex(hex);
    if (typeof mat.emissiveIntensity === "number") {
      mat.emissiveIntensity = baseIntensity * (1 - whiteMix) + glowIntensity * whiteMix;
    }
  };

  if (cache.isRaveGltf) {
    applyRaveGltfLeaderGlow(cache, neonHex, glowPulse, glowIntensity);
    return;
  }

  if (theme.colorPolicy === "neonFull") {
    for (const mat of cache.frameGlowMats) pulseMat(mat, neonHex);
    return;
  }

  for (const mat of cache.frameBodyMats) pulseMat(mat, theme.baseHex);
  const accentHex = theme.colorPolicy === "fixedBase" ? theme.accentHex : neonHex;
  for (const mat of cache.accentMats) pulseMat(mat, accentHex);
}

/**
 * @param {THREE.Object3D | null | undefined} root
 * @param {CartThemeId | string} themeId
 * @param {number} neonHex
 */
export function applyCartTheme(root, themeId, neonHex) {
  if (!root) return;

  const theme = getCartTheme(themeId);
  const id = normalizeThemeId(themeId);
  root.userData.cartThemeId = id;

  const frameMesh = getNamedChild(root, "CartFrame");
  if (frameMesh?.isMesh && frameMesh.material) {
    forEachMaterial(frameMesh.material, (mat) => {
      applyFrameMaterialPreset(mat, theme.frameMaterial, theme.ghost);
    });
  }

  applyHandleStyle(root, theme);
  applyWheelModule(root, theme, neonHex);
  rebuildThemeProps(root, theme, neonHex);
  applyFacePolicy(root, theme);
  applyPatternPolicy(root, theme);
  tagFrameAndAccentMeshes(root);

  const cache = buildCartThemeMaterialCache(root);
  applyThemeColorToCache(cache, id, neonHex);
}

/**
 * Disposes per-cart theme-only geometries/materials (props, pads, whitewalls).
 * @param {THREE.Object3D | null | undefined} mesh
 */
export function disposeCartThemeResources(mesh) {
  if (!mesh) return;
  removeHoverPads(mesh);
  removeWhitewallRings(mesh);
  removeWoodHubs(mesh);
  removeConstructionTires(mesh);
  const propsGroup = getNamedChild(mesh, PROPS_GROUP_NAME);
  if (propsGroup) {
    disposeThemeSubtree(propsGroup);
    mesh.remove(propsGroup);
  }
}
