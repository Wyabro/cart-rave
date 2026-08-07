import { MSG } from "../../shared/protocol.js";
import { isP2PBinaryWithinLimit, isP2PJsonWithinLimit } from "./p2pLimits.js";
import { devLog } from "../utils/devLog.js";

/** Grace period before treating ICE "disconnected" as a hard failure (ms). */
const ICE_DISCONNECT_GRACE_MS = 5000;

let isHost = false;
const peerConnections = new Map();
const dataChannels = new Map();
/** @type {Map<string, RTCIceCandidateInit[]>} ICE candidates that arrived before setRemoteDescription. */
const pendingIceCandidates = new Map();
/**
 * Per-peer promise chain so offer/answer/ICE handlers never interleave on the same
 * RTCPeerConnection (WS delivers them fire-and-forget without awaiting).
 * @type {Map<string, Promise<void>>}
 */
const signalingChains = new Map();
/**
 * Pending ICE "disconnected" → teardown timers. Cleared on recovery or peer cleanup.
 * @type {Map<string, ReturnType<typeof setTimeout>>}
 */
const iceDisconnectGraceTimers = new Map();
/** @type {Map<string, number>} connId → Date.now() when the RTCPeerConnection was created. */
const peerCreatedAtMs = new Map();
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
let signalingSend = null;
let onInputCallback = null;
let onStateCallback = null;

/** @type {object | null} */
let pendingInputPayload = null;
/** @type {string | null} */
let pendingInputTarget = null;

/**
 * Gates offer/answer PC creation until TURN credentials arrive (or timeout).
 * Prevents building RTCPeerConnections with STUN-only config when TURN is on the way.
 * @type {Promise<void>}
 */
let iceServersReady = Promise.resolve();
/** @type {(() => void) | null} */
let iceServersReadyResolve = null;
/** True once setTurnServers ran or the wait timed out for this wait cycle. */
let iceServersReadySettled = true;
/** @type {ReturnType<typeof setTimeout> | null} Active wait-timeout; cleared on settle / re-entry. */
let iceServersReadyTimeout = null;
/**
 * Bumped only in {@link closeAllConnections}. In-flight initiate / answerer awaits
 * capture the value and abort when it changes so a demoted host cannot finish an offer
 * after tear-down (HOST-TAB-1 second-migrate freeze).
 * @type {number}
 */
let sessionGeneration = 0;

/**
 * Initialize P2P settings.
 * @param {object} params
 * @param {string} [params.localId]
 * @param {boolean} params.host
 * @param {function} params.sendSignal
 * @param {function} params.onInput
 * @param {function} params.onState
 */
export function initP2P({ localId, host, sendSignal, onInput, onState }) {
  isHost = host;
  signalingSend = sendSignal;
  onInputCallback = onInput;
  onStateCallback = onState;
}

/** @param {number} gen */
function hostSessionStillValid(gen) {
  return isHost && gen === sessionGeneration;
}

/** @param {number} gen */
function answererSessionStillValid(gen) {
  return !isHost && gen === sessionGeneration;
}

/** Clear the wait timer and resolve any in-flight iceServersReady waiter. */
function settleIceServersWait() {
  if (iceServersReadyTimeout != null) {
    clearTimeout(iceServersReadyTimeout);
    iceServersReadyTimeout = null;
  }
  if (!iceServersReadySettled) {
    iceServersReadySettled = true;
    const resolve = iceServersReadyResolve;
    iceServersReadyResolve = null;
    resolve?.();
  }
}

/**
 * Begin waiting for TURN credentials before creating peer connections.
 * Call immediately before requesting credentials from the server.
 * Safe to call again while a wait is open: prior waiters are released, then a
 * fresh window starts (rapid rejoin / double requestTurnCredentials must not hang).
 * @param {number} [timeoutMs=2500]
 */
export function beginIceServersWait(timeoutMs = 2500) {
  // * Re-entry must not orphan holders of the previous iceServersReady promise —
  // * overwriting iceServersReadyResolve left them pending forever after setTurnServers
  // * or the first timer settled the wrong generation.
  settleIceServersWait();
  iceServersReadySettled = false;
  iceServersReady = new Promise((resolve) => {
    iceServersReadyResolve = resolve;
    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 2500;
    iceServersReadyTimeout = setTimeout(() => {
      iceServersReadyTimeout = null;
      if (!iceServersReadySettled) {
        iceServersReadySettled = true;
        iceServersReadyResolve = null;
        resolve();
      }
    }, ms);
  });
}

/**
 * Wait until TURN credentials are applied (or the wait timed out / never started).
 * @returns {Promise<void>}
 */
export function waitForIceServers() {
  return iceServersReady;
}

/**
 * Set the ICE/TURN servers and push them onto any already-created peer connections.
 * @param {any[]} servers
 */
export function setTurnServers(servers) {
  if (servers && servers.length > 0) {
    iceServers = servers;
    for (const pc of peerConnections.values()) {
      try {
        if (typeof pc.setConfiguration === "function") {
          pc.setConfiguration({ iceServers });
        }
        // * Re-gather candidates with the new servers if negotiation already started.
        if (typeof pc.restartIce === "function" && pc.remoteDescription) {
          pc.restartIce();
        }
      } catch (e) {
        console.warn("[p2p] setConfiguration/restartIce failed", e);
      }
    }
  }
  settleIceServersWait();
}

/**
 * Create a new RTCPeerConnection.
 * @param {string} connId
 * @returns {RTCPeerConnection}
 */
function createPeerConnection(connId) {
  const pc = new RTCPeerConnection({ iceServers });
  peerConnections.set(connId, pc);
  peerCreatedAtMs.set(connId, Date.now());

  pc.onicecandidate = (event) => {
    if (event.candidate && signalingSend) {
      // * Prefer plain JSON init — RTCIceCandidate does not always stringify cleanly
      // * across the PartyKit hop without toJSON().
      const cand = typeof event.candidate.toJSON === "function"
        ? event.candidate.toJSON()
        : event.candidate;
      signalingSend({
        type: MSG.iceCandidate,
        targetConnId: connId,
        candidate: cand
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    devLog(`[p2p] Peer ${connId} state: ${state}`);
    // * "failed" / "closed" are terminal. "disconnected" is often transient
    // * (packet loss, network switch) — WebRTC can self-heal, so only tear
    // * down if it stays disconnected past the grace window.
    if (state === "failed" || state === "closed") {
      cleanupPeer(connId);
      return;
    }
    if (state === "disconnected") {
      scheduleIceDisconnectCleanup(connId, pc);
      return;
    }
    // * connected / completed / checking / new — ICE recovered or still negotiating.
    clearIceDisconnectGrace(connId);
  };

  return pc;
}

/**
 * @param {string} connId
 */
function clearIceDisconnectGrace(connId) {
  const timer = iceDisconnectGraceTimers.get(connId);
  if (timer != null) {
    clearTimeout(timer);
    iceDisconnectGraceTimers.delete(connId);
  }
}

/**
 * Arm a one-shot grace teardown if ICE stays in "disconnected".
 * @param {string} connId
 * @param {RTCPeerConnection} pc
 */
function scheduleIceDisconnectCleanup(connId, pc) {
  clearIceDisconnectGrace(connId);
  const timer = setTimeout(() => {
    iceDisconnectGraceTimers.delete(connId);
    const current = peerConnections.get(connId);
    // * Only tear down if this is still the same PC and still disconnected.
    if (current === pc && current.iceConnectionState === "disconnected") {
      console.warn(`[p2p] ICE disconnect grace expired for peer ${connId}; tearing down`);
      cleanupPeer(connId);
    }
  }, ICE_DISCONNECT_GRACE_MS);
  iceDisconnectGraceTimers.set(connId, timer);
}

/**
 * Cleans up a peer connection.
 * @param {string} connId
 */
function cleanupPeer(connId) {
  clearIceDisconnectGrace(connId);
  peerCreatedAtMs.delete(connId);
  const pc = peerConnections.get(connId);
  if (pc) {
    try { pc.close(); } catch (e) {}
    peerConnections.delete(connId);
  }
  dataChannels.delete(connId);
  pendingIceCandidates.delete(connId);
  signalingChains.delete(connId);
}

/**
 * Force-remove a peer so the host can re-offer (mid-match recovery).
 * @param {string} connId
 */
export function forceClosePeer(connId) {
  cleanupPeer(connId);
}

/**
 * @typedef {"ok" | "missing" | "dead" | "disconnected" | "channel_down" | "negotiating"} PeerHealthReason
 */

/**
 * Snapshot of whether a peer can currently carry gameplay traffic.
 * @param {string} connId
 * @returns {{ ok: boolean, reason: PeerHealthReason, ice: string | null, ageMs: number }}
 */
export function getPeerHealth(connId) {
  const pc = peerConnections.get(connId);
  if (!pc) {
    return { ok: false, reason: "missing", ice: null, ageMs: 0 };
  }
  const ice = pc.iceConnectionState;
  const createdAt = peerCreatedAtMs.get(connId);
  const ageMs = createdAt != null ? Math.max(0, Date.now() - createdAt) : 0;
  const dc = dataChannels.get(connId);

  if (ice === "failed" || ice === "closed") {
    return { ok: false, reason: "dead", ice, ageMs };
  }
  if (dc && dc.readyState === "open") {
    return { ok: true, reason: "ok", ice, ageMs };
  }
  // * Transient ICE loss — grace timer may still recover; do not re-offer yet.
  if (ice === "disconnected") {
    return { ok: false, reason: "disconnected", ice, ageMs };
  }
  // * ICE looks fine but the DataChannel died or never bound.
  if (
    (ice === "connected" || ice === "completed") &&
    (!dc || dc.readyState === "closed" || dc.readyState === "closing")
  ) {
    return { ok: false, reason: "channel_down", ice, ageMs };
  }
  return { ok: false, reason: "negotiating", ice, ageMs };
}

/**
 * Normalize a wire ICE payload into an RTCIceCandidateInit.
 * @param {any} candidate
 * @returns {RTCIceCandidateInit | null}
 */
function normalizeIceCandidate(candidate) {
  if (!candidate) return null;
  // * Already an init dict (or RTCIceCandidate with enumerable fields).
  if (typeof candidate === "object") {
    if (typeof candidate.candidate === "string" || candidate.candidate === "") {
      return {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? undefined,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
        usernameFragment: candidate.usernameFragment ?? undefined,
      };
    }
  }
  return null;
}

/**
 * Queue an ICE candidate until the remote description is set for this peer.
 * @param {string} connId
 * @param {any} candidate
 */
function bufferIceCandidate(connId, candidate) {
  const init = normalizeIceCandidate(candidate);
  if (!init) return;
  let queue = pendingIceCandidates.get(connId);
  if (!queue) {
    queue = [];
    pendingIceCandidates.set(connId, queue);
  }
  queue.push(init);
}

/**
 * Queue or apply a single ICE candidate for a peer.
 * Uses `pc.remoteDescription` (not a side flag) so we never addIceCandidate too early.
 * @param {RTCPeerConnection} pc
 * @param {string} connId
 * @param {any} candidate
 */
async function enqueueOrAddIceCandidate(pc, connId, candidate) {
  const init = normalizeIceCandidate(candidate);
  if (!init) return;

  // * Browsers throw InvalidStateError if remote description is not set yet.
  if (!pc.remoteDescription) {
    let queue = pendingIceCandidates.get(connId);
    if (!queue) {
      queue = [];
      pendingIceCandidates.set(connId, queue);
    }
    queue.push(init);
    return;
  }

  try {
    const ice = typeof RTCIceCandidate === "function" ? new RTCIceCandidate(init) : init;
    await pc.addIceCandidate(ice);
  } catch (e) {
    console.error("[p2p] Error adding ICE candidate", e);
  }
}

/**
 * Apply any ICE candidates that were buffered while remote description was pending.
 * @param {RTCPeerConnection} pc
 * @param {string} connId
 */
async function flushPendingIceCandidates(pc, connId) {
  const queue = pendingIceCandidates.get(connId);
  if (!queue || queue.length === 0) return;
  pendingIceCandidates.delete(connId);
  if (!pc.remoteDescription) return;
  for (const init of queue) {
    try {
      const ice = typeof RTCIceCandidate === "function" ? new RTCIceCandidate(init) : init;
      await pc.addIceCandidate(ice);
    } catch (e) {
      console.error("[p2p] Error flushing ICE candidate", e);
    }
  }
}

/**
 * Initiates a WebRTC connection (Host-side).
 * Waits for TURN credentials (or timeout) so the offer is not built STUN-only by accident.
 * @param {string} connId
 */
export async function initiateP2PConnection(connId) {
  if (!isHost) return;
  if (peerConnections.has(connId)) return;

  const gen = sessionGeneration;
  await waitForIceServers();
  // * Demotion / closeAll may have landed while we waited — do not offer as a non-host.
  if (!hostSessionStillValid(gen)) return;
  // * Another concurrent initiate may have won the race while we waited.
  if (peerConnections.has(connId)) return;

  const pc = createPeerConnection(connId);
  const dc = pc.createDataChannel("physics", { ordered: false, maxRetransmits: 0 });
  setupDataChannel(dc, connId);

  const offer = await pc.createOffer();
  if (!hostSessionStillValid(gen)) {
    cleanupPeer(connId);
    return;
  }
  await pc.setLocalDescription(offer);
  if (!hostSessionStillValid(gen)) {
    cleanupPeer(connId);
    return;
  }

  if (signalingSend) {
    signalingSend({
      type: MSG.sdpOffer,
      targetConnId: connId,
      sdp: pc.localDescription
    });
  }
}

/**
 * Core signaling handler (must run one-at-a-time per fromConnId).
 * @param {any} msg
 */
async function handleSignalingMessageInner(msg) {
  const fromConnId = msg.fromConnId;
  if (!fromConnId) return;

  // * Host is always the offerer — inbound offers are illegitimate (stale demoted host).
  if (msg.type === MSG.sdpOffer && isHost) return;

  let pc = peerConnections.get(fromConnId);

  if (!pc) {
    if (msg.type === MSG.sdpOffer) {
      // * Answerer also needs TURN before PC construction (symmetric NAT on both ends).
      const gen = sessionGeneration;
      await waitForIceServers();
      if (!answererSessionStillValid(gen)) return;
      pc = peerConnections.get(fromConnId);
      if (!pc) {
        pc = createPeerConnection(fromConnId);
        pc.ondatachannel = (event) => {
          setupDataChannel(event.channel, fromConnId);
        };
      }
    } else if (msg.type === MSG.iceCandidate) {
      // * ICE can race ahead of the offer; buffer until we have a PC + remote description.
      bufferIceCandidate(fromConnId, msg.candidate);
      return;
    } else {
      return; // No PC and not offer/ICE — drop.
    }
  }

  if (msg.type === MSG.sdpOffer && !isHost) {
    const gen = sessionGeneration;
    await pc.setRemoteDescription(msg.sdp);
    if (!answererSessionStillValid(gen)) return;
    await flushPendingIceCandidates(pc, fromConnId);
    if (!answererSessionStillValid(gen)) return;
    const answer = await pc.createAnswer();
    if (!answererSessionStillValid(gen)) return;
    await pc.setLocalDescription(answer);
    if (!answererSessionStillValid(gen)) return;
    if (signalingSend) {
      signalingSend({
        type: MSG.sdpAnswer,
        targetConnId: fromConnId,
        sdp: pc.localDescription
      });
    }
  } else if (msg.type === MSG.sdpAnswer) {
    await pc.setRemoteDescription(msg.sdp);
    await flushPendingIceCandidates(pc, fromConnId);
  } else if (msg.type === MSG.iceCandidate) {
    await enqueueOrAddIceCandidate(pc, fromConnId, msg.candidate);
  }
}

/**
 * Handles WebRTC signaling messages from the WebSocket connection.
 * Serialized per remote peer so offer/answer/ICE never race on one PC.
 * @param {any} msg
 */
export async function handleSignalingMessage(msg) {
  const fromConnId = msg.fromConnId;
  if (!fromConnId) return;

  const prev = signalingChains.get(fromConnId) || Promise.resolve();
  const next = prev
    .then(() => handleSignalingMessageInner(msg))
    .catch((e) => {
      console.error("[p2p] Signaling handler error", e);
    });
  signalingChains.set(fromConnId, next);
  await next;
}

/**
 * Coerce DataChannel binary payloads to ArrayBuffer.
 * Some environments deliver Uint8Array/Blob even when binaryType is set.
 * @param {any} data
 * @returns {ArrayBuffer | null}
 */
function coerceToArrayBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = /** @type {ArrayBufferView} */ (data);
    // * slice() re-types as ArrayBufferLike; DataChannel payloads are never SharedArrayBuffer.
    return /** @type {ArrayBuffer} */ (view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  return null;
}

/**
 * Setup data channel event listeners.
 * @param {RTCDataChannel} dc
 * @param {string} connId
 */
function setupDataChannel(dc, connId) {
  dataChannels.set(connId, dc);
  dc.binaryType = "arraybuffer"; // Force binary for performance
  
  dc.onopen = () => {
    devLog(`[p2p] DataChannel open with ${connId}`);
    // Flush buffered input immediately to prevent input drop during migration
    if (pendingInputPayload && pendingInputTarget === connId) {
      try {
        if (pendingInputPayload instanceof ArrayBuffer) {
          dc.send(pendingInputPayload);
        } else {
          dc.send(JSON.stringify(pendingInputPayload));
        }
      } catch (e) {
        console.error('[p2p] Failed to flush pending input', e);
      }
      pendingInputPayload = null;
      pendingInputTarget = null;
    }
  };

  dc.onclose = () => devLog(`[p2p] DataChannel closed with ${connId}`);
  
  dc.onmessage = (event) => {
    try {
      const binary = coerceToArrayBuffer(event.data);
      if (binary) {
        // * DataChannel frames come from a semi-trusted peer with no server relay; drop
        // * anything past the size ceiling before it reaches decode/parse (see p2pLimits).
        if (!isP2PBinaryWithinLimit(binary.byteLength)) {
          console.warn("[p2p] Oversized binary frame dropped:", binary.byteLength);
          return;
        }
        // * Binary payloads are always host->client transform snapshots.
        if (!isHost && onStateCallback) {
          onStateCallback(binary, connId);
        }
        return;
      }

      // * Blob fallback (binaryType not honored): async path keeps the channel alive.
      if (typeof Blob !== "undefined" && event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          if (buf && !isP2PBinaryWithinLimit(buf.byteLength)) {
            console.warn("[p2p] Oversized binary frame dropped:", buf.byteLength);
            return;
          }
          if (!isHost && onStateCallback) onStateCallback(buf, connId);
        }).catch((e) => console.error("[p2p] Blob→ArrayBuffer failed", e));
        return;
      }

      if (typeof event.data !== "string") return;

      // * Cheap length gate before JSON.parse; oversized control/input frames are dropped.
      if (!isP2PJsonWithinLimit(event.data.length)) {
        console.warn("[p2p] Oversized JSON frame dropped:", event.data.length);
        return;
      }

      const data = JSON.parse(event.data);
      if (isHost) {
        // * Host only consumes client input; everything else is host-authored.
        if (data.type === MSG.clientInput && onInputCallback) {
          onInputCallback(data.input, connId, data.seq);
        }
      } else if (onStateCallback) {
        // * Forward every host-authored JSON event (hostTransform, spill, …) to the
        // * netcode dispatcher, which routes by data.type. Filtering here previously
        // * dropped MSG.spill; the dispatcher is the single point that decides handling.
        onStateCallback(data, connId);
      }
    } catch (e) {
      console.error('[p2p] DataChannel parse error', e);
    }
  };
}

/**
 * Sends data to a specific peer (used by Non-Host to send input to Host).
 * @param {string} targetConnId
 * @param {object} data
 */
export function sendToPeer(targetConnId, data) {
  const dc = dataChannels.get(targetConnId);
  if (dc && dc.readyState === "open") {
    const payload = data instanceof ArrayBuffer ? data : JSON.stringify(data);
    try {
      dc.send(payload);
      pendingInputPayload = null;
      pendingInputTarget = null;
      return;
    } catch (e) {
      // Channel died between the readyState check and send — fall through to buffering.
    }
  }
  // Buffer the latest input. We only care about the most recent frame.
  pendingInputPayload = data;
  pendingInputTarget = targetConnId;
}

/**
 * Sends data to all connected peers (used by Host to broadcast state).
 * @param {object} data
 */
export function sendToAll(data) {
  const payload = data instanceof ArrayBuffer ? data : (typeof data === "string" ? data : JSON.stringify(data));
  for (const dc of dataChannels.values()) {
    if (dc.readyState === "open") {
      try {
        dc.send(payload);
      } catch (e) {
        // A channel can close between the readyState check and send — keep serving the rest.
      }
    }
  }
}

/**
 * Closes all peer connections and data channels.
 */
export function closeAllConnections() {
  // * Invalidate in-flight initiate / answerer awaits before settling ICE wait.
  sessionGeneration += 1;
  for (const timer of iceDisconnectGraceTimers.values()) {
    clearTimeout(timer);
  }
  iceDisconnectGraceTimers.clear();
  peerCreatedAtMs.clear();
  for (const pc of peerConnections.values()) {
    try { pc.close(); } catch (e) {}
  }
  peerConnections.clear();
  dataChannels.clear();
  pendingIceCandidates.clear();
  signalingChains.clear();
  pendingInputPayload = null;
  pendingInputTarget = null;
  // * Leave iceServers as-is (credentials still valid); settle any in-flight wait
  // * so a subsequent initiate is not stuck behind a closed session's promise.
  settleIceServersWait();
  iceServersReady = Promise.resolve();
}

/**
 * Close any peer connections not present in the live connection set.
 * @param {string[] | Set<string>} liveConnIds
 */
export function prunePeers(liveConnIds) {
  const live = new Set(liveConnIds);
  for (const connId of [...peerConnections.keys()]) {
    if (!live.has(connId)) {
      devLog(`[p2p] Pruning peer connection to ${connId} (not in live slots)`);
      cleanupPeer(connId);
    }
  }
}

/** @returns {number} Grace period used for ICE "disconnected" before teardown (ms). */
export function getIceDisconnectGraceMs() {
  return ICE_DISCONNECT_GRACE_MS;
}

/**
 * Test/debug: whether a peer PC is currently tracked.
 * @param {string} connId
 * @returns {boolean}
 */
export function hasPeerConnection(connId) {
  return peerConnections.has(connId);
}
