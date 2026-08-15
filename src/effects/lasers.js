/**
 * lasers.js — Stage, arena, and sky laser beams (additive sweep fans).
 *
 * Extracted from src/effects.js (EFFECTS-SPLIT-1). `laserEntries` is an exported
 * live binding read by effects.js (setRaveExtrasVisible / applyRaveExtrasQuality).
 * initLasers anchors stage beams to the stage group, imported from stage.js.
 */

import * as THREE from "three";
import { registerMirrorExclude } from "../utils/cheapMirror.js";
import { sampleArenaReactive } from "../levels/arenaReactiveLights.js";
import { stageGroup } from "./stage.js";

/** @typedef {import("../effects/ambientParticles.js").CartColorMap} CartColorMap */

/** @type {{
 *   mesh: THREE.Mesh,
 *   sheathMat?: THREE.MeshBasicMaterial,
 *   coreMat?: THREE.MeshBasicMaterial,
 *   band?: "stage" | "arena" | "sky" | "deck",
 *   index: number,
 *   speed: number,
 *   phaseStep: number,
 *   amplitude: number,
 *   baseZ: number,
 * }[]} */
let laserEntries = [];

const laserPositionScratch = new THREE.Vector3();

/**
 * @param {THREE.Scene} scene
 * @param {{
 *   position: THREE.Vector3,
 *   color: number,
 *   radius: number,
 *   length: number,
 *   opacity: number,
 *   tiltX: number,
 *   index: number,
 *   speed: number,
 *   phaseStep: number,
 *   amplitude: number,
 *   baseQuaternion?: THREE.Quaternion,
 *   faceCenter?: boolean,
 *   band?: "stage" | "arena" | "sky" | "deck",
 * }} opts
 */
function addLaserBeam(scene, {
  position,
  color,
  radius,
  length,
  opacity,
  tiltX,
  index,
  speed,
  phaseStep,
  amplitude,
  baseQuaternion,
  faceCenter = false,
  band = "stage",
}) {
  const laserGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
  laserGeo.translate(0, length / 2, 0);
  // * toneMapped: false pushes the beams past the bloom threshold so they read as
  // * actual light sources, not tinted geometry.
  const laserMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  laserMat.toneMapped = false;
  laserMat.userData.baseOpacity = opacity;
  laserMat.userData.baseColor = new THREE.Color(color);
  const laser = new THREE.Mesh(laserGeo, laserMat);

  // * Hot white core inside the colored sheath — the classic laser look.
  const coreGeo = new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, length, 6);
  coreGeo.translate(0, length / 2, 0);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: Math.min(1, opacity * 0.9),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  coreMat.toneMapped = false;
  coreMat.userData.baseOpacity = Math.min(1, opacity * 0.9);
  laser.add(new THREE.Mesh(coreGeo, coreMat));

  laser.position.copy(position);
  if (baseQuaternion) {
    laser.quaternion.copy(baseQuaternion);
  } else if (faceCenter) {
    laser.lookAt(0, 0, 0);
  }
  laser.rotateX(tiltX);
  scene.add(laser);
  registerMirrorExclude(laser);
  laserEntries.push({
    mesh: laser,
    sheathMat: laserMat,
    coreMat,
    band,
    index,
    speed,
    phaseStep,
    amplitude,
    baseZ: laser.rotation.z,
  });
}


/**
 * Builds stage, arena, and sky laser beams. Call after `initStage`.
 * @param {THREE.Scene} scene
 * @param {number} pitInnerRadius
 * @param {CartColorMap} cartColors
 */
export function initLasers(scene, pitInnerRadius, cartColors) {
  if (!stageGroup) return;

  laserEntries = [];
  const stageLightPalette = Object.values(cartColors).map((entry) => entry.hex);

  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const lx = -10 + t * 20;
    addLaserBeam(scene, {
      position: stageGroup.localToWorld(laserPositionScratch.set(lx, 18, 0)),
      color: stageLightPalette[i % stageLightPalette.length],
      radius: 0.15,
      length: 80,
      opacity: 0.6,
      tiltX: -Math.PI * 0.3,
      index: i,
      speed: 0.5,
      phaseStep: 1.05,
      amplitude: 0.6,
      baseQuaternion: stageGroup.quaternion,
      band: "stage",
    });
  }

  // * Arena ring lives in the open moat between the pit rim and the lower bowl —
  // * field-edge pyro that stays fully visible instead of poking through seating.
  const arenaLaserRadius = pitInnerRadius + 1.5;
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    addLaserBeam(scene, {
      position: new THREE.Vector3(
        Math.cos(angle) * arenaLaserRadius,
        -3,
        Math.sin(angle) * arenaLaserRadius,
      ),
      color: stageLightPalette[i % stageLightPalette.length],
      radius: 0.12,
      length: 80,
      opacity: 0.5,
      tiltX: -Math.PI * 0.35,
      index: i,
      speed: 0.4,
      phaseStep: 0.52,
      amplitude: 0.5,
      faceCenter: true,
      band: "arena",
    });
  }

  // * Sky ring fires from the upper-deck rim (r matches the stadium bowl's top deck
  // * edge, base on its parapet) — coliseum skyline beams instead of buried bases.
  const skyLaserRadius = pitInnerRadius + 79.7;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    addLaserBeam(scene, {
      position: new THREE.Vector3(
        Math.cos(angle) * skyLaserRadius,
        33.2,
        Math.sin(angle) * skyLaserRadius,
      ),
      color: i % 2 === 0 ? 0xff2bd6 : 0x22e6ff,
      radius: 0.18,
      length: 120,
      opacity: 0.45,
      tiltX: -Math.PI * 0.4,
      index: i,
      speed: 0.3,
      phaseStep: 0.79,
      amplitude: 0.7,
      faceCenter: true,
      band: "sky",
    });
  }

  // * Deck rings — beams firing from the mid and upper deck front edges (radii/
  // * heights match the stadium decks in initCrowd) so the whole bowl joins the
  // * light show instead of just the field edge and the rim.
  // * Gated to High via laserBudget "full" (Medium keeps stage/arena/sky only).
  const deckLaserRings = [
    { r: pitInnerRadius + 33.7, y: 12.3, count: 10, radius: 0.12, length: 90, opacity: 0.55, tiltX: -Math.PI * 0.38, speed: 0.45, phaseStep: 0.61 },
    { r: pitInnerRadius + 59.7, y: 25.3, count: 10, radius: 0.14, length: 100, opacity: 0.5, tiltX: -Math.PI * 0.42, speed: 0.35, phaseStep: 0.87 },
  ];
  let deckBeamIndex = 0;
  for (const ring of deckLaserRings) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = ((i + 0.5) / ring.count) * Math.PI * 2;
      addLaserBeam(scene, {
        position: new THREE.Vector3(
          Math.cos(angle) * ring.r,
          ring.y,
          Math.sin(angle) * ring.r,
        ),
        color: stageLightPalette[deckBeamIndex % stageLightPalette.length],
        radius: ring.radius,
        length: ring.length,
        opacity: ring.opacity,
        tiltX: ring.tiltX,
        index: deckBeamIndex,
        speed: ring.speed,
        phaseStep: ring.phaseStep,
        amplitude: 0.55,
        faceCenter: true,
        band: "deck",
      });
      deckBeamIndex += 1;
    }
  }
}


/**
 * Rotates laser beam meshes with sinusoidal wobble.
 * @param {number} nowMs Current time (ms).
 */
const _laserReactiveColor = new THREE.Color();

export function updateLasers(nowMs) {
  if (laserEntries.length === 0) return;
  const nowSec = nowMs * 0.001;
  const reactive = sampleArenaReactive(nowMs);
  // * Subtle leader lean; KO still gets a stronger flash. Idle keeps pure palette colors.
  const leaderMix = reactive.hasLeader ? 0.12 : 0;
  const koT = reactive.koT;
  const wantsLaserTint = leaderMix > 0 || koT > 0;
  for (const entry of laserEntries) {
    entry.mesh.rotation.z =
      entry.baseZ +
      Math.sin(nowSec * entry.speed + entry.index * entry.phaseStep) *
        entry.amplitude * (1 + koT * 0.35);
    if (entry.sheathMat?.userData?.baseColor) {
      if (wantsLaserTint) {
        _laserReactiveColor
          .copy(entry.sheathMat.userData.baseColor)
          .lerp(reactive.accentColor, leaderMix + koT * 0.55);
        entry.sheathMat.color.copy(_laserReactiveColor);
        entry.sheathMat.opacity =
          (entry.sheathMat.userData.baseOpacity ?? 0.5) * (1 + koT * 0.75);
      } else {
        entry.sheathMat.color.copy(entry.sheathMat.userData.baseColor);
        entry.sheathMat.opacity = entry.sheathMat.userData.baseOpacity ?? 0.5;
      }
    }
    if (entry.coreMat) {
      entry.coreMat.opacity =
        (entry.coreMat.userData.baseOpacity ?? 0.5) * (1 + koT * 1.1);
    }
  }
}


export { laserEntries };
