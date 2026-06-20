// sceneSetup.js — skybox, environment visuals, spotlights, ground plane

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { CONFIG, CART_COLORS } from "./config.js";

/**
 * Creates the distant starfield point cloud.
 *
 * @param {THREE.Scene} scene Root scene.
 */
function createStarfield(scene) {
  const starCount = 4000;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 150 + Math.random() * 80;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)); // bias upward
    starPositions[i * 3 + 2] = r * Math.cos(phi);
    const tint = Math.random();
    if (tint < 0.15) {
      starColors[i * 3] = 1;
      starColors[i * 3 + 1] = 0.2;
      starColors[i * 3 + 2] = 0.85;
    } else if (tint < 0.3) {
      starColors[i * 3] = 0.15;
      starColors[i * 3 + 1] = 0.9;
      starColors[i * 3 + 2] = 1;
    } else if (tint < 0.38) {
      starColors[i * 3] = 1;
      starColors[i * 3 + 1] = 1;
      starColors[i * 3 + 2] = 0.4;
    } else {
      const b = 0.8 + Math.random() * 0.2;
      starColors[i * 3] = b;
      starColors[i * 3 + 1] = b;
      starColors[i * 3 + 2] = b;
    }
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const starCanvas = document.createElement("canvas");
  starCanvas.width = 32;
  starCanvas.height = 32;
  const starCtx = starCanvas.getContext("2d");
  const starGrad = starCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  starGrad.addColorStop(0, "rgba(255,255,255,1)");
  starGrad.addColorStop(0.15, "rgba(255,255,255,0.8)");
  starGrad.addColorStop(0.4, "rgba(255,255,255,0.15)");
  starGrad.addColorStop(1, "rgba(255,255,255,0)");
  starCtx.fillStyle = starGrad;
  starCtx.fillRect(0, 0, 32, 32);
  const starTexture = new THREE.CanvasTexture(starCanvas);
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
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);
}

/**
 * Creates additive nebula cloud spheres in the upper hemisphere.
 *
 * @param {THREE.Scene} scene Root scene.
 */
function createNebulaClouds(scene) {
  const nebulaColors = [0x6600aa, 0xaa0066, 0x003366, 0x220044, 0x660033];
  for (let i = 0; i < 8; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.3 + Math.random() * 1.0; // upper hemisphere bias
    const r = 120 + Math.random() * 50;
    const nebula = new THREE.Mesh(
      new THREE.SphereGeometry(20 + Math.random() * 30, 16, 16),
      new THREE.MeshBasicMaterial({
        color: nebulaColors[i % nebulaColors.length],
        transparent: true,
        opacity: 0.06 + Math.random() * 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    nebula.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
    scene.add(nebula);
  }
}

/**
 * Creates distant decorative planets (with optional rings).
 *
 * @param {THREE.Scene} scene Root scene.
 */
function createPlanets(scene) {
  const planetConfigs = [
    { radius: 8, color: 0x993366, pos: [100, 70, -80], ring: true, ringColor: 0xcc6699 },
    { radius: 5, color: 0x334488, pos: [-120, 55, -60], ring: false },
    { radius: 3, color: 0x886633, pos: [60, 90, 100], ring: false },
  ];
  for (const p of planetConfigs) {
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius, 24, 24),
      new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.5 }),
    );
    planet.position.set(p.pos[0], p.pos[1], p.pos[2]);
    scene.add(planet);
    if (p.ring) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(p.radius * 1.6, 0.4, 8, 48),
        new THREE.MeshBasicMaterial({
          color: p.ringColor, transparent: true, opacity: 0.35,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI * 0.35;
      ring.position.set(p.pos[0], p.pos[1], p.pos[2]);
      scene.add(ring);
    }
  }
}

/**
 * Creates distant galaxy sprites with radial glow textures.
 *
 * @param {THREE.Scene} scene Root scene.
 */
function createGalaxies(scene) {
  const galaxyConfigs = [
    { pos: [-80, 100, -130], color: 0x6644aa, size: 12 },
    { pos: [130, 85, -100], color: 0xaa4466, size: 8 },
  ];
  for (const g of galaxyConfigs) {
    const gCanvas = document.createElement("canvas");
    gCanvas.width = 64; gCanvas.height = 64;
    const gCtx = gCanvas.getContext("2d");
    const gGrad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gGrad.addColorStop(0, "rgba(255,255,255,0.6)");
    gGrad.addColorStop(0.3, "rgba(180,120,220,0.3)");
    gGrad.addColorStop(1, "rgba(0,0,0,0)");
    gCtx.fillStyle = gGrad;
    gCtx.beginPath();
    gCtx.ellipse(32, 32, 30, 15, 0, 0, Math.PI * 2);
    gCtx.fill();
    const gTex = new THREE.CanvasTexture(gCanvas);
    const galaxy = new THREE.Sprite(new THREE.SpriteMaterial({
      map: gTex, color: g.color, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    galaxy.scale.set(g.size, g.size * 0.5, 1);
    galaxy.position.set(g.pos[0], g.pos[1], g.pos[2]);
    scene.add(galaxy);
  }
}

/**
 * Creates orbiting UFO meshes and returns their orbit animation data.
 *
 * @param {THREE.Scene} scene Root scene.
 * @returns {Array<{ group: THREE.Group, orbitRadius: number, orbitSpeed: number, orbitHeight: number, phaseOffset: number }>}
 */
function createUfos(scene) {
  const ufoEntries = [];
  for (let i = 0; i < 3; i++) {
    const ufoGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({ color: 0x888888 }),
    );
    ufoGroup.add(body);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 }),
    );
    dome.position.y = 0.3;
    ufoGroup.add(dome);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.15, 8, 24),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x00ff88 : i === 1 ? 0xff00ff : 0x00ffff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ufoGroup.add(ring);

    const orbitRadius = 100 + i * 20;
    const orbitSpeed = 0.03 + i * 0.01;
    const orbitHeight = 15 + i * 8;
    const phaseOffset = i * Math.PI * 0.66;
    ufoGroup.scale.set(2, 2, 2);
    scene.add(ufoGroup);
    ufoEntries.push({ group: ufoGroup, orbitRadius, orbitSpeed, orbitHeight, phaseOffset });
  }
  return ufoEntries;
}

/**
 * Creates the ground disc ring beneath the arena pit.
 *
 * @param {THREE.Scene} scene Root scene.
 * @param {number} pitInnerRadius Inner pit radius for the ring geometry.
 */
function createGroundDisc(scene, pitInnerRadius) {
  const groundDiscGeo = new THREE.RingGeometry(pitInnerRadius, 150, 64);
  const groundDiscMat = new THREE.MeshStandardMaterial({
    color: 0x1e1e3a,
    metalness: 0.2,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const groundDisc = new THREE.Mesh(groundDiscGeo, groundDiscMat);
  groundDisc.rotation.x = -Math.PI / 2;
  groundDisc.position.y = -3;
  scene.add(groundDisc);
}

/**
 * Creates the wireframe ground grid overlay.
 *
 * @param {THREE.Scene} scene Root scene.
 * @param {number} pitInnerRadius Inner pit radius for the ring geometry.
 */
function createGroundGrid(scene, pitInnerRadius) {
  const groundGridGeo = new THREE.RingGeometry(pitInnerRadius, 150, 64);
  const groundGridMat = new THREE.MeshBasicMaterial({
    color: 0x2a2a5a,
    wireframe: true,
    opacity: 0.25,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });
  const groundGrid = new THREE.Mesh(groundGridGeo, groundGridMat);
  groundGrid.rotation.x = -Math.PI / 2;
  groundGrid.position.y = -2.99;
  scene.add(groundGrid);
}

/**
 * Creates the horizon fog cylinder with a custom fade shader.
 *
 * @param {THREE.Scene} scene Root scene.
 */
function createHorizonFog(scene) {
  const horizonFogGeo = new THREE.CylinderGeometry(150, 150, 40, 64, 8, true);
  const horizonFogMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uColor: { value: new THREE.Color(0x0a0520) },
    },
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
  const horizonFog = new THREE.Mesh(horizonFogGeo, horizonFogMat);
  horizonFog.position.y = -3;
  scene.add(horizonFog);
}

/**
 * Creates cart-colored spotlights with volumetric beams and floor glow pools.
 *
 * @param {THREE.Scene} scene Root scene.
 * @param {{ platformTopY: number, recordSurfaceGlowY: number }} yRefs Vertical reference heights.
 * @returns {object} Spotlight entries and animation helpers.
 */
function createSpotlightSystem(scene, { platformTopY, recordSurfaceGlowY }) {
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
    scene.add(light);
    scene.add(light.target);

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
    }

    positionSpotlightBeam(beamGroup, position, beamTarget);
    scene.add(beamGroup);

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
    scene.add(glowMesh);

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
      color: cfg.color,
      driftSpeed: cfg.driftSpeed,
      phase: cfg.phase,
    });
  }

  return {
    spotlightEntries,
    spotlightPositionRadius,
    spotlightHeight,
    spotlightDriftAmplitudeRad,
    spotlightLightPosScratch,
    spotlightTargetScratch,
    positionSpotlightBeam,
  };
}

/**
 * Initializes skybox, UFOs, spotlights, ground plane, and horizon fog.
 * Returns runtime references needed by the animation loop.
 *
 * @param {THREE.Scene} scene Root scene.
 * @param {number} pitInnerRadius Inner pit radius from arena init.
 * @returns {{
 *   ufoEntries: Array,
 *   spotlightEntries: Array,
 *   spotlightPositionRadius: number,
 *   spotlightHeight: number,
 *   spotlightDriftAmplitudeRad: number,
 *   platformTopY: number,
 *   recordSurfaceGlowY: number,
 *   spotlightLightPosScratch: THREE.Vector3,
 *   spotlightTargetScratch: THREE.Vector3,
 *   positionSpotlightBeam: Function,
 * }}
 */
export function initSceneExtras(scene, pitInnerRadius) {
  createStarfield(scene);
  createNebulaClouds(scene);
  createPlanets(scene);
  createGalaxies(scene);
  const ufoEntries = createUfos(scene);

  const platformTopY = CONFIG.record.y + CONFIG.record.thickness / 2;
  const recordSurfaceGlowY =
    platformTopY + CONFIG.record.surface.concentricRings.yOffset + 0.018;

  const spotlightSystem = createSpotlightSystem(scene, { platformTopY, recordSurfaceGlowY });

  createGroundDisc(scene, pitInnerRadius);
  createGroundGrid(scene, pitInnerRadius);
  createHorizonFog(scene);

  return {
    ufoEntries,
    platformTopY,
    recordSurfaceGlowY,
    ...spotlightSystem,
  };
}
