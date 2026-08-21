/**
 * CART-POP-1 isolated Rapier reproduction — Storerooms floor.
 * Loads the real @dimforge/rapier3d wasm (not the vitest stub).
 * Run: node --experimental-wasm-modules --import ./tests/rapier-live/register-rapier-hook.mjs tests/rapier-live/cartPopStoreroomsRepro.mjs
 *
 * Live floor must match getBackroomsFloorColliderSpec / buildStoreroomsFloorTrimesh
 * in src/levels/backroomsSupermarket.js. The 9-cuboid factory is the pre-fix
 * control that still has to pop. Chamfer hulls and pit walls are omitted here —
 * they are sloped lips, not the flat drive surface.
 */
import RAPIER from "@dimforge/rapier3d/rapier.js";

const GRAVITY = -24;
const DT = 1 / 60;
const ARENA_HALF = 38;
const HOLE_HALF = 8.5 / 2;
const HOLE_CENTER = 20;
const HOLE_CHAMFER_W = 1.05;
const OUTER_CHAMFER_W = 1.25;
const FLOOR_FRICTION = 0.55;
const FLOOR_RESTITUTION = 0.05;
const T_HALF = 0.3;
const BODY_Y = -0.3;
const FLOOR_THICKNESS = 0.6;
const REST_Y = 0.375;
const INNER = HOLE_CENTER - HOLE_HALF - HOLE_CHAMFER_W;
const OUTER = HOLE_CENTER + HOLE_HALF + HOLE_CHAMFER_W;
const EDGE = ARENA_HALF - OUTER_CHAMFER_W;
const HOLE_CENTERS = [
  { x: HOLE_CENTER, z: HOLE_CENTER },
  { x: -HOLE_CENTER, z: HOLE_CENTER },
  { x: HOLE_CENTER, z: -HOLE_CENTER },
  { x: -HOLE_CENTER, z: -HOLE_CENTER },
];

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

/** Must match computeFloorSliceRects() in src/levels/backroomsSupermarket.js. */
function floorSliceRects() {
  const stripHX = (OUTER - INNER) / 2;
  const stripPX = -((OUTER + INNER) / 2);
  return [
    { i: 0, hx: (EDGE - OUTER) / 2, hz: EDGE, px: -(OUTER + EDGE) / 2, pz: 0 },
    { i: 1, hx: INNER, hz: EDGE, px: 0, pz: 0 },
    { i: 2, hx: (EDGE - OUTER) / 2, hz: EDGE, px: (OUTER + EDGE) / 2, pz: 0 },
    { i: 3, hx: stripHX, hz: (EDGE - OUTER) / 2, px: stripPX, pz: (OUTER + EDGE) / 2 },
    { i: 4, hx: stripHX, hz: INNER, px: stripPX, pz: 0 },
    { i: 5, hx: stripHX, hz: (EDGE - OUTER) / 2, px: stripPX, pz: -((OUTER + EDGE) / 2) },
    { i: 6, hx: stripHX, hz: (EDGE - OUTER) / 2, px: -stripPX, pz: (OUTER + EDGE) / 2 },
    { i: 7, hx: stripHX, hz: INNER, px: -stripPX, pz: 0 },
    { i: 8, hx: stripHX, hz: (EDGE - OUTER) / 2, px: -stripPX, pz: -((OUTER + EDGE) / 2) },
  ];
}

function addCuboidFloor(world) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, BODY_Y, 0),
  );
  const colliders = [];
  for (const r of floorSliceRects()) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(r.hx, T_HALF, r.hz)
        .setTranslation(r.px, 0, r.pz)
        .setFriction(FLOOR_FRICTION)
        .setRestitution(FLOOR_RESTITUTION),
      body,
    );
    colliders.push({ i: r.i, yaw: 0, handle: collider.handle, collider, px: r.px, pz: r.pz });
  }
  return { body, colliders };
}

/** Must match buildStoreroomsFloorTrimesh() in src/levels/backroomsSupermarket.js. */
function buildFloorTrimesh() {
  const yTop = 0;
  const yBot = -FLOOR_THICKNESS;
  const rects = floorSliceRects();
  const verts = [];
  const indexOf = new Map();
  const add = (x, y, z) => {
    const key = `${x.toFixed(7)},${y.toFixed(7)},${z.toFixed(7)}`;
    const existing = indexOf.get(key);
    if (existing !== undefined) return existing;
    const i = verts.length / 3;
    verts.push(x, y, z);
    indexOf.set(key, i);
    return i;
  };
  const indices = [];
  const quad = (a, b, c, d) => {
    indices.push(a, b, c, a, c, d);
  };
  for (const r of rects) {
    const x0 = r.px - r.hx;
    const x1 = r.px + r.hx;
    const z0 = r.pz - r.hz;
    const z1 = r.pz + r.hz;
    const tBL = add(x0, yTop, z0);
    const tTL = add(x0, yTop, z1);
    const tTR = add(x1, yTop, z1);
    const tBR = add(x1, yTop, z0);
    quad(tBL, tTL, tTR, tBR);
    const bBL = add(x0, yBot, z0);
    const bTL = add(x0, yBot, z1);
    const bTR = add(x1, yBot, z1);
    const bBR = add(x1, yBot, z0);
    quad(bBL, bBR, bTR, bTL);
  }
  const outer = [
    [EDGE, EDGE],
    [-EDGE, EDGE],
    [-EDGE, -EDGE],
    [EDGE, -EDGE],
  ];
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const t0 = add(outer[i][0], yTop, outer[i][1]);
    const t1 = add(outer[j][0], yTop, outer[j][1]);
    const b1 = add(outer[j][0], yBot, outer[j][1]);
    const b0 = add(outer[i][0], yBot, outer[i][1]);
    quad(t0, t1, b1, b0);
  }
  const holeHalf = HOLE_HALF + HOLE_CHAMFER_W;
  for (const h of HOLE_CENTERS) {
    const ring = [
      [h.x + holeHalf, h.z + holeHalf],
      [h.x + holeHalf, h.z - holeHalf],
      [h.x - holeHalf, h.z - holeHalf],
      [h.x - holeHalf, h.z + holeHalf],
    ];
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      const t0 = add(ring[i][0], yTop, ring[i][1]);
      const t1 = add(ring[j][0], yTop, ring[j][1]);
      const b1 = add(ring[j][0], yBot, ring[j][1]);
      const b0 = add(ring[i][0], yBot, ring[i][1]);
      quad(t0, t1, b1, b0);
    }
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(indices) };
}

function addTrimeshFloor(world) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
  );
  const mesh = buildFloorTrimesh();
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

const named = [
  ["cuboid rest", { x: 0, y: REST_Y, z: 8, vy: 0 }, 90, addCuboidFloor, "none"],
  ["cuboid rest seam", { x: INNER, y: REST_Y, z: 0, vy: 0 }, 90, addCuboidFloor, "none"],
  ["cuboid circle r10 24", drivePose(10, 0, Math.PI / 2, 24), 180, addCuboidFloor, "circle"],
  ["cuboid circle r16 24", drivePose(16, 0, Math.PI / 2, 24), 180, addCuboidFloor, "circle"],
  ["cuboid circle seam 24", drivePose(INNER, 0, Math.PI / 2, 24), 240, addCuboidFloor, "circle"],
  ["cuboid drop then drive", {
    x: 8,
    y: 3.154,
    z: 0,
    yaw: Math.PI / 2,
    vx: 0,
    vy: -2.617,
    vz: 8,
  }, 180, addCuboidFloor, "none"],
  ["cuboid hole +20 +20", { x: HOLE_CENTER, y: REST_Y, z: HOLE_CENTER, vy: 0 }, 90, addCuboidFloor, "none"],
  ["trimesh rest", { x: 0, y: REST_Y, z: 8, vy: 0 }, 90, addTrimeshFloor, "none"],
  ["trimesh circle r10 24", drivePose(10, 0, Math.PI / 2, 24), 180, addTrimeshFloor, "circle"],
  ["trimesh circle r16 24", drivePose(16, 0, Math.PI / 2, 24), 180, addTrimeshFloor, "circle"],
  ["trimesh circle seam 24", drivePose(INNER, 0, Math.PI / 2, 24), 240, addTrimeshFloor, "circle"],
  ["trimesh drop then drive", {
    x: 8,
    y: 3.154,
    z: 0,
    yaw: Math.PI / 2,
    vx: 0,
    vy: -2.617,
    vz: 8,
  }, 180, addTrimeshFloor, "none"],
  ["trimesh hole +20 +20", { x: HOLE_CENTER, y: REST_Y, z: HOLE_CENTER, vy: 0 }, 90, addTrimeshFloor, "none"],
  ["trimesh hole -20 +20", { x: -HOLE_CENTER, y: REST_Y, z: HOLE_CENTER, vy: 0 }, 90, addTrimeshFloor, "none"],
  ["trimesh hole +20 -20", { x: HOLE_CENTER, y: REST_Y, z: -HOLE_CENTER, vy: 0 }, 90, addTrimeshFloor, "none"],
  ["trimesh hole -20 -20", { x: -HOLE_CENTER, y: REST_Y, z: -HOLE_CENTER, vy: 0 }, 90, addTrimeshFloor, "none"],
];

const cases = named.map(([name, pose, steps, factory, hold]) => (
  runCase(name, pose, steps, factory, hold)
));

const report = {
  rapier: RAPIER.version?.() || "0.20",
  inner: INNER,
  outer: OUTER,
  edge: EDGE,
  holeCenters: HOLE_CENTERS,
  restContacts: restContacts({ x: 0, y: REST_Y, z: 8 }, addTrimeshFloor),
  cuboidRestContacts: restContacts({ x: 0, y: REST_Y, z: 8 }, addCuboidFloor),
  seamRestContacts: restContacts({ x: INNER, y: REST_Y, z: 0 }, addCuboidFloor),
  summary: cases,
};
console.log(JSON.stringify(report, null, process.env.CART_POP_REPRO_JSON === "1" ? 0 : 2));
if (process.env.CART_POP_REPRO_JSON === "1") process.exit(0);
