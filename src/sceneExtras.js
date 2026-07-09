// sceneExtras.js — reusable space-skybox environment: starfield, nebula, planets,
// galaxies, UFOs, drifting spotlight system, ground disc/grid, and horizon fog.
//
// Built per-level so a level switch can dispose the old extras and rebuild them against
// the new arena's pitInnerRadius (the ground ring inner radius depends on it).

import * as THREE from "three";
import { CONFIG, CART_COLORS } from "./config.js";
import { sampleArenaReactive } from "./arenaReactiveLights.js";

/** Slow sky yaw (rad/s) — full turn ~7 min; reads as living void without spinning hard. */
const SKY_YAW_RAD_PER_SEC = 0.015;
/** Camera XZ parallax factor — sky lags slightly so the void has depth. */
const SKY_PARALLAX = 0.028;

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
 * @param {{ addToSky: Function, disposables: object[], createRadialTexture: Function }} ctx
 */
function createStarfield(ctx) {
  // * Slightly leaner than 4k — parallax + yaw sell depth better than raw point count.
  const starCount = 3200;
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

    // * Depth tiers — PointsMaterial can't vary size per star, so fake the near/far
    // * layering through brightness: stars at the far shell dim to ~40%, giving the
    // * field visible depth instead of a uniform speckle.
    const depthDim = 1.05 - ((r - 150) / 80) * 0.65;
    starColors[i * 3] *= depthDim;
    starColors[i * 3 + 1] *= depthDim;
    starColors[i * 3 + 2] *= depthDim;
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

  ctx.addToSky(new THREE.Points(starGeo, starMat));
  ctx.disposables.push(starGeo, starMat);
}

/**
 * Fewer, stronger nebulae beat a wall of faint spheres.
 * @param {{ addToSky: Function, disposables: object[] }} ctx
 */
function createNebulaClouds(ctx) {
  const nebulaColors = [0x6600aa, 0xaa0066, 0x003366, 0x440066];
  const sharedGeo = new THREE.SphereGeometry(1, 16, 16);
  const count = 4;

  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: nebulaColors[i % nebulaColors.length],
      transparent: true,
      opacity: 0.09 + Math.random() * 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });

    const mesh = new THREE.Mesh(sharedGeo, mat);
    const scale = 28 + Math.random() * 34;
    mesh.scale.set(scale, scale * (0.7 + Math.random() * 0.5), scale);

    const theta = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const phi = 0.35 + Math.random() * 0.75;
    const r = 125 + Math.random() * 40;
    mesh.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );

    ctx.addToSky(mesh);
    ctx.disposables.push(mat);
  }
  ctx.disposables.push(sharedGeo);
}

/**
 * One hero ringed planet + one distant moon — less wallpaper clutter.
 * @param {{ addToSky: Function, disposables: object[] }} ctx
 */
function createPlanets(ctx) {
  const planetConfigs = [
    { radius: 10, color: 0x993366, pos: [110, 68, -85], ring: true, ringColor: 0xcc6699, opacity: 0.55 },
    { radius: 3.5, color: 0x445588, pos: [-105, 50, 70], ring: false, opacity: 0.4 },
  ];

  const sharedGeo = new THREE.SphereGeometry(1, 24, 24);

  for (const p of planetConfigs) {
    const mat = new THREE.MeshBasicMaterial({
      color: p.color,
      transparent: true,
      opacity: p.opacity,
    });
    const planet = new THREE.Mesh(sharedGeo, mat);
    planet.position.set(p.pos[0], p.pos[1], p.pos[2]);
    planet.scale.setScalar(p.radius);
    ctx.addToSky(planet);
    ctx.disposables.push(mat);

    if (p.ring) {
      const ringGeo = new THREE.TorusGeometry(p.radius * 1.65, 0.35, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: p.ringColor,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI * 0.35;
      ring.rotation.z = 0.2;
      ring.position.set(p.pos[0], p.pos[1], p.pos[2]);
      ctx.addToSky(ring);
      ctx.disposables.push(ringGeo, ringMat);
    }
  }
  ctx.disposables.push(sharedGeo);
}

/**
 * @param {{ addToSky: Function, disposables: object[], createRadialTexture: Function }} ctx
 */
function createGalaxies(ctx) {
  // * Single larger galaxy blob — second one was barely readable at distance.
  const galaxyConfigs = [
    { pos: [-90, 95, -120], color: 0x7755bb, size: 16 },
  ];

  const sharedTex = createRadialTexture([
    [0, "rgba(255,255,255,0.65)"],
    [0.3, "rgba(180,120,220,0.32)"],
    [1, "rgba(0,0,0,0)"],
  ], ctx);

  for (const g of galaxyConfigs) {
    const mat = new THREE.SpriteMaterial({
      map: sharedTex,
      color: g.color,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const galaxy = new THREE.Sprite(mat);
    galaxy.scale.set(g.size, g.size * 0.45, 1);
    galaxy.position.set(g.pos[0], g.pos[1], g.pos[2]);
    ctx.addToSky(galaxy);
    ctx.disposables.push(mat);
  }
}

/**
 * @param {{ addToSky: Function, disposables: object[] }} ctx
 * @returns {{ update: (timeMs: number) => void }}
 */
function createUfos(ctx) {
  const ufoEntries = [];
  const sharedBodyGeo = new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const sharedDomeGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const sharedRingGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 24);
  const ringColors = [0x00ff88, 0xff00ff];

  // * Two UFOs — enough motion without a flying-saucer parking lot.
  for (let i = 0; i < 2; i++) {
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
    ctx.addToSky(ufoGroup);

    ufoEntries.push({
      group: ufoGroup,
      orbitRadius: 105 + i * 28,
      orbitSpeed: 0.028 + i * 0.012,
      orbitHeight: 18 + i * 10,
      phaseOffset: i * Math.PI * 0.9,
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
 * @param {number} pitInnerRadius
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createGround(pitInnerRadius, ctx) {
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
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createHorizonFog(ctx) {
  const geo = new THREE.CylinderGeometry(150, 150, 40, 64, 8, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    // * Must match CONFIG.postFx.fog.color (renderer clear) or the horizon seams.
    uniforms: { uColor: { value: new THREE.Color(CONFIG.postFx.fog.color) } },
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

  // * Faint cool glow band hugging the horizon line — separates the ground plane from
  // * the star void with a whisper of violet. Additive, very low opacity, no fog.
  const glowGeo = new THREE.CylinderGeometry(148, 148, 7, 64, 1, true);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x4a2a99,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const glowBand = new THREE.Mesh(glowGeo, glowMat);
  glowBand.position.y = 3.5;
  ctx.addToScene(glowBand);
  ctx.disposables.push(glowGeo, glowMat);
}

/**
 * @param {{ platformTopY: number, recordSurfaceGlowY: number }} yRefs
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 * @returns {{
 *   update: (
 *     timeMs: number,
 *     reactive?: { accentColor: THREE.Color, intensityMul: number, koT: number, hasLeader: boolean } | null,
 *   ) => void,
 * }}
 */
function createSpotlightSystem(yRefs, ctx) {
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
    const baseColor = new THREE.Color(color);
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
    /** @type {THREE.MeshBasicMaterial[]} */
    const beamMats = [];

    for (const layer of beamLayers) {
      const beamGeo = new THREE.CylinderGeometry(
        layer.sourceRadius,
        layer.floorRadius,
        height,
        8,
        1,
        true,
      );
      const beamMat = new THREE.MeshBasicMaterial({
        color: baseColor.clone(),
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      beamMat.userData.baseOpacity = layer.opacity;
      beamGroup.add(new THREE.Mesh(beamGeo, beamMat));
      beamMats.push(beamMat);
      ctx.disposables.push(beamGeo, beamMat);
    }

    positionSpotlightBeam(beamGroup, position, beamTarget);
    ctx.addToScene(beamGroup);

    const glowGeo = new THREE.CircleGeometry(5.25, 48);
    const glowMat = new THREE.MeshBasicMaterial({
      map: spotlightPoolTexture,
      color: baseColor.clone(),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    glowMat.userData.baseOpacity = 0.3;
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.set(beamTarget.x, recordSurfaceGlowY, beamTarget.z);
    glowMesh.renderOrder = 2;
    ctx.addToScene(glowMesh);
    ctx.disposables.push(glowGeo, glowMat);

    return {
      light,
      beamGroup,
      glowMesh,
      glowMat,
      beamMats,
      baseColor,
      baseIntensity: intensity,
    };
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

  const _spotReactiveColor = new THREE.Color();

  return {
    /**
     * @param {number} timeMs
     * @param {{ accentColor: THREE.Color, intensityMul: number, koT: number, hasLeader: boolean } | null} [reactive]
     */
    update: (timeMs, reactive = null) => {
      const nowSec = timeMs * 0.001;
      const leaderMix = reactive?.hasLeader ? 0.42 : 0;
      const koT = reactive?.koT ?? 0;
      const intensityMul = reactive?.intensityMul ?? 1;

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

        // * Leader tints the club wash; KO punches intensity + leans color toward flash.
        if (reactive) {
          _spotReactiveColor.copy(entry.baseColor).lerp(reactive.accentColor, leaderMix + koT * 0.5);
          entry.light.color.copy(_spotReactiveColor);
          entry.light.intensity = entry.baseIntensity * intensityMul;
          for (const mat of entry.beamMats) {
            mat.color.copy(_spotReactiveColor);
            mat.opacity = (mat.userData.baseOpacity ?? 0.05) * (1 + koT * 0.85);
          }
          if (entry.glowMat) {
            entry.glowMat.color.copy(_spotReactiveColor);
            entry.glowMat.opacity = (entry.glowMat.userData.baseOpacity ?? 0.3) * (1 + koT * 0.7);
          }
        }
      }
    },
  };
}

/**
 * Initializes the space-skybox environment: starfield, nebula, planets, galaxies, UFOs,
 * drifting spotlight system, ground disc/grid, and horizon fog. Adds everything to the
 * scene and tracks objects/disposables so the whole set can be torn down with
 * {@link disposeSceneExtras}.
 *
 * Sky dressing (stars/nebulae/planets/UFOs) lives under a single `skyRoot` that slowly
 * yaws and parallax-lags the camera for depth. Spotlights/ground/horizon stay world-fixed.
 *
 * @param {THREE.Scene} scene Root scene.
 * @param {number} pitInnerRadius Inner pit radius from the active level (ground ring start).
 * @param {{ enabled?: boolean }} [options] When `enabled` is false (e.g. Backrooms, Zanzibar,
 *   testArena), the rig is never built at all — not just hidden — so the per-level-load cost
 *   of the starfield, nebula spheres, planets, UFOs, spotlight system, and horizon
 *   fog cylinder is skipped entirely for levels that would immediately hide it. The returned
 *   object still matches the enabled shape (empty `sceneRoots`/`disposables`, a no-op
 *   `update`) so callers can update/dispose it unconditionally.
 * @returns {{
 *   scene: THREE.Scene,
 *   sceneRoots: THREE.Object3D[],
 *   disposables: object[],
 *   disposed: boolean,
 *   update: (timeMs: number, camera?: THREE.Camera | null) => void,
 * }}
 */
export function initSceneExtras(scene, pitInnerRadius, options = {}) {
  const enabled = options.enabled !== false;
  if (!enabled) {
    return {
      scene,
      sceneRoots: [],
      disposables: [],
      disposed: false,
      update: () => {},
    };
  }

  const disposables = [];
  const sceneRoots = [];

  // * Parallax/yaw group for distant sky only — floor lights must stay world-locked.
  const skyRoot = new THREE.Group();
  skyRoot.name = "classicSkyRoot";
  scene.add(skyRoot);
  sceneRoots.push(skyRoot);

  const ctx = {
    disposables,
    addToScene: (obj) => {
      scene.add(obj);
      sceneRoots.push(obj);
      return obj;
    },
    addToSky: (obj) => {
      skyRoot.add(obj);
      return obj;
    },
    createRadialTexture: (stops) => createRadialTexture(stops, ctx),
  };

  createStarfield(ctx);
  createNebulaClouds(ctx);
  createPlanets(ctx);
  createGalaxies(ctx);
  const ufos = createUfos(ctx);

  const platformTopY = CONFIG.record.y + CONFIG.record.thickness / 2;
  const recordSurfaceGlowY =
    platformTopY + CONFIG.record.surface.concentricRings.yOffset + 0.018;

  const spotlights = createSpotlightSystem({ platformTopY, recordSurfaceGlowY }, ctx);
  createGround(pitInnerRadius, ctx);
  createHorizonFog(ctx);

  return {
    scene,
    sceneRoots,
    disposables,
    disposed: false,
    /**
     * @param {number} timeMs
     * @param {THREE.Camera | null | undefined} [camera]
     */
    update: (timeMs, camera) => {
      if (!skyRoot.visible) {
        // * Spotlights may still be visible when sky is on (same roots visibility flag
        // * in practice); only skip if the first root was hidden by quality/level.
        return;
      }
      const t = timeMs * 0.001;
      skyRoot.rotation.y = t * SKY_YAW_RAD_PER_SEC;
      if (camera) {
        skyRoot.position.x = -camera.position.x * SKY_PARALLAX;
        skyRoot.position.z = -camera.position.z * SKY_PARALLAX;
      }
      ufos.update(timeMs);
      // * Leader/KO sample drives floor spot colors/intensity (club reacts to play).
      const reactive = sampleArenaReactive(timeMs);
      spotlights.update(timeMs, reactive);
    },
  };
}

/**
 * Removes all scene-extras objects from the scene and disposes their geometries,
 * materials, and textures. Idempotent.
 *
 * @param {ReturnType<typeof initSceneExtras> | null | undefined} extras
 */
export function disposeSceneExtras(extras) {
  if (!extras || extras.disposed) return;
  extras.disposed = true;
  if (Array.isArray(extras.sceneRoots) && extras.scene) {
    for (const root of extras.sceneRoots) extras.scene.remove(root);
    extras.sceneRoots.length = 0;
  }
  if (Array.isArray(extras.disposables)) {
    for (const item of extras.disposables) {
      if (item && typeof item.dispose === "function") item.dispose();
    }
    extras.disposables.length = 0;
  }
}
