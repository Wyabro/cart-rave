import type * as Party from "partykit/server";

type SlotId = 0 | 1 | 2 | 3;

type CartState = {
  p: [number, number, number];
  q: [number, number, number, number];
  lv: [number, number, number];
  av: [number, number, number];
  flags?: Record<string, unknown>;
  seq?: number;
  tHost?: number;
};

type Slot = {
  slotId: SlotId;
  kind: "human" | "npc";
  connId: string | null;
  name: string;
  color: string;
  /** Client-synced neon frame hex (0–0xffffff); preset slot color is assignment only. */
  lookHex?: number | null;
  isReady: boolean;
};

type RoundPhase = "lobby" | "countdown" | "running" | "podium";

type RoundState = {
  phase: RoundPhase;
  winnerSlotIndex: number | "draw" | null;
  startedAtMs: number;
  countdownStartedAtMs: number;
  scores: Record<number, number>;
  endReason?: "timer" | "lastStanding" | null;
  /** Server stamped on every broadcast round payload clients may trust for stats. */
  validated: true;
};

const MSG = {
  // Client -> server
  join: "join",
  hostTransform: "host_transform",
  clientInput: "client_input",
  hostEventCollision: "host_event_collision",
  hostEventFall: "host_event_fall",
  hostRound: "host_round",
  colorPick: "color_pick",
  cartLook: "cart_look",
  readyToggle: "ready_toggle",
  playAgain: "play_again",

  // Server -> client
  hello: "hello",
  hostAssigned: "host_assigned",
  hostMigrated: "host_migrated",
  slots: "slots",
  state: "state",
  round: "round",
  joinRejected: "join_rejected",
  gameStart: "game_start",
  countdownCancel: "countdown_cancel",
} as const;

const PROTOCOL_VERSION = 2;
const PALETTE = ["pink", "blue", "green", "yellow", "neonOrange"] as const;
// * Keep in sync with src/npcNames.js (canonical browser-side list).
const NPC_NAME_POOL = [
  "CartNapper",
  "WheelSnipe",
  "BuggyBrawler",
  "TrolleyTerror",
  "AisleDrifter",
  "CartJacker",
  "PushNPray",
  "WobbleBot",
  "RimRattler",
  "BasketCase",
  "SkidMark",
  "BumperDumper",
  "RollCage",
  "HotWheelz",
  "CurbStomp",
  "CartBlanche",
  "DriftWood",
  "NitroNancy",
  "TurboTuesday",
  "WipeOut",
  "SendIt",
  "FullSend",
  "YeetCart",
  "NoBrakes",
  "CartGod",
  "Spinout",
  "ParkingPal",
  "LaneCrasher",
  "CartWheel",
  "RampRat",
  "AisleGoblin",
  "CouponCrusher",
  "BagRattler",
  "DentedDolly",
  "WobblesMcGee",
  "ReceiptReaper",
  "ShelfShark",
  "SnackBandit",
  "CheckoutChamp",
  "GreaseGremlin",
] as const;

const ROUND_DURATION_MS = 60_000;
const MIN_RUNNING_BEFORE_PODIUM_MS = 3_000;
const MAX_SCORE_PER_SLOT = 500;
const PICKER_TIMEOUT_MS = 30_000;
const RATE_LIMIT_MAX_PER_SEC = 50;
const RATE_LIMIT_WINDOW_MS = 1_000;
const ALLOWED_FALL_VERBS = new Set(["RAMMED", "YEETED", "BOOSTED OFF", "FELL OFF"]);

type CollisionFxEvent = {
  slotA: number;
  slotB: number;
  intensity: number;
  midpoint: { x: number; y: number; z: number } | null;
  rammerSlot?: number;
  isBoosting?: boolean;
};

/** @param {unknown} mp */
function validateCollisionMidpoint(mp: unknown): { x: number; y: number; z: number } | null {
  if (!mp || typeof mp !== "object") return null;
  const x = (mp as { x?: unknown }).x;
  const y = (mp as { y?: unknown }).y;
  const z = (mp as { z?: unknown }).z;
  if (typeof x !== "number" || !Number.isFinite(x) || x < -500 || x > 500) return null;
  if (typeof y !== "number" || !Number.isFinite(y) || y < -500 || y > 501) return null;
  if (typeof z !== "number" || !Number.isFinite(z) || z < -500 || z > 500) return null;
  return { x, y, z };
}

/** @param {unknown} n */
function validateCollisionSlot(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isInteger(n) || n < -3 || n > 3) return null;
  return n;
}

/** @param {unknown} raw */
function sanitizeCollisionBatch(raw: unknown): CollisionFxEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: CollisionFxEvent[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length && out.length < 12; i += 1) {
    const ev = raw[i];
    if (!ev || typeof ev !== "object") continue;
    const slotA = validateCollisionSlot((ev as { slotA?: unknown }).slotA);
    const slotB = validateCollisionSlot((ev as { slotB?: unknown }).slotB);
    if (slotA === null || slotB === null) continue;
    const intensity = (ev as { intensity?: unknown }).intensity;
    if (typeof intensity !== "number" || !Number.isFinite(intensity) || intensity < 0 || intensity > 2) {
      continue;
    }
    const key = `${Math.min(slotA, slotB)}|${Math.max(slotA, slotB)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry: CollisionFxEvent = {
      slotA,
      slotB,
      intensity,
      midpoint: validateCollisionMidpoint((ev as { midpoint?: unknown }).midpoint),
    };
    const rammerSlot = validateCollisionSlot((ev as { rammerSlot?: unknown }).rammerSlot);
    if (rammerSlot !== null && rammerSlot >= 0 && rammerSlot <= 3) {
      entry.rammerSlot = rammerSlot;
    }
    if ((ev as { isBoosting?: unknown }).isBoosting === true) {
      entry.isBoosting = true;
    }
    out.push(entry);
  }
  return out;
}

// * Activity-based connection reaper thresholds. PartyKit's onClose is not
// * guaranteed to fire (tab crash, airplane mode, phone sleep, dead socket not
// * yet detected by the runtime) so we track lastSeenAtMs per connection and
// * forcibly remove any that hasn't spoken in REAP_TIMEOUT_MS.
const REAP_TIMEOUT_MS = 20_000;
const REAP_THROTTLE_MS = 5_000;

export default class Server implements Party.Server {
  readonly #connections = new Map<string, Party.Connection>();
  readonly #joinOrder: string[] = [];
  readonly #connClientId = new Map<string, string>();

  #hostId: string | null = null;
  #slots: Slot[] | null = null;
  #carts: (CartState | undefined)[] = [];
  #round: RoundState = {
    phase: "lobby",
    winnerSlotIndex: null,
    startedAtMs: 0,
    countdownStartedAtMs: 0,
    scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
    validated: true,
  };
  #lastSeq: number = 0;
  #countdownArmed = false;
  readonly #pendingPickers = new Set<string>();
  readonly #pendingPickerAtMs = new Map<string, number>();
  readonly #pendingNames = new Map<string, string>();
  readonly #rateLimitWindows = new Map<string, { count: number; windowStart: number }>();
  // * Per-connection last-activity timestamp. A missing entry is intentionally
  // * treated as epoch (0) so that connections already present at reaper-deploy
  // * time (no prior lastSeenAtMs ever set) are reap-eligible on the first pass.
  // * Legitimate live connections will have an entry set by onConnect or onMessage.
  readonly #lastSeenAtMs = new Map<string, number>();
  #lastReapAtMs: number = 0;
  #countdownTimerHandle: ReturnType<typeof setTimeout> | null = null;
  #npcNameDeck: string[] = [];

  // Security: Rate limiting state
  readonly #ipConnectionCounts = new Map<string, number>();
  readonly #connToIp = new Map<string, string>();

  constructor(readonly room: Party.Room) {}

  #clamp(value: unknown, min: number, max: number) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  #safeStructuredClone<T>(value: T): T {
    try {
      // PartyKit runs on a modern runtime where structuredClone should exist.
      return structuredClone(value);
    } catch {
      // Fallback: keep server alive even if clone fails.
      return JSON.parse(JSON.stringify(value)) as T;
    }
  }

  #removeFromJoinOrder(connId: string) {
    for (let i = this.#joinOrder.length - 1; i >= 0; i -= 1) {
      if (this.#joinOrder[i] === connId) this.#joinOrder.splice(i, 1);
    }
  }

  #serverNowMs() {
    return Date.now();
  }

  #normalizeLookHex(raw: unknown): number | null {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n) & 0xffffff;
  }

  #ensureInitialized() {
    if (this.#slots) return;

    const colors = ["pink", "blue", "green", "yellow"];
    const npcNames = this.#drawNpcNames(4);

    this.#slots = ([0, 1, 2, 3] as SlotId[]).map((slotId) => ({
      slotId,
      kind: "npc",
      connId: null,
      name: npcNames[slotId] ?? `NPC-${slotId}`,
      color: colors[slotId] ?? `slot-${slotId}`,
      isReady: false,
    }));
  }

  #shuffleNpcNames() {
    this.#npcNameDeck = [...NPC_NAME_POOL];
    for (let i = this.#npcNameDeck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.#npcNameDeck[i], this.#npcNameDeck[j]] = [this.#npcNameDeck[j], this.#npcNameDeck[i]];
    }
  }

  #drawNpcNames(count: number): string[] {
    const names: string[] = [];
    for (let i = 0; i < count; i += 1) {
      names.push(this.#drawNpcName(new Set([...names])));
    }
    return names;
  }

  #drawNpcName(excludedNames = new Set<string>()) {
    const activeNpcNames = new Set(
      this.#slots
        ?.filter((s) => s.kind === "npc")
        .map((s) => s.name) ?? []
    );
    const unavailableNames = new Set([...activeNpcNames, ...excludedNames]);

    if (this.#npcNameDeck.length === 0) this.#shuffleNpcNames();
    let attempts = 0;
    while (attempts < NPC_NAME_POOL.length) {
      if (this.#npcNameDeck.length === 0) this.#shuffleNpcNames();
      const name = this.#npcNameDeck.shift();
      if (name && !unavailableNames.has(name)) return name;
      attempts += 1;
    }

    return NPC_NAME_POOL.find((name) => !unavailableNames.has(name)) ?? "CartGoblin";
  }

  #broadcastJson(payload: unknown) {
    const msg = JSON.stringify(payload);
    this.room.broadcast(msg);
  }

  #sendJson(conn: Party.Connection, payload: unknown) {
    conn.send(JSON.stringify(payload));
  }

  #sendJsonToHost(payload: unknown) {
    if (!this.#hostId) return;
    const hostConn = this.#connections.get(this.#hostId);
    if (!hostConn) return;
    this.#sendJson(hostConn, payload);
  }

  #snapshot() {
    this.#ensureInitialized();
    this.#ensureLiveHost();
    return {
      v: PROTOCOL_VERSION,
      roomId: this.room.id,
      serverNowMs: this.#serverNowMs(),
      hostId: this.#hostId,
      slots: this.#slots,
      round: this.#round,
      carts: this.#safeStructuredClone(this.#carts),
      seq: this.#lastSeq,
    };
  }

  #pickNextHostId(): string | null {
    for (const id of this.#joinOrder) {
      if (
        this.#connections.has(id) &&
        this.#slots?.some((s) => s.connId === id && s.kind === "human")
      ) {
        return id;
      }
    }
    return null;
  }

  // * Repairs #hostId if it points at a connection that no longer exists in
  // * #connections (e.g. onClose never fired for the host due to crash/network
  // * drop). Must be called after any operation that may have removed the host
  // * from #connections, and before hostId is surfaced to clients.
  #ensureLiveHost() {
    if (this.#hostId === null) return;
    if (this.#connections.has(this.#hostId)) return;
    const prevHostId = this.#hostId;
    this.#hostId = this.#pickNextHostId();
    this.#lastSeq = -1;
    if (this.#hostId) {
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostMigrated,
        serverNowMs: this.#serverNowMs(),
        hostId: this.#hostId,
      });
      this.#checkAllReady();
    }
  }

  #assignHumanToSlot(connId: string, preferredColor?: string): Slot | null {
    this.#ensureInitialized();
    const slots = this.#slots!;

    // Already assigned?
    const existing = slots.find((s) => s.connId === connId);
    if (existing) return existing;

    // Prefer the NPC holding the picked color so the human inherits booth position.
    let npcSlot =
      preferredColor
        ? slots.find((s) => s.kind === "npc" && s.color === preferredColor)
        : undefined;
    if (!npcSlot) npcSlot = slots.find((s) => s.kind === "npc");
    if (!npcSlot) return null;

    npcSlot.kind = "human";
    npcSlot.connId = connId;
    npcSlot.isReady = false;
    // Keep npcSlot.name until client sends join with a name.
    return npcSlot;
  }

  #convertHumanSlotToNpc(connId: string) {
    this.#ensureInitialized();
    const slots = this.#slots!;
    const slot = slots.find((s) => s.connId === connId);
    if (!slot) return;
    slot.kind = "npc";
    slot.connId = null;
    slot.isReady = false;
    slot.name = this.#drawNpcName();
    // Reassign color to avoid collisions with other slots.
    const usedColors = new Set(
      slots
        .filter((s) => s !== slot)
        .map((s) => s.color)
    );
    const nextColor = PALETTE.find((c) => !usedColors.has(c)) ?? slot.color;
    slot.color = nextColor;
    slot.lookHex = null;
  }

  #getAvailableColors(): string[] {
    const humanColors = new Set(
      this.#slots
        ?.filter((s) => s.kind === "human")
        .map((s) => s.color) ?? []
    );
    return PALETTE.filter((c) => !humanColors.has(c));
  }

  #freshRoundLobby(): RoundState {
    return {
      phase: "lobby",
      winnerSlotIndex: null,
      startedAtMs: 0,
      countdownStartedAtMs: 0,
      scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      validated: true,
    };
  }

  #broadcastRound() {
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.round,
      serverNowMs: this.#serverNowMs(),
      round: this.#safeStructuredClone(this.#round),
    });
  }

  #sanitizeScores(raw: unknown, base: Record<number, number>): Record<number, number> {
    const scores: Record<number, number> = { ...base };
    if (!raw || typeof raw !== "object") return scores;
    for (let i = 0; i < 4; i += 1) {
      const src = (raw as Record<string, unknown>)[i] ?? (raw as Record<string, unknown>)[String(i)];
      const n = typeof src === "number" ? src : Number(src);
      if (!Number.isFinite(n)) continue;
      scores[i] = Math.max(0, Math.min(MAX_SCORE_PER_SLOT, Math.floor(n)));
    }
    return scores;
  }

  #winnerFromScores(scores: Record<number, number>): number | "draw" {
    let max = 0;
    for (let i = 0; i < 4; i += 1) {
      max = Math.max(max, scores[i] ?? 0);
    }
    if (max === 0) return "draw";
    for (let i = 0; i < 4; i += 1) {
      if ((scores[i] ?? 0) === max) return i;
    }
    return 0;
  }

  #isAllowedPhaseTransition(from: RoundPhase, to: RoundPhase): boolean {
    if (from === to) return true;
    if (from === "lobby" && to === "countdown") return true;
    if (from === "countdown" && (to === "running" || to === "lobby")) return true;
    if (from === "running" && to === "podium") return true;
    if (from === "podium" && to === "lobby") return true;
    return false;
  }

  /** Validates host_round payloads; returns sanitized server round or null to reject. */
  #validateHostRound(incoming: unknown, now: number): RoundState | null {
    if (!incoming || typeof incoming !== "object") return null;
    const phase = (incoming as { phase?: unknown }).phase;
    if (phase !== "lobby" && phase !== "countdown" && phase !== "running" && phase !== "podium") {
      return null;
    }
    const nextPhase = phase as RoundPhase;
    const prev = this.#round;

    if (!this.#isAllowedPhaseTransition(prev.phase, nextPhase)) {
      return null;
    }

    const startedAtMsRaw = (incoming as { startedAtMs?: unknown }).startedAtMs;
    const countdownStartedAtMsRaw = (incoming as { countdownStartedAtMs?: unknown }).countdownStartedAtMs;
    const winnerRaw = (incoming as { winnerSlotIndex?: unknown }).winnerSlotIndex;
    const endReasonRaw = (incoming as { endReason?: unknown }).endReason;

    let startedAtMs = prev.startedAtMs;
    let countdownStartedAtMs = prev.countdownStartedAtMs;
    let scores = { ...prev.scores };
    let winnerSlotIndex: number | "draw" | null = prev.winnerSlotIndex;
    let endReason: "timer" | "lastStanding" | null = prev.endReason ?? null;

    if (nextPhase === "countdown") {
      countdownStartedAtMs =
        typeof countdownStartedAtMsRaw === "number" && Number.isFinite(countdownStartedAtMsRaw)
          ? countdownStartedAtMsRaw
          : now;
      startedAtMs = 0;
      winnerSlotIndex = null;
      scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
      endReason = null;
    }

    if (nextPhase === "running") {
      if (prev.phase !== "countdown" && prev.phase !== "running") return null;
      startedAtMs =
        typeof startedAtMsRaw === "number" && Number.isFinite(startedAtMsRaw) && startedAtMsRaw > 0
          ? startedAtMsRaw
          : (prev.phase === "running" && prev.startedAtMs > 0 ? prev.startedAtMs : now);
      winnerSlotIndex = null;
      if (prev.phase !== "running") {
        scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
        endReason = null;
      } else if (endReasonRaw === "lastStanding") {
        endReason = "lastStanding";
      } else if (endReasonRaw === null || endReasonRaw === undefined) {
        endReason = null;
      } else if (endReasonRaw === "timer") {
        return null;
      }
    }

    if (nextPhase === "running" || nextPhase === "podium") {
      scores = this.#sanitizeScores((incoming as { scores?: unknown }).scores, scores);
      for (let i = 0; i < 4; i += 1) {
        const prevScore = prev.scores[i] ?? 0;
        if ((scores[i] ?? 0) < prevScore) scores[i] = prevScore;
      }
    }

    if (nextPhase === "podium") {
      if (prev.phase !== "running") return null;
      if (!prev.startedAtMs || now - prev.startedAtMs < MIN_RUNNING_BEFORE_PODIUM_MS) return null;
      if (now - prev.startedAtMs > ROUND_DURATION_MS + 15_000) return null;

      const lastStanding =
        endReasonRaw === "lastStanding"
        || (typeof endReasonRaw === "string" && endReasonRaw.trim() === "lastStanding");
      if (lastStanding) {
        endReason = "lastStanding";
      } else if (endReasonRaw === "timer" || endReasonRaw === null || endReasonRaw === undefined) {
        endReason = endReasonRaw === "timer" ? "timer" : null;
      } else {
        return null;
      }

      const computedWinner = this.#winnerFromScores(scores);
      if (computedWinner === "draw") {
        winnerSlotIndex = "draw";
        endReason = null;
      } else if (winnerRaw === "draw") {
        return null;
      } else {
        const w = typeof winnerRaw === "number" ? winnerRaw : Number(winnerRaw);
        if (!Number.isInteger(w) || w < 0 || w > 3) return null;
        if (
          !lastStanding
          && (scores[w] ?? 0) < Math.max(scores[0] ?? 0, scores[1] ?? 0, scores[2] ?? 0, scores[3] ?? 0)
        ) {
          return null;
        }
        winnerSlotIndex = w;
        if (!lastStanding && endReason !== "timer") {
          endReason = "timer";
        }
      }
    }

    if (nextPhase === "lobby") {
      startedAtMs = 0;
      countdownStartedAtMs = 0;
      winnerSlotIndex = null;
      scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
      endReason = null;
    }

    return {
      phase: nextPhase,
      winnerSlotIndex,
      startedAtMs,
      countdownStartedAtMs,
      scores,
      endReason,
      validated: true,
    };
  }

  #checkRateLimit(connId: string): boolean {
    const now = this.#serverNowMs();
    let bucket = this.#rateLimitWindows.get(connId);
    if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      bucket = { count: 0, windowStart: now };
      this.#rateLimitWindows.set(connId, bucket);
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX_PER_SEC) {
      return false;
    }
    return true;
  }

  #reapStalePendingPickers() {
    const now = this.#serverNowMs();
    for (const id of [...this.#pendingPickers]) {
      const joinedAt = this.#pendingPickerAtMs.get(id) ?? 0;
      if (now - joinedAt <= PICKER_TIMEOUT_MS) continue;
      this.#pendingPickers.delete(id);
      this.#pendingNames.delete(id);
      this.#pendingPickerAtMs.delete(id);
      const conn = this.#connections.get(id);
      this.#connections.delete(id);
      this.#removeFromJoinOrder(id);
      this.#lastSeenAtMs.delete(id);
      this.#connClientId.delete(id);
      this.#rateLimitWindows.delete(id);
      const ip = this.#connToIp.get(id);
      if (ip) {
        const count = this.#ipConnectionCounts.get(ip) ?? 1;
        this.#ipConnectionCounts.set(ip, Math.max(0, count - 1));
        this.#connToIp.delete(id);
      }
      try {
        conn?.close(4011, "Picker timeout");
      } catch {
        // ignore
      }
    }
  }

  // * Cancels the game-start countdown if the "all ready" condition is no
  // * longer satisfied. Called after any human slot reverts to NPC to
  // * prevent a countdown from firing with fewer players than intended.
  #cancelCountdownIfNeeded() {
    if (this.#countdownTimerHandle === null && !this.#countdownArmed) return;
    const humanSlots = this.#slots!.filter((s) => s.kind === "human");
    if (humanSlots.every((s) => s.isReady)) return;
    this.#abortArmedCountdown();
  }

  // * Notifies all clients when an armed game_start countdown is invalidated.
  #abortArmedCountdown() {
    if (this.#countdownTimerHandle === null && !this.#countdownArmed) return;
    if (this.#countdownTimerHandle !== null) {
      clearTimeout(this.#countdownTimerHandle);
      this.#countdownTimerHandle = null;
    }
    this.#countdownArmed = false;
    if (this.#round.phase === "countdown") {
      this.#round = this.#freshRoundLobby();
      this.#broadcastRound();
      return;
    }
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.countdownCancel,
      serverNowMs: this.#serverNowMs(),
    });
  }

  #rejectPendingConn(conn: Party.Connection, code: number, reason: string) {
    this.#sendJson(conn, { v: PROTOCOL_VERSION, type: MSG.joinRejected });
    this.#pendingPickers.delete(conn.id);
    this.#pendingPickerAtMs.delete(conn.id);
    this.#pendingNames.delete(conn.id);
    this.#connections.delete(conn.id);
    this.#removeFromJoinOrder(conn.id);
    this.#lastSeenAtMs.delete(conn.id);
    this.#connClientId.delete(conn.id);
    this.#rateLimitWindows.delete(conn.id);
    const ip = this.#connToIp.get(conn.id);
    if (ip) {
      const count = this.#ipConnectionCounts.get(ip) ?? 1;
      this.#ipConnectionCounts.set(ip, Math.max(0, count - 1));
      this.#connToIp.delete(conn.id);
    }
    try {
      conn.close(code, reason);
    } catch {
      // ignore
    }
  }

  #hasNpcSlotForPendingPicker(): boolean {
    this.#ensureInitialized();
    return this.#slots!.some((s) => s.kind === "npc");
  }

  // * Room capacity after ghost exorcism — pending pickers need a free NPC slot.
  #rejectPendingConnIfRoomFull(conn: Party.Connection): boolean {
    if (!this.#pendingPickers.has(conn.id)) return false;
    if (this.#hasNpcSlotForPendingPicker()) return false;
    this.#rejectPendingConn(conn, 4004, "Room full");
    return true;
  }

  // * Checks whether every human slot has toggled ready. If so, arms a
  // * 3-second timer and broadcasts MSG.gameStart with a startsAtMs timestamp.
  // * The timer handle acts as the one-shot guard — re-entrant calls are no-ops
  // * until the timer fires and clears the handle.
  #checkAllReady() {
    if (this.#round.phase !== "lobby" || this.#countdownTimerHandle !== null) return;
    const liveConnIds = new Set<string>();
    for (const c of this.room.getConnections()) {
      liveConnIds.add(c.id);
    }
    const humanSlots = this.#slots!.filter(
      (s) => s.kind === "human" && s.connId && liveConnIds.has(s.connId)
    );
    if (humanSlots.length === 0) return;
    if (!humanSlots.every((s) => s.isReady)) return;

    const startsAtMs = this.#serverNowMs() + 3000;
    this.#countdownArmed = true;
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.gameStart,
      serverNowMs: this.#serverNowMs(),
      startsAtMs,
    });
    this.#countdownTimerHandle = setTimeout(() => {
      this.#countdownTimerHandle = null;
      this.#countdownArmed = false;
    }, 3000);
  }

  #reconcileOrphanSlots(liveConnIds: Set<string>) {
    this.#ensureInitialized();
    let changed = false;
    for (const slot of this.#slots!) {
      if (slot.kind === "human" && slot.connId && !liveConnIds.has(slot.connId)) {
        this.#convertHumanSlotToNpc(slot.connId);
        changed = true;
      }
    }
    return changed;
  }

  // * Removes connections that haven't sent a message in REAP_TIMEOUT_MS.
  // * Intended as a safety net for when onClose doesn't fire (crash, network
  // * drop, platform bug, phantom tabs). Host handoff is delegated to
  // * #ensureLiveHost() so we don't duplicate the migration broadcast logic.
  #reapSilentConnections() {
    const now = this.#serverNowMs();
    const reapedIds: string[] = [];

    for (const id of this.#connections.keys()) {
      const lastSeen = this.#lastSeenAtMs.get(id) ?? 0;
      if (now - lastSeen > REAP_TIMEOUT_MS) {
        reapedIds.push(id);
      }
    }

    this.#lastReapAtMs = now;
    this.#reapStalePendingPickers();
    if (reapedIds.length === 0) return false;

    let slotsChanged = false;
    for (const id of reapedIds) {
      const lastSeen = this.#lastSeenAtMs.get(id) ?? 0;
      const age = now - lastSeen;
      const wasHost = id === this.#hostId;
      const slot = this.#slots?.find((s) => s.connId === id);
      if (slot && slot.kind === "human") slotsChanged = true;
      this.#connections.delete(id);
      this.#removeFromJoinOrder(id);
      this.#lastSeenAtMs.delete(id);
      this.#connClientId.delete(id);
      this.#rateLimitWindows.delete(id);
      if (this.#pendingPickers.has(id)) {
        this.#pendingPickers.delete(id);
        this.#pendingPickerAtMs.delete(id);
        this.#pendingNames.delete(id);
      } else {
        this.#convertHumanSlotToNpc(id);
      }
      
      // Cleanup IP tracking on reap
      const ip = this.#connToIp.get(id);
      if (ip) {
        const count = this.#ipConnectionCounts.get(ip) ?? 1;
        this.#ipConnectionCounts.set(ip, Math.max(0, count - 1));
        this.#connToIp.delete(id);
      }
    }

    // * Cancel any armed countdown if the departed human(s) broke the all-ready
    // * condition. Must run before #ensureLiveHost so the check sees the final
    // * post-reap slot state.
    this.#cancelCountdownIfNeeded();

    // * Delegate host repair + hostMigrated broadcast to #ensureLiveHost so
    // * handoff logic lives in exactly one place.
    this.#ensureLiveHost();

    return slotsChanged;
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const ua = new URL(ctx.request.url).searchParams.get("_ua") ||
      ctx.request.headers.get("user-agent") || "";
    const mobileRe = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;
    if (mobileRe.test(ua)) {
      conn.close(4003, "Mobile not supported");
      return;
    }

    // Security: Enforce connection rate limit per IP
    const ip = ctx.request.headers.get("cf-connecting-ip") || "unknown";
    const currentConnections = this.#ipConnectionCounts.get(ip) ?? 0;
    if (currentConnections >= 5) {
      conn.close(4029, "Too many connections");
      return;
    }
    this.#ipConnectionCounts.set(ip, currentConnections + 1);
    this.#connToIp.set(conn.id, ip);

    this.#ensureInitialized();

    // --- Phase Reset: If room was completely empty of humans, nuke the state ---
    const existingHumans = this.#slots!.filter(s => s.kind === "human");
    if (existingHumans.length === 0) {
      this.#round = this.#freshRoundLobby();
      this.#carts = []; // Nuke the stale physical positions
      this.#countdownArmed = false;
      if (this.#countdownTimerHandle) {
        clearTimeout(this.#countdownTimerHandle);
        this.#countdownTimerHandle = null;
      }
    }

    this.#pendingPickers.add(conn.id);
    this.#pendingPickerAtMs.set(conn.id, this.#serverNowMs());

    this.#connections.set(conn.id, conn);
    this.#joinOrder.push(conn.id);
    this.#lastSeenAtMs.set(conn.id, this.#serverNowMs());

    // * Reap before reconcile so a freshly-reaped ghost host is already gone
    // * by the time we compute orphan slots and build the hello snapshot.
    // * The new conn is already in #connections and lastSeenAtMs, so it's
    // * immune to reap and a valid host successor.
    const reaped = this.#reapSilentConnections();

    // Reconcile: any slot marked "human" whose connId is not in the platform's live
    // connection list is orphaned. Use room.getConnections() rather than #connections
    // because WebSocket close events are not guaranteed to fire (tab crash, incognito
    // close, network drop) and #connections can hold zombies.
    const liveConnIds = new Set<string>();
    for (const c of this.room.getConnections()) {
      liveConnIds.add(c.id);
    }
    // The new connection itself is not yet in getConnections() during onConnect, so add it.
    liveConnIds.add(conn.id);
    const reconciled = this.#reconcileOrphanSlots(liveConnIds);
    void reaped;
    void reconciled;

    // Prune zombies from #connections to match platform reality.
    for (const staleId of [...this.#connections.keys()]) {
      if (!this.room.getConnections().some((c) => c.id === staleId) && staleId !== conn.id) {
        this.#connections.delete(staleId);
      }
    }

    // * After pruning, the prior host may have been a zombie we just removed.
    // * Repair #hostId before we advertise it via hello. The newly joined conn
    // * is already in #connections and #joinOrder, so #pickNextHostId() will
    // * return it as a last resort if no older connection survives.
    this.#ensureLiveHost();

    // * First-ever host assignment, or fallthrough when #ensureLiveHost found
    // * no successor (empty room edge case).
    if (!this.#hostId) {
      this.#hostId = conn.id;
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostAssigned,
        serverNowMs: this.#serverNowMs(),
        hostId: this.#hostId,
      });
    }

    // Late-join snapshot: send full room state immediately.
    const helloPayload = {
      v: PROTOCOL_VERSION,
      type: MSG.hello,
      ...this.#snapshot(),
      youConnId: conn.id,
      path: new URL(ctx.request.url).pathname,
      availableColors: this.#getAvailableColors(),
    };
    this.#sendJson(conn, helloPayload);

    // Broadcast current slot mapping so all clients stay consistent.
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.slots,
      serverNowMs: this.#serverNowMs(),
      slots: this.#slots,
    });

    // After cleaning up a disconnected player's slot, re-evaluate ready state.
    // Handles the refresh race: new conn readied up while old conn was still alive,
    // #checkAllReady failed (2 humans, 1 not ready). Now that the orphan is gone,
    // the remaining humans may all be ready.
    this.#checkAllReady();
  }

  onClose(conn: Party.Connection) {
    // Security: Cleanup IP tracking
    const ip = this.#connToIp.get(conn.id);
    if (ip) {
      const count = this.#ipConnectionCounts.get(ip) ?? 1;
      this.#ipConnectionCounts.set(ip, Math.max(0, count - 1));
      this.#connToIp.delete(conn.id);
    }

    this.#connections.delete(conn.id);
    this.#removeFromJoinOrder(conn.id);
    this.#lastSeenAtMs.delete(conn.id);
    this.#connClientId.delete(conn.id);
    this.#rateLimitWindows.delete(conn.id);
    if (this.#pendingPickers.has(conn.id)) {
      this.#pendingPickers.delete(conn.id);
      this.#pendingPickerAtMs.delete(conn.id);
      this.#pendingNames.delete(conn.id);
    } else {
      this.#convertHumanSlotToNpc(conn.id);
    }
    this.#cancelCountdownIfNeeded();

    const wasHost = this.#hostId === conn.id;
    if (wasHost) {
      if (this.#countdownTimerHandle !== null) {
        clearTimeout(this.#countdownTimerHandle);
        this.#countdownTimerHandle = null;
      }
      const prevHostId = this.#hostId;
      this.#hostId = this.#pickNextHostId();
      this.#lastSeq = -1;
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostMigrated,
        serverNowMs: this.#serverNowMs(),
        hostId: this.#hostId,
      });
      // * Carts continue from last-known transforms. No re-init.
      // * Host loss during countdown strands clients — reset to lobby so
      // * #checkAllReady() can re-arm game_start for the surviving host.
      if (this.#round.phase === "countdown") {
        this.#round = this.#freshRoundLobby();
        this.#countdownArmed = false;
        this.#broadcastRound();
      }
    }

    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.slots,
      serverNowMs: this.#serverNowMs(),
      slots: this.#slots,
    });

    if (wasHost) {
      this.#checkAllReady();
    }
  }

  onMessage(message: string, conn: Party.Connection) {
    // Security: Block massive payload bombs before trying to parse
    if (message.length > 4096) {
      conn.close(4009, "Payload too large");
      return;
    }

    if (!this.#checkRateLimit(conn.id)) {
      conn.close(4028, "Rate limit exceeded");
      return;
    }

    const now = this.#serverNowMs();
    this.#lastSeenAtMs.set(conn.id, now);
    if (now - this.#lastReapAtMs >= REAP_THROTTLE_MS) {
      this.#reapSilentConnections();
    }

    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const type = data?.type;
    if (type === MSG.join) {
      // Optional client metadata; server already assigned a slot on connect.
      const name = typeof data?.name === "string" ? data.name.trim() : "";
      const clientId = typeof data?.clientId === "string" ? data.clientId.trim() : "";
      if (name) {
        this.#ensureInitialized();
        if (this.#pendingPickers.has(conn.id)) {
          this.#pendingNames.set(conn.id, name.slice(0, 24));
        }
        const slot = this.#slots!.find((s) => s.connId === conn.id);
        if (slot) slot.name = name.slice(0, 24);
      }

      let ghostHumanExorcised = false;

      if (clientId) {
        // Exorcise ghost: same clientId, different connId.
        let ghostConnId: string | null = null;
        for (const [id, cid] of this.#connClientId.entries()) {
          if (id !== conn.id && cid === clientId) {
            ghostConnId = id;
            break;
          }
        }
        if (ghostConnId && this.#connections.has(ghostConnId)) {
          const ghostConn = this.#connections.get(ghostConnId);
          if (this.#pendingPickers.has(ghostConnId)) {
            this.#pendingPickers.delete(ghostConnId);
            this.#pendingPickerAtMs.delete(ghostConnId);
            this.#pendingNames.delete(ghostConnId);
          } else {
            this.#convertHumanSlotToNpc(ghostConnId);
            ghostHumanExorcised = true;
          }
          this.#connections.delete(ghostConnId);
          this.#removeFromJoinOrder(ghostConnId);
          this.#lastSeenAtMs.delete(ghostConnId);
          this.#connClientId.delete(ghostConnId);

          // Cleanup IP tracking on ghost exorcism
          const ip = this.#connToIp.get(ghostConnId);
          if (ip) {
            const count = this.#ipConnectionCounts.get(ip) ?? 1;
            this.#ipConnectionCounts.set(ip, Math.max(0, count - 1));
            this.#connToIp.delete(ghostConnId);
          }

          try {
            ghostConn?.close(4010, "Replaced by new session");
          } catch {
            // ignore
          }
        }

        this.#connClientId.set(conn.id, clientId);
      }

      if (this.#rejectPendingConnIfRoomFull(conn)) return;

      let slotsDirty = ghostHumanExorcised;
      if (name) {
        const assigned = this.#slots!.find((s) => s.connId === conn.id);
        if (assigned) slotsDirty = true;
      }

      if (ghostHumanExorcised) {
        this.#cancelCountdownIfNeeded();
      }

      if (slotsDirty) {
        this.#broadcastJson({
          v: PROTOCOL_VERSION,
          type: MSG.slots,
          serverNowMs: this.#serverNowMs(),
          slots: this.#slots,
        });
      }

      if (ghostHumanExorcised) {
        this.#checkAllReady();
      }
      return;
    }

    if (type === MSG.colorPick) {
      const requestedColor = typeof data?.color === "string" ? data.color.trim() : "";

      let assignedFromPending = false;
      if (this.#pendingPickers.has(conn.id)) {
        const pickColor = PALETTE.includes(requestedColor as (typeof PALETTE)[number])
          ? requestedColor
          : undefined;
        if (!this.#assignHumanToSlot(conn.id, pickColor)) {
          this.#rejectPendingConn(conn, 4004, "Room full");
          return;
        }
        assignedFromPending = true;
        this.#pendingPickers.delete(conn.id);
        this.#pendingPickerAtMs.delete(conn.id);
        const pendingName = this.#pendingNames.get(conn.id);
        if (pendingName) {
          const assigned = this.#slots!.find((s) => s.connId === conn.id);
          if (assigned) assigned.name = pendingName.slice(0, 24);
        }
        this.#pendingNames.delete(conn.id);
      }

      const slot = this.#slots?.find((s) => s.connId === conn.id);
      if (!slot) return;

      let color = requestedColor;
      if (!PALETTE.includes(color as (typeof PALETTE)[number])) {
        color = slot.color;
      }
      const available = this.#getAvailableColors();
      if (!available.includes(color)) {
        color = available[0] ?? color;
      }

      const oldColor = slot.color;
      slot.color = color;
      const lookHex = this.#normalizeLookHex(data?.lookHex);
      if (lookHex !== null) slot.lookHex = lookHex;

      // Displace any NPC holding the picked color to the unused 5th color.
      const npcWithColor = this.#slots!.find(
        (s) => s !== slot && s.kind === "npc" && s.color === color
      );
      if (npcWithColor) {
        const allUsed = new Set(this.#slots!.map((s) => s.color));
        const unused = PALETTE.find((c) => !allUsed.has(c)) ?? oldColor;
        npcWithColor.color = unused;
      }

      if (assignedFromPending) {
        this.#cancelCountdownIfNeeded();
      }

      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.slots,
        serverNowMs: this.#serverNowMs(),
        slots: this.#slots,
      });
      return;
    }

    if (type === MSG.cartLook) {
      const slot = this.#slots?.find((s) => s.connId === conn.id);
      if (!slot || slot.kind !== "human") return;
      const lookHex = this.#normalizeLookHex(data?.lookHex);
      if (lookHex === null) return;
      slot.lookHex = lookHex;
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.slots,
        serverNowMs: this.#serverNowMs(),
        slots: this.#slots,
      });
      return;
    }

    if (type === MSG.readyToggle) {
      const slot = this.#slots?.find((s) => s.connId === conn.id);
      if (slot && slot.kind === "human") {
        slot.isReady = !slot.isReady;

        // Reconcile orphan human slots before checking ready state.
        // On hard refresh, the old connection may not have been cleaned up
        // during onConnect (platform hadn't closed it yet). By the time the
        // player clicks Ready, the stale conn is gone from getConnections().
        const liveConnIds = new Set<string>();
        for (const c of this.room.getConnections()) {
          liveConnIds.add(c.id);
        }
        for (const s of this.#slots!) {
          if (s.kind === "human" && s.connId && !liveConnIds.has(s.connId)) {
            this.#convertHumanSlotToNpc(s.connId);
          }
        }

        this.#broadcastJson({
          v: PROTOCOL_VERSION,
          type: MSG.slots,
          serverNowMs: this.#serverNowMs(),
          slots: this.#slots,
        });
        this.#cancelCountdownIfNeeded();
        this.#checkAllReady();
      }
      return;
    }

    if (type === MSG.playAgain) {
      if (conn.id !== this.#hostId) return;
      if (this.#countdownTimerHandle !== null) {
        clearTimeout(this.#countdownTimerHandle);
        this.#countdownTimerHandle = null;
      }
      this.#round = this.#freshRoundLobby();
      this.#countdownArmed = false;
      this.#carts = [];
      // * Host-initiated rematch: auto-ready all humans so the next countdown can start.
      for (const slot of this.#slots!) {
        if (slot.kind === "human") slot.isReady = true;
      }
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.slots,
        serverNowMs: this.#serverNowMs(),
        slots: this.#slots,
      });
      this.#broadcastRound();
      this.#checkAllReady();
      return;
    }

    if (type === MSG.clientInput) {
      // Security: prevent connId spoofing by forcing sender id.
      data.connId = conn.id;
      // Clamp inputs before relaying to host.
      const throttle = this.#clamp(data?.input?.throttle, -1, 1);
      const steer = this.#clamp(data?.input?.steer, -1, 1);
      const nitro = Boolean(data?.input?.nitro);
      const hop = Boolean(data?.input?.hop);
      // Relay to host only. Do not broadcast.
      this.#sendJsonToHost({
        v: PROTOCOL_VERSION,
        type: MSG.clientInput,
        serverNowMs: this.#serverNowMs(),
        connId: data.connId,
        seq: typeof data?.seq === "number" ? data.seq : null,
        tClient: typeof data?.tClient === "number" ? data.tClient : null,
        input: { throttle, steer, nitro, hop },
      });
      return;
    }

    if (type === MSG.hostTransform) {
      // Security: host-only.
      if (conn.id !== this.#hostId) return;
      const seq = typeof data?.seq === "number" ? data.seq : null;
      if (seq === null) return;
      if (seq <= this.#lastSeq) return;
      this.#lastSeq = seq;

      // Security: Validate the host isn't flooding us with fake physics objects
      const carts = data?.carts;
      /**
       * @param {unknown} arr
       * @param {number} len
       * @param {number} min
       * @param {number} max
       */
      const validateNumberArray = (arr: unknown, len: number, min: number, max: number) => {
        if (!Array.isArray(arr) || arr.length !== len) return false;
        for (let i = 0; i < len; i += 1) {
          const n = arr[i];
          if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) return false;
        }
        return true;
      };

      /** @param {unknown} c */
      const validateCartState = (c: unknown): c is CartState => {
        const p = (c as any)?.p;
        const isPositionValid =
          Array.isArray(p) &&
          p.length === 3 &&
          typeof p[0] === "number" && Number.isFinite(p[0]) && p[0] >= -500 && p[0] <= 500 &&
          typeof p[1] === "number" && Number.isFinite(p[1]) && p[1] >= -500 && p[1] <= 501.0 &&
          typeof p[2] === "number" && Number.isFinite(p[2]) && p[2] >= -500 && p[2] <= 500;

        return Boolean(
          c &&
          typeof c === "object" &&
          isPositionValid &&
          validateNumberArray((c as any).q, 4, -1.5, 1.5) &&
          validateNumberArray((c as any).lv, 3, -200, 200) &&
          validateNumberArray((c as any).av, 3, -200, 200),
        );
      };

      if (Array.isArray(carts) && carts.length <= 4) {
        const sanitized: (CartState | undefined)[] = [...this.#carts];
        for (let i = 0; i < carts.length; i += 1) {
          const c = carts[i];
          if (!c) continue;
          if (!validateCartState(c)) {
            // eslint-disable-next-line no-console
            console.warn(`[cart-rave] hostTransform rejected cart payload from ${conn.id} for cart ${i}`);
            continue;
          }
          sanitized[i] = c;
        }
        this.#carts = sanitized;
      } else if (carts && typeof carts === "object" && !Array.isArray(carts)) {
        const keys = Object.keys(carts);
        if (keys.length <= 4) {
          const sanitized: (CartState | undefined)[] = [...this.#carts];
          for (const id of keys) {
            const slotIndex = Number(id);
            if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 3) continue;
            const c = (carts as any)[id];
            if (!validateCartState(c)) {
              // eslint-disable-next-line no-console
              console.warn(`[cart-rave] hostTransform rejected cart payload from ${conn.id} for cart "${id}"`);
              continue;
            }
            sanitized[slotIndex] = c;
          }
          this.#carts = sanitized;
        }
      }

      const sanitizedCollisions = sanitizeCollisionBatch(data?.collisions);

      // Relay authoritative state to all clients (including host for confirmation).
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.state,
        serverNowMs: this.#serverNowMs(),
        seq: this.#lastSeq,
        tHost: typeof data?.tHost === "number" ? data.tHost : null,
        carts: this.#safeStructuredClone(this.#carts),
        ...(sanitizedCollisions.length > 0 ? { collisions: sanitizedCollisions } : {}),
      });
      return;
    }

    if (type === MSG.hostRound) {
      // Security: host-only; server validates transitions and podium results.
      if (conn.id !== this.#hostId) return;
      const validated = this.#validateHostRound(data?.round, this.#serverNowMs());
      if (!validated) return;
      this.#round = validated;
      if (validated.phase === "countdown") this.#countdownArmed = false;
      this.#broadcastRound();
      return;
    }

    if (type === MSG.hostEventCollision) {
      if (conn.id !== this.#hostId) return;
      const slotA = validateCollisionSlot(data?.slotA);
      const slotB = validateCollisionSlot(data?.slotB);
      const intensity = data?.intensity;
      if (slotA === null || slotB === null) return;
      if (typeof intensity !== "number" || !Number.isFinite(intensity) || intensity < 0 || intensity > 2) return;
      const payload: CollisionFxEvent = {
        slotA,
        slotB,
        intensity,
        midpoint: validateCollisionMidpoint(data?.midpoint),
      };
      const rammerSlot = validateCollisionSlot(data?.rammerSlot);
      if (rammerSlot !== null && rammerSlot >= 0 && rammerSlot <= 3) {
        payload.rammerSlot = rammerSlot;
      }
      if (data?.isBoosting === true) {
        payload.isBoosting = true;
      }
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostEventCollision,
        serverNowMs: this.#serverNowMs(),
        ...payload,
      });
      return;
    }

    if (type === MSG.hostEventFall) {
      // Security: host-only; verb is whitelisted for kill-feed safety.
      if (conn.id !== this.#hostId) return;
      const verbRaw = typeof data?.verb === "string" ? data.verb.trim().toUpperCase() : "";
      const verb = ALLOWED_FALL_VERBS.has(verbRaw) ? verbRaw : (verbRaw ? "RAMMED" : "FELL OFF");
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostEventFall,
        serverNowMs: this.#serverNowMs(),
        tHost: typeof data?.tHost === "number" ? data.tHost : null,
        slotId: data?.slotId ?? null,
        victimSlotIndex: data?.victimSlotIndex ?? null,
        attackerSlot: data?.attackerSlot ?? null,
        attackerSlotIndex: data?.attackerSlotIndex ?? null,
        verb,
        reason: typeof data?.reason === "string" ? data.reason.slice(0, 32) : null,
      });
    }
  }
}

Server satisfies Party.Worker;
