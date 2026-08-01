# Root Cause Tracing

Bugs surface deep in the stack — a NaN in the render, a body at the origin, a sting on the
wrong bus. The instinct is to fix where the error appears. That is treating a symptom.

**Core principle:** trace backward through the call chain until you find the original
trigger, then fix at the source.

## When to use

- The error happens deep in execution, not at an entry point
- The stack trace shows a long chain
- It is unclear where the invalid value originated
- You need to know which test, tick, or peer triggered it

If you cannot trace backward — a dead end, a value that arrives from a worker or the
network with no history — fall back to fixing at the symptom point, and add
[defense-in-depth](defense-in-depth.md) so the next occurrence is caught earlier.

## The process

### 1. Observe the symptom
State it precisely, with the value. `body.translation() → {x: NaN, y: NaN}` beats "physics
is broken."

### 2. Find the immediate cause
What line directly produces it?

### 3. Ask what called this
Write the chain out. Do not hold it in your head:

```
applyImpulse(cart, impulse)
  ← stepSim(dt)
  ← hostTick()
  ← onMessage(intent)
```

### 4. Keep tracing up
At each level, what value was passed? The moment a value becomes wrong is the level that
owns the bug.

### 5. Find the original trigger
Keep going until you reach code that made the value up rather than passed it along. That is
the source. Fix there.

## Adding stack traces when you cannot trace by reading

Instrument before the dangerous operation, not after it fails:

```js
function applyImpulse(cart, impulse) {
  if (!Number.isFinite(impulse.x) || !Number.isFinite(impulse.y)) {
    console.error('[TRACE bad impulse]', {
      impulse,
      cartId: cart.id,
      tick: sim.tick,
      isHost: room.isHost,
      stack: new Error().stack,
    });
  }
  // … proceed
}
```

**Use `console.error`, not the logger** — the logger may be suppressed in tests and in the
prod bundle.

**Include the context that splits this codebase:** tick, host vs non-host, connection id,
quality tier, focused vs hidden. Most bugs here live in one of those splits.

Capture and read on Windows:

```powershell
npm run test 2>&1 | Select-String -Pattern 'TRACE bad impulse' -Context 0,12
```

## Illustrative trace — the shape, not a real incident

**Symptom:** remote carts snap to the arena origin for one frame after a KO.

```
1. render reads transform → {0,0,0}
2. interpolator returned the identity, because…
3. the snapshot buffer had a hole at that tick, because…
4. the host skipped a broadcast on the KO frame, because…
5. the KO handler returned early before the broadcast call
```

**Root cause:** the early return at step 5 — five levels above where the symptom appeared.
Fixing the interpolator (step 2) would have hidden it and left the hole.

**Then add defense-in-depth:** interpolator refuses to return the identity for a known body;
snapshot buffer logs holes; host asserts a broadcast happened every tick it stepped.

## Finding which test pollutes

Upstream ships a bash bisect script; it is not portable here. On Windows, run the suite
file-by-file and stop at the first one that leaves the artifact behind:

```powershell
Get-ChildItem -Recurse -Filter *.test.ts src, party |
  ForEach-Object {
    npx vitest run $_.FullName *> $null
    if (Test-Path .\the-artifact) { "POLLUTER: $($_.FullName)"; break }
  }
```

Swap `.\the-artifact` for whatever the pollution actually is — a stray file, a leaked
listener count, a global that should be undefined.

## Key principle

**Never fix only where the error appears.** Trace back to the original trigger, fix at the
source, then add validation at each layer the bad value passed through.
