// sceneSetup.js — skybox, environment visuals, spotlights, ground plane

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { CONFIG, CART_COLORS } from "./config.js";

/**
 * @param {Array<[number, string]>} stops
 * @param {{ disposables: object[] }} ctx
 * @returns {THREE.CanvasTexture}
 */
function createRadialTexture(stops, ctx) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const gradCtx = canvas.getContext("2d");
  const grad = gradCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
  gradCtx.fillStyle = grad;
  gradCtx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  ctx.disposables.push(tex);
  return tex;
}

/**
 * @param {THREE.Scene} scene
 * @param {{ addToScene: Function, disposables: object[], createRadialTexture: Function }} ctx
 */
function createStarfield(scene, ctx) {
  const starCount = 4000;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 150 + Math.random() * 80;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta));
    starPositions[i * 3 + 2] = r * Math.cos(phi);

    const tint = Math.random();
    if (tint < 0.15) starColors.set([1, 0.2, 0.85], i * 3);
    else if (tint < 0.3) starColors.set([0.15, 0.9, 1], i * 3);
    else if (tint < 0.38) starColors.set([1, 1, 0.4], i * 3);
    else {
      const b = 0.8 + Math.random() * 0.2;
      starColors.set([b, b, b], i * 3);
    }
  }

  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

  const starTexture = createRadialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.15, "rgba(255,255,255,0.8)"],
    [0.4, "rgba(255,255,255,0.15)"],
    [1, "rgba(255,255,255,0)"],
  ], ctx);

  const starMat = new THREE.PointsMaterial({
    size: 1.5,
    map: starTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  ctx.addToScene(new THREE.Points(starGeo, starMat));
  ctx.disposables.push(starGeo, starMat);
}

/**
 * @param {THREE.Scene} scene
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createNebulaClouds(scene, ctx) {
  const nebulaColors = [0x6600aa, 0xaa0066, 0x003366, 0x220044, 0x660033];
  const sharedGeo = new THREE.SphereGeometry(1, 16, 16);

  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: nebulaColors[i % nebulaColors.length],
      transparent: true,
      opacity: 0.06 + Math.random() * 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });

    const mesh = new THREE.Mesh(sharedGeo, mat);
    const scale = 20 + Math.random() * 30;
    mesh.scale.set(scale, scale, scale);

    const theta = Math.random() * Math.PI * 2;
    const phi = 0.3 + Math.random() * 1.0;
    const r = 120 + Math.random() * 50;
    mesh.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );

    ctx.addToScene(mesh);
    ctx.disposables.push(mat);
  }
  ctx.disposables.push(sharedGeo);
}

/**
 * @param {THREE.Scene} scene
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createPlanets(scene, ctx) {
  const planetConfigs = [
    { radius: 8, color: 0x993366, pos: [100, 70, -80], ring: true, ringColor: 0xcc6699 },
    { radius: 5, color: 0x334488, pos: [-120, 55, -60], ring: false },
    { radius: 3, color: 0x886633, pos: [60, 90, 100], ring: false },
  ];

  const sharedGeo = new THREE.SphereGeometry(1, 24, 24);

  for (const p of planetConfigs) {
    const mat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.5 });
    const planet = new THREE.Mesh(sharedGeo, mat);
    planet.position.set(...p.pos);
    planet.scale.setScalar(p.radius);
    ctx.addToScene(planet);
    ctx.disposables.push(mat);

    if (p.ring) {
      const ringGeo = new THREE.TorusGeometry(p.radius * 1.6, 0.4, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: p.ringColor,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI * 0.35;
      ring.position.set(...p.pos);
      ctx.addToScene(ring);
      ctx.disposables.push(ringGeo, ringMat);
    }
  }
  ctx.disposables.push(sharedGeo);
}

/**
 * @param {THREE.Scene} scene
 * @param {{ addToScene: Function, disposables: object[], createRadialTexture: Function }} ctx
 */
function createGalaxies(scene, ctx) {
  const galaxyConfigs = [
    { pos: [-80, 100, -130], color: 0x6644aa, size: 12 },
    { pos: [130, 85, -100], color: 0xaa4466, size: 8 },
  ];

  const sharedTex = createRadialTexture([
    [0, "rgba(255,255,255,0.6)"],
    [0.3, "rgba(180,120,220,0.3)"],
    [1, "rgba(0,0,0,0)"],
  ], ctx);

  for (const g of galaxyConfigs) {
    const mat = new THREE.SpriteMaterial({
      map: sharedTex,
      color: g.color,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const galaxy = new THREE.Sprite(mat);
    galaxy.scale.set(g.size, g.size * 0.5, 1);
    galaxy.position.set(...g.pos);
    ctx.addToScene(galaxy);
    ctx.disposables.push(mat);
  }
}

/**
 * @param {THREE.Scene} scene
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createUfos(scene, ctx) {
  const ufoEntries = [];
  const sharedBodyGeo = new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const sharedDomeGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const sharedRingGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 24);
  const ringColors = [0x00ff88, 0xff00ff, 0x00ffff];

  for (let i = 0; i < 3; i++) {
    const ufoGroup = new THREE.Group();

    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    ufoGroup.add(new THREE.Mesh(sharedBodyGeo, bodyMat));

    const domeMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 });
    const dome = new THREE.Mesh(sharedDomeGeo, domeMat);
    dome.position.y = 0.3;
    ufoGroup.add(dome);

    const ringMat = new THREE.MeshBasicMaterial({
      color: ringColors[i],
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(sharedRingGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ufoGroup.add(ring);

    ufoGroup.scale.set(2, 2, 2);
    ctx.addToScene(ufoGroup);

    ufoEntries.push({
      group: ufoGroup,
      orbitRadius: 100 + i * 20,
      orbitSpeed: 0.03 + i * 0.01,
      orbitHeight: 15 + i * 8,
      phaseOffset: i * Math.PI * 0.66,
    });

    ctx.disposables.push(bodyMat, domeMat, ringMat);
  }
  ctx.disposables.push(sharedBodyGeo, sharedDomeGeo, sharedRingGeo);

  return {
    update: (timeMs) => {
      const t = timeMs * 0.001;
      for (const ufo of ufoEntries) {
        const angle = t * ufo.orbitSpeed + ufo.phaseOffset;
        ufo.group.position.set(
          Math.cos(angle) * ufo.orbitRadius,
          ufo.orbitHeight + Math.sin(angle * 2) * 10,
          Math.sin(angle) * ufo.orbitRadius,
        );
        ufo.group.rotation.y = angle + Math.PI;
      }
    },
  };
}

/**
 * @param {THREE.Scene} scene
 * @param {number} pitInnerRadius
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createGround(scene, pitInnerRadius, ctx) {
  const sharedGeo = new THREE.RingGeometry(pitInnerRadius, 150, 64);

  const discMat = new THREE.MeshStandardMaterial({
    color: 0x1e1e3a,
    metalness: 0.2,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const groundDisc = new THREE.Mesh(sharedGeo, discMat);
  groundDisc.rotation.x = -Math.PI / 2;
  groundDisc.position.y = -3;
  ctx.addToScene(groundDisc);

  const gridMat = new THREE.MeshBasicMaterial({
    color: 0x2a2a5a,
    wireframe: true,
    opacity: 0.25,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  const groundGrid = new THREE.Mesh(sharedGeo, gridMat);
  groundGrid.rotation.x = -Math.PI / 2;
  groundGrid.position.y = -2.99;
  ctx.addToScene(groundGrid);

  ctx.disposables.push(sharedGeo, discMat, gridMat);
}

/**
 * @param {THREE.Scene} scene
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createHorizonFog(scene, ctx) {
  const geo = new THREE.CylinderGeometry(150, 150, 40, 64, 8, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color(0x0a0520) } },
    vertexShader: `
      varying float vY;
      void main() {
        vY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vY;
      void main() {
        float fade = smoothstep(20.0, -10.0, vY);
        gl_FragColor = vec4(uColor, fade * 0.5);
      }
    `,
  });
  const horizonFog = new THREE.Mesh(geo, mat);
  horizonFog.position.y = -3;
  ctx.addToScene(horizonFog);
  ctx.disposables.push(geo, mat);
}

/**
 * @param {THREE.Scene} scene
 * @param {{ platformTopY: number, recordSurfaceGlowY: number }} yRefs
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createSpotlightSystem(scene, yRefs, ctx) {
  const { platformTopY, recordSurfaceGlowY } = yRefs;
  const spotlightBeamAxisY = new THREE.Vector3(0, 1, 0);
  const spotlightBeamMid = new THREE.Vector3();
  const spotlightBeamDir = new THREE.Vector3();
  const spotlightLightPosScratch = new THREE.Vector3();
  const spotlightTargetScratch = new THREE.Vector3();

  const spotlightPoolTextureCanvas = document.createElement("canvas");
  spotlightPoolTextureCanvas.width = 128;
  spotlightPoolTextureCanvas.height = 128;
  const spotlightPoolTextureCtx = spotlightPoolTextureCanvas.getContext("2d");
  const spotlightPoolGradient = spotlightPoolTextureCtx.createRadialGradient(
    64,
    64,
    0,
    64,
    64,
    64,
  );
  spotlightPoolGradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
  spotlightPoolGradient.addColorStop(0.45, "rgba(255, 255, 255, 0.28)");
  spotlightPoolGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  spotlightPoolTextureCtx.fillStyle = spotlightPoolGradient;
  spotlightPoolTextureCtx.fillRect(0, 0, 128, 128);
  const spotlightPoolTexture = new THREE.CanvasTexture(spotlightPoolTextureCanvas);
  spotlightPoolTexture.needsUpdate = true;
  ctx.disposables.push(spotlightPoolTexture);

  function positionSpotlightBeam(beamGroup, source, target) {
    beamGroup.position.copy(spotlightBeamMid.copy(source).add(target).multiplyScalar(0.5));
    beamGroup.quaternion.setFromUnitVectors(
      spotlightBeamAxisY,
      spotlightBeamDir.copy(source).sub(target).normalize(),
    );
  }

  function addSpotlightWithBeam({ color, position, intensity, target }) {
    const light = new THREE.SpotLight(color, intensity, 60, Math.PI / 8.75, 0.2, 1.1);
    light.position.copy(position);
    light.target.position.set(target.x, platformTopY, target.z);
    ctx.addToScene(light);
    ctx.addToScene(light.target);

    const beamTarget = new THREE.Vector3(target.x, platformTopY, target.z);
    const height = Math.max(0.01, position.y - platformTopY);
    const beamGroup = new THREE.Group();
    const beamLayers = [
      { sourceRadius: 0.45, floorRadius: 1.2, opacity: 0.1 },
      { sourceRadius: 0.65, floorRadius: 1.8, opacity: 0.055 },
      { sourceRadius: 0.9, floorRadius: 2.6, opacity: 0.025 },
    ];

    for (const layer of beamLayers) {
      const beamGeo = new THREE.CylinderGeometry(
        layer.sourceRadius,
        layer.floorRadius,
        height,
        24,
        1,
        true,
      );
      const beamMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      beamGroup.add(new THREE.Mesh(beamGeo, beamMat));
      ctx.disposables.push(beamGeo, beamMat);
    }

    positionSpotlightBeam(beamGroup, position, beamTarget);
    ctx.addToScene(beamGroup);

    const glowGeo = new THREE.CircleGeometry(5.25, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      map: spotlightPoolTexture,
      color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.set(beamTarget.x, recordSurfaceGlowY, beamTarget.z);
    glowMesh.renderOrder = 2;
    ctx.addToScene(glowMesh);
    ctx.disposables.push(glowGeo, glowMat);

    return { light, beamGroup, glowMesh };
  }

  const spotlightEntries = [];
  const spotlightPositionRadius = CONFIG.record.radius * 0.7;
  const spotlightHeight = 25;
  const spotlightIntensity = 12;
  const spotlightDriftAmplitudeRad = (18 * Math.PI) / 180;
  const spotlightConfigs = [
    { color: CART_COLORS.pink.hex, angleDeg: -90, driftSpeed: 0.056, phase: 0.0 },
    { color: CART_COLORS.blue.hex, angleDeg: -18, driftSpeed: 0.0455, phase: 1.4 },
    { color: CART_COLORS.green.hex, angleDeg: 54, driftSpeed: 0.0525, phase: 2.8 },
    { color: CART_COLORS.yellow.hex, angleDeg: 126, driftSpeed: 0.0385, phase: 4.2 },
    { color: CART_COLORS.neonOrange.hex, angleDeg: 198, driftSpeed: 0.049, phase: 5.6 },
  ];

  for (const cfg of spotlightConfigs) {
    const baseAngleRad = (cfg.angleDeg * Math.PI) / 180;
    const position = new THREE.Vector3(
      Math.cos(baseAngleRad) * spotlightPositionRadius,
      spotlightHeight,
      Math.sin(baseAngleRad) * spotlightPositionRadius,
    );
    const target = new THREE.Vector3(position.x, 0, position.z);
    const entry = addSpotlightWithBeam({
      color: cfg.color,
      position,
      intensity: spotlightIntensity,
      target,
    });
    spotlightEntries.push({
      ...entry,
      baseAngleRad,
      driftSpeed: cfg.driftSpeed,
      phase: cfg.phase,
    });
  }

  return {
    update: (timeMs) => {
      const nowSec = timeMs * 0.001;
      for (const entry of spotlightEntries) {
        const drift =
          Math.sin(nowSec * entry.driftSpeed * Math.PI * 2 + entry.phase) *
          spotlightDriftAmplitudeRad;
        const angle = entry.baseAngleRad + drift;
        spotlightLightPosScratch.set(
          Math.cos(angle) * spotlightPositionRadius,
          spotlightHeight,
          Math.sin(angle) * spotlightPositionRadius,
        );
        spotlightTargetScratch.set(
          spotlightLightPosScratch.x,
          platformTopY,
          spotlightLightPosScratch.z,
        );
        entry.light.position.copy(spotlightLightPosScratch);
        entry.light.target.position.copy(spotlightTargetScratch);
        entry.light.target.updateMatrix();
        positionSpotlightBeam(entry.beamGroup, spotlightLightPosScratch, spotlightTargetScratch);
        entry.glowMesh.position.set(
          spotlightTargetScratch.x,
          recordSurfaceGlowY,
          spotlightTargetScratch.z,
        );
      }
    },
  };
}

/**
 * Initializes skybox, UFOs, spotlights, ground plane, and horizon fog.
 *
 * @param {THREE.Scene} scene Root scene.
 * @param {number} pitInnerRadius Inner pit radius from arena init.
 * @returns {{ update: (timeMs: number) => void, dispose: () => void }}
 */
export function initSceneExtras(scene, pitInnerRadius) {
  const disposables = [];
  const sceneRoots = [];

  const ctx = {
    disposables,
    addToScene: (obj) => {
      scene.add(obj);
      sceneRoots.push(obj);
      return obj;
    },
    createRadialTexture: (stops) => createRadialTexture(stops, ctx),
  };

  createStarfield(scene, ctx);
  createNebulaClouds(scene, ctx);
  createPlanets(scene, ctx);
  createGalaxies(scene, ctx);
  const ufos = createUfos(scene, ctx);

  const platformTopY = CONFIG.record.y + CONFIG.record.thickness / 2;
  const recordSurfaceGlowY =
    platformTopY + CONFIG.record.surface.concentricRings.yOffset + 0.018;

  const spotlights = createSpotlightSystem(scene, { platformTopY, recordSurfaceGlowY }, ctx);
  createGround(scene, pitInnerRadius, ctx);
  createHorizonFog(scene, ctx);

  let disposed = false;

  return {
    update: (timeMs) => {
      ufos.update(timeMs);
      spotlights.update(timeMs);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const root of sceneRoots) scene.remove(root);
      for (const item of disposables) {
        if (item && typeof item.dispose === "function") item.dispose();
      }
      sceneRoots.length = 0;
      disposables.length = 0;
    },
  };
}
