// probe-standard-events.mjs — does the STANDARD @dimforge/rapier3d build emit a
// collision event for a pair where only ONE collider has COLLISION_EVENTS?
// The game loads the standard build; the env-impact drain sees cart-cart events
// (KOs) but zero cart-vs-level events, so level colliders (no activeEvents) may
// need their own flag. Run via `npx vite-node` (bundles the extensionless wasm-pack
// imports Node's ESM resolver rejects).
import RAPIER from "@dimforge/rapier3d";

const CART_GROUPS = (0x0001 << 16) | 0xfffd;

await RAPIER.default.init?.();

function oneCase({ label, levelColliderEvents }) {
  const world = new RAPIER.World({ x: 0, y: -24, z: 0 });
  const queue = new RAPIER.EventQueue(true);

  const cartBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 1, 0)
      .setCcdEnabled(true)
      .setAdditionalSolverIterations(4),
  );
  const cartCollider = world.createCollider(
    RAPIER.ColliderDesc.roundCuboid(1.31 / 2, 1.35 / 2 - 0.25, 2.26 / 2, 0.08)
      .setTranslation(0, 0.13, 0)
      .setCollisionGroups(CART_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    cartBody,
  );

  const postBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  let postDesc = RAPIER.ColliderDesc.cylinder(1.6 / 2, 0.55).setTranslation(6, 1.6 / 2, 0);
  if (levelColliderEvents) {
    postDesc = postDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  }
  const postCollider = world.createCollider(postDesc, postBody);

  cartBody.setLinvel({ x: 8, y: 0, z: 0 }, true);
  let postEvent = false;
  for (let i = 0; i < 120; i += 1) {
    world.step(queue);
    queue.drainCollisionEvents((h1, h2, started) => {
      if (started && (h1 === postCollider.handle || h2 === postCollider.handle)) {
        postEvent = true;
      }
    });
    // * Hold approach speed (throttle model) so friction cannot stall the run.
    const v = cartBody.linvel();
    cartBody.setLinvel({ x: 8, y: v.y, z: 0 }, true);
    if (postEvent) break;
  }
  console.log(`[${label}] levelColliderEvents=${levelColliderEvents} → cart<->post event fired: ${postEvent}`);
}

oneCase({ label: "cart-only flag", levelColliderEvents: false });
oneCase({ label: "both flags", levelColliderEvents: true });
