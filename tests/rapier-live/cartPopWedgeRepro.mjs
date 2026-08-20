/**
 * CART-POP-1 isolated Rapier reproduction.
 * Loads the real @dimforge/rapier3d wasm (not the vitest stub).
 * Run: node --experimental-wasm-modules --import ./tests/rapier-live/register-rapier-hook.mjs tests/rapier-live/cartPopWedgeRepro.mjs
 *
 * Floor mesh must match getClassicRecordColliderSpec in src/levels/arena.js.
 */
import RAPIER from "@dimforge/rapier3d/rapier.js";

const GRAVITY = -24;
const DT = 1 / 60;
const SEGMENTS = 72;
const R_OUT = 26.4;
const R_IN = 3.63;
const THICKNESS = 0.6;
const RECORD_Y = -0.3;
const FLOOR_FRICTION = 0.8;
const FLOOR_RESTITUTION = 0.05;

const CART = {
  hx: 1.31 / 2,
  hyPhys: 1.35 / 2 - 0.25,
  hz: 2.26 / 2,
  radius: 0.08,
  localY: 0.13,
  friction: 1.1,
  restitution: 0.3,
  linearDamping: 0.6,
  angularDamping: 1.2,
  extraSolver: 4,
};

function classicTrimesh() {
  const halfT = THICKNESS / 2;
  const vertices = new Float32Array(SEGMENTS * 4 * 3);
  let w = 0;
  for (let i = 0; i < SEGMENTS; i += 1) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    vertices[w++] = R_IN * c;
    vertices[w++] = halfT;
    vertices[w++] = R_IN * s;
    vertices[w++] = R_OUT * c;
    vertices[w++] = halfT;
    vertices[w++] = R_OUT * s;
    vertices[w++] = R_IN * c;
    vertices[w++] = -halfT;
    vertices[w++] = R_IN * s;
    vertices[w++] = R_OUT * c;
    vertices[w++] = -halfT;
    vertices[w++] = R_OUT * s;
  }
  const indices = [];
  const IT = 0;
  const OT = 1;
  const IB = 2;
  const OB = 3;
  const vert = (i, k) => ((i % SEGMENTS) * 4 + k);
  const quad = (a, b, c, d) => {
    indices.push(a, b, c, a, c, d);
  };
  for (let i = 0; i < SEGMENTS; i += 1) {
    const n = i + 1;
    quad(vert(i, IT), vert(n, IT), vert(n, OT), vert(i, OT));
    quad(vert(i, IB), vert(i, OB), vert(n, OB), vert(n, IB));
    quad(vert(i, IT), vert(i, IB), vert(n, IB), vert(n, IT));
    quad(vert(i, OT), vert(n, OT), vert(n, OB), vert(i, OB));
  }
  return { vertices, indices: new Uint32Array(indices) };
}

function quatYaw(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function addTrimeshFloor(world) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, RECORD_Y, 0),
  );
  const mesh = classicTrimesh();
  const flags = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED;
  const collider = world.createCollider(
    RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices, flags)
      .setFriction(FLOOR_FRICTION)
      .setRestitution(FLOOR_RESTITUTION),
    body,
  );
  return { body, colliders: [{ i: 0, yaw: 0, handle: collider.handle, collider }] };
}

function addCart(world, { x, y, z, yaw = 0, vx = 0, vy = 0, vz = 0 }) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(CART.extraSolver)
      .setTranslation(x, y, z)
      .setRotation(quatYaw(yaw))
      .setLinvel(vx, vy, vz)
      .setLinearDamping(CART.linearDamping)
      .setAngularDamping(CART.angularDamping)
      .setCanSleep(false),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(CART.hx, CART.hyPhys, CART.hz, CART.radius)
      .setTranslation(0, CART.localY, 0)
      .setFriction(CART.friction)
      .setRestitution(CART.restitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
    body,
  );
  return { body, collider };
}

function snapshotContacts(world, cartCollider, floorColliders) {
  const out = [];
  for (const floor of floorColliders) {
    world.contactPair(cartCollider, floor.collider, (manifold) => {
      const n = manifold.normal();
      const count = manifold.numContacts?.() ?? 0;
      let maxImpulse = 0;
      for (let i = 0; i < count; i += 1) {
        maxImpulse = Math.max(maxImpulse, manifold.contactImpulse?.(i) ?? 0);
      }
      out.push({
        i: floor.i,
        normalY: n?.y ?? null,
        contacts: count,
        maxImpulse,
      });
    });
  }
  return out;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function runCase(name, pose, steps = 90) {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = addTrimeshFloor(world);
  const cart = addCart(world, pose);
  let maxVy = pose.vy || 0;
  let maxDelta = 0;
  let minY = pose.y;
  let firstPop = null;
  for (let s = 0; s < steps; s += 1) {
    const pre = cart.body.linvel();
    world.step();
    const post = cart.body.linvel();
    const pos = cart.body.translation();
    const dvy = post.y - pre.y;
    if (post.y > maxVy) maxVy = post.y;
    if (dvy > maxDelta) maxDelta = dvy;
    if (pos.y < minY) minY = pos.y;
    if (!firstPop && dvy >= 0.75) {
      firstPop = {
        s,
        preVy: round3(pre.y),
        postVy: round3(post.y),
        dvy: round3(dvy),
        y: round3(pos.y),
        planar: round3(Math.hypot(post.x, post.z)),
        contacts: snapshotContacts(world, cart.collider, floor.colliders),
      };
    }
  }
  const pos = cart.body.translation();
  world.free();
  return {
    name,
    maxVy: round3(maxVy),
    maxDelta: round3(maxDelta),
    minY: round3(minY),
    endY: round3(pos.y),
    pops: firstPop ? 1 : 0,
    firstPop,
  };
}

const REST_Y = 0.375;
const EVENT_1686 = { x: -1.158, y: REST_Y, z: 15.829, vy: 0.132 };
const r1686 = Math.hypot(EVENT_1686.x, EVENT_1686.z);
const theta = Math.atan2(EVENT_1686.z, EVENT_1686.x);
const tangent = theta + Math.PI / 2;

function restContactCount() {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = addTrimeshFloor(world);
  const cart = addCart(world, { ...EVENT_1686, yaw: 0, vy: 0 });
  for (let i = 0; i < 30; i += 1) world.step();
  const pairs = [];
  world.contactPairsWith(cart.collider, (other) => {
    pairs.push(other.handle);
  });
  const details = snapshotContacts(world, cart.collider, floor.colliders);
  const pos = cart.body.translation();
  const lv = cart.body.linvel();
  world.free();
  return { pairs: pairs.length, y: round3(pos.y), vy: round3(lv.y), details };
}

const cases = [
  runCase("trimesh rest", { ...EVENT_1686, yaw: 0, vx: 0, vz: 0 }),
  runCase("trimesh tangent 24", {
    ...EVENT_1686,
    yaw: tangent,
    vx: Math.cos(tangent) * 24,
    vy: 0,
    vz: Math.sin(tangent) * 24,
  }, 180),
  runCase("drop then inward drive", {
    x: EVENT_1686.x,
    y: 3.154,
    z: EVENT_1686.z,
    yaw: 0,
    vx: EVENT_1686.x / r1686 * -8,
    vy: -2.617,
    vz: EVENT_1686.z / r1686 * -8,
  }, 180),
  runCase("center hole", { x: 0, y: REST_Y, z: 0, vy: 0 }, 90),
];

const report = {
  rapier: RAPIER.version?.() || "0.20",
  restContacts: restContactCount(),
  summary: cases,
};
console.log(JSON.stringify(report, null, process.env.CART_POP_REPRO_JSON === "1" ? 0 : 2));
if (process.env.CART_POP_REPRO_JSON === "1") process.exit(0);
