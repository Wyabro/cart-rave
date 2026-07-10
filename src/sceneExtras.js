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
/**
 * Multi-layer camera XZ parallax — nearer sky layers lag more so pans read depth.
 * Far shell barely moves (wallpaper); mid/near shift against it.
 */
const SKY_PARALLAX_FAR = 0.012;
const SKY_PARALLAX_MID = 0.032;
const SKY_PARALLAX_NEAR = 0.055;
/** Slight extra yaw speed on the near dust layer (relative to far). */
const SKY_NEAR_YAW_MUL = 1.35;

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
 * Builds one star shell into a target group (far / mid / near use different radii + sizes).
 *
 * @param {{
 *   addTo: (obj: THREE.Object3D) => unknown,
 *   disposables: object[],
 * }} ctx
 * @param {{
 *   count: number,
 *   rMin: number,
 *   rMax: number,
 *   size: number,
 *   opacity: number,
 *   tintBoost?: number,
 * }} shell
 */
function createStarShell(ctx, shell) {
  const { count, rMin, rMax, size, opacity, tintBoost = 1 } = shell;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(count * 3);
  const starColors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = rMin + Math.random() * (rMax - rMin);
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta));
    starPositions[i * 3 + 2] = r * Math.cos(phi);

    const tint = Math.random();
    if (tint < 0.14) starColors.set([1 * tintBoost, 0.22 * tintBoost, 0.88 * tintBoost], i * 3);
    else if (tint < 0.28) starColors.set([0.15 * tintBoost, 0.92 * tintBoost, 1 * tintBoost], i * 3);
    else if (tint < 0.36) starColors.set([1 * tintBoost, 1 * tintBoost, 0.45 * tintBoost], i * 3);
    else {
      const b = (0.75 + Math.random() * 0.25) * tintBoost;
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
    size,
    map: starTexture,
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  ctx.addTo(new THREE.Points(starGeo, starMat));
  ctx.disposables.push(starGeo, starMat);
}

/**
 * Three depth shells — far wallpaper, mid field, near dust — for multi-parallax sky.
 * @param {{
 *   addToFar: (obj: THREE.Object3D) => unknown,
 *   addToMid: (obj: THREE.Object3D) => unknown,
 *   addToNear: (obj: THREE.Object3D) => unknown,
 *   disposables: object[],
 *   createRadialTexture: (stops: Array<[number, string]>) => THREE.CanvasTexture,
 * }} ctx
 */
function createStarfield(ctx) {
  createStarShell(
    { addTo: ctx.addToFar, disposables: ctx.disposables },
    { count: 2200, rMin: 175, rMax: 240, size: 1.15, opacity: 0.72, tintBoost: 0.85 },
  );
  createStarShell(
    { addTo: ctx.addToMid, disposables: ctx.disposables },
    { count: 1100, rMin: 130, rMax: 175, size: 1.55, opacity: 0.9, tintBoost: 1.0 },
  );
  createStarShell(
    { addTo: ctx.addToNear, disposables: ctx.disposables },
    { count: 280, rMin: 95, rMax: 130, size: 2.2, opacity: 0.95, tintBoost: 1.15 },
  );
}

/**
 * Fewer, stronger nebulae beat a wall of faint spheres. Far layer = wallpaper depth.
 * @param {{ addToFar: Function, disposables: object[] }} ctx
 */
function createNebulaClouds(ctx) {
  const nebulaColors = [0x6600aa, 0xaa0066, 0x003366, 0x440066];
  const sharedGeo = new THREE.SphereGeometry(1, 16, 16);
  const count = 5;

  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: nebulaColors[i % nebulaColors.length],
      transparent: true,
      opacity: 0.1 + Math.random() * 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });

    const mesh = new THREE.Mesh(sharedGeo, mat);
    const scale = 32 + Math.random() * 40;
    mesh.scale.set(scale, scale * (0.65 + Math.random() * 0.5), scale);

    const theta = (i / count) * Math.PI * 2 + Math.random() * 0.35;
    const phi = 0.3 + Math.random() * 0.8;
    const r = 150 + Math.random() * 50;
    mesh.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );

    ctx.addToFar(mesh);
    ctx.disposables.push(mat);
  }
  ctx.disposables.push(sharedGeo);
}

/**
 * Hero ringed planet (mid parallax) + distant moon (far) + neon club station landmark (near).
 * @param {{ addToFar: Function, addToMid: Function, addToNear: Function, disposables: object[] }} ctx
 */
function createPlanets(ctx) {
  const sharedGeo = new THREE.SphereGeometry(1, 28, 28);

  // * Far moon — small, dim, wallpaper.
  {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x445588,
      transparent: true,
      opacity: 0.42,
    });
    const moon = new THREE.Mesh(sharedGeo, mat);
    moon.position.set(-118, 52, 78);
    moon.scale.setScalar(3.2);
    ctx.addToFar(moon);
    ctx.disposables.push(mat);
  }

  // * Mid hero planet — rings + stronger silhouette so cam pans feel intentional.
  {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xaa4477,
      transparent: true,
      opacity: 0.62,
    });
    const planet = new THREE.Mesh(sharedGeo, mat);
    planet.position.set(105, 62, -90);
    planet.scale.setScalar(12);
    ctx.addToMid(planet);
    ctx.disposables.push(mat);

    const ringGeo = new THREE.TorusGeometry(12 * 1.7, 0.42, 8, 56);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xdd77aa,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.35;
    ring.rotation.z = 0.22;
    ring.position.copy(planet.position);
    ctx.addToMid(ring);
    ctx.disposables.push(ringGeo, ringMat);

    // * Soft atmosphere halo.
    const atmoGeo = new THREE.SphereGeometry(1, 20, 20);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0xff66aa,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const atmo = new THREE.Mesh(atmoGeo, atmoMat);
    atmo.position.copy(planet.position);
    atmo.scale.setScalar(14.5);
    ctx.addToMid(atmo);
    ctx.disposables.push(atmoGeo, atmoMat);
  }

  // * Near landmark — orbiting club station (disc + core glow) so space has a place.
  {
    const station = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x22e6ff,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    const core = new THREE.Mesh(sharedGeo, coreMat);
    core.scale.setScalar(1.4);
    station.add(core);

    const discGeo = new THREE.TorusGeometry(3.2, 0.18, 8, 40);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0xff2bd6,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    station.add(disc);

    const armGeo = new THREE.BoxGeometry(0.25, 0.25, 5.5);
    const armMat = new THREE.MeshBasicMaterial({ color: 0x8899bb, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 3; i += 1) {
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.rotation.y = (i / 3) * Math.PI * 2;
      arm.position.y = 0.1;
      station.add(arm);
    }

    station.position.set(-70, 28, -55);
    station.scale.setScalar(1.35);
    ctx.addToNear(station);
    ctx.disposables.push(coreMat, discGeo, discMat, armGeo, armMat);
  }

  ctx.disposables.push(sharedGeo);
}

/**
 * @param {{ addToFar: Function, disposables: object[], createRadialTexture: Function }} ctx
 */
function createGalaxies(ctx) {
  const galaxyConfigs = [
    { pos: [-95, 100, -130], color: 0x7755bb, size: 22 },
    { pos: [120, 70, 100], color: 0x553388, size: 14 },
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
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const galaxy = new THREE.Sprite(mat);
    galaxy.scale.set(g.size, g.size * 0.45, 1);
    galaxy.position.set(g.pos[0], g.pos[1], g.pos[2]);
    ctx.addToFar(galaxy);
    ctx.disposables.push(mat);
  }
}

/**
 * @param {{ addToNear: Function, disposables: object[] }} ctx
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
    ctx.addToNear(ufoGroup);

    ufoEntries.push({
      group: ufoGroup,
      orbitRadius: 100 + i * 26,
      orbitSpeed: 0.03 + i * 0.014,
      orbitHeight: 20 + i * 11,
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
 * Outer void floor beyond the coliseum bowl. Must NOT overlap the stadium shell /
 * moat (those live at y≈-3 from the pit rim out through the seating) — coplanar
 * RingGeometry + shell lathe was z-fighting into a shimmering purple band.
 *
 * @param {number} pitInnerRadius
 * @param {{ addToScene: Function, disposables: object[] }} ctx
 */
function createGround(pitInnerRadius, ctx) {
  // * Upper deck outer ≈ pit+79.7; start past the bowl so the moat/shell own the
  // * pit→crowd band alone (see initCrowd stadium lathe).
  const groundInnerR = pitInnerRadius + 84;
  const groundOuterR = 150;
  const sharedGeo = new THREE.RingGeometry(groundInnerR, groundOuterR, 64);

  const discMat = new THREE.MeshStandardMaterial({
    color: 0x1e1e3a,
    metalness: 0.2,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const groundDisc = new THREE.Mesh(sharedGeo, discMat);
  groundDisc.rotation.x = -Math.PI / 2;
  // * Slightly below stadium shell so any remaining overlap can't z-fight.
  groundDisc.position.y = -3.08;
  ctx.addToScene(groundDisc);

  const gridMat = new THREE.MeshBasicMaterial({
    color: 0x2a2a5a,
    wireframe: true,
    opacity: 0.25,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const groundGrid = new THREE.Mesh(sharedGeo, gridMat);
  groundGrid.rotation.x = -Math.PI / 2;
  groundGrid.position.y = -3.06;
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
      { sourceRadius: 0.45, floorRadius: 1.2, opacity: 0.12 },
      { sourceRadius: 0.65, floorRadius: 1.8, opacity: 0.07 },
      { sourceRadius: 0.9, floorRadius: 2.6, opacity: 0.035 },
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
        // * Bypass NeutralToneMapping @ exposure 0.4 so neon beams stay saturated
        // * (same treatment lasers got in the visual polish pass).
        toneMapped: false,
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
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    glowMat.userData.baseOpacity = 0.38;
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
  // * Authored under exposure 0.4 + OutputPass; 12 read as a dull grey wash on the vinyl.
  const spotlightIntensity = 22;
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
      // * Keep leader tint subtle — 0.42 was washing every booth-color spot into one
      // * muddy accent and killed the multi-color rave wash over the dancefloor.
      const leaderMix = reactive?.hasLeader ? 0.16 : 0;
      const koT = reactive?.koT ?? 0;
      const intensityMul = reactive?.intensityMul ?? 1;
      const wantsReactiveTint = leaderMix > 0 || koT > 0;

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

        // * Soft intensity breathe (pre-reactive behaviour) so idle spots stay alive.
        const wobble = 0.88 + 0.12 * Math.sin(nowSec * 1.05 + entry.phase);
        entry.light.intensity = entry.baseIntensity * wobble * intensityMul;

        if (wantsReactiveTint && reactive) {
          // * KO / sole-leader only — otherwise leave pure cart-palette colors alone.
          _spotReactiveColor
            .copy(entry.baseColor)
            .lerp(reactive.accentColor, leaderMix + koT * 0.45);
          entry.light.color.copy(_spotReactiveColor);
          for (const mat of entry.beamMats) {
            mat.color.copy(_spotReactiveColor);
            mat.opacity = (mat.userData.baseOpacity ?? 0.05) * (1 + koT * 0.85);
          }
          if (entry.glowMat) {
            entry.glowMat.color.copy(_spotReactiveColor);
            entry.glowMat.opacity = (entry.glowMat.userData.baseOpacity ?? 0.3) * (1 + koT * 0.7);
          }
        } else {
          // * Restore palette identity after a KO flash or when leader drops to a tie.
          entry.light.color.copy(entry.baseColor);
          for (const mat of entry.beamMats) {
            mat.color.copy(entry.baseColor);
            mat.opacity = mat.userData.baseOpacity ?? 0.05;
          }
          if (entry.glowMat) {
            entry.glowMat.color.copy(entry.baseColor);
            entry.glowMat.opacity = entry.glowMat.userData.baseOpacity ?? 0.3;
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

  // * Multi-layer sky — far/mid/near groups with independent parallax + yaw so pans
  // * read depth. Spotlights/ground/horizon stay world-locked on the scene.
  const skyRoot = new THREE.Group();
  skyRoot.name = "classicSkyRoot";
  const skyFar = new THREE.Group();
  skyFar.name = "classicSkyFar";
  const skyMid = new THREE.Group();
  skyMid.name = "classicSkyMid";
  const skyNear = new THREE.Group();
  skyNear.name = "classicSkyNear";
  skyRoot.add(skyFar, skyMid, skyNear);
  scene.add(skyRoot);
  sceneRoots.push(skyRoot);

  const ctx = {
    disposables,
    addToScene: (obj) => {
      scene.add(obj);
      sceneRoots.push(obj);
      return obj;
    },
    addToFar: (obj) => {
      skyFar.add(obj);
      return obj;
    },
    addToMid: (obj) => {
      skyMid.add(obj);
      return obj;
    },
    addToNear: (obj) => {
      skyNear.add(obj);
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
        return;
      }
      const t = timeMs * 0.001;
      const baseYaw = t * SKY_YAW_RAD_PER_SEC;
      skyFar.rotation.y = baseYaw;
      skyMid.rotation.y = baseYaw * 1.12;
      skyNear.rotation.y = baseYaw * SKY_NEAR_YAW_MUL;
      if (camera) {
        const cx = camera.position.x;
        const cz = camera.position.z;
        skyFar.position.x = -cx * SKY_PARALLAX_FAR;
        skyFar.position.z = -cz * SKY_PARALLAX_FAR;
        skyMid.position.x = -cx * SKY_PARALLAX_MID;
        skyMid.position.z = -cz * SKY_PARALLAX_MID;
        skyNear.position.x = -cx * SKY_PARALLAX_NEAR;
        skyNear.position.z = -cz * SKY_PARALLAX_NEAR;
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
