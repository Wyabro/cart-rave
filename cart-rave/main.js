import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";

const CONFIG = {
  canvasId: "game",
  backgroundColor: 0x000000,

  gravity: -24,
  fixedTimeStep: 1 / 60,
  maxSubsteps: 4,

  record: {
    radius: 10,
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
    maxSpeed: 9.0,
    accel: 65.0,
    braking: 35.0,
    steeringTorque: 110.0,
    lateralGrip: 16.0,
    airControlFactor: 0.15,
  },

  fall: {
    yThreshold: -6,
    respawnDelayMs: 2000,
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

  // --- Cart (simple box) ---
  const cartGeo = new THREE.BoxGeometry(
    CONFIG.cart.size.x,
    CONFIG.cart.size.y,
    CONFIG.cart.size.z,
  );
  const cartMat = new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    roughness: 1,
    metalness: 0,
  });
  const cartMesh = new THREE.Mesh(cartGeo, cartMat);
  scene.add(cartMesh);

  const cartBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(CONFIG.cart.spawn.x, CONFIG.cart.spawn.y, CONFIG.cart.spawn.z)
      .setLinearDamping(CONFIG.cart.linearDamping)
      .setAngularDamping(CONFIG.cart.angularDamping),
  );
  // Keep the cart responsive; some Rapier builds may sleep bodies aggressively.
  if (typeof cartBody.setCanSleep === "function") {
    cartBody.setCanSleep(false);
  }

  // Lower collider a touch to make the cart feel less tippy (weighty).
  const cartColliderDesc = RAPIER.ColliderDesc.cuboid(
    CONFIG.cart.size.x / 2,
    CONFIG.cart.size.y / 2,
    CONFIG.cart.size.z / 2,
  )
    .setTranslation(0, -0.08, 0)
    .setFriction(CONFIG.cart.friction)
    .setRestitution(CONFIG.cart.restitution);
  world.createCollider(cartColliderDesc, cartBody);

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
    if (handledCodes.has(e.code)) {
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

  // --- Respawn logic ---
  let respawnAtMs = null;
  function scheduleRespawn() {
    if (respawnAtMs !== null) return;
    respawnAtMs = performance.now() + CONFIG.fall.respawnDelayMs;
  }

  function doRespawn() {
    cartBody.setTranslation(
      { x: CONFIG.cart.spawn.x, y: CONFIG.cart.spawn.y, z: CONFIG.cart.spawn.z },
      true,
    );
    cartBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cartBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    cartBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    respawnAtMs = null;
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

    const axis = getAxis();

    const cartPos = cartBody.translation();
    const cartRot = cartBody.rotation();
    const cartLinvel = cartBody.linvel();

    // Fall detection.
    if (cartPos.y < CONFIG.fall.yThreshold) scheduleRespawn();
    if (respawnAtMs !== null && now >= respawnAtMs) doRespawn();

    // Camera follows the cart.
    const camTarget = new THREE.Vector3(cartPos.x, cartPos.y, cartPos.z);
    camera.position.set(
      cartPos.x,
      cartPos.y + CONFIG.camera.height,
      cartPos.z + CONFIG.camera.distance,
    );
    camera.lookAt(camTarget);

    // Debug: print velocity while input is held (throttled).
    if ((axis.forward !== 0 || axis.turn !== 0) && now - lastDebugMs >= 100) {
      const lv = cartBody.linvel();
      const sleeping =
        typeof cartBody.isSleeping === "function" ? cartBody.isSleeping() : "unknown";
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
      const pos = cartBody.translation();
      const rot = cartBody.rotation();
      const linvel = cartBody.linvel();
      const mass = getBodyMass(cartBody);

      const onGround = pos.y <= 1.25; // cheap heuristic good enough for day 1
      const controlFactor = onGround ? 1 : CONFIG.driving.airControlFactor;

      const yaw = yawFromQuaternion(rot);
      const { forward, right } = getForwardRightFromYaw(yaw);

      const v = rapierToVec3(linvel);
      const vForward = forward.dot(v);
      const vRight = right.dot(v);

      if (axis.forward !== 0 || axis.turn !== 0) {
        cartBody.wakeUp();
      }

      // Lateral grip: kills sideways skating.
      // dv = (-vRight) * grip * dt  =>  J = m * dv
      const dvRight = (-vRight) * CONFIG.driving.lateralGrip * CONFIG.fixedTimeStep;
      const gripImpulse = right.clone().multiplyScalar(mass * dvRight);
      cartBody.applyImpulse(vec3ToRapier(gripImpulse), true);

      // Drive/brake along forward direction.
      if (axis.forward !== 0) {
        // Use full accel when trying to go in the current direction (or from rest),
        // and use braking strength only when trying to reverse against current motion.
        const reversingAgainstMotion = vForward !== 0 && Math.sign(axis.forward) !== Math.sign(vForward);
        const desiredAccel = reversingAgainstMotion ? CONFIG.driving.braking : CONFIG.driving.accel;
        // dvForward = a * dt,  J = m * dv
        const dvForward = axis.forward * desiredAccel * controlFactor * CONFIG.fixedTimeStep;
        // Soft top-speed cap.
        if (Math.abs(vForward) < CONFIG.driving.maxSpeed || Math.sign(vForward) !== Math.sign(axis.forward)) {
          const driveImpulse = forward.clone().multiplyScalar(mass * dvForward);
          cartBody.applyImpulse(vec3ToRapier(driveImpulse), true);
        }
      }

      // Steering torque (turn rate increases with forward speed).
      if (axis.turn !== 0) {
        // Allow steering at low speed; scale up gently with speed.
        const speedFactor = clamp(Math.abs(vForward) / CONFIG.driving.maxSpeed, 0, 1);
        const steerFactor = 0.25 + 0.75 * speedFactor;
        // Treat steeringTorque as a torque strength; apply as torque impulse (tau * dt).
        const steerTorqueImpulse =
          axis.turn *
          CONFIG.driving.steeringTorque *
          steerFactor *
          controlFactor *
          CONFIG.fixedTimeStep;
        cartBody.applyTorqueImpulse({ x: 0, y: steerTorqueImpulse, z: 0 }, true);
      }

      world.step();
      accumulator -= CONFIG.fixedTimeStep;
      substeps += 1;
    }

    // Sync render meshes from physics.
    const p = cartBody.translation();
    const r = cartBody.rotation();
    cartMesh.position.set(p.x, p.y, p.z);
    cartMesh.quaternion.set(r.x, r.y, r.z, r.w);

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

