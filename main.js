import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import PartySocket from "partysocket";
import { buildCart, resetCartVisualState, updateCartVisuals } from "./cart.js";

// * PartyKit public host after `npx partykit deploy` (partykit.dev). Local dev uses 127.0.0.1:1999.
const PARTYKIT_PUBLIC_HOST = "";

const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x070010,
  debug: {
    input: false,
    velocity: false,
    arenaTrimesh: false,
  },

  gravity: -24,
  fixedTimeStep: 1 / 60,
  maxSubsteps: 4,

  record: {
    radius: 26.4,
    innerRadius: 3.3,
    thickness: 0.6,
    y: -0.3,
    rotationSpeedRadPerSec: 0.35,
    friction: 2.2,
    restitution: 0.0,
    color: 0x050006,
    rimColor: 0xff2bd6,
    swirl: {
      enabled: true,
      maxForce: 8.0,
      falloffExponent: 2.0,
      direction: 1,
    },
  },

  cart: {
    size: { x: 1.95, y: 1.35, z: 3.3 },
    // * World y for all start slots; xz come from spawnRingRadius + slot angle (see main()).
    spawnHeight: 1.077,
    friction: 1.6,
    restitution: 0.0,
    linearDamping: 2.5,
    angularDamping: 3.5,
  },

  // * TEST scaffolding only: extra NPC carts (not slot-fill / PartyKit join flow).
  npcCount: 3,

  driving: {
    maxSpeed: 14.0,
    reverseMaxSpeed: 8.0,
    accel: 110.0,
    braking: 35.0,
    steeringTorque: 110.0,
    tankYawRate: 5.6, // rad/s at full input (in-place rotation)
    yawResponsiveness: 22.0, // higher = snaps to desired yaw rate faster
    lateralGrip: 16.0,
    driftGripFactor: 0.35, // lower = more sideways slide while turning
    driftImpulseStrength: 0.55, // sideways push while turning at speed
    airControlFactor: 0.15,
  },

  ramming: {
    minSpeed: 0.8,
    strength: 6.0,
    maxImpulse: 120.0,
  },

  fall: {
    yThreshold: -6,
    respawnDelayMs: 600,
  },

  camera: {
    fov: 55,
    minFov: 50,
    maxFov: 75,
    followBack: 7.6,
    followUp: 3.54,
    lookAhead: 5.0,
    lookUp: 1.2,
    positionDamping: 10.0,
    rotationDamping: 12.0,
    snapDistance: 40.0,
  },

  audio: {
    hornVolume: 0.45,
    hornRefDistance: 5,
    hornRolloffFactor: 1.5,
    musicVolume: 0.15,
    // * Sparse IR convolver on buffered horn: dry spike + soft reflections.
    hornEchoIrDurationSec: 0.16,
    hornEchoTaps: [
      { delaySec: 0.032, gain: 0.1 },
      { delaySec: 0.058, gain: 0.055 },
      { delaySec: 0.09, gain: 0.03 },
    ],
    // * Procedural horn: parallel delay tap (matches convolver feel).
    hornEchoProceduralDelaySec: 0.04,
    hornEchoProceduralDry: 0.88,
    hornEchoProceduralWet: 0.14,
    // * Chance the NPC honks when a ram into the player is registered.
    aiRamHornChance: 0.38,
  },
};

CONFIG.record.swirl.falloffRadius = CONFIG.record.radius * 0.75;
CONFIG.cart.spawnRingRadius = CONFIG.record.radius * 0.7;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildRecordRingGeometry({ outerRadius, innerRadius, thickness, curveSegments }) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments,
  });

  // ExtrudeGeometry extrudes along +Z; center it and rotate so thickness becomes Y (floor height).
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

function yawFromQuaternion(q) {
  // Assumes Y-up.
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny, cosy);
}

function getForwardRightFromYaw(yaw) {
  // Coordinate convention for this prototype:
  // - Camera sits behind the cart at +Z.
  // - "Forward" (W) should move away from the camera, toward -Z when yaw = 0.
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  return { forward, right };
}

function vec3ToRapier(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function rapierToVec3(v) {
  return new THREE.Vector3(v.x, v.y, v.z);
}

function getBodyMass(body) {
  if (body && typeof body.mass === "function") return body.mass();
  return 1;
}

function planarSpeed(v) {
  return Math.hypot(v.x, v.z);
}

function vec3PlanarDirection(v) {
  const d = new THREE.Vector3(v.x, 0, v.z);
  const len = d.length();
  if (len <= 1e-6) return null;
  return d.multiplyScalar(1 / len);
}

/**
 * @param {number} mass
 * @param {number} hx
 * @param {number} hy
 * @param {number} hz
 * @param {{ x: number; y: number; z: number }} comOffsetFromColliderCenter
 * @returns {{ ix: number; iy: number; iz: number }}
 */
function principalInertiaForTranslatedBox(mass, hx, hy, hz, comOffsetFromColliderCenter) {
  // * Solid cuboid inertia about its geometric center (principal axes align with the box).
  const ix0 = (mass / 12) * (4 * hy * hy + 4 * hz * hz);
  const iy0 = (mass / 12) * (4 * hx * hx + 4 * hz * hz);
  const iz0 = (mass / 12) * (4 * hx * hx + 4 * hy * hy);

  // * Parallel axis theorem: shift inertia to a new body origin given an explicit center of mass.
  const x = comOffsetFromColliderCenter.x;
  const y = comOffsetFromColliderCenter.y;
  const z = comOffsetFromColliderCenter.z;
  const r2 = x * x + y * y + z * z;
  const ix = ix0 + mass * (r2 - x * x);
  const iy = iy0 + mass * (r2 - y * y);
  const iz = iz0 + mass * (r2 - z * z);

  return { ix, iy, iz };
}

/**
 * @param {any} body
 * @param {any} collider
 * @param {{ label: string; hx: number; hy: number; hz: number; colliderLocalY: number }}
 */
function applyCartMassPropertiesOverride(body, collider, { label, hx, hy, hz, colliderLocalY }) {
  // * Capture Rapier's default mass from the cuboid collider, then move mass to the collider without contributing mass.
  let baseMass =
    collider && typeof collider.mass === "function"
      ? collider.mass()
      : typeof body.mass === "function"
        ? body.mass()
        : 1;
  if (!Number.isFinite(baseMass) || baseMass <= 0) {
    baseMass = 1;
  }

  if (typeof collider.setDensity === "function") {
    collider.setDensity(0);
  }

  const targetCom = new RAPIER.Vector3(0, -0.55, 0);

  const comOffsetFromColliderCenter = {
    x: 0,
    y: -0.55 - colliderLocalY,
    z: 0,
  };
  const { ix, iy, iz } = principalInertiaForTranslatedBox(
    baseMass,
    hx,
    hy,
    hz,
    comOffsetFromColliderCenter,
  );

  body.setAdditionalMassProperties(
    baseMass,
    targetCom,
    new RAPIER.Vector3(ix, iy, iz),
    RAPIER.RotationOps.identity(),
    true,
  );

  if (typeof body.recomputeMassPropertiesFromColliders === "function") {
    body.recomputeMassPropertiesFromColliders(true);
  }

  const com = body.localCom();
  const inertia = body.principalInertia();
  // eslint-disable-next-line no-console
  console.log(`[cart:${label}] massProperties`, {
    mass: body.mass(),
    localCom: { x: com.x, y: com.y, z: com.z },
    principalInertia: { x: inertia.x, y: inertia.y, z: inertia.z },
  });
}

function wrapAngleRad(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// * Mono IR: direct impulse plus sparse taps for subtle echo via ConvolverNode.
function buildSparseEchoImpulseResponse(audioContext) {
  const rate = audioContext.sampleRate;
  const dur = CONFIG.audio.hornEchoIrDurationSec;
  const len = Math.max(1, Math.ceil(dur * rate));
  const buffer = audioContext.createBuffer(1, len, rate);
  const ch0 = buffer.getChannelData(0);
  ch0[0] = 1;
  for (const tap of CONFIG.audio.hornEchoTaps) {
    const i = Math.min(len - 1, Math.round(tap.delaySec * rate));
    ch0[i] += tap.gain;
  }
  return buffer;
}

async function main() {
  await RAPIER.init();

  const canvas = document.getElementById(CONFIG.canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Canvas element '#${CONFIG.canvasId}' not found.`);
  }
  // Make canvas able to receive keyboard focus.
  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  // Try to focus immediately on load (some browsers require a user gesture;
  // pointerdown above covers that).
  setTimeout(() => canvas.focus(), 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(CONFIG.backgroundColor, 1);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 0, 0);

  const audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  const cameraState = {
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
  };

  const cartLinvelScratch = new THREE.Vector3();

  function dampFactor(lambda, dt) {
    return 1 - Math.exp(-lambda * dt);
  }

  function updateCameraFraming() {
    const aspect = window.innerWidth / window.innerHeight;
    const portraitBoost = (1 / Math.max(0.5, aspect)) - 1;
    const wideBoost = Math.max(0, aspect - 1.8);
    const fov =
      CONFIG.camera.fov +
      portraitBoost * 18 +
      wideBoost * 7;
    camera.fov = clamp(fov, CONFIG.camera.minFov, CONFIG.camera.maxFov);
  }

  function updateViewport() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    updateCameraFraming();
    camera.updateProjectionMatrix();
  }

  updateViewport();

  // Minimal ambient + a few colored spotlights for "neon" vibe.
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  const platformTopY = CONFIG.record.y + CONFIG.record.thickness / 2;

  function addSpotlightWithCone({ color, position, intensity, target }) {
    const light = new THREE.SpotLight(color, intensity, 60, Math.PI / 5.4, 0.75, 1.1);
    light.position.copy(position);
    light.target.position.set(target.x, platformTopY, target.z);
    scene.add(light);
    scene.add(light.target);

    // Fake a visible light cone without fog (simple transparent cone mesh).
    const coneTarget = new THREE.Vector3(target.x, platformTopY, target.z);
    const height = Math.max(0.01, position.y - platformTopY);
    const radius = Math.tan(light.angle) * height;
    const coneGeo = new THREE.ConeGeometry(radius, height, 18, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const coneMesh = new THREE.Mesh(coneGeo, coneMat);
    const mid = position.clone().add(coneTarget).multiplyScalar(0.5);
    coneMesh.position.copy(mid);
    coneMesh.lookAt(coneTarget);
    coneMesh.rotateX(Math.PI / 2); // orient cone axis along -Z
    scene.add(coneMesh);

    return { light, coneMesh };
  }

  addSpotlightWithCone({
    color: 0xff2bd6,
    position: new THREE.Vector3(-16, 20, 12),
    intensity: 110,
    target: new THREE.Vector3(-12, 0, 9),
  });
  addSpotlightWithCone({
    color: 0x2bd6ff,
    position: new THREE.Vector3(16, 20, 12),
    intensity: 110,
    target: new THREE.Vector3(12, 0, 9),
  });
  addSpotlightWithCone({
    color: 0x8dff2b,
    position: new THREE.Vector3(0, 20, -18),
    intensity: 95,
    target: new THREE.Vector3(0, 0, -13),
  });

  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);

  // --- Record platform (visual rotates, physics stays fixed for day 1) ---
  const recordGeo = buildRecordRingGeometry({
    outerRadius: CONFIG.record.radius,
    innerRadius: CONFIG.record.innerRadius,
    thickness: CONFIG.record.thickness,
    curveSegments: 64,
  });
  const recordMat = new THREE.MeshStandardMaterial({
    color: CONFIG.record.color,
    roughness: 0.95,
    metalness: 0.15,
  });
  const recordMesh = new THREE.Mesh(recordGeo, recordMat);
  recordMesh.position.set(0, CONFIG.record.y, 0);
  recordMesh.receiveShadow = false;
  scene.add(recordMesh);

  // Neon rim (visual only).
  const rimMat = new THREE.MeshStandardMaterial({
    color: CONFIG.record.rimColor,
    emissive: CONFIG.record.rimColor,
    emissiveIntensity: 2.2,
    roughness: 0.5,
    metalness: 0.0,
    depthWrite: false,
  });
  // * Beveled ExtrudeGeometry extends past nominal outerRadius — inset torus (0.985*r) sits inside the floor mesh and
  // * disappears; place slightly outside the nominal edge (mirrors inner rim * 1.015) so the neon ring stays visible.
  const rimGeo = new THREE.TorusGeometry(CONFIG.record.radius * 1.015, 0.12, 10, 72);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.set(0, CONFIG.record.y + CONFIG.record.thickness / 2 + 0.02, 0);
  rimMesh.rotation.x = Math.PI / 2;
  scene.add(rimMesh);

  // Inner neon rim (visual only): sells the hole edge.
  const innerRimGeo = new THREE.TorusGeometry(CONFIG.record.innerRadius * 1.02, 0.12, 10, 72);
  const innerRimMesh = new THREE.Mesh(innerRimGeo, rimMat);
  innerRimMesh.position.set(0, CONFIG.record.y + CONFIG.record.thickness / 2 + 0.03, 0);
  innerRimMesh.rotation.x = Math.PI / 2;
  scene.add(innerRimMesh);

  const recordBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, CONFIG.record.y, 0),
  );

  const recordVerts = /** @type {Float32Array} */ (recordGeo.attributes.position.array);
  const recordIndices = recordGeo.index
    ? Uint32Array.from(recordGeo.index.array)
    : Uint32Array.from(
        Array.from({ length: recordGeo.attributes.position.count }, (_, i) => i),
      );
  const recordColliderDesc = RAPIER.ColliderDesc.trimesh(recordVerts, recordIndices)
    .setFriction(CONFIG.record.friction)
    .setRestitution(CONFIG.record.restitution);
  const recordCollider = world.createCollider(recordColliderDesc, recordBody);
  void recordCollider;

  if (CONFIG.debug.arenaTrimesh) {
    const vCount = recordGeo.attributes.position.count;
    const iCount = recordGeo.index ? recordGeo.index.count : vCount;
    // eslint-disable-next-line no-console
    console.log("[arena] record ring trimesh", {
      vertices: vCount,
      indices: iCount,
      triangles: Math.floor(iCount / 3),
    });
  }

  function yawToCenter(spawn) {
    // Our yaw convention yields forward = (-sin(yaw), 0, -cos(yaw)).
    // Facing the center means forward should point from spawn -> (0,0).
    return Math.atan2(spawn.x, spawn.z);
  }

  function quatFromYaw(yaw) {
    const half = yaw / 2;
    return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
  }

  function createCart({ color, spawn, spawnYaw, label, slotIndex }) {
    const mesh = buildCart(color);
    scene.add(mesh);

    const spawnFrozen = { x: spawn.x, y: spawn.y, z: spawn.z };

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnFrozen.x, spawnFrozen.y, spawnFrozen.z)
        .setLinearDamping(CONFIG.cart.linearDamping)
        .setAngularDamping(CONFIG.cart.angularDamping),
    );
    body.setRotation(quatFromYaw(spawnYaw), true);
    // Keep the cart responsive; some Rapier builds may sleep bodies aggressively.
    if (typeof body.setCanSleep === "function") {
      body.setCanSleep(false);
    }

    const hx = CONFIG.cart.size.x / 2;
    const hy = CONFIG.cart.size.y / 2;
    const hz = CONFIG.cart.size.z / 2;
    const colliderLocalY = -0.12;

    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(0, colliderLocalY, 0)
      .setFriction(CONFIG.cart.friction)
      .setRestitution(CONFIG.cart.restitution);
    if (typeof colliderDesc.setActiveEvents === "function") {
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    }
    const collider = world.createCollider(colliderDesc, body);

    applyCartMassPropertiesOverride(body, collider, {
      label,
      hx,
      hy,
      hz,
      colliderLocalY,
    });

    return {
      mesh,
      body,
      collider,
      spawn: spawnFrozen,
      spawnYaw,
      slotIndex,
      respawnAtMs: null,
      pendingRam: null,
    };
  }

  function scheduleRespawn(cart, now) {
    if (cart.respawnAtMs !== null) return;
    cart.respawnAtMs = now + CONFIG.fall.respawnDelayMs;
  }

  function doRespawn(cart) {
    cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y, z: cart.spawn.z }, true);
    cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    cart.body.setRotation(quatFromYaw(cart.spawnYaw), true);
    cart.respawnAtMs = null;
    cart.pendingRam = null;
    resetCartVisualState(cart.mesh);
  }

  function applyArcadeControls(cart, axis, dtFixed) {
    const pos = cart.body.translation();
    const rot = cart.body.rotation();
    const linvel = cart.body.linvel();
    const mass = getBodyMass(cart.body);

    const onGround = pos.y <= 1.25; // cheap heuristic good enough for day 1
    const controlFactor = onGround ? 1 : CONFIG.driving.airControlFactor;

    const yaw = yawFromQuaternion(rot);
    const { forward, right } = getForwardRightFromYaw(yaw);

    const v = rapierToVec3(linvel);
    const vForward = forward.dot(v);
    const vRight = right.dot(v);

    if (axis.forward !== 0 || axis.turn !== 0) {
      cart.body.wakeUp();
    }

    const grip =
      axis.turn !== 0
        ? CONFIG.driving.lateralGrip * CONFIG.driving.driftGripFactor
        : CONFIG.driving.lateralGrip;
    const dvRight = (-vRight) * grip * dtFixed;
    const gripImpulse = right.clone().multiplyScalar(mass * dvRight);
    cart.body.applyImpulse(vec3ToRapier(gripImpulse), true);

    if (axis.forward !== 0) {
      const targetSpeed =
        axis.forward > 0 ? CONFIG.driving.maxSpeed : -CONFIG.driving.reverseMaxSpeed;
      const speedError = targetSpeed - vForward;
      const maxDeltaV = CONFIG.driving.accel * controlFactor * dtFixed;
      const dvForward = clamp(speedError, -maxDeltaV, maxDeltaV);
      if (Math.abs(dvForward) > 1e-4) {
        const driveImpulse = forward.clone().multiplyScalar(mass * dvForward);
        cart.body.applyImpulse(vec3ToRapier(driveImpulse), true);
      }
    }

    if (axis.turn !== 0) {
      const av = cart.body.angvel();
      const desiredYawRate = axis.turn * CONFIG.driving.tankYawRate * controlFactor;
      const yawError = desiredYawRate - av.y;
      const torqueImpulseY = yawError * CONFIG.driving.yawResponsiveness * mass * dtFixed;
      cart.body.applyTorqueImpulse({ x: 0, y: torqueImpulseY, z: 0 }, true);

      const speedForDrift = Math.abs(vForward);
      if (speedForDrift > 0.25) {
        const driftDir = right.clone().multiplyScalar(axis.turn * Math.sign(vForward || 1));
        const driftMag =
          speedForDrift *
          CONFIG.driving.driftImpulseStrength *
          controlFactor *
          mass *
          dtFixed;
        cart.body.applyImpulse(vec3ToRapier(driftDir.multiplyScalar(driftMag)), true);
      }
    }
  }

  function spawnOnRingForSlot(slotIndex) {
    const ringR = CONFIG.cart.spawnRingRadius;
    const angle = (slotIndex * Math.PI) / 2;
    return {
      x: ringR * Math.cos(angle),
      y: CONFIG.cart.spawnHeight,
      z: ringR * Math.sin(angle),
    };
  }

  const playerSpawn = spawnOnRingForSlot(0);
  const playerCart = createCart({
    color: 0x2bd6ff,
    spawn: playerSpawn,
    spawnYaw: yawToCenter(playerSpawn),
    label: "player",
    slotIndex: 0,
  });

  const NPC_TEST_COLORS = [0xff2bd6, 0x8dff2b, 0xffee00, 0xff8800, 0xaa66ff];
  const npcCount = Math.max(0, Math.floor(CONFIG.npcCount));
  const npcCarts = [];
  const npcSlotIndices = [1, 2, 3];
  for (let i = 0; i < npcCount; i += 1) {
    const slotIndex = npcSlotIndices[i];
    const spawn = spawnOnRingForSlot(slotIndex);
    const cart = createCart({
      color: NPC_TEST_COLORS[i % NPC_TEST_COLORS.length],
      spawn,
      spawnYaw: yawToCenter(spawn),
      label: `npc-${i}`,
      slotIndex,
    });
    cart.aiNextDecisionMs = 0;
    cart.aiTarget = { x: 0, z: 0 };
    npcCarts.push(cart);
  }

  const colliderHandleToCart = new Map();
  colliderHandleToCart.set(playerCart.collider.handle, playerCart);
  for (const c of npcCarts) {
    colliderHandleToCart.set(c.collider.handle, c);
  }

  const allCarts = [playerCart, ...npcCarts];

  /**
   * * Planar tangential push toward the record rim: strongest at center, ~0 beyond falloffRadius.
   * @param {number} fixedDt
   * @param {(sample: { r: number; falloff: number; impulseMag: number; skippedSmallR?: boolean }) => void} [onPlayerSample]
   */
  function applyRecordSwirlImpulsesForSubstep(fixedDt, onPlayerSample) {
    const swirl = CONFIG.record.swirl;
    if (!swirl.enabled) return;

    const maxF = swirl.maxForce;
    const falloffR = swirl.falloffRadius;
    const exp = swirl.falloffExponent;
    const dirSign = swirl.direction;
    const rec = recordBody.translation();
    const cx = rec.x;
    const cz = rec.z;

    for (const cart of allCarts) {
      const p = cart.body.translation();
      const relX = p.x - cx;
      const relZ = p.z - cz;
      const r = Math.hypot(relX, relZ);
      if (r < 0.01) {
        if (cart === playerCart && typeof onPlayerSample === "function") {
          onPlayerSample({ r, falloff: 0, impulseMag: 0, skippedSmallR: true });
        }
        continue;
      }
      const raw = 1 - r / falloffR;
      const falloff = Math.max(0, raw) ** exp;
      const forceMag = maxF * falloff;
      const tx = (-relZ / r) * dirSign;
      const tz = (relX / r) * dirSign;
      const impulseMag = forceMag * fixedDt;
      cart.body.applyImpulse(
        { x: tx * forceMag * fixedDt, y: 0, z: tz * forceMag * fixedDt },
        true,
      );
      if (cart === playerCart && typeof onPlayerSample === "function") {
        onPlayerSample({ r, falloff, impulseMag });
      }
    }
  }

  function pickAiTarget(fromPos) {
    const dist = Math.hypot(fromPos.x, fromPos.z);
    const edgeBiasStart = CONFIG.record.radius * 0.78;
    if (dist > edgeBiasStart) return { x: 0, z: 0 };

    const r = Math.sqrt(Math.random()) * (CONFIG.record.radius * 0.85);
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  /**
   * @param {number} now
   * @param {{ body: any; aiNextDecisionMs: number; aiTarget: { x: number; z: number } }} cart
   */
  function getAiAxis(now, cart) {
    const p = cart.body.translation();
    if (now >= cart.aiNextDecisionMs) {
      cart.aiTarget = pickAiTarget(p);
      cart.aiNextDecisionMs = now + (2000 + Math.random() * 2000);
    }

    const toTarget = new THREE.Vector3(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    if (toTarget.lengthSq() < 0.25) {
      cart.aiTarget = pickAiTarget(p);
      cart.aiNextDecisionMs = now + (2000 + Math.random() * 2000);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    }
    toTarget.normalize();

    const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
    const currentYaw = yawFromQuaternion(cart.body.rotation());
    const yawDiff = wrapAngleRad(desiredYaw - currentYaw);

    const turn = clamp(yawDiff * 1.4, -1, 1);
    const forward = Math.abs(yawDiff) > 2.2 ? -0.5 : 1;
    return { forward, turn };
  }

  // --- Input ---
  const keys = new Set();
  const handledCodes = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowLeft",
    "ArrowDown",
    "ArrowRight",
  ]);

  // --- Horn (positional at player cart) & ambient music ---
  const hornUrlWav = new URL("sounds/horn.wav", window.location.href).toString();
  const hornUrlMp3 = new URL("sounds/horn.mp3", window.location.href).toString();

  const hornEchoIRBuffer = buildSparseEchoImpulseResponse(audioListener.context);

  const playerCartHorn = new THREE.PositionalAudio(audioListener);
  playerCart.mesh.add(playerCartHorn);
  playerCartHorn.setRefDistance(CONFIG.audio.hornRefDistance);
  playerCartHorn.setRolloffFactor(CONFIG.audio.hornRolloffFactor);
  playerCartHorn.setVolume(CONFIG.audio.hornVolume);
  const playerHornEchoConvolver = audioListener.context.createConvolver();
  playerHornEchoConvolver.buffer = hornEchoIRBuffer;
  playerHornEchoConvolver.normalize = false;
  playerCartHorn.setFilter(playerHornEchoConvolver);

  /** @type {{ horn: THREE.PositionalAudio; cart: (typeof playerCart) }[]} */
  const npcHornEntries = [];
  for (const c of npcCarts) {
    const horn = new THREE.PositionalAudio(audioListener);
    c.mesh.add(horn);
    horn.setRefDistance(CONFIG.audio.hornRefDistance);
    horn.setRolloffFactor(CONFIG.audio.hornRolloffFactor);
    horn.setVolume(CONFIG.audio.hornVolume);
    const conv = audioListener.context.createConvolver();
    conv.buffer = hornEchoIRBuffer;
    conv.normalize = false;
    horn.setFilter(conv);
    npcHornEntries.push({ horn, cart: c });
  }

  const hornLoader = new THREE.AudioLoader();
  let hornBufferReady = false;

  function loadHornFromMp3() {
    hornLoader.load(
      hornUrlMp3,
      (buffer) => {
        playerCartHorn.setBuffer(buffer);
        for (const { horn } of npcHornEntries) {
          horn.setBuffer(buffer);
        }
        hornBufferReady = true;
      },
      undefined,
      () => {
        // * Horn samples unavailable; procedural horn is used instead.
      },
    );
  }

  hornLoader.load(
    hornUrlWav,
    (buffer) => {
      playerCartHorn.setBuffer(buffer);
      for (const { horn } of npcHornEntries) {
        horn.setBuffer(buffer);
      }
      hornBufferReady = true;
    },
    undefined,
    () => {
      loadHornFromMp3();
    },
  );

  const musicUrl = new URL("sounds/music.mp3", window.location.href).toString();
  const musicEl = new Audio();
  musicEl.loop = true;
  musicEl.volume = CONFIG.audio.musicVolume;
  musicEl.preload = "auto";
  musicEl.src = musicUrl;
  let musicStarted = false;
  let musicUnavailable = false;
  musicEl.addEventListener("error", () => {
    musicUnavailable = true;
  });
  musicEl.load();

  let audioMuted = false;
  const muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.setAttribute("aria-label", "Mute game audio");
  muteBtn.title = "Mute (M)";
  Object.assign(muteBtn.style, {
    position: "fixed",
    bottom: "14px",
    right: "86px",
    zIndex: "10000",
    width: "42px",
    height: "42px",
    padding: "0",
    margin: "0",
    boxSizing: "border-box",
    border: "1px solid rgba(255, 43, 214, 0.55)",
    borderRadius: "10px",
    cursor: "pointer",
    background: "rgba(7, 0, 16, 0.72)",
    color: "#e8f6ff",
    fontSize: "22px",
    lineHeight: "1",
    boxShadow: "0 0 14px rgba(43, 214, 255, 0.22)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  });

  function applySessionAudioMute() {
    audioListener.setMasterVolume(audioMuted ? 0 : 1);
    musicEl.muted = audioMuted;
  }

  function refreshMuteButtonUi() {
    muteBtn.textContent = audioMuted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-label", audioMuted ? "Unmute game audio" : "Mute game audio");
    muteBtn.title = audioMuted ? "Unmute (M)" : "Mute (M)";
    muteBtn.setAttribute("aria-pressed", audioMuted ? "true" : "false");
  }

  function toggleSessionAudioMute() {
    audioMuted = !audioMuted;
    applySessionAudioMute();
    refreshMuteButtonUi();
  }

  muteBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    toggleSessionAudioMute();
  });
  document.body.appendChild(muteBtn);
  refreshMuteButtonUi();

  function tryStartAmbientMusic() {
    if (musicStarted || musicUnavailable) return;
    void musicEl.play().then(
      () => {
        musicStarted = true;
      },
      () => {
        // * Autoplay may block until a gesture; missing file sets musicUnavailable.
      },
    );
  }

  function unlockAudioAndMaybeStartMusic() {
    void audioListener.context.resume();
    tryStartAmbientMusic();
  }

  canvas.addEventListener("pointerdown", () => {
    unlockAudioAndMaybeStartMusic();
    canvas.focus();
  });
  window.addEventListener("pointerdown", unlockAudioAndMaybeStartMusic, { passive: true });

  function playProceduralHornAtCart(cart) {
    const ctx = audioListener.context;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const duration = 0.24;

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + duration * 0.55);
    osc.frequency.exponentialRampToValueAtTime(620, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, now);
    filter.Q.setValueAtTime(7, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const panner = ctx.createPannerNode();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = CONFIG.audio.hornRefDistance;
    panner.rolloffFactor = CONFIG.audio.hornRolloffFactor;
    const p = cart.body.translation();
    if (panner.positionX) {
      panner.positionX.setValueAtTime(p.x, now);
      panner.positionY.setValueAtTime(p.y, now);
      panner.positionZ.setValueAtTime(p.z, now);
    } else {
      panner.setPosition(p.x, p.y, p.z);
    }

    const echoDry = ctx.createGain();
    echoDry.gain.value = CONFIG.audio.hornEchoProceduralDry;
    const echoWet = ctx.createGain();
    echoWet.gain.value = CONFIG.audio.hornEchoProceduralWet;
    const echoDelay = ctx.createDelay(0.25);
    echoDelay.delayTime.value = CONFIG.audio.hornEchoProceduralDelaySec;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(echoDry);
    gain.connect(echoDelay);
    echoDelay.connect(echoWet);
    echoDry.connect(panner);
    echoWet.connect(panner);
    panner.connect(audioListener.gain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playBufferHorn(hornPositional, cartForProcedural) {
    void audioListener.context.resume();
    if (hornBufferReady) {
      if (hornPositional.isPlaying) {
        hornPositional.stop();
      }
      try {
        hornPositional.play();
      } catch {
        playProceduralHornAtCart(cartForProcedural);
      }
      return;
    }
    playProceduralHornAtCart(cartForProcedural);
  }

  function playHorn() {
    playBufferHorn(playerCartHorn, playerCart);
  }

  function maybePlayAiRamHornOnPlayerHit(rammerCart) {
    if (Math.random() >= CONFIG.audio.aiRamHornChance) return;
    const entry = npcHornEntries.find((e) => e.cart === rammerCart);
    if (!entry) return;
    playBufferHorn(entry.horn, rammerCart);
  }

  function applyRammingImpulse(rammer, victim) {
    const rv = rammer.body.linvel();
    const speed = planarSpeed(rv);
    if (speed < CONFIG.ramming.minSpeed) return;

    const dir = vec3PlanarDirection(rv);
    if (!dir) return;

    const rp = rammer.body.translation();
    const vp = victim.body.translation();
    const toVictim = new THREE.Vector3(vp.x - rp.x, 0, vp.z - rp.z);
    if (toVictim.lengthSq() < 1e-6) return;
    toVictim.normalize();

    // Only count as a "ram" if moving roughly toward the other cart.
    if (dir.dot(toVictim) < 0.1) return;

    if (victim === playerCart && npcCarts.includes(rammer)) {
      maybePlayAiRamHornOnPlayerHit(rammer);
    }

    const impulseMag = clamp(
      CONFIG.ramming.strength * speed * getBodyMass(victim.body),
      0,
      CONFIG.ramming.maxImpulse,
    );
    const impulse = { x: dir.x * impulseMag, y: 0, z: dir.z * impulseMag };

    // Spread impact over a few physics steps to reduce jitter spikes.
    const steps = 3;
    if (!victim.pendingRam) {
      victim.pendingRam = { impulse, remainingSteps: steps };
      return;
    }
    victim.pendingRam.impulse.x += impulse.x;
    victim.pendingRam.impulse.y += impulse.y;
    victim.pendingRam.impulse.z += impulse.z;
    victim.pendingRam.remainingSteps = Math.max(victim.pendingRam.remainingSteps, steps);
  }

  function onKeyDown(e) {
    unlockAudioAndMaybeStartMusic();
    if (e.code === "KeyM") {
      if (e.repeat) return;
      e.preventDefault();
      toggleSessionAudioMute();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      playHorn();
      return;
    }
    if (handledCodes.has(e.code)) e.preventDefault();
    keys.add(e.code);
    if (CONFIG.debug.input && handledCodes.has(e.code)) {
      // eslint-disable-next-line no-console
      console.log("[input] keydown", e.code);
    }
  }
  function onKeyUp(e) {
    if (handledCodes.has(e.code)) e.preventDefault();
    keys.delete(e.code);
  }
  // Attach to both window and canvas so input works regardless of focus quirks.
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  canvas.addEventListener("keydown", onKeyDown, { passive: false });
  canvas.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", () => keys.clear());

  function getAxis() {
    const forward =
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) +
      (keys.has("KeyS") || keys.has("ArrowDown") ? -1 : 0);
    const turn =
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
      (keys.has("KeyD") || keys.has("ArrowRight") ? -1 : 0);
    return { forward: clamp(forward, -1, 1), turn: clamp(turn, -1, 1) };
  }

  // --- Simulation loop (fixed timestep) ---
  let lastT = performance.now();
  let accumulator = 0;
  let lastDebugMs = 0;
  let simFrameIndex = 0;
  let recordVersusPlayerFrame30Logged = false;
  let playerSwirlFrame120Logged = false;
  /** @type {ReadonlySet<number>} */
  const NPC_INWARD_DRIFT_LOG_FRAMES = new Set([1, 5, 15, 30]);
  /** @type {{ r: number; falloff: number; impulseMag: number; skippedSmallR?: boolean } | null} */
  let playerSwirlFrame120Sample = null;

  function step(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    accumulator += dt;

    simFrameIndex += 1;
    if (simFrameIndex === 120) {
      playerSwirlFrame120Sample = null;
    }

    if (simFrameIndex === 30 && !recordVersusPlayerFrame30Logged) {
      recordVersusPlayerFrame30Logged = true;
      const playerT = playerCart.body.translation();
      const ringR = CONFIG.cart.spawnRingRadius;
      const spawnSlotAxisTol = 0.01;
      const cartRows = allCarts.map((cart) => {
        const t = cart.body.translation();
        const s = cart.spawn;
        const expectedSpawn = spawnOnRingForSlot(cart.slotIndex);
        const distPlayer = Math.hypot(t.x - playerT.x, t.y - playerT.y, t.z - playerT.z);
        const distOrigin = Math.hypot(t.x, t.y, t.z);
        const distOriginXZ = Math.hypot(t.x, t.z);
        const id =
          cart === playerCart ? "player" : `npc-${npcCarts.indexOf(cart)}`;
        return {
          id,
          slotIndex: cart.slotIndex,
          translation: { x: t.x, y: t.y, z: t.z },
          spawnAtCreation: { x: s.x, y: s.y, z: s.z },
          expectedSpawnForSlot: { x: expectedSpawn.x, y: expectedSpawn.y, z: expectedSpawn.z },
          spawnRecordDeltaFromSlot: {
            x: s.x - expectedSpawn.x,
            y: s.y - expectedSpawn.y,
            z: s.z - expectedSpawn.z,
          },
          distanceToPlayer: distPlayer,
          distanceToWorldOrigin: distOrigin,
          distanceToWorldOriginXZ: distOriginXZ,
        };
      });
      const expectedAdjacent = ringR * Math.SQRT2;
      const expectedOpposite = 2 * ringR;
      const planarRingTolerance = 0.1;
      const chordTolerance = 0.5;
      const planarOk = cartRows.every(
        (row) => Math.abs(row.distanceToWorldOriginXZ - ringR) <= planarRingTolerance,
      );
      const spawnRecordsMatchSlotPositions = cartRows.every((row) => {
        const d = row.spawnRecordDeltaFromSlot;
        return (
          Math.abs(d.x) <= spawnSlotAxisTol &&
          Math.abs(d.y) <= spawnSlotAxisTol &&
          Math.abs(d.z) <= spawnSlotAxisTol
        );
      });
      const playerDistChecks = cartRows
        .filter((row) => row.id !== "player")
        .map((row, j) => {
          const slotDelta = j + 1;
          const expectedChord =
            slotDelta === 2 ? expectedOpposite : expectedAdjacent;
          return {
            toId: row.id,
            distanceToPlayer: row.distanceToPlayer,
            expectedChord,
            matchesExpected:
              Math.abs(row.distanceToPlayer - expectedChord) <= chordTolerance,
          };
        });
      // eslint-disable-next-line no-console
      console.log("[diagnostic] spawn layout @ sim frame 30", {
        layoutConstants: {
          spawnRingRadius: ringR,
          spawnHeight: CONFIG.cart.spawnHeight,
          npcCount: npcCarts.length,
        },
        verification: {
          spawnRecordsMatchSlotPositionsWithin001: spawnRecordsMatchSlotPositions,
          spawnSlotAxisTolerance: spawnSlotAxisTol,
          allPlanarOriginDistancesWithinToleranceOfRing: planarOk,
          planarRingTolerance,
          expectedAdjacentChord: expectedAdjacent,
          expectedOppositeChord: expectedOpposite,
          chordTolerance,
          fromPlayerChordChecks: playerDistChecks,
        },
        carts: cartRows,
      });
    }

    // Visual-only record rotation.
    recordMesh.rotation.y += CONFIG.record.rotationSpeedRadPerSec * dt;

    const playerAxis = getAxis();

    const playerPos = playerCart.body.translation();

    // Fall detection / respawn.
    if (playerPos.y < CONFIG.fall.yThreshold) scheduleRespawn(playerCart, now);
    if (playerCart.respawnAtMs !== null && now >= playerCart.respawnAtMs) {
      doRespawn(playerCart);
    }
    for (const c of npcCarts) {
      const p = c.body.translation();
      if (p.y < CONFIG.fall.yThreshold) scheduleRespawn(c, now);
      if (c.respawnAtMs !== null && now >= c.respawnAtMs) {
        doRespawn(c);
      }
    }

    // Third-person follow camera (behind the cart), smoothed.
    const playerRot = playerCart.body.rotation();
    const playerQuat = new THREE.Quaternion(
      playerRot.x,
      playerRot.y,
      playerRot.z,
      playerRot.w,
    );
    const playerPosition = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    const forwardWorld = new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuat);

    const desiredPos = playerPosition
      .clone()
      .addScaledVector(forwardWorld, -CONFIG.camera.followBack)
      .add(new THREE.Vector3(0, CONFIG.camera.followUp, 0));

    const desiredLook = playerPosition
      .clone()
      .addScaledVector(forwardWorld, CONFIG.camera.lookAhead)
      .add(new THREE.Vector3(0, CONFIG.camera.lookUp, 0));

    // Desired camera rotation from look direction.
    const lookMat = new THREE.Matrix4().lookAt(
      desiredPos,
      desiredLook,
      new THREE.Vector3(0, 1, 0),
    );
    const desiredQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);

    if (cameraState.pos.distanceTo(desiredPos) > CONFIG.camera.snapDistance) {
      cameraState.pos.copy(desiredPos);
      cameraState.quat.copy(desiredQuat);
    } else {
      const posAlpha = dampFactor(CONFIG.camera.positionDamping, dt);
      const rotAlpha = dampFactor(CONFIG.camera.rotationDamping, dt);
      cameraState.pos.lerp(desiredPos, posAlpha);
      cameraState.quat.slerp(desiredQuat, rotAlpha);
    }

    camera.position.copy(cameraState.pos);
    camera.quaternion.copy(cameraState.quat);

    // Debug: print velocity while input is held (throttled).
    if (
      CONFIG.debug.velocity &&
      (playerAxis.forward !== 0 || playerAxis.turn !== 0) &&
      now - lastDebugMs >= 100
    ) {
      const lv = playerCart.body.linvel();
      const sleeping =
        typeof playerCart.body.isSleeping === "function"
          ? playerCart.body.isSleeping()
          : "unknown";
      // eslint-disable-next-line no-console
      console.log(
        "[debug] linvel",
        { x: lv.x.toFixed(3), y: lv.y.toFixed(3), z: lv.z.toFixed(3) },
        "sleeping=",
        sleeping,
      );
      lastDebugMs = now;
    }

    // Fixed substeps for stability/consistency.
    const accumulatorEnteringPhysics = accumulator;
    let substeps = 0;
    /** @type {Map<object, { forward: number; turn: number }>} */
    const npcDiagLastAiByCart = new Map();
    while (
      accumulator >= CONFIG.fixedTimeStep &&
      substeps < CONFIG.maxSubsteps
    ) {
      applyArcadeControls(playerCart, playerAxis, CONFIG.fixedTimeStep);
      for (const c of npcCarts) {
        const aiAxis = getAiAxis(now, c);
        npcDiagLastAiByCart.set(c, aiAxis);
        applyArcadeControls(c, aiAxis, CONFIG.fixedTimeStep);
      }

      // Apply any pending ramming impulses over multiple physics steps.
      for (const cart of allCarts) {
        if (!cart.pendingRam) continue;
        const { impulse, remainingSteps } = cart.pendingRam;
        const denom = Math.max(1, remainingSteps);
        cart.body.applyImpulse(
          { x: impulse.x / denom, y: impulse.y / denom, z: impulse.z / denom },
          true,
        );
        cart.pendingRam.remainingSteps -= 1;
        if (cart.pendingRam.remainingSteps <= 0) cart.pendingRam = null;
      }

      applyRecordSwirlImpulsesForSubstep(CONFIG.fixedTimeStep, (sample) => {
        if (simFrameIndex === 120) {
          playerSwirlFrame120Sample = sample;
        }
      });

      world.step(eventQueue);
      eventQueue.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const c1 = colliderHandleToCart.get(h1);
        const c2 = colliderHandleToCart.get(h2);
        if (!c1 || !c2 || c1 === c2) return;
        applyRammingImpulse(c1, c2);
        applyRammingImpulse(c2, c1);
      });
      accumulator -= CONFIG.fixedTimeStep;
      substeps += 1;
    }

    if (NPC_INWARD_DRIFT_LOG_FRAMES.has(simFrameIndex)) {
      for (const c of npcCarts) {
        const t = c.body.translation();
        const lv = c.body.linvel();
        const av = c.body.angvel();
        const s = c.spawn;
        const aiAxis = npcDiagLastAiByCart.get(c) ?? { forward: 0, turn: 0 };
        // eslint-disable-next-line no-console
        console.log("[diagnostic] npc inward drift on spawn", {
          simFrameIndex,
          label: c.label,
          slotIndex: c.slotIndex,
          linvel: { x: lv.x, y: lv.y, z: lv.z },
          angvel: { x: av.x, y: av.y, z: av.z },
          positionDeltaFromSpawnAtCreation: {
            x: t.x - s.x,
            y: t.y - s.y,
            z: t.z - s.z,
          },
          distanceToWorldOriginXZ: Math.hypot(t.x, t.z),
          aiAxisAppliedLastSubstep: aiAxis,
          aiTarget: { x: c.aiTarget.x, z: c.aiTarget.z },
        });
      }
    }

    if (simFrameIndex <= 10) {
      const fixedTs = CONFIG.fixedTimeStep;
      const maxSub = CONFIG.maxSubsteps;
      const accumEnter = accumulatorEnteringPhysics;
      // eslint-disable-next-line no-console
      console.log("[diagnostic] physics substep gate", {
        simFrameIndex,
        dtSec: dt,
        accumulatorEnteringPhysics: accumEnter,
        accumulatorAfterWhileLoop: accumulator,
        fixedTimeStep: fixedTs,
        maxSubsteps: maxSub,
        whileConditionAccumulatorGteFixedDt: accumEnter >= fixedTs,
        whileConditionSubstepsLtMax: 0 < maxSub,
        substepsThisRenderFrame: substeps,
      });
    }

    if (simFrameIndex === 120 && !playerSwirlFrame120Logged) {
      playerSwirlFrame120Logged = true;
      const swirl = CONFIG.record.swirl;
      const recT = recordBody.translation();
      const t = playerCart.body.translation();
      const rNow = Math.hypot(t.x - recT.x, t.z - recT.z);

      let r = rNow;
      let falloff = 0;
      let impulseMag = 0;
      if (playerSwirlFrame120Sample) {
        r = playerSwirlFrame120Sample.r;
        falloff = playerSwirlFrame120Sample.falloff;
        impulseMag = playerSwirlFrame120Sample.impulseMag;
      } else if (rNow >= 0.01) {
        const raw = 1 - rNow / swirl.falloffRadius;
        falloff = Math.max(0, raw) ** swirl.falloffExponent;
      }

      // eslint-disable-next-line no-console
      console.log("[diagnostic] record swirl @ sim frame 120 (player)", {
        r,
        falloff,
        impulseMag,
        physicsSubstepsThisRenderFrame: substeps,
        swirlEnabled: swirl.enabled,
      });
    }

    // Sync render meshes from physics.
    {
      const p = playerCart.body.translation();
      const r = playerCart.body.rotation();
      playerCart.mesh.position.set(p.x, p.y, p.z);
      playerCart.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      playerCart.mesh.updateMatrixWorld(true);
      const lv = playerCart.body.linvel();
      cartLinvelScratch.set(lv.x, lv.y, lv.z);
      updateCartVisuals(playerCart.mesh, cartLinvelScratch, dt, now);
    }
    for (const c of npcCarts) {
      const p = c.body.translation();
      const r = c.body.rotation();
      c.mesh.position.set(p.x, p.y, p.z);
      c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      c.mesh.updateMatrixWorld(true);
      const lv = c.body.linvel();
      cartLinvelScratch.set(lv.x, lv.y, lv.z);
      updateCartVisuals(c.mesh, cartLinvelScratch, dt, now);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", updateViewport);

  requestAnimationFrame(step);
}

(function initPartyKitHandshake() {
  if (typeof window === "undefined") return;
  const hostname = window.location.hostname;
  const host =
    hostname === "localhost" || hostname === "127.0.0.1"
      ? "127.0.0.1:1999"
      : PARTYKIT_PUBLIC_HOST.trim() || null;
  if (!host) return;

  const socket = new PartySocket({
    host,
    party: "main",
    room: "default",
  });

  socket.addEventListener("open", () => {
    console.log("connected to party");
  });
})();

main();

