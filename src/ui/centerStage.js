// centerStage.js — occupancy arbiter for the HUD's Center Stage event slot.
//
// The stage band (upper-center of the screen) shows ONE momentary event at a
// time: an announcer callout or a challenge/unlock toast. Persistent phase
// banners (GET READY / SUDDEN DEATH / MATCH POINT) live in their own slat above
// the event slot and never route through here — they are state, not events.
//
// Rules (from the HUD redesign plan):
// - Higher priority preempts the current occupant (its hide() is called).
// - `replaceSameKind` lets a client that does its own arbitration (the
//   announcer manager) hard-replace its previous callout instead of queueing.
// - Equal/lower priority queues, at most MAX_QUEUE deep; overflow is dropped.

/** Maximum queued events waiting behind the current occupant. */
const MAX_QUEUE = 2;
/** Grace between an occupant's scheduled end and granting the next (ms). */
const HANDOFF_GAP_MS = 60;

/**
 * Shared stage-claim priorities — the single source of truth for who preempts
 * whom on the Center Stage band. Higher wins.
 * - TOAST: default challenge toast — queues behind announcer callouts.
 * - ANNOUNCER: Store PA callouts.
 * - CRITICAL: unlock toasts + NEXT ARENA — usually land on the same KO that
 *   fires an announcer line, which used to preempt them instantly.
 */
export const STAGE_PRIORITY = Object.freeze({
  TOAST: 2,
  ANNOUNCER: 3,
  CRITICAL: 4,
});

/**
 * @typedef {object} StageRequest
 * @property {string} kind Client identity, e.g. "announcer" | "toast".
 * @property {number} priority Higher wins; announcer(3) > toast(2).
 * @property {number} durationMs How long the occupant owns the slot.
 * @property {() => void} show Called when the slot is granted.
 * @property {() => void} [hide] Called if a higher-priority event preempts.
 * @property {boolean} [replaceSameKind] Same-kind requests replace instead of queue.
 */

/** @type {{ kind: string, priority: number, untilMs: number, hide: (() => void) | null } | null} */
let _occupant = null;
/** @type {StageRequest[]} */
let _pending = [];
/** @type {ReturnType<typeof setTimeout> | null} */
let _drainTimer = null;

/**
 * @param {StageRequest} req
 * @param {number} nowMs
 */
function grant(req, nowMs) {
  _occupant = {
    kind: req.kind,
    priority: req.priority,
    untilMs: nowMs + Math.max(0, req.durationMs),
    hide: req.hide || null,
  };
  req.show();
  scheduleDrain(req.durationMs + HANDOFF_GAP_MS);
}

/** @param {number} delayMs */
function scheduleDrain(delayMs) {
  if (_drainTimer) clearTimeout(_drainTimer);
  _drainTimer = setTimeout(drain, Math.max(0, delayMs));
}

function drain() {
  _drainTimer = null;
  const now = performance.now();
  if (_occupant && _occupant.untilMs > now) {
    scheduleDrain(_occupant.untilMs - now + HANDOFF_GAP_MS);
    return;
  }
  _occupant = null;
  const next = _pending.shift();
  if (next) grant(next, now);
}

/**
 * Requests the Center Stage event slot. Grants immediately (possibly preempting
 * the current occupant), queues, or drops when the queue is full.
 *
 * @param {StageRequest} req
 * @returns {boolean} False only when the request was dropped (queue full).
 */
export function claimStage(req) {
  const now = performance.now();
  const occupied = _occupant && _occupant.untilMs > now;

  if (!occupied) {
    grant(req, now);
    return true;
  }

  const preempts =
    req.priority > _occupant.priority ||
    (req.replaceSameKind && req.kind === _occupant.kind && req.priority >= _occupant.priority);

  if (preempts) {
    _occupant.hide?.();
    grant(req, now);
    return true;
  }

  if (_pending.length >= MAX_QUEUE) return false;
  _pending.push(req);
  scheduleDrain(_occupant.untilMs - now + HANDOFF_GAP_MS);
  return true;
}

/**
 * Clears occupancy and the queue. Calls the current occupant's hide() so DOM
 * (toast / callout) is not left painted — menu return skips the game loop, so
 * timeouts alone are not a reliable cleanup path.
 */
export function resetStage() {
  if (_drainTimer) {
    clearTimeout(_drainTimer);
    _drainTimer = null;
  }
  if (_occupant?.hide) {
    try {
      _occupant.hide();
    } catch {
      /* presenter/DOM may already be torn down */
    }
  }
  _occupant = null;
  _pending = [];
}
