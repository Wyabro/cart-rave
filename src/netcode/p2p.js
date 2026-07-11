import { MSG } from "../../shared/protocol.js";

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
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
let signalingSend = null;
let onInputCallback = null;
let onStateCallback = null;

/** @type {object | null} */
let pendingInputPayload = null;
/** @type {string | null} */
let pendingInputTarget = null;

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

/**
 * Set the ICE/TURN servers.
 * @param {any[]} servers
 */
export function setTurnServers(servers) {
  if (servers && servers.length > 0) {
    iceServers = servers;
  }
}

/**
 * Create a new RTCPeerConnection.
 * @param {string} connId
 * @returns {RTCPeerConnection}
 */
function createPeerConnection(connId) {
  const pc = new RTCPeerConnection({ iceServers });
  peerConnections.set(connId, pc);

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
    console.log(`[p2p] Peer ${connId} state: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
      cleanupPeer(connId);
    }
  };

  return pc;
}

/**
 * Cleans up a peer connection.
 * @param {string} connId
 */
function cleanupPeer(connId) {
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
 * @param {string} connId
 */
export async function initiateP2PConnection(connId) {
  if (!isHost) return;
  if (peerConnections.has(connId)) return;

  const pc = createPeerConnection(connId);
  const dc = pc.createDataChannel("physics", { ordered: false, maxRetransmits: 0 });
  setupDataChannel(dc, connId);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

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

  let pc = peerConnections.get(fromConnId);

  if (!pc) {
    if (msg.type === MSG.sdpOffer) {
      pc = createPeerConnection(fromConnId);
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel, fromConnId);
      };
    } else if (msg.type === MSG.iceCandidate) {
      // * ICE can race ahead of the offer; buffer until we have a PC + remote description.
      bufferIceCandidate(fromConnId, msg.candidate);
      return;
    } else {
      return; // No PC and not offer/ICE — drop.
    }
  }

  if (msg.type === MSG.sdpOffer && !isHost) {
    await pc.setRemoteDescription(msg.sdp);
    await flushPendingIceCandidates(pc, fromConnId);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
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
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
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
    console.log(`[p2p] DataChannel open with ${connId}`);
    // Flush buffered input immediately to prevent input drop during migration
    if (pendingInputPayload && pendingInputTarget === connId) {
      try {
        dc.send(JSON.stringify(pendingInputPayload));
      } catch (e) {
        console.error('[p2p] Failed to flush pending input', e);
      }
      pendingInputPayload = null;
      pendingInputTarget = null;
    }
  };

  dc.onclose = () => console.log(`[p2p] DataChannel closed with ${connId}`);
  
  dc.onmessage = (event) => {
    try {
      const binary = coerceToArrayBuffer(event.data);
      if (binary) {
        // * Binary payloads are always host->client transform snapshots.
        if (!isHost && onStateCallback) {
          onStateCallback(binary, connId);
        }
        return;
      }

      // * Blob fallback (binaryType not honored): async path keeps the channel alive.
      if (typeof Blob !== "undefined" && event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          if (!isHost && onStateCallback) onStateCallback(buf, connId);
        }).catch((e) => console.error("[p2p] Blob→ArrayBuffer failed", e));
        return;
      }

      if (typeof event.data !== "string") return;

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
    dc.send(payload);
    pendingInputPayload = null;
    pendingInputTarget = null;
  } else {
    // Buffer the latest input. We only care about the most recent frame.
    pendingInputPayload = data;
    pendingInputTarget = targetConnId;
  }
}

/**
 * Sends data to all connected peers (used by Host to broadcast state).
 * @param {object} data
 */
export function sendToAll(data) {
  const payload = data instanceof ArrayBuffer ? data : (typeof data === "string" ? data : JSON.stringify(data));
  for (const dc of dataChannels.values()) {
    if (dc.readyState === "open") {
      dc.send(payload);
    }
  }
}

/**
 * Closes all peer connections and data channels.
 */
export function closeAllConnections() {
  for (const pc of peerConnections.values()) {
    pc.close();
  }
  peerConnections.clear();
  dataChannels.clear();
  pendingIceCandidates.clear();
  signalingChains.clear();
  pendingInputPayload = null;
  pendingInputTarget = null;
}
