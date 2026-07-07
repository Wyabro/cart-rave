import { MSG } from "../../shared/protocol.js";

let isHost = false;
const peerConnections = new Map();
const dataChannels = new Map();
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
      signalingSend({
        type: MSG.iceCandidate,
        targetConnId: connId,
        candidate: event.candidate
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
 * Handles WebRTC signaling messages from the WebSocket connection.
 * @param {any} msg
 */
export async function handleSignalingMessage(msg) {
  const fromConnId = msg.fromConnId;
  if (!fromConnId) return;

  let pc = peerConnections.get(fromConnId);

  if (!pc) {
    if (msg.type === MSG.sdpOffer) {
      pc = createPeerConnection(fromConnId);
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel, fromConnId);
      };
    } else {
      return; // No PC and no offer, drop.
    }
  }

  if (msg.type === MSG.sdpOffer && !isHost) {
    await pc.setRemoteDescription(msg.sdp);
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
  } else if (msg.type === MSG.iceCandidate) {
    try {
      await pc.addIceCandidate(msg.candidate);
    } catch (e) {
      console.error('[p2p] Error adding ICE candidate', e);
    }
  }
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
      if (event.data instanceof ArrayBuffer) {
        // * Binary payloads are always host->client transform snapshots.
        if (!isHost && onStateCallback) {
          onStateCallback(event.data, connId);
        }
      } else {
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
  pendingInputPayload = null;
  pendingInputTarget = null;
}
