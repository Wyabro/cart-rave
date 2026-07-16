// haptics.js — impact haptics: gamepad dual-rumble + mobile vibration, fire-and-forget.
// Feature-detected and wrapped in try/catch throughout; every call is a safe no-op on
// hardware without an actuator. Purely presentational — callers pass normalized 0..1
// magnitudes and a duration, matching how shake/impulse intensity already flows.

/**
 * Fires one haptic pulse on EVERY connected gamepad with any rumble capability,
 * plus a `navigator.vibrate` fallback pulse for touch devices.
 *
 * Playtest 2026-07-16: controller rumble read as absent. Two robustness holes fixed:
 * (1) the old loop stopped at the FIRST pad exposing `vibrationActuator` — Chrome keeps
 * stale/phantom entries in `getGamepads()`, so the pulse could land on a dead slot while
 * the pad in hand stayed silent; every connected pad gets the pulse now. (2) Firefox
 * exposes rumble via `pad.hapticActuators[0].pulse(value, duration)` (no
 * `vibrationActuator` at all) — that spec variant is now a fallback path.
 *
 * @param {number} strong 0..1 strong-motor (low frequency) magnitude.
 * @param {number} weak 0..1 weak-motor (high frequency) magnitude.
 * @param {number} durationMs Pulse length in milliseconds (clamped to 20..300).
 * @returns {void}
 */
export function hapticPulse(strong, weak, durationMs) {
  const duration = Math.min(Math.max(durationMs, 20), 300);
  const strongMagnitude = Math.min(Math.max(strong, 0), 1);
  const weakMagnitude = Math.min(Math.max(weak, 0), 1);
  try {
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad?.connected) continue;
      const anyPad = /** @type {any} */ (pad);
      const actuator = anyPad.vibrationActuator;
      if (actuator?.playEffect) {
        // * playEffect returns a promise that rejects when a newer effect preempts
        // * this one — expected during rapid impacts, so swallow it.
        try {
          actuator.playEffect("dual-rumble", { duration, strongMagnitude, weakMagnitude })
            .catch(() => {});
        } catch { /* per-pad — keep pulsing the others */ }
        continue;
      }
      // * Firefox / older Gamepad Extensions spec: per-pad hapticActuators list.
      const legacy = anyPad.hapticActuators?.[0];
      if (legacy?.pulse) {
        try {
          const p = legacy.pulse(Math.max(strongMagnitude, weakMagnitude), duration);
          p?.catch?.(() => {});
        } catch { /* per-pad — keep pulsing the others */ }
      }
    }
  } catch {}
  try {
    navigator.vibrate?.(duration);
  } catch {}
}
