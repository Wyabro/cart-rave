/**
 * CART-POP-1 isolated Rapier reproduction — Sundial floor.
 * Loads the real @dimforge/rapier3d wasm (not the vitest stub).
 * Run: node --experimental-wasm-modules --import ./tests/rapier-live/register-rapier-hook.mjs tests/rapier-live/cartPopSundialRepro.mjs
 *
 * Live floor must match getZanzibarFloorColliderSpec / buildOctagonPrismTrimesh
 * in src/levels/zanzibarPlatform.js. The overlapping-cuboid factory is the
 * pre-fix control that still has to pop.
 */
import RAPIER from "@dimforge/rapier3d/rapier.js";

const GRAVITY = -24;
const DT = 1 / 60;
const APOTHEM = 31.7;
const HALF_ANGLE = Math.PI / 8;
const VERTEX_OFFSET = HALF_ANGLE;
const DECK_THICKNESS = 0.6;
const DECK_FRICTION = 0.62;
const FLOOR_RESTITUTION = 0.05;
const HALF_W = APOTHEM * Math.tan(HALF_ANGLE);
const REST_Y = 0.375;
const CIRCUM_R = APOTHEM / Math.cos(HALF_ANGLE);

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

function quatYaw(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function octRects() {
  const tanHalf = Math.tan(HALF_ANGLE);
  const halfHeight = DECK_THICKNESS / 2;
  return [0, 1, 2, 3].map((k) => ({
    i: k,
    yaw: k * (Math.PI / 4),
    halfLength: APOTHEM,
    halfWidth: APOTHEM * tanHalf,
    halfHeight,
    centerY: -halfHeight,
  }));
}

function octagonTrimesh() {
  const n = 8;
  const vertices = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i += 1) {
    const a = VERTEX_OFFSET + i * (Math.PI / 4);
    const c = Math.cos(a) * CIRCUM_R;
    const s = Math.sin(a) * CIRCUM_R;
    vertices[i * 3 + 0] = c;
    vertices[i * 3 + 1] = 0;
    vertices[i * 3 + 2] = s;
    vertices[(n + i) * 3 + 0] = c;
    vertices[(n + i) * 3 + 1] = -DECK_THICKNESS;
    vertices[(n + i) * 3 + 2] = s;
  }
  const indices = [];
  const quad = (a, b, c, d) => {
    indices.push(a, b, c, a, c, d);
  };
  for (let i = 1; i < n - 1; i += 1) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    quad(i, j, n + j, n + i);
  }
  return { vertices, indices: new Uint32Array(indices) };
}

function addOverlappingCuboidFloor(world) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
  );
  const colliders = [];
  for (const rect of octRects()) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(rect.halfLength, rect.halfHeight, rect.halfWidth)
        .setTranslation(0, rect.centerY, 0)
        .setRotation(quatYaw(rect.yaw))
        .setFriction(DECK_FRICTION)
        .setRestitution(FLOOR_RESTITUTION)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
      body,
    );
    colliders.push({ i: rect.i, yaw: rect.yaw, handle: collider.handle, collider });
  }
  return { body, colliders };
}

function addTrimeshFloor(world) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
  );
  const mesh = octagonTrimesh();
  const flags = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.ORIENTED;
  const collider = world.createCollider(
    RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices, flags)
      .setFriction(DECK_FRICTION)
      .setRestitution(FLOOR_RESTITUTION)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
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
        yaw: round3(floor.yaw),
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

function isFloorPop(preVy, dvy, y) {
  return dvy >= 0.75 && y > 0.2 && Math.abs(preVy) < 0.4;
}

function runCase(name, pose, steps, floorFactory, hold = "none") {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = floorFactory(world);
  const cart = addCart(world, pose);
  const speed = Math.hypot(pose.vx || 0, pose.vz || 0);
  let maxVy = pose.vy || 0;
  let maxDelta = 0;
  let minY = pose.y;
  let firstPop = null;
  for (let s = 0; s < steps; s += 1) {
    if (hold === "circle") {
      const p = cart.body.translation();
      const theta = Math.atan2(p.z, p.x);
      const tangent = theta + Math.PI / 2;
      const lv = cart.body.linvel();
      cart.body.setLinvel({
        x: Math.cos(tangent) * speed,
        y: lv.y,
        z: Math.sin(tangent) * speed,
      }, true);
    }
    const pre = cart.body.linvel();
    world.step();
    const post = cart.body.linvel();
    const pos = cart.body.translation();
    const dvy = post.y - pre.y;
    if (post.y > maxVy) maxVy = post.y;
    if (dvy > maxDelta) maxDelta = dvy;
    if (pos.y < minY) minY = pos.y;
    if (!firstPop && isFloorPop(pre.y, dvy, pos.y)) {
      firstPop = {
        s,
        preVy: round3(pre.y),
        postVy: round3(post.y),
        dvy: round3(dvy),
        y: round3(pos.y),
        planar: round3(Math.hypot(post.x, post.z)),
        contacts: snapshotContacts(world, cart.collider, floor.colliders)
          .filter((c) => c.contacts > 0 || (c.normalY != null && c.normalY < 0.95)),
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

function restContacts(pose, floorFactory) {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = floorFactory(world);
  const cart = addCart(world, { ...pose, yaw: 0, vy: 0, vx: 0, vz: 0 });
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

function drivePose(x, z, yaw, speed, extra = {}) {
  return {
    x,
    y: extra.y ?? REST_Y,
    z,
    yaw,
    vx: Math.cos(yaw) * speed,
    vy: extra.vy ?? 0,
    vz: Math.sin(yaw) * speed,
  };
}

const SEAM_Z = HALF_W;

const named = [
  ["cuboid rest", { x: 18, y: REST_Y, z: SEAM_Z, vy: 0 }, 90, addOverlappingCuboidFloor, "none"],
  ["cuboid circle r26 24", drivePose(26, 0, Math.PI / 2, 24), 180, addOverlappingCuboidFloor, "circle"],
  ["trimesh rest", { x: 18, y: REST_Y, z: SEAM_Z, vy: 0 }, 90, addTrimeshFloor, "none"],
  ["trimesh circle r16 24", drivePose(16, 0, Math.PI / 2, 24), 240, addTrimeshFloor, "circle"],
  ["trimesh circle seam 24", drivePose(18, SEAM_Z, 0, 24), 240, addTrimeshFloor, "circle"],
  ["trimesh circle r26 24", drivePose(26, 0, Math.PI / 2, 24), 180, addTrimeshFloor, "circle"],
  ["trimesh drop then drive", {
    x: 16,
    y: 3.154,
    z: 0,
    yaw: Math.PI / 2,
    vx: 0,
    vy: -2.617,
    vz: 8,
  }, 180, addTrimeshFloor, "none"],
];

const cases = named.map(([name, pose, steps, factory, hold]) => (
  runCase(name, pose, steps, factory, hold)
));

const report = {
  rapier: RAPIER.version?.() || "0.20",
  apothem: APOTHEM,
  internalHalfWidth: round3(HALF_W),
  restContacts: restContacts({ x: 18, y: REST_Y, z: SEAM_Z }, addTrimeshFloor),
  cuboidRestContacts: restContacts({ x: 18, y: REST_Y, z: SEAM_Z }, addOverlappingCuboidFloor),
  summary: cases,
};
console.log(JSON.stringify(report, null, process.env.CART_POP_REPRO_JSON === "1" ? 0 : 2));
if (process.env.CART_POP_REPRO_JSON === "1") process.exit(0);
