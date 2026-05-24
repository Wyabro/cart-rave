// netcode.js — PartyKit networking, interpolation, host/client authority (extracted)

import PartySocket from "partysocket";
import * as GameState from "./gameState.js";
import { CONFIG, MSG, PARTYKIT_PUBLIC_HOST } from "./config.js";
import { isNitroHeld } from "./input.js";

let partySocket = null;
let youConnId = null;
let hostId = null;
let isHost = false;

let hostSeq = 0;
let inputSeq = 0;
let hostEpoch = 0;
let serverClockOffsetMs = 0;
let serverClockOffsetSamples = 0;

let lastCartsCache = null;
let netStateBuffer = [];

let remoteInputsByConnId = new Map();
let remoteNitroLatchedByConnId = new Map();

let hostSendTimer = null;
let inputSendTimer = null;
let keepaliveTimer = null;

let hostMigrationFreezeUntilMs = 0;

let skipNextPhysicsStep = false;

let allCartsRef = null;
let getAxisRef = null;
let triggerRamBoostRef = null;
let resetSimTimingRef = null;

let netSlots = [];
let lastSlotsJson = "";

// Registration of external callbacks/functions from main.js
let callbacks = {
  detectGameMode: () => "quickplay",
  getIncomingPortalParams: () => null,
  getPALETTE: () => [],
  getInitialNpcNames: () => [],
  markFirstHelloReceived: () => {},
  getOnGameStartHandler: () => null,
  getMenuVisible: () => true,
  hideMenuRef: () => {},
  updateCartMaterialsFromSlots: () => {},
  updateHudColorsFromSlots: () => {},
  scheduleNameLabelUpdate: () => {},
  respawnLocalMidRoundJoinRef: () => {},
  playCollisionRef: () => {},
  spawnTrashBurstRef: () => {},
  playFloorImpactRef: () => {},
  playEdgeImpactRef: () => {},
  addKillFeedEntry: () => {},
  colorHexForSlot: () => 0x888888,
  getPendingColorKey: () => null,
  getPendingColorChipEl: () => null,
  setPendingColorKey: () => {},
  setPendingColorChipEl: () => {},
  getLocalColorPicked: () => false,
  setLocalColorPicked: () => {},
  renderColorPicker: () => {},
  recordPodiumStats: () => {},
  bumpCrowd: () => {},
  getPendingMidRoundJoinRespawnConnId: () => null,
  setPendingMidRoundJoinRespawnConnId: () => {},
};

export function registerCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

export function setRefs(refs) {
  if (refs.allCartsRef !== undefined) allCartsRef = refs.allCartsRef;
  if (refs.getAxisRef !== undefined) getAxisRef = refs.getAxisRef;
  if (refs.triggerRamBoostRef !== undefined) triggerRamBoostRef = refs.triggerRamBoostRef;
  if (refs.resetSimTimingRef !== undefined) resetSimTimingRef = refs.resetSimTimingRef;
}

export function setNetSlots(slots) {
  netSlots = slots;
}

export function getYouConnId() { return youConnId; }
export function getIsHost() { return isHost; }
export function getHostId() { return hostId; }
export function getNetSlots() { return netSlots; }
export function getRemoteInputsByConnId() { return remoteInputsByConnId; }
export function getHostMigrationFreezeUntilMs() { return hostMigrationFreezeUntilMs; }
export function getServerClockOffsetMs() { return serverClockOffsetMs; }
export function getNetStateBuffer() { return netStateBuffer; }
export function getHostEpoch() { return hostEpoch; }
export function getSkipNextPhysicsStep() { return skipNextPhysicsStep; }
export function setSkipNextPhysicsStep(val) { skipNextPhysicsStep = val; }
export function getLastCartsCache() { return lastCartsCache; }
export function getPartySocket() { return partySocket; }

// Loop timers for main.js compatibility
export function getHostSendTimer() { return hostSendTimer; }
export function getInputSendTimer() { return inputSendTimer; }
export function getKeepaliveTimer() { return keepaliveTimer; }

export function partyHostFromWindowLocation() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
  return isLocal ? `${hostname}:1999` : PARTYKIT_PUBLIC_HOST;
}

export function resolvedPartyRoomFromUrl() {
  if (typeof window === "undefined") return "quickplay";
  const params = new URLSearchParams(window.location.search || "");
  const raw = (params.get("room") || "").trim();
  return /^[A-Za-z0-9]{2,16}$/.test(raw) ? raw : "quickplay";
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function applyCartsSnapshotToBodies(carts) {
  if (!allCartsRef) return;
  for (let i = 0; i < allCartsRef.length; i++) {
    const cart = allCartsRef[i];
    const snap = carts[String(i)];
    if (!cart || !snap) continue;

    const { p, q, lv, av } = snap;
    if (Array.isArray(p)) cart.body.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    if (Array.isArray(q)) cart.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
    if (Array.isArray(lv)) cart.body.setLinvel({ x: lv[0], y: lv[1], z: lv[2] }, true);
    if (Array.isArray(av)) cart.body.setAngvel({ x: av[0], y: av[1], z: av[2] }, true);
  }
}

export function bufferAuthoritativeState(serverNowMs, seq, carts, epoch) {
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(seq)) return;
  if (!carts || typeof carts !== "object") return;

  const last = netStateBuffer[netStateBuffer.length - 1];
  if (last && seq <= last.seq) return;

  netStateBuffer.push({ serverNowMs, seq, carts, epoch });
  while (netStateBuffer.length > 64) netStateBuffer.shift();
}

export function stopHostSendLoop() {
  if (hostSendTimer) clearInterval(hostSendTimer);
  hostSendTimer = null;
}

export function stopInputSendLoop() {
  if (inputSendTimer) clearInterval(inputSendTimer);
  inputSendTimer = null;
}

export function stopKeepaliveLoop() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = null;
}

export function startHostSendLoop() {
  stopHostSendLoop();
  if (!partySocket || !isHost || !allCartsRef) return;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.hostSendHz));
  hostSendTimer = setInterval(() => {
    if (!partySocket || !isHost || !allCartsRef || GameState.getRoundState().phase !== "running") return;

    hostSeq += 1;
    const carts = {};
    const round3 = v => Math.round(v * 1000) / 1000;

    for (let i = 0; i < allCartsRef.length; i++) {
      const c = allCartsRef[i];
      const t = c.body.translation();
      const r = c.body.rotation();
      const lv = c.body.linvel();
      const av = c.body.angvel();

      carts[String(i)] = {
        p: [round3(t.x), round3(t.y), round3(t.z)],
        q: [round3(r.x), round3(r.y), round3(r.z), round3(r.w)],
        lv: [round3(lv.x), round3(lv.y), round3(lv.z)],
        av: [round3(av.x), round3(av.y), round3(av.z)],
      };
    }

    lastCartsCache = carts;
    partySocket.send(JSON.stringify({
      type: MSG.hostTransform,
      seq: hostSeq,
      tHost: Date.now(),
      carts,
    }));
  }, intervalMs);
}

export function startInputSendLoop() {
  stopInputSendLoop();
  if (!partySocket || isHost || !getAxisRef) return;

  const intervalMs = Math.max(1, Math.round(1000 / CONFIG.net.clientInputHz));
  inputSendTimer = setInterval(() => {
    if (!partySocket || isHost || !getAxisRef) return;

    inputSeq += 1;
    const axis = getAxisRef();
    partySocket.send(JSON.stringify({
      type: MSG.clientInput,
      seq: inputSeq,
      tClient: Date.now(),
      input: {
        throttle: axis.forward,
        steer: axis.turn,
        nitro: isNitroHeld(),
      },
    }));
  }, intervalMs);
}

export function startKeepaliveLoop() {
  stopKeepaliveLoop();
  if (!partySocket) return;

  keepaliveTimer = setInterval(() => {
    if (partySocket) {
      partySocket.send(JSON.stringify({ type: MSG.keepalive, tClient: Date.now() }));
    }
  }, CONFIG.net.keepaliveIntervalMs);
}

export function setAuthorityMode(nextIsHost) {
  const becomingHost = nextIsHost && !isHost;
  const becomingClient = !nextIsHost && isHost;
  isHost = Boolean(nextIsHost);

  if (becomingHost) {
    stopInputSendLoop();
    netStateBuffer = [];
    hostSeq = 0;
    inputSeq = 0;

    if (lastCartsCache) applyCartsSnapshotToBodies(lastCartsCache);
    resetSimTimingRef?.current?.();
    skipNextPhysicsStep = true;

    for (const cart of allCartsRef || []) cart.body?.wakeUp?.();
    startHostSendLoop();
    return;
  }

  if (becomingClient) {
    stopHostSendLoop();
    startInputSendLoop();
    return;
  }

  if (isHost) {
    stopInputSendLoop();
    if (!hostSendTimer) startHostSendLoop();
  } else {
    stopHostSendLoop();
    if (!inputSendTimer) startInputSendLoop();
  }
}

export function strictSlotIndexForConn(connId) {
  if (!connId) return -1;
  return netSlots.findIndex((s) => s && s.connId === connId);
}

export function localSlotIndexForConn(connId) {
  return strictSlotIndexForConn(connId);
}

export function initNetcode(roomOverride) {
  if (typeof window === "undefined") return;
  callbacks.setLocalColorPicked(false);
  serverClockOffsetMs = 0;
  serverClockOffsetSamples = 0;
  let clientId = localStorage.getItem("cartRaveClientId");
  if (!clientId) {
    try {
      clientId = crypto.randomUUID();
    } catch {
      clientId = `cr-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    }
    try {
      localStorage.setItem("cartRaveClientId", clientId);
    } catch {
      // ignore
    }
  }
  const modeAtConnect = callbacks.detectGameMode();
  if (partySocket) {
    stopKeepaliveLoop();
    partySocket.close();
    partySocket = null;
  }

  if (modeAtConnect === "solo") {
    youConnId = "local-solo-player";
    hostId = "local-solo-player";
    isHost = true;
    setAuthorityMode(true);

    const portalParams = callbacks.getIncomingPortalParams();
    let savedUsername = (portalParams?.username || localStorage.getItem("cartRaveUsername") || localStorage.getItem("cartRaveName") || "").trim();
    if (!savedUsername) {
      savedUsername = "PLAYER" + Math.floor(Math.random() * 9000 + 1000);
      try {
        localStorage.setItem("cartRaveUsername", savedUsername);
        localStorage.setItem("cartRaveName", savedUsername);
      } catch {}
    }
    const savedColor = localStorage.getItem('cartRaveColor');
    const palette = callbacks.getPALETTE();
    const colorToSend = (savedColor && palette.includes(savedColor)) ? savedColor : palette[0];
    const npcNames = callbacks.getInitialNpcNames();

    netSlots = [
      { slotId: 0, kind: "human", connId: youConnId, name: savedUsername, color: colorToSend },
      { slotId: 1, kind: "npc", connId: null, name: npcNames[1], color: "blue" },
      { slotId: 2, kind: "npc", connId: null, name: npcNames[2], color: "green" },
      { slotId: 3, kind: "npc", connId: null, name: npcNames[3], color: "yellow" },
    ];

    callbacks.markFirstHelloReceived();

    setTimeout(() => {
      const startHandler = callbacks.getOnGameStartHandler();
      if (startHandler) {
        startHandler({ type: MSG.gameStart });
      }
    }, 100);
    return;
  }

  let didAutoReadyOnOpen = false;

  let resolvedRoom = resolvedPartyRoomFromUrl();
  if (roomOverride != null && String(roomOverride).trim() !== "") {
    const r = String(roomOverride).trim();
    if (/^[A-Za-z0-9]{2,16}$/.test(r)) resolvedRoom = r;
  }
  partySocket = new PartySocket({
    host: partyHostFromWindowLocation(),
    party: "main",
    room: resolvedRoom,
  });

  let didSendJoin = false;
  let netcodeRetryScheduled = false;
  const scheduleNetcodeRetry = () => {
    if (netcodeRetryScheduled) return;
    netcodeRetryScheduled = true;
    setTimeout(() => {
      netcodeRetryScheduled = false;
      if (partySocket) return;
      initNetcode(roomOverride);
    }, 400 + Math.random() * 600);
  };

  partySocket.addEventListener("close", () => {
    if (didSendJoin) return;
    try { scheduleNetcodeRetry(); } catch {}
  });

  partySocket.addEventListener("error", () => {
    if (didSendJoin) return;
    try { scheduleNetcodeRetry(); } catch {}
  });

  partySocket.addEventListener("open", () => {
    const portalParams = callbacks.getIncomingPortalParams();
    let savedUsername = (portalParams?.username || localStorage.getItem("cartRaveUsername") || localStorage.getItem("cartRaveName") || "").trim();
    if (!savedUsername) {
      savedUsername = "PLAYER" + Math.floor(Math.random() * 9000 + 1000);
      localStorage.setItem("cartRaveUsername", savedUsername);
      localStorage.setItem("cartRaveName", savedUsername);
    }
    if (portalParams?.username) {
      try {
        localStorage.setItem("cartRaveUsername", savedUsername);
        localStorage.setItem("cartRaveName", savedUsername);
      } catch {
        // ignore
      }
    }
    partySocket?.send(JSON.stringify({ type: MSG.join, name: savedUsername, clientId }));
    didSendJoin = true;
    
    startKeepaliveLoop();

    const menuVisible = callbacks.getMenuVisible();
    if (!didAutoReadyOnOpen && !menuVisible && (modeAtConnect === "quickplay" || modeAtConnect === "solo")) {
      didAutoReadyOnOpen = true;
      setTimeout(() => {
        if (
          partySocket &&
          partySocket.readyState === WebSocket.OPEN &&
          !callbacks.getMenuVisible() &&
          (callbacks.detectGameMode() === "quickplay" || callbacks.detectGameMode() === "solo")
        ) {
          partySocket.send(JSON.stringify({ type: MSG.readyToggle }));
        }
      }, 500);
    }
  });

  partySocket.addEventListener("message", (ev) => {
    let msg = null;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    const type = msg.type;
    const menuVisible = callbacks.getMenuVisible();

    if (type === MSG.hello) {
      youConnId = typeof msg.youConnId === "string" ? msg.youConnId : null;
      hostId = typeof msg.hostId === "string" ? msg.hostId : null;
      if (Array.isArray(msg.slots)) netSlots = msg.slots;
      if (msg.round && typeof msg.round === "object") {
        const state = GameState.getRoundState();
        GameState.setRoundPhase(msg.round.phase ?? state.phase);
        GameState.setRoundStartedAtMs(msg.round.startedAtMs ?? state.startedAtMs);
        GameState.setRoundCountdownStartedAtMs(msg.round.countdownStartedAtMs ?? state.countdownStartedAtMs);
        GameState.setRoundWinnerSlotIndex(msg.round.winnerSlotIndex ?? state.winnerSlotIndex);
      }
      if (GameState.getRoundState().phase === "running" && youConnId) {
        callbacks.setPendingMidRoundJoinRespawnConnId(youConnId);
      }
      callbacks.markFirstHelloReceived();

      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
        applyCartsSnapshotToBodies(msg.carts);
      }

      setAuthorityMode(Boolean(hostId && youConnId && hostId === youConnId));

      if (!menuVisible) {
        const savedColor = localStorage.getItem('cartRaveColor');
        const palette = callbacks.getPALETTE();
        const colorToSend = (savedColor && palette.includes(savedColor)) ? savedColor : palette[0];
        if (partySocket && partySocket.readyState === WebSocket.OPEN) {
          partySocket.send(JSON.stringify({ type: MSG.colorPick, color: colorToSend }));
          if (GameState.getRoundState().phase === "running" && youConnId) {
            callbacks.setPendingMidRoundJoinRespawnConnId(youConnId);
          }
        }
        callbacks.hideMenuRef();
      }

      callbacks.updateCartMaterialsFromSlots(msg.slots);
      callbacks.updateHudColorsFromSlots(msg.slots);
      callbacks.scheduleNameLabelUpdate();
      return;
    }

    if (type === MSG.hostMigrated) {
      hostId = typeof msg.hostId === "string" ? msg.hostId : null;
      const nextIsHost = Boolean(hostId && youConnId && hostId === youConnId);
      if (nextIsHost && lastCartsCache) {
        applyCartsSnapshotToBodies(lastCartsCache);
      }
      setAuthorityMode(nextIsHost);
      if (!nextIsHost) hostMigrationFreezeUntilMs = Date.now() + 300;
      hostEpoch += 1;
      netStateBuffer = [];
      return;
    }

    if (type === MSG.slots) {
      const incomingJson = JSON.stringify(msg.slots);
      if (incomingJson === lastSlotsJson) return;
      lastSlotsJson = incomingJson;
      if (Array.isArray(msg.slots)) {
        const newColors = msg.slots.map((s) => (s?.color || ""));
        const oldColors = netSlots.map((s) => (s?.color || ""));
        const colorsChanged = newColors.some((c, i) => c !== oldColors[i]);

        netSlots = msg.slots;
        const liveConnIds = new Set(
          netSlots
            .map((s) => (s && typeof s.connId === "string" ? s.connId : null))
            .filter(Boolean),
        );
        for (const id of remoteInputsByConnId.keys()) {
          if (!liveConnIds.has(id)) remoteInputsByConnId.delete(id);
        }
        for (const id of remoteNitroLatchedByConnId.keys()) {
          if (!liveConnIds.has(id)) remoteNitroLatchedByConnId.delete(id);
        }
        
        const takenColors = msg.slots
          .filter((s) => s && s.kind === "human" && s.connId !== youConnId)
          .map((s) => s.color);
        const palette = callbacks.getPALETTE();
        const availableColors = palette.filter((c) => !takenColors.includes(c));
        callbacks.renderColorPicker(availableColors);

        if (callbacks.getLocalColorPicked() && youConnId) {
          const mySlot = msg.slots.find((s) => s && s.connId === youConnId) || null;
          if (mySlot && typeof mySlot.color === "string") {
            const pendingColorKey = callbacks.getPendingColorKey();
            const isConfirmed = pendingColorKey && mySlot.color === pendingColorKey;
            const isRejected = pendingColorKey && mySlot.color !== pendingColorKey;
            if (isConfirmed || isRejected) {
              const pendingColorChipEl = callbacks.getPendingColorChipEl();
              pendingColorChipEl?.classList.remove("color-pending");
              callbacks.setPendingColorChipEl(null);
              callbacks.setPendingColorKey(null);
              callbacks.setLocalColorPicked(false);
            }
          }
        }
        
        if (colorsChanged) callbacks.updateCartMaterialsFromSlots(msg.slots);
        if (colorsChanged) callbacks.updateHudColorsFromSlots(msg.slots);
        callbacks.scheduleNameLabelUpdate();
        callbacks.respawnLocalMidRoundJoinRef();
      }
      return;
    }

    if (type === MSG.state) {
      if (msg.carts && typeof msg.carts === "object") {
        lastCartsCache = msg.carts;
      }
      if (!isHost) {
        const serverNowMs = typeof msg.serverNowMs === "number" ? msg.serverNowMs : Date.now();
        if (typeof serverNowMs === "number") {
          const sample = Date.now() - serverNowMs;
          serverClockOffsetSamples += 1;
          if (serverClockOffsetSamples <= 10) {
            serverClockOffsetMs = sample;
          } else {
            serverClockOffsetMs += (sample - serverClockOffsetMs) * 0.05;
          }
        }
        const seq = typeof msg.seq === "number" ? msg.seq : -1;
        bufferAuthoritativeState(serverNowMs, seq, msg.carts, hostEpoch);
      }
      return;
    }

    if (type === MSG.hostEventCollision) {
      if (isHost) return;
      const intensity = typeof msg.intensity === "number" ? msg.intensity : 0;
      const mp = msg.midpoint;
      const slotB = typeof msg.slotB === "number" ? msg.slotB : 0;
      if (mp && typeof mp.x === "number") {
        if (slotB === -1) {
          callbacks.playFloorImpactRef(intensity);
          if (GameState.getRoundState().phase === "running") {
            callbacks.spawnTrashBurstRef(mp, intensity, "floor");
          }
        } else if (slotB === -2 || slotB === -3) {
          callbacks.playEdgeImpactRef(intensity);
          if (GameState.getRoundState().phase === "running") {
            callbacks.spawnTrashBurstRef(mp, intensity, "edge");
          }
        } else {
          callbacks.playCollisionRef(intensity);
          if (GameState.getRoundState().phase === "running") {
            callbacks.spawnTrashBurstRef(mp, intensity);
          }
        }
      }
      return;
    }

    if (type === MSG.hostEventFall) {
      if (isHost) return;
      const victimSlot = netSlots[msg.slotId];
      const targetName = victimSlot?.name || `P${(msg.slotId ?? 0) + 1}`;
      const targetColor = callbacks.colorHexForSlot(victimSlot);
      if (msg.attackerSlot != null) {
        const attackerSlot = netSlots[msg.attackerSlot];
        const actorName = attackerSlot?.name || `P${msg.attackerSlot + 1}`;
        const actorColor = callbacks.colorHexForSlot(attackerSlot);
        callbacks.addKillFeedEntry(actorName, actorColor, msg.verb || "RAMMED", targetName, targetColor);
      } else {
        callbacks.addKillFeedEntry(null, null, msg.verb || "FELL OFF", targetName, targetColor);
      }
      return;
    }

    if (type === MSG.clientInput) {
      if (!isHost) return;
      const connId = typeof msg.connId === "string" ? msg.connId : null;
      const input = msg.input;
      if (!connId || !input || typeof input !== "object") return;

      const throttle = Number.isFinite(input.throttle) ? input.throttle : 0;
      const steer = Number.isFinite(input.steer) ? input.steer : 0;
      const nitro = Boolean(input.nitro);

      remoteInputsByConnId.set(connId, {
        throttle: clamp(throttle, -1, 1),
        steer: clamp(steer, -1, 1),
        nitro,
      });

      const was = remoteNitroLatchedByConnId.get(connId) || false;
      if (!was && nitro && allCartsRef && triggerRamBoostRef) {
        const slotIndex = strictSlotIndexForConn(connId);
        if (slotIndex >= 0) {
          const cart = allCartsRef[slotIndex];
          if (cart) triggerRamBoostRef(cart, performance.now());
        }
      }
      remoteNitroLatchedByConnId.set(connId, nitro);
      return;
    }

    if (type === MSG.round) {
      const r = msg.round;
      if (r && typeof r === "object") {
        if (r.phase === "running" && r.scores && typeof r.scores === "object") {
          let didScore = false;
          const currentScores = GameState.getRoundState().scores;
          for (let i = 0; i < 4; i += 1) {
            const prev = Number(currentScores?.[i] ?? 0);
            const next = Number(r.scores?.[i] ?? prev);
            if (next > prev) { didScore = true; break; }
          }
          callbacks.bumpCrowd();
        }

        const prevPhase = GameState.getRoundState().phase;
        const newPhase = r.phase;
        if (typeof newPhase === "string" && prevPhase === "running" && newPhase === "podium") {
          callbacks.setPendingMidRoundJoinRespawnConnId(null);
          if (!isHost) {
            const w = r.winnerSlotIndex;
            const winnerSlotIndex =
              w === "draw" ? "draw" : Number.isFinite(w) ? w : 0;
            const src = r.scores && typeof r.scores === "object" ? r.scores : GameState.getRoundState().scores;
            callbacks.recordPodiumStats(winnerSlotIndex, src);
          }
        }
        const state = GameState.getRoundState();
        GameState.setRoundPhase(r.phase ?? state.phase);
        GameState.setRoundStartedAtMs(r.startedAtMs ?? state.startedAtMs);
        GameState.setRoundCountdownStartedAtMs(r.countdownStartedAtMs ?? state.countdownStartedAtMs);
        GameState.setRoundWinnerSlotIndex(r.winnerSlotIndex ?? null);
        if (r.scores && typeof r.scores === "object") GameState.setRoundScores(r.scores);
      }
      return;
    }

    if (type === MSG.gameStart) {
      const startHandler = callbacks.getOnGameStartHandler();
      if (startHandler) startHandler(msg);
      return;
    }
  });
}

export function broadcastHostTransform(carts) {
  if (!partySocket || !isHost) return;
  hostSeq += 1;
  lastCartsCache = carts;
  partySocket.send(JSON.stringify({
    type: MSG.hostTransform,
    seq: hostSeq,
    tHost: Date.now(),
    carts: lastCartsCache,
  }));
}

export function sendHostRound() {
  if (!partySocket || !isHost) return;
  const state = GameState.getRoundState();
  partySocket.send(JSON.stringify({
    type: MSG.hostRound,
    round: {
      phase: state.phase,
      startedAtMs: state.startedAtMs,
      countdownStartedAtMs: state.countdownStartedAtMs,
      winnerSlotIndex: state.winnerSlotIndex,
      scores: state.scores,
    },
  }));
}

export function sendPlayAgain() {
  if (partySocket && partySocket.readyState === 1) {
    partySocket.send(JSON.stringify({ type: MSG.playAgain }));
  }
}