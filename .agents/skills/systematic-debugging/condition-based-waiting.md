# Condition-Based Waiting

Flaky tests guess at timing with arbitrary delays. That creates races that pass on the 4090
and fail on the Intel box, or pass locally and fail in CI under load.

**Core principle:** wait for the condition you actually care about, not for a guess about
how long it takes.

## When to use

- A test sleeps (`setTimeout`, `await delay(50)`) and then asserts
- A test passes sometimes, or fails only under parallel load
- You are waiting on an async op: a room broadcast, an asset load, a capture to be written

**Do not use when** you are testing timing behavior itself — a debounce interval, a
throttle, a deliberate 150ms silence hold. Then the delay IS the subject. Document why.

## The pattern

```js
// ❌ guessing at timing
await new Promise(r => setTimeout(r, 50));
expect(room.state.phase).toBe('ARMED');

// ✅ waiting for the condition
await waitFor(() => room.state.phase === 'ARMED', 'countdown to arm');
expect(room.state.phase).toBe('ARMED');
```

## Quick patterns

| Scenario | Pattern |
|---|---|
| Wait for an event | `waitFor(() => events.find(e => e.type === 'KO'))` |
| Wait for state | `waitFor(() => room.state.phase === 'ARMED')` |
| Wait for a count | `waitFor(() => beacons.length >= 5)` |
| Wait for a file | `waitFor(() => fs.existsSync(shotPath))` |
| Compound | `waitFor(() => sim.ready && sim.tick > startTick)` |

## Implementation

```js
async function waitFor(condition, description, timeoutMs = 5000) {
  const start = performance.now();
  for (;;) {
    const result = condition();
    if (result) return result;
    if (performance.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}
```

Poll every ~10ms. Always pass a `description` — a bare "Timeout" in CI tells you nothing.

## Mistakes

- **Polling every 1ms** — burns CPU and changes the timing you are measuring. Use 10ms.
- **No timeout** — the loop hangs forever and the suite dies without a reason.
- **Caching state before the loop** — call the getter *inside* the loop or you poll a stale
  snapshot forever.
- **Asserting a beat instead of a state.** This is the COUNTDOWN-ARM-2 lesson (`2934d0b`):
  assert the ARM that must happen, not an intermediate beat a stall can swallow.

## When an arbitrary delay IS correct

```js
// The tool ticks every 100ms; we need 2 ticks to see partial output.
await waitFor(() => tool.started, 'tool start');   // 1. condition first
await new Promise(r => setTimeout(r, 200));         // 2. then the known interval
```

Requirements: wait for the triggering condition first, base the number on known timing
rather than a guess, and comment why. An explicit, justified timeout on a genuinely
load-sensitive case is the TEST-MARGIN-1 pattern (`234eee9`) — that is a documented margin,
not a guess.
