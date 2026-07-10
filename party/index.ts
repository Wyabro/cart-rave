import { Server, routePartykitRequest, type Connection, type ConnectionContext } from "partyserver";

function getMonotonicNow() { return performance.timeOrigin + performance.now(); }

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
  isSuddenDeath?: boolean;
  /** Server stamped on every broadcast round payload clients may trust for stats. */
  validated: true;
};

import { MSG } from '../shared/protocol.js';
import { NPC_NAME_POOL } from '../shared/npcNames.js';

const PROTOCOL_VERSION = 2;
const PALETTE = ["pink", "blue", "green", "yellow", "neonOrange"] as const;

const ROUND_DURATION_MS = 150_000;
const MIN_RUNNING_BEFORE_PODIUM_MS = 3_000;
const MAX_SCORE_PER_SLOT = 500;
const PICKER_TIMEOUT_MS = 30_000;
const RATE_LIMIT_MAX_PER_SEC = 100;
const RATE_LIMIT_WINDOW_MS = 1_000;
// * Host collision/fall events travel in the WebRTC binary snapshot's collisions[]/falls[]
// * JSON tail (host-authored, client-replayed) — there is no server relay for them, so the
// * server-side validators/whitelist that once guarded those relays have been removed.

// * Activity-based connection reaper thresholds. PartyKit's onClose is not
// * guaranteed to fire (tab crash, airplane mode, phone sleep, dead socket not
// * yet detected by the runtime) so we track lastSeenAtMs per connection and
// * forcibly remove any that hasn't spoken in REAP_TIMEOUT_MS.
const REAP_TIMEOUT_MS = 20_000;
const REAP_THROTTLE_MS = 5_000;

export class CartRaveServer extends Server {
  readonly #connections = new Map<string, Connection>();
  readonly #joinOrder: string[] = [];
  readonly #connClientId = new Map<string, string>();

  #hostId: string | null = null;
  #currentLevelId: string = "classicRecord";
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

  env: Record<string, any>;
  constructor(state: any, env: any) {
    super(state, env);
    this.env = env;
  }

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
    return getMonotonicNow();
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

  #broadcastJson(payload: unknown, without?: Connection | Connection[]) {
    const msg = JSON.stringify(payload);
    const withoutIds = without ? (Array.isArray(without) ? without.map((c) => c.id) : [without.id]) : undefined;
    this.broadcast(msg, withoutIds);
  }

  #sendJson(conn: Connection, payload: unknown) {
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
      roomId: this.name,
      levelId: this.#currentLevelId,
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
    if (!this.#slots) return null;
    const slots = this.#slots;

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
    if (!this.#slots) return;
    const slots = this.#slots;
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
      levelId: this.#currentLevelId,
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
      if (!prev.isSuddenDeath && now - prev.startedAtMs > ROUND_DURATION_MS + 15_000) return null;

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
      if (computedWinner === "draw" && endReason !== "lastStanding") {
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

    const isSuddenDeath =
      typeof (incoming as { isSuddenDeath?: unknown }).isSuddenDeath === "boolean"
        ? (incoming as { isSuddenDeath?: boolean }).isSuddenDeath
        : prev.isSuddenDeath ?? false;

    return {
      phase: nextPhase,
      winnerSlotIndex,
      startedAtMs,
      countdownStartedAtMs,
      scores,
      endReason,
      isSuddenDeath,
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
    if (!this.#slots) return;
    const humanSlots = this.#slots.filter((s) => s.kind === "human");
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

  #rejectPendingConn(conn: Connection, code: number, reason: string) {
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
    return Boolean(this.#slots?.some((s) => s.kind === "npc"));
  }

  // * Room capacity after ghost exorcism — pending pickers need a free NPC slot.
  #rejectPendingConnIfRoomFull(conn: Connection): boolean {
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
    if (!this.#slots) return;
    const liveConnIds = new Set<string>();
    for (const c of this.getConnections()) {
      liveConnIds.add(c.id);
    }
    const humanSlots = this.#slots.filter(
      (s) => s.kind === "human" && s.connId && liveConnIds.has(s.connId)
    );
    // INVARIANT: the length check below is load-bearing, not defensive style —
    // Array.prototype.every() on an empty array returns TRUE, so removing it would
    // arm the countdown for a room with zero live humans.
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
    if (!this.#slots) return false;
    let changed = false;
    for (const slot of this.#slots) {
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
      if (this.#pendingPickers.has(id)) continue;
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
      const conn = this.#connections.get(id);
      if (conn) {
        try { conn.close(); } catch {}
      }
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

    // * The reaped player may have been the only un-ready human — re-evaluate
    // * so the remaining all-ready lobby isn't stuck waiting forever.
    // * (#checkAllReady is a no-op outside the lobby phase / while armed.)
    this.#checkAllReady();

    return slotsChanged;
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
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
    const existingHumans = (this.#slots ?? []).filter(s => s.kind === "human");
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
    for (const c of this.getConnections()) {
      liveConnIds.add(c.id);
    }
    // The new connection itself is not yet in getConnections() during onConnect, so add it.
    liveConnIds.add(conn.id);
    const reconciled = this.#reconcileOrphanSlots(liveConnIds);
    void reaped;
    void reconciled;

    // Prune zombies from #connections to match platform reality.
    for (const staleId of [...this.#connections.keys()]) {
      if (![...this.getConnections()].some((c) => c.id === staleId) && staleId !== conn.id) {
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
        type: MSG.hostMigrated,
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

  onClose(conn: Connection) {
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

    // * Unconditional (not just wasHost): a departing non-host may have been the
    // * only un-ready human, leaving the rest stuck showing READY! forever.
    // * #checkAllReady is idempotent — no-op outside lobby / while armed.
    this.#checkAllReady();
  }

  async onMessage(connection: Connection, message: string) {
    // Security: Block massive payload bombs before trying to parse
    if (message.length > 4096) {
      connection.close(4009, "Payload too large");
      return;
    }

    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const type = data?.type;

    if (!this.#checkRateLimit(connection.id)) {
      connection.close(4028, "Rate limit exceeded");
      return;
    }

    const now = this.#serverNowMs();
    this.#lastSeenAtMs.set(connection.id, now);
    if (now - this.#lastReapAtMs >= REAP_THROTTLE_MS) {
      this.#reapSilentConnections();
    }

    try {
      if (type === MSG.join) {
        // Optional client metadata; server already assigned a slot on connect.
        const name = typeof data?.name === "string" ? data.name.trim() : "";
        const clientId = typeof data?.clientId === "string" ? data.clientId.trim() : "";
        if (name) {
          this.#ensureInitialized();
          if (this.#pendingPickers.has(connection.id)) {
            this.#pendingNames.set(connection.id, name.slice(0, 24));
          }
          const slot = this.#slots?.find((s) => s.connId === connection.id);
          if (slot) slot.name = name.slice(0, 24);
        }

        let ghostHumanExorcised = false;

        if (clientId) {
          // Exorcise ghost: same clientId, different connId.
          let ghostConnId: string | null = null;
          for (const [id, cid] of this.#connClientId.entries()) {
            if (id !== connection.id && cid === clientId) {
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

          this.#connClientId.set(connection.id, clientId);
        }

        if (this.#rejectPendingConnIfRoomFull(connection)) return;

        let slotsDirty = ghostHumanExorcised;
        if (name) {
          const assigned = this.#slots?.find((s) => s.connId === connection.id);
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
        if (this.#pendingPickers.has(connection.id)) {
          const pickColor = PALETTE.includes(requestedColor as (typeof PALETTE)[number])
            ? requestedColor
            : undefined;
          if (!this.#assignHumanToSlot(connection.id, pickColor)) {
            this.#rejectPendingConn(connection, 4004, "Room full");
            return;
          }
          assignedFromPending = true;
          this.#pendingPickers.delete(connection.id);
          this.#pendingPickerAtMs.delete(connection.id);
          const pendingName = this.#pendingNames.get(connection.id);
          if (pendingName) {
            const assigned = this.#slots?.find((s) => s.connId === connection.id);
            if (assigned) assigned.name = pendingName.slice(0, 24);
          }
          this.#pendingNames.delete(connection.id);
        }

        const slot = this.#slots?.find((s) => s.connId === connection.id);
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
        const npcWithColor = this.#slots?.find(
          (s) => s !== slot && s.kind === "npc" && s.color === color
        );
        if (npcWithColor) {
          const allUsed = new Set((this.#slots ?? []).map((s) => s.color));
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
        const slot = this.#slots?.find((s) => s.connId === connection.id);
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
        const slot = this.#slots?.find((s) => s.connId === connection.id);
        if (!slot || slot.kind !== "human") return;

        slot.isReady = !slot.isReady;

        // Reconcile orphan human slots before checking ready state.
        // On hard refresh, the old connection may not have been cleaned up
        // during onConnect (platform hadn't closed it yet). By the time the
        // player clicks Ready, the stale conn is gone from getConnections().
        const liveConnIds = new Set<string>();
        for (const c of this.getConnections()) {
          liveConnIds.add(c.id);
        }
        for (const s of (this.#slots ?? [])) {
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
        return;
      }

      if (type === MSG.playAgain) {
        if (connection.id !== this.#hostId) return;
        if (this.#countdownTimerHandle !== null) {
          clearTimeout(this.#countdownTimerHandle);
          this.#countdownTimerHandle = null;
        }
        this.#round = this.#freshRoundLobby();
        this.#countdownArmed = false;
        this.#carts = [];
        // * Host-initiated rematch: auto-ready all humans so the next countdown can start.
        for (const slot of (this.#slots ?? [])) {
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

      if (type === MSG.requestTurnCredentials) {
        const env = this.env;
        if (!env?.CF_ACCOUNT_ID || !env?.CF_CALLS_KEY_ID || !env?.CF_API_TOKEN) {
          console.error('[cart-rave] Missing Cloudflare credentials in environment bindings.');
          return;
        }
        const callsApiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/calls/turn_keys/${env.CF_CALLS_KEY_ID}/tokens`;
        try {
          const response = await fetch(callsApiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.CF_API_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ttl: 7200 }) // 2 hours
          });
          const resBody: any = await response.json();
          this.#sendJson(connection, {
            v: PROTOCOL_VERSION,
            type: MSG.turnCredentials,
            servers: resBody?.servers || []
          });
        } catch (e) {
          console.error('[cart-rave] TURN minting failed:', e);
        }
        return;
      }

      if (type === MSG.sdpOffer) {
        const targetConnId = data?.targetConnId;
        if (typeof targetConnId === 'string') {
          const targetConn = this.#connections.get(targetConnId);
          if (targetConn) {
            this.#sendJson(targetConn, {
              v: PROTOCOL_VERSION,
              type: MSG.sdpOffer,
              fromConnId: connection.id,
              sdp: data.sdp
            });
          }
        }
        return;
      }

      if (type === MSG.sdpAnswer) {
        const targetConnId = data?.targetConnId;
        if (typeof targetConnId === 'string') {
          const targetConn = this.#connections.get(targetConnId);
          if (targetConn) {
            this.#sendJson(targetConn, {
              v: PROTOCOL_VERSION,
              type: MSG.sdpAnswer,
              fromConnId: connection.id,
              sdp: data.sdp
            });
          }
        }
        return;
      }

      if (type === MSG.iceCandidate) {
        const targetConnId = data?.targetConnId;
        if (typeof targetConnId === 'string') {
          const targetConn = this.#connections.get(targetConnId);
          if (targetConn) {
            this.#sendJson(targetConn, {
              v: PROTOCOL_VERSION,
              type: MSG.iceCandidate,
              fromConnId: connection.id,
              candidate: data.candidate
            });
          }
        }
        return;
      }

      if (type === MSG.hostRound) {
        // Security: host-only; server validates transitions and podium results.
        if (connection.id !== this.#hostId) return;
        const levelId = typeof data?.levelId === "string" ? data.levelId.trim() : typeof data?.round?.levelId === "string" ? data.round.levelId.trim() : "";
        if (levelId) {
          this.#currentLevelId = levelId;
        }
        const validated = this.#validateHostRound(data?.round, this.#serverNowMs());
        if (!validated) return;
        this.#round = validated;
        if (validated.phase === "countdown") this.#countdownArmed = false;
        this.#broadcastRound();
        return;
      }

    } catch (err) {
      console.error("[cart-rave] onMessage error:", err);
    }
  }
}

/**
 * Cache headers for static assets served via the ASSETS binding.
 * Vite content-hashed bundles under /assets/ are immutable; models/sounds/draco
 * use a 7d max-age + SWR (filenames are not content-hashed).
 */
function withAssetCacheHeaders(request: Request, response: Response): Response {
  if (response.status !== 200 && response.status !== 206) return response;

  const path = new URL(request.url).pathname;
  let cacheControl: string | null = null;

  // * Hashed Vite output: assets/index-Ab12CdEf.js, assets/three-Xy9Z.js, etc.
  if (/^\/assets\/[^/]+\.[a-fA-F0-9_-]{6,}\.(js|css|mjs|map|wasm)$/i.test(path)) {
    cacheControl = "public, max-age=31536000, immutable";
  } else if (
    /^\/(models|sounds|draco|fonts)\//i.test(path) ||
    /\.(glb|wasm|ogg|mp3|png|ico|webmanifest|woff2?)$/i.test(path)
  ) {
    cacheControl = "public, max-age=604800, stale-while-revalidate=86400";
  }

  if (!cacheControl) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Record<string, any>): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.includes("/api/log-error")) {
      try {
        const body = await request.json();
        console.log("[cart-rave] client error:", JSON.stringify(body));
      } catch {
        // Body may be empty or malformed; ignore.
      }
      return new Response(null, { status: 204 });
    }

    const isParty =
      url.pathname.startsWith("/parties/") ||
      url.pathname.startsWith("/party/") ||
      request.headers.get("Upgrade")?.toLowerCase() === "websocket";

    if (!isParty && env.ASSETS) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return withAssetCacheHeaders(request, assetResponse);
        }
      } catch (err) {
        console.error("[cart-rave] ASSETS fetch error:", err);
      }
    }

    return routePartykitRequest(request, env);
  },
};
