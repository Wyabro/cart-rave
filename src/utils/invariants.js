/**
 * invariants.js — pure runtime-invariant predicates for the diagnostics layer.
 *
 * Each predicate encodes a structural rule the game must never break. They are PURE
 * (no game imports, no side effects) so they unit-test in isolation and can be consumed
 * anywhere — today by gameplayDiagnostics.js, which observes store transitions and emits
 * an "assert" diag event on violation. Observation only: a violation is recorded evidence
 * for a harness/capture bundle, never a throw or a behavior change.
 *
 * Add new invariants as pure exported predicates + a test in tests/invariants.test.js,
 * then emit from the system that owns the transition (see the phase watchdog in
 * gameplayDiagnostics.wireStoreEvents for the pattern).
 */

/**
 * Legal round-phase transitions (gameStore.RoundPhase values).
 *
 * Derived from the phase machine's real flows:
 *   lobby     → countdown (round start) | running (mid-round join seats into a live round)
 *   countdown → running (GO)            | lobby (abort / host loss resets to lobby)
 *   running   → podium (round end)      | lobby (leave / return to menu)
 *   podium    → countdown (rematch)     | lobby (back to menu)
 *
 * Anything else (lobby→podium, countdown→podium, running→countdown, podium→running)
 * means a seam skipped a required state — the "wedged round" bug class.
 *
 * @type {Record<string, readonly string[]>}
 */
const LEGAL_PHASE_TRANSITIONS = {
  lobby: ["countdown", "running"],
  countdown: ["running", "lobby"],
  running: ["podium", "lobby"],
  podium: ["countdown", "lobby"],
};

/**
 * Whether a round-phase transition is one the phase machine is allowed to make.
 * Unknown phases are treated as legal (forward-compat: a new phase must not spam asserts).
 *
 * @param {string | null | undefined} from
 * @param {string | null | undefined} to
 * @returns {boolean}
 */
export function isLegalPhaseTransition(from, to) {
  if (!from || !to || from === to) return true;
  const allowed = LEGAL_PHASE_TRANSITIONS[from];
  if (!allowed) return true;
  return allowed.includes(to);
}
