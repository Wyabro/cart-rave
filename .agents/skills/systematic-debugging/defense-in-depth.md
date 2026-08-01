# Defense-in-Depth Validation

You found the root cause and fixed it at the source. Adding one check there feels
sufficient. It is not — that check gets bypassed by a different code path, a refactor, a
mock, or a non-host peer taking a branch you did not test.

**Core principle:** validate at every layer the bad value passes through. Make the bug
structurally impossible rather than currently absent.

Use this **after** [root-cause-tracing.md](root-cause-tracing.md), not instead of it.
Layering validation over an unknown root cause is just louder guessing.

## Why more than one layer

Different layers catch different things:

- Entry validation catches the common case
- Business-logic checks catch edge cases the entry point never sees
- Environment guards catch context-specific danger (host vs peer, test vs prod, hidden tab)
- Instrumentation catches what all three missed, and tells you where next time

## The four layers

### Layer 1 — entry point
Reject obviously invalid input at the boundary.

```js
export function spawnCart(id, spawnPoint) {
  if (!id) throw new Error('spawnCart: id required');
  if (!spawnPoint || !Number.isFinite(spawnPoint.x)) {
    throw new Error(`spawnCart: bad spawnPoint for ${id}: ${JSON.stringify(spawnPoint)}`);
  }
  // …
}
```

### Layer 2 — business logic
Make sure the value makes sense for *this* operation, even if it is well-formed.

```js
function applyImpulse(cart, impulse) {
  if (!room.isHost) return;                 // only the host mutates the sim
  if (!Number.isFinite(impulse.x)) throw new Error('applyImpulse: non-finite impulse');
  // …
}
```

### Layer 3 — environment guard
Refuse dangerous operations in contexts where they cannot be correct.

```js
function broadcastSnapshot(snap) {
  if (import.meta.env.DEV && snap.tick == null) {
    throw new Error('broadcastSnapshot: snapshot without a tick (dev-only guard)');
  }
  // …
}
```

Guards that only throw in DEV are fine — they turn a silent prod desync into a loud local
failure. Guards that must hold in prod should degrade honestly (skip, clamp, log) rather
than throw into a live match.

### Layer 4 — instrumentation
Capture context for the next forensic pass.

```js
if (drift > MAX_DRIFT) {
  console.error('[GUARD drift]', { drift, tick, connId, isHost, quality });
}
```

## Applying the pattern

1. **Trace the data flow** — where did the bad value originate, and where was it used?
2. **Map every checkpoint** it passes through.
3. **Add a check at each layer** — entry, business, environment, instrumentation.
4. **Test each layer independently.** Bypass layer 1 on purpose and confirm layer 2 catches
   it. A layer you never saw fire is a layer you have not verified.

## Cost check

Every guard runs. In a per-tick or per-frame path, prefer:

- DEV-only throws for shape and invariant violations
- Cheap finite/null checks in the hot path
- Instrumentation behind the existing `?diag=1` lever rather than always-on logging

A guard that costs a frame is a new bug wearing a safety vest.

## Key insight

Do not stop at one validation point. Different code paths bypass entry validation, mocks
bypass business logic, and platform differences need environment guards. The bug is fixed
when it can no longer happen — not when it stopped happening.
