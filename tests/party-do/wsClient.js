// Minimal WebSocket client for CartRaveServer DO harness tests.
// Upgrades via the Worker fetch handler (routePartykitRequest → CartRaveServer).

import { exports } from "cloudflare:workers";

/**
 * @typedef {{ type: string, [key: string]: unknown }} PartyMsg
 */

/**
 * @param {string} room
 * @param {{ ip?: string }} [opts]
 */
export function partyWsUrl(room, opts = {}) {
  void opts;
  return `http://example.com/parties/cart-rave-server/${encodeURIComponent(room)}`;
}

/**
 * Open a party WebSocket, collect JSON messages, and expose await helpers.
 * @param {string} room Unique private room name (not quickplay).
 * @param {{ ip?: string }} [opts]
 */
export async function openPartyClient(room, opts = {}) {
  const ip = opts.ip ?? `test-${Math.random().toString(16).slice(2)}`;
  const response = await exports.default.fetch(partyWsUrl(room), {
    headers: {
      Upgrade: "websocket",
      "cf-connecting-ip": ip,
    },
  });

  const socket = response.webSocket;
  if (!socket) {
    throw new Error(`Expected WebSocket upgrade, got status ${response.status}`);
  }

  // * Close tracking — register BEFORE accept() so an immediate server-side close
  // * (e.g. 4029 cap rejection) cannot arrive before the listener.
  let closeCode = null;
  /** @type {Array<() => void>} */
  let closeResolvers = [];
  socket.addEventListener("close", (event) => {
    closeCode = typeof event.code === "number" ? event.code : null;
    const rs = closeResolvers;
    closeResolvers = [];
    for (const r of rs) r();
  });

  socket.accept();

  /** @type {PartyMsg[]} */
  const messages = [];
  /** @type {Array<(msg: PartyMsg) => void>} */
  const waiters = [];

  socket.addEventListener("message", (event) => {
    let data;
    try {
      data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    messages.push(/** @type {PartyMsg} */ (data));
    for (let i = waiters.length - 1; i >= 0; i--) {
      waiters[i](/** @type {PartyMsg} */ (data));
    }
  });

  /**
   * @param {(msg: PartyMsg) => boolean} predicate
   * @param {number} [timeoutMs]
   * @returns {Promise<PartyMsg>}
   */
  function awaitMessage(predicate, timeoutMs = 3000) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(onMsg);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error(`awaitMessage timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      function onMsg(msg) {
        if (!predicate(msg)) return;
        clearTimeout(timer);
        const idx = waiters.indexOf(onMsg);
        if (idx >= 0) waiters.splice(idx, 1);
        resolve(msg);
      }
      waiters.push(onMsg);
    });
  }

  /**
   * @param {string} type
   * @param {number} [timeoutMs]
   */
  function awaitType(type, timeoutMs = 3000) {
    return awaitMessage((m) => m.type === type, timeoutMs);
  }

  /**
   * Resolves with the socket close code (number) once closed, or null when the
   * close event carried no numeric code. Bounded timeout; rejects if never closed.
   * @param {number} [timeoutMs]
   * @returns {Promise<number | null>}
   */
  function awaitClose(timeoutMs = 3000) {
    if (closeCode !== null) return Promise.resolve(closeCode);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = closeResolvers.indexOf(onClose);
        if (idx >= 0) closeResolvers.splice(idx, 1);
        reject(new Error(`awaitClose timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      function onClose() {
        clearTimeout(timer);
        resolve(closeCode);
      }
      closeResolvers.push(onClose);
    });
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function sendJson(payload) {
    socket.send(JSON.stringify(payload));
  }

  function close(code = 1000, reason = "test done") {
    try {
      socket.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  return {
    socket,
    messages,
    awaitMessage,
    awaitType,
    awaitClose,
    sendJson,
    close,
    ip,
  };
}

/**
 * Connect, wait for hello, join + color_pick, wait until seated as human.
 * @param {string} room
 * @param {{
 *   name?: string,
 *   clientId?: string,
 *   color?: string,
 *   lookHex?: number,
 *   hostScore?: number,
 *   ip?: string,
 * }} [opts]
 */
export async function connectAndSeat(room, opts = {}) {
  const client = await openPartyClient(room, { ip: opts.ip });
  const hello = await client.awaitType("hello");
  const youConnId = /** @type {string} */ (hello.youConnId);

  client.sendJson({
    type: "join",
    name: opts.name ?? "TEST",
    clientId: opts.clientId ?? `cid-${youConnId}`,
    hostScore: opts.hostScore ?? 50,
  });
  client.sendJson({
    type: "color_pick",
    color: opts.color ?? "pink",
    lookHex: opts.lookHex ?? 0xff00ff,
  });

  await client.awaitMessage(
    (m) =>
      m.type === "slots" &&
      Array.isArray(m.slots) &&
      m.slots.some((s) => s && s.kind === "human" && s.connId === youConnId),
  );

  return { client, hello, youConnId };
}
