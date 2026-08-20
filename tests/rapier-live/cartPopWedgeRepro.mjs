/**
 * CART-POP-1 isolated Rapier reproduction.
 * Loads the real @dimforge/rapier3d wasm (not the vitest stub).
 * Run: node tests/rapier-live/cartPopWedgeRepro.mjs
 */
import RAPIER from "@dimforge/rapier3d/rapier.js";

const GRAVITY = -24;
const DT = 1 / 60;
const N_SEGMENTS = 16;
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

function classicVertices() {
  const halfT = THICKNESS / 2;
  const halfAngle = Math.PI / N_SEGMENTS;
  const zIn = R_IN * Math.tan(halfAngle);
  const zOut = R_OUT * Math.tan(halfAngle);
  return new Float32Array([
    R_IN, halfT, -zIn,
    R_IN, halfT, zIn,
    R_OUT, halfT, -zOut,
    R_OUT, halfT, zOut,
    R_IN, -halfT, -zIn,
    R_IN, -halfT, zIn,
    R_OUT, -halfT, -zOut,
    R_OUT, -halfT, zOut,
  ]);
}

function quatYaw(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function addWedgeFloor(world, { overlapRad = 0 } = {}) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, RECORD_Y, 0),
  );
  const vertices = classicVertices();
  const colliders = [];
  for (let i = 0; i < N_SEGMENTS; i += 1) {
    const yaw = (i / N_SEGMENTS) * Math.PI * 2;
    const verts = overlapRad
      ? scaledTangents(overlapRad)
      : vertices;
    const desc = RAPIER.ColliderDesc.convexHull(verts)
      .setRotation(quatYaw(yaw + (overlapRad ? 0 : 0)))
      .setFriction(FLOOR_FRICTION)
      .setRestitution(FLOOR_RESTITUTION)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
    const col = world.createCollider(desc, body);
    colliders.push({ i, yaw, handle: col.handle, collider: col });
  }
  return { body, colliders };
}

function scaledTangents(extraHalfAngle) {
  const halfT = THICKNESS / 2;
  const halfAngle = Math.PI / N_SEGMENTS + extraHalfAngle;
  const zIn = R_IN * Math.tan(halfAngle);
  const zOut = R_OUT * Math.tan(halfAngle);
  return new Float32Array([
    R_IN, halfT, -zIn,
    R_IN, halfT, zIn,
    R_OUT, halfT, -zOut,
    R_OUT, halfT, zOut,
    R_IN, -halfT, -zIn,
    R_IN, -halfT, zIn,
    R_OUT, -halfT, -zOut,
    R_OUT, -halfT, zOut,
  ]);
}

function addSolidCuboidFloor(world) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, RECORD_Y, 0),
  );
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(R_OUT, THICKNESS / 2, R_OUT)
      .setFriction(FLOOR_FRICTION)
      .setRestitution(FLOOR_RESTITUTION)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
    body,
  );
  return { body, colliders: [{ i: 0, yaw: 0, handle: col.handle, collider: col }] };
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
    world.contactPair(cartCollider, floor.collider, (manifold, flipped) => {
      const n = manifold.normal();
      const count = manifold.numContacts?.() ?? 0;
      let maxImpulse = 0;
      let strongest = -1;
      for (let i = 0; i < count; i += 1) {
        const imp = manifold.contactImpulse?.(i) ?? 0;
        if (imp >= maxImpulse) {
          maxImpulse = imp;
          strongest = i;
        }
      }
      const solverN = manifold.numSolverContacts?.() ?? 0;
      const point = strongest >= 0
        ? (flipped ? manifold.localContactPoint1?.(strongest) : manifold.localContactPoint2?.(strongest))
        : null;
      const worldPt = solverN > 0 ? manifold.solverContactPoint?.(0) : null;
      out.push({
        i: floor.i,
        yawDeg: (floor.yaw * 180) / Math.PI,
        handle: floor.handle,
        normalY: n?.y ?? null,
        contacts: count,
        maxImpulse,
        solverContacts: solverN,
        fid1: strongest >= 0 ? manifold.contactFid1?.(strongest) : null,
        fid2: strongest >= 0 ? manifold.contactFid2?.(strongest) : null,
        surfacePoint: point,
        worldPoint: worldPt,
        restitution: manifold.restitution?.() ?? null,
      });
    });
  }
  return out;
}

function runCase(name, buildFloor, pose, steps = 90) {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = buildFloor(world);
  const cart = addCart(world, pose);
  const history = [];
  let maxVy = pose.vy || 0;
  let maxDelta = 0;
  for (let s = 0; s < steps; s += 1) {
    const pre = cart.body.linvel();
    const prePos = cart.body.translation();
    world.step();
    const post = cart.body.linvel();
    const pos = cart.body.translation();
    const dvy = post.y - pre.y;
    if (post.y > maxVy) maxVy = post.y;
    if (dvy > maxDelta) maxDelta = dvy;
    if (dvy >= 0.75 || s < 3 || s === steps - 1) {
      history.push({
        s,
        preVy: round3(pre.y),
        postVy: round3(post.y),
        dvy: round3(dvy),
        y: round3(pos.y),
        preY: round3(prePos.y),
        planar: round3(Math.hypot(post.x, post.z)),
        contacts: snapshotContacts(world, cart.collider, floor.colliders)
          .filter((c) => c.contacts > 0 || (c.normalY != null && Math.abs(c.normalY) < 0.95)),
      });
    }
  }
  world.free();
  return { name, maxVy: round3(maxVy), maxDelta: round3(maxDelta), history };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

const REST_Y = 0.375;
const EVENT_1686 = { x: -1.158, y: REST_Y, z: 15.829, vy: 0.132 };
const EVENT_1595 = { x: 20.072, y: REST_Y, z: -5.168, vy: 0 };

const cases = [];

cases.push(runCase("solid-cuboid rest", addSolidCuboidFloor, {
  ...EVENT_1686, yaw: 0, vx: 0, vz: 0,
}));

cases.push(runCase("wedges rest yaw0", (w) => addWedgeFloor(w), {
  ...EVENT_1686, yaw: 0, vx: 0, vz: 0,
}));

for (let k = 0; k < 8; k += 1) {
  const yaw = (k / 8) * Math.PI * 2;
  cases.push(runCase(`wedges rest yaw${k}/8`, (w) => addWedgeFloor(w), {
    ...EVENT_1686, yaw, vx: 0, vz: 0,
  }));
}

// Drive across a seam at 101.25 deg (segment 4/5) near event radius.
const seamDeg = 101.25;
const seam = (seamDeg * Math.PI) / 180;
const r = 15.87;
cases.push(runCase("wedges seam crawl", (w) => addWedgeFloor(w), {
  x: Math.cos(seam) * r,
  y: REST_Y,
  z: Math.sin(seam) * r,
  yaw: seam + Math.PI / 2,
  vx: Math.cos(seam + Math.PI / 2) * 12,
  vy: 0.132,
  vz: Math.sin(seam + Math.PI / 2) * 12,
}, 180));

cases.push(runCase("wedges 1686 radial 12", (w) => addWedgeFloor(w), {
  ...EVENT_1686,
  yaw: Math.atan2(EVENT_1686.z, EVENT_1686.x),
  vx: EVENT_1686.x / 15.87 * 12,
  vz: EVENT_1686.z / 15.87 * 12,
  vy: 0.132,
}, 180));

cases.push(runCase("wedges 1686 radial 28", (w) => addWedgeFloor(w), {
  ...EVENT_1686,
  yaw: Math.atan2(EVENT_1686.z, EVENT_1686.x),
  vx: EVENT_1686.x / 15.87 * 28,
  vz: EVENT_1686.z / 15.87 * 28,
  vy: 0.132,
}, 120));

cases.push(runCase("wedges 1595 rest", (w) => addWedgeFloor(w), {
  ...EVENT_1595, yaw: 0,
}, 90));

cases.push(runCase("wedges overlap+1deg rest", (w) => addWedgeFloor(w, { overlapRad: (1 * Math.PI) / 180 }), {
  ...EVENT_1686, yaw: 0,
}));

cases.push(runCase("wedges overlap+1deg radial 12", (w) => addWedgeFloor(w, { overlapRad: (1 * Math.PI) / 180 }), {
  ...EVENT_1686,
  yaw: Math.atan2(EVENT_1686.z, EVENT_1686.x),
  vx: EVENT_1686.x / 15.87 * 12,
  vz: EVENT_1686.z / 15.87 * 12,
  vy: 0.132,
}, 180));

function runTwoCartRam() {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = addWedgeFloor(world);
  const victim = addCart(world, { ...EVENT_1686, yaw: 0, vx: 0, vy: 0.132, vz: 0 });
  const bumper = addCart(world, {
    x: EVENT_1686.x,
    y: REST_Y,
    z: EVENT_1686.z - 2.4,
    yaw: 0,
    vx: 0,
    vy: 0,
    vz: 18,
  });
  let maxDelta = 0;
  let maxVy = 0;
  let firstPop = null;
  for (let s = 0; s < 90; s += 1) {
    const pre = victim.body.linvel();
    world.step();
    const post = victim.body.linvel();
    const dvy = post.y - pre.y;
    if (dvy > maxDelta) maxDelta = dvy;
    if (post.y > maxVy) maxVy = post.y;
    if (!firstPop && dvy >= 0.75) {
      firstPop = {
        s,
        preVy: round3(pre.y),
        postVy: round3(post.y),
        dvy: round3(dvy),
        bumperVy: round3(bumper.body.linvel().y),
        contacts: snapshotContacts(world, victim.collider, floor.colliders)
          .filter((c) => c.contacts > 0 || c.maxImpulse > 0),
      };
    }
  }
  world.free();
  return {
    name: "two-cart ram on wedges",
    maxVy: round3(maxVy),
    maxDelta: round3(maxDelta),
    pops: firstPop ? 1 : 0,
    firstPop,
  };
}

function runDropThenDrive() {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = addWedgeFloor(world);
  const cart = addCart(world, {
    x: EVENT_1686.x,
    y: 3.154,
    z: EVENT_1686.z,
    yaw: 0,
    vx: EVENT_1686.x / 15.87 * -8,
    vy: -2.617,
    vz: EVENT_1686.z / 15.87 * -8,
  });
  let maxDelta = 0;
  let maxVy = 0;
  let firstPop = null;
  for (let s = 0; s < 180; s += 1) {
    const pre = cart.body.linvel();
    world.step();
    const post = cart.body.linvel();
    const dvy = post.y - pre.y;
    if (dvy > maxDelta) maxDelta = dvy;
    if (post.y > maxVy) maxVy = post.y;
    if (!firstPop && dvy >= 0.75 && cart.body.translation().y < 2) {
      firstPop = {
        s,
        preVy: round3(pre.y),
        postVy: round3(post.y),
        dvy: round3(dvy),
        y: round3(cart.body.translation().y),
        contacts: snapshotContacts(world, cart.collider, floor.colliders)
          .filter((c) => c.contacts > 0 || c.maxImpulse > 0),
      };
    }
  }
  world.free();
  return {
    name: "drop then inward drive",
    maxVy: round3(maxVy),
    maxDelta: round3(maxDelta),
    pops: firstPop ? 1 : 0,
    firstPop,
  };
}

function restContactCount() {
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = DT;
  const floor = addWedgeFloor(world);
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

cases.push(runTwoCartRam());
cases.push(runDropThenDrive());

const summary = cases.map((c) => ({
  name: c.name,
  maxVy: c.maxVy,
  maxDelta: c.maxDelta,
  pops: c.pops ?? c.history?.filter((h) => h.dvy >= 0.75).length ?? 0,
  firstPop: c.firstPop ?? c.history?.find((h) => h.dvy >= 0.75) ?? null,
}));

const report = {
  rapier: RAPIER.version?.() || "0.20",
  restContacts: restContactCount(),
  summary,
};
console.log(JSON.stringify(report, null, process.env.CART_POP_REPRO_JSON === "1" ? 0 : 2));
if (process.env.CART_POP_REPRO_JSON === "1") process.exit(0);

const interesting = cases.filter((c) => c.maxDelta >= 0.75);
for (const c of interesting) {
  console.log("\n====", c.name, "maxDelta", c.maxDelta, "maxVy", c.maxVy);
  const rows = c.history?.filter((row) => row.dvy >= 0.75).slice(0, 4)
    || (c.firstPop ? [c.firstPop] : []);
  for (const h of rows) {
    console.log(JSON.stringify(h, null, 2));
  }
}
