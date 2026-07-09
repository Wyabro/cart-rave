// haptics.js — impact haptics: gamepad dual-rumble + mobile vibration, fire-and-forget.
// Feature-detected and wrapped in try/catch throughout; every call is a safe no-op on
// hardware without an actuator. Purely presentational — callers pass normalized 0..1
// magnitudes and a duration, matching how shake/impulse intensity already flows.

/**
 * Fires one haptic pulse on the first connected gamepad with a rumble actuator,
 * plus a `navigator.vibrate` fallback pulse for touch devices.
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
      const actuator = /** @type {any} */ (pad).vibrationActuator;
      if (actuator?.playEffect) {
        // * playEffect returns a promise that rejects when a newer effect preempts
        // * this one — expected during rapid impacts, so swallow it.
        actuator.playEffect("dual-rumble", { duration, strongMagnitude, weakMagnitude })
          .catch(() => {});
        break;
      }
    }
  } catch {}
  try {
    navigator.vibrate?.(duration);
  } catch {}
}
