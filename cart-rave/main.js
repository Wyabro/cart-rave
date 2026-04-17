import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";

const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x000000,
  debug: {
    input: false,
    velocity: false,
  },

  gravity: -24,
  fixedTimeStep: 1 / 60,
  maxSubsteps: 4,

  record: {
    radius: 20,
    thickness: 0.6,
    y: -0.3,
    rotationSpeedRadPerSec: 0.35,
    friction: 2.2,
    restitution: 0.0,
  },

  cart: {
    size: { x: 1.3, y: 0.9, z: 2.2 },
    spawn: { x: 0, y: 2.5, z: 0 },
    friction: 1.6,
    restitution: 0.0,
    linearDamping: 2.5,
    angularDamping: 3.5,
  },

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
    height: 10,
    distance: 14,
    fov: 60,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function wrapAngleRad(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
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
  canvas.addEventListener("pointerdown", () => {
    canvas.focus();
  });
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
  camera.position.set(0, CONFIG.camera.height, CONFIG.camera.distance);
  camera.lookAt(0, 0, 0);

  // Minimal light so geometry is visible without textures/fancy setup.
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  const world = new RAPIER.World({ x: 0, y: CONFIG.gravity, z: 0 });
  const eventQueue = new RAPIER.EventQueue(true);

  // --- Record platform (visual rotates, physics stays fixed for day 1) ---
  const recordGeo = new THREE.CylinderGeometry(
    CONFIG.record.radius,
    CONFIG.record.radius,
    CONFIG.record.thickness,
    64,
    1,
    false,
  );
  const recordMat = new THREE.MeshStandardMaterial({
    color: 0x202020,
    roughness: 1,
    metalness: 0,
  });
  const recordMesh = new THREE.Mesh(recordGeo, recordMat);
  recordMesh.position.set(0, CONFIG.record.y, 0);
  recordMesh.receiveShadow = false;
  scene.add(recordMesh);

  const recordBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, CONFIG.record.y, 0),
  );
  const recordCollider = world.createCollider(
    RAPIER.ColliderDesc.cylinder(CONFIG.record.thickness / 2, CONFIG.record.radius)
      .setFriction(CONFIG.record.friction)
      .setRestitution(CONFIG.record.restitution),
    recordBody,
  );
  void recordCollider;

  function createCart({ color, spawn }) {
    const cartGeo = new THREE.BoxGeometry(
      CONFIG.cart.size.x,
      CONFIG.cart.size.y,
      CONFIG.cart.size.z,
    );
    const cartMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(cartGeo, cartMat);
    scene.add(mesh);

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setLinearDamping(CONFIG.cart.linearDamping)
        .setAngularDamping(CONFIG.cart.angularDamping),
    );
    // Keep the cart responsive; some Rapier builds may sleep bodies aggressively.
    if (typeof body.setCanSleep === "function") {
      body.setCanSleep(false);
    }

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      CONFIG.cart.size.x / 2,
      CONFIG.cart.size.y / 2,
      CONFIG.cart.size.z / 2,
    )
      .setTranslation(0, -0.08, 0)
      .setFriction(CONFIG.cart.friction)
      .setRestitution(CONFIG.cart.restitution);
    if (typeof colliderDesc.setActiveEvents === "function") {
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    }
    const collider = world.createCollider(colliderDesc, body);

    return {
      mesh,
      body,
      collider,
      spawn,
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
    cart.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    cart.respawnAtMs = null;
    cart.pendingRam = null;
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

  const playerCart = createCart({
    color: 0x8a8a8a,
    spawn: { ...CONFIG.cart.spawn },
  });

  const aiCart = createCart({
    color: 0x3aa0ff,
    spawn: { x: 2.0, y: CONFIG.cart.spawn.y, z: 2.0 },
  });

  const colliderHandleToCart = new Map();
  colliderHandleToCart.set(playerCart.collider.handle, playerCart);
  colliderHandleToCart.set(aiCart.collider.handle, aiCart);

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

  let aiNextDecisionMs = 0;
  let aiTarget = { x: 0, z: 0 };
  function pickAiTarget(fromPos) {
    const dist = Math.hypot(fromPos.x, fromPos.z);
    const edgeBiasStart = CONFIG.record.radius * 0.78;
    if (dist > edgeBiasStart) return { x: 0, z: 0 };

    const r = Math.sqrt(Math.random()) * (CONFIG.record.radius * 0.85);
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  function getAiAxis(now) {
    const p = aiCart.body.translation();
    if (now >= aiNextDecisionMs) {
      aiTarget = pickAiTarget(p);
      aiNextDecisionMs = now + (2000 + Math.random() * 2000);
    }

    const toTarget = new THREE.Vector3(aiTarget.x - p.x, 0, aiTarget.z - p.z);
    if (toTarget.lengthSq() < 0.25) {
      aiTarget = pickAiTarget(p);
      aiNextDecisionMs = now + (2000 + Math.random() * 2000);
      toTarget.set(aiTarget.x - p.x, 0, aiTarget.z - p.z);
    }
    toTarget.normalize();

    const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
    const currentYaw = yawFromQuaternion(aiCart.body.rotation());
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
  function onKeyDown(e) {
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
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) +
      (keys.has("KeyA") || keys.has("ArrowLeft") ? -1 : 0);
    return { forward: clamp(forward, -1, 1), turn: clamp(turn, -1, 1) };
  }

  // --- Simulation loop (fixed timestep) ---
  let lastT = performance.now();
  let accumulator = 0;
  let lastDebugMs = 0;

  function step(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    accumulator += dt;

    // Visual-only record rotation.
    recordMesh.rotation.y += CONFIG.record.rotationSpeedRadPerSec * dt;

    const playerAxis = getAxis();
    const aiAxis = getAiAxis(now);

    const playerPos = playerCart.body.translation();
    const aiPos = aiCart.body.translation();

    // Fall detection / respawn.
    if (playerPos.y < CONFIG.fall.yThreshold) scheduleRespawn(playerCart, now);
    if (playerCart.respawnAtMs !== null && now >= playerCart.respawnAtMs) {
      doRespawn(playerCart);
    }
    if (aiPos.y < CONFIG.fall.yThreshold) scheduleRespawn(aiCart, now);
    if (aiCart.respawnAtMs !== null && now >= aiCart.respawnAtMs) {
      doRespawn(aiCart);
    }

    // Camera follows the cart.
    const camTarget = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
    camera.position.set(
      playerPos.x,
      playerPos.y + CONFIG.camera.height,
      playerPos.z + CONFIG.camera.distance,
    );
    camera.lookAt(camTarget);

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
    let substeps = 0;
    while (
      accumulator >= CONFIG.fixedTimeStep &&
      substeps < CONFIG.maxSubsteps
    ) {
      applyArcadeControls(playerCart, playerAxis, CONFIG.fixedTimeStep);
      applyArcadeControls(aiCart, aiAxis, CONFIG.fixedTimeStep);

      // Apply any pending ramming impulses over multiple physics steps.
      for (const cart of [playerCart, aiCart]) {
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

    // Sync render meshes from physics.
    {
      const p = playerCart.body.translation();
      const r = playerCart.body.rotation();
      playerCart.mesh.position.set(p.x, p.y, p.z);
      playerCart.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    {
      const p = aiCart.body.translation();
      const r = aiCart.body.rotation();
      aiCart.mesh.position.set(p.x, p.y, p.z);
      aiCart.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  requestAnimationFrame(step);
}

main();

