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
  /** Client-synced wireframe pattern id (NET-LOOK-ACC-1); client normalizes unknown ids. */
  patternId?: string | null;
  /** Client-synced sunglasses style id (NET-LOOK-ACC-1); client normalizes unknown ids. */
  sunglassesStyle?: string | null;
  isReady: boolean;
  /**
   * COUNTDOWN-ARM-1: carts + play-shader warm acknowledged via MSG.clientPlayReady.
   * Continuous mode requires this (or PLAY_READY_TIMEOUT_MS) before game_start.
   */
  isPlayReady: boolean;
};

import { HOST_MIGRATION_COOLDOWN_MS, MSG } from '../shared/protocol.js';
import { COUNTDOWN_MS, FLYOVER_PREROLL_MS } from '../shared/roundConstants.js';
import { requireAdminToken } from './adminAuth';
import { UNKNOWN_IP } from './beaconLimit';
import {
  IP_CONNECTION_CAP,
  getPlatformLiveIdsOverride,
  getPlayReadyTimeoutMs,
  getReapThrottleMs,
  getReapTimeoutMs,
} from './constants';
import { COUNTDOWN_ABORT_GRACE_MS, isContinuousModeRoom, seatReadyState } from '../shared/readiness.js';
import { validateHostRound, type RoundState } from './roundValidation';
import {
  pickNextHostId,
  pickPreferredHostId,
  pickPreferredHostIdExcluding,
  shouldMigrateToPreferredHost,
} from './hostSelection';
import { advanceRateLimit } from './rateLimit';
import {
  listSilentConnectionsToReap,
  listStalePendingPickers,
} from './connectionReaper';
import { planHostRearm } from './hostRearm';
import {
  findNpcSlotForHuman,
  listOrphanHumanConnIds,
  nextFreePaletteColor,
} from './slotReconcile';
import { NPC_NAME_POOL } from '../shared/npcNames.js';
import { QUICKPLAY_ARENA_IDS } from '../shared/arenaPool.js';
import { isQuickplayRoom, nextQuickplayShard } from '../shared/roomCodes.js';
import { assetCacheControlForPath } from '../shared/assetCache.js';
import {
  classifyWsMessagePostParse,
  classifyWsMessagePreParse,
} from '../shared/wsMessageLimits.js';

// * Client crash-report sink (SQLite DO). Must be a named export of the Worker
// * entrypoint so the runtime can construct it; wired in wrangler.jsonc.
export { ErrorLog } from './errorLog';
// * Gameplay analytics sink (SQLite DO, sibling of ErrorLog) — src/analytics/ beacons
// * event batches to /api/analytics below. Wired in wrangler.jsonc (migration v3).
export { AnalyticsLog } from './analyticsLog';
// * F8 / ?diag capture bundles — both playtest machines POST here so the agent can
// * pull without emailing JSONs (migration v4).
export { CaptureLog } from './captureLog';

const PROTOCOL_VERSION = 2;
const PALETTE = ["pink", "blue", "green", "yellow", "neonOrange"] as const;

// * Host collision/fall events travel in the WebRTC binary snapshot's collisions[]/falls[]
// * JSON tail (host-authored, client-replayed) — there is no server relay for them, so the
// * server-side validators/whitelist that once guarded those relays have been removed.
// * Rate-limit / reap / picker thresholds live in ./constants (shared with pure helpers).

export class CartRaveServer extends Server {
  readonly #connections = new Map<string, Connection>();
  readonly #joinOrder: string[] = [];
  readonly #connClientId = new Map<string, string>();
  /** NH-HIT lever 3: client-reported host capability 0–100 (join hostScore). */
  readonly #hostScores = new Map<string, number>();
  readonly #awayHostIds = new Set<string>();
  #lastMidRoundHostMigrationAtMs = Number.NEGATIVE_INFINITY;

  #hostId: string | null = null;
  #currentLevelId: string = "classicRecord";
  #currentAiDifficulty: string = "easy";
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
  // * -1 = no host_spawn seq seen yet (room start and post-migration share this).
  #lastSeq: number = -1;
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
  /** Rematch grace before auto-ready arms countdown (lets humans unready / breathe). */
  #rematchGraceTimerHandle: ReturnType<typeof setTimeout> | null = null;
  // * COUNTDOWN-ABORT-1: connIds that have signalled ready, preserved across an
  // * orphan-reconcile → reseat blip so a slow/flapping peer's slot doesn't drop to
  // * unready and abort an armed countdown (fix B). Continuous mode ignores this.
  readonly #readyConnIds = new Set<string>();
  // * Grace timer: an armed countdown tolerates a brief unready blip before aborting (fix A).
  #countdownAbortGraceHandle: ReturnType<typeof setTimeout> | null = null;
  // * COUNTDOWN-ARM-1: continuous lobby ceiling waiting for clientPlayReady.
  #playReadyWaitHandle: ReturnType<typeof setTimeout> | null = null;
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

  /**
   * Give this connection's slot back to the per-IP connection cap.
   * Every path that drops a connection calls this — picker timeout, silent reap,
   * onClose, ghost exorcism — so the cap cannot leak on whichever path is missed.
   */
  #releaseIp(connId: string) {
    const ip = this.#connToIp.get(connId);
    if (!ip) return;
    const count = this.#ipConnectionCounts.get(ip) ?? 1;
    if (count <= 1) {
      this.#ipConnectionCounts.delete(ip);
    } else {
      this.#ipConnectionCounts.set(ip, count - 1);
    }
    this.#connToIp.delete(connId);
  }

  /**
   * Forgets every per-connection tracking map that is NOT branch-sensitive.
   * Idempotent — every sub-call is a no-op on a missing id, so a second call is safe.
   *
   * Owned here: IP tracking (#releaseIp → #connToIp / #ipConnectionCounts),
   * #connections, #joinOrder, #lastSeenAtMs, #connClientId, #hostScores,
   * #awayHostIds, #rateLimitWindows.
   *
   * NOT owned here (branch-sensitive, each caller handles its own branch):
   * - #pendingPickers / #pendingPickerAtMs / #pendingNames — onClose uses pending
   *   membership to choose slot conversion; the reaper branch and
   *   #reapStalePendingPickers own these.
   * - #readyConnIds — owned by onClose only (COUNTDOWN-ABORT-1 B preservation rules).
   */
  #forgetConnectionTracking(connId: string) {
    this.#releaseIp(connId);
    this.#connections.delete(connId);
    this.#removeFromJoinOrder(connId);
    this.#lastSeenAtMs.delete(connId);
    this.#connClientId.delete(connId);
    this.#hostScores.delete(connId);
    this.#awayHostIds.delete(connId);
    this.#rateLimitWindows.delete(connId);
  }

  /**
   * The set of connection ids the platform currently lists as live.
   * Single funnel for pre-cap pruning — the test seam (getPlatformLiveIdsOverride)
   * can fake a socket the platform dropped without onClose firing. Several other
   * deliberate getConnections() call sites remain (reconcile, ready checks).
   */
  #platformLiveConnIds(): Set<string> {
    const override = getPlatformLiveIdsOverride();
    if (override) return new Set(override);
    const ids = new Set<string>();
    for (const c of this.getConnections()) ids.add(c.id);
    return ids;
  }

  /**
   * CONN-TRACK-LEAK-1: release IP + tracking maps for any conn the platform no
   * longer lists, so leaked counts cannot deadlock the cap on the next join.
   * Iterates #connToIp (the IP-cap surface), not #connections — the leak lives
   * in the IP map. Does NOT convert slots, touch pending maps, or repair the
   * host; those effects stay in the later #reconcileOrphanSlots /
   * #reapStalePendingPickers / #ensureLiveHost, unchanged.
   */
  #prunePlatformDeadTracking() {
    if (this.#connToIp.size === 0) return;
    const liveIds = this.#platformLiveConnIds();
    for (const connId of [...this.#connToIp.keys()]) {
      if (liveIds.has(connId)) continue;
      this.#forgetConnectionTracking(connId);
    }
  }

  #serverNowMs() {
    return getMonotonicNow();
  }

  #normalizeLookHex(raw: unknown): number | null {
    // * Number(null) === 0 / Number("") === 0 — reject so a missing look does not
    // * stamp pure black (0x000000) onto the slot (mirrors client normalizeLookHex).
    if (raw === null || raw === undefined || raw === "") return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n) & 0xffffff;
  }

  // * NET-LOOK-ACC-1: length/charset sanitizer, not an id whitelist — the server can't import
  // * client pattern/sunglasses config, and both clients already fall back to a default on an
  // * unknown id (normalizePatternId / normalizeSunglassesStyleId in customization.js).
  #normalizeLookId(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!/^[a-z0-9_-]{1,24}$/i.test(trimmed)) return null;
    return trimmed;
  }

  #ensureInitialized() {
    if (this.#slots) return;

    // * Quickplay: pick a random arena at room creation so the first hello carries
    // * the room's real level (QP-ORDER-1). Rematches then advance catalog order via
    // * nextQuickplayArenaId on the host. Otherwise a hardcoded default would clobber
    // * every joiner's local pick via adoptAuthoritativeRoomLevel. Friends rooms keep
    // * the default — the host's local pick reaches everyone via the first host_round.
    // * QUICKPLAY-SHARD-1: every public shard (`quickplay`, `quickplay2`…) gets this, not just
    // * shard 1. An exact-match here would leave shards on the hardcoded default arena with AI
    // * "easy" — QP-ORDER-1 silently off, and the wrong difficulty broadcast as authoritative.
    if (isQuickplayRoom(this.name) && QUICKPLAY_ARENA_IDS.length > 0) {
      const idx = Math.floor(Math.random() * QUICKPLAY_ARENA_IDS.length);
      this.#currentLevelId = QUICKPLAY_ARENA_IDS[idx] ?? this.#currentLevelId;
      this.#currentAiDifficulty = "medium";
    }

    // * Shuffled per room so NPC color combinations vary between sessions. Uniqueness
    // * is preserved (one preset per slot); humans can still re-pick via color_pick.
    const colors = ["pink", "blue", "green", "yellow"];
    for (let i = colors.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    const npcNames = this.#drawNpcNames(4);

    this.#slots = ([0, 1, 2, 3] as SlotId[]).map((slotId) => ({
      slotId,
      kind: "npc",
      connId: null,
      name: npcNames[slotId] ?? `NPC-${slotId}`,
      color: colors[slotId] ?? `slot-${slotId}`,
      isReady: false,
      isPlayReady: false,
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
      aiDifficulty: this.#currentAiDifficulty,
      serverNowMs: this.#serverNowMs(),
      hostId: this.#hostId,
      slots: this.#slots,
      round: this.#round,
      carts: this.#safeStructuredClone(this.#carts),
      seq: this.#lastSeq,
    };
  }

  #pickNextHostId(): string | null {
    return pickNextHostId(this.#joinOrder, new Set(this.#connections.keys()), this.#slots);
  }

  /**
   * NH-HIT lever 3 / HOST-ROLE-1: in lobby only, migrate host to a clearly
   * stronger peer when one has seated. Not a ban on weak hosts — alone they
   * keep authority; ties stay on the first joiner (margin gate).
   */
  #maybeRebalanceHostForQuality() {
    if (this.#round.phase !== "lobby") return;
    // * Don't yank host mid-countdown arming; rematch grace is still lobby and OK.
    if (this.#countdownArmed) return;
    const live = new Set(this.#connections.keys());
    const preferred = pickPreferredHostId(
      this.#joinOrder,
      live,
      this.#slots,
      this.#hostScores,
    );
    if (!shouldMigrateToPreferredHost(this.#hostId, preferred, this.#hostScores)) {
      return;
    }
    this.#hostId = preferred;
    this.#lastSeq = -1;
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.hostMigrated,
      serverNowMs: this.#serverNowMs(),
      hostId: this.#hostId,
      reason: "host_quality",
    });
  }

  #handleHostAway(connId: string, now: number) {
    if (connId !== this.#hostId) return;
    if (this.#round.phase !== "running" && this.#round.phase !== "countdown") return;
    this.#awayHostIds.add(connId);
    if (now - this.#lastMidRoundHostMigrationAtMs < HOST_MIGRATION_COOLDOWN_MS) {
      return;
    }

    const live = new Set(this.#connections.keys());
    const liveHumanCount = this.#slots?.filter(
      (slot) => slot.kind === "human" && slot.connId && live.has(slot.connId),
    ).length ?? 0;
    if (liveHumanCount < 2) return;

    const nextHostId = pickPreferredHostIdExcluding(
      this.#joinOrder,
      live,
      this.#slots,
      this.#hostScores,
      this.#hostId,
    );
    if (!nextHostId) return;

    this.#migrateMidRoundHost(nextHostId, "host_afk", now);
  }

  #handleHostPresent(connId: string, now: number) {
    if (this.#round.phase !== "running" && this.#round.phase !== "countdown") return;
    const live = new Set(this.#connections.keys());
    const senderIsLiveHuman = this.#slots?.some(
      (slot) => slot.kind === "human" && slot.connId === connId && live.has(connId),
    );
    if (!senderIsLiveHuman) return;
    this.#awayHostIds.delete(connId);
    if (now - this.#lastMidRoundHostMigrationAtMs < HOST_MIGRATION_COOLDOWN_MS) {
      return;
    }

    const eligibleLive = new Set(
      [...live].filter((id) => !this.#awayHostIds.has(id)),
    );
    const preferred = pickPreferredHostId(
      this.#joinOrder,
      eligibleLive,
      this.#slots,
      this.#hostScores,
    );
    if (!preferred) return;
    if (!shouldMigrateToPreferredHost(this.#hostId, preferred, this.#hostScores)) return;
    this.#migrateMidRoundHost(preferred, "host_return", now);
  }

  #migrateMidRoundHost(nextHostId: string, reason: "host_afk" | "host_return", now: number) {
    this.#hostId = nextHostId;
    this.#lastSeq = -1;
    this.#lastMidRoundHostMigrationAtMs = now;
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.hostMigrated,
      serverNowMs: now,
      hostId: this.#hostId,
      reason,
    });
  }

  /** Parse join/capability hostScore (0–100); missing → leave prior or skip. */
  #setHostScoreFromPayload(connId: string, data: { hostScore?: unknown } | null | undefined) {
    const raw = data?.hostScore;
    if (typeof raw !== "number" || !Number.isFinite(raw)) return;
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    this.#hostScores.set(connId, score);
  }

  // * Repairs #hostId if it points at a connection that no longer exists in
  // * #connections (e.g. onClose never fired for the host due to crash/network
  // * drop). Must be called after any operation that may have removed the host
  // * from #connections, and before hostId is surfaced to clients.
  // * Decision plan is pure (./hostRearm); side effects stay here.
  #ensureLiveHost() {
    const plan = planHostRearm(
      this.#hostId,
      new Set(this.#connections.keys()),
      this.#joinOrder,
      this.#slots,
      this.#round.phase,
    );
    if (!plan.hostWasDead) return;
    this.#hostId = plan.nextHostId;
    this.#lastSeq = -1;
    if (this.#hostId) {
      // * FIX-MIG: disconnect repairs (onClose / silent reap / ghost / snapshot)
      // * used to omit reason, so clients skipped the toast while PA still fired.
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostMigrated,
        serverNowMs: this.#serverNowMs(),
        hostId: this.#hostId,
        reason: "host_disconnect",
      });
    }
    // * Host loss during countdown strands clients waiting on a game_start the dead
    // * host owned — clear the pending timer and reset to lobby so #checkAllReady
    // * can re-arm for the successor. Lives here (not just onClose) so the reap /
    // * ghost-exorcism / snapshot repair paths get the same protection instead of
    // * leaning on the client-side resumeCountdownAsNewHost fallback.
    // * Also drop rematch grace: a mid-grace host flip must not leave a stale
    // * 2s timer arming countdown against the new host's room shape.
    this.#clearCountdownTimer();
    this.#clearRematchGrace();
    if (plan.resetCountdownToLobby) {
      this.#round = this.#freshRoundLobby();
      this.#countdownArmed = false;
      this.#broadcastRound();
    }
    if (this.#hostId) this.#checkAllReady();
  }

  /** Drop the game_start arming timer if any (does not touch phase / countdownArmed). */
  #clearCountdownTimer() {
    this.#clearCountdownAbortGrace();
    this.#clearPlayReadyWait();
    if (this.#countdownTimerHandle !== null) {
      clearTimeout(this.#countdownTimerHandle);
      this.#countdownTimerHandle = null;
    }
  }

  /** Drop the post-rematch 2s grace timer if any. */
  #clearRematchGrace() {
    if (this.#rematchGraceTimerHandle !== null) {
      clearTimeout(this.#rematchGraceTimerHandle);
      this.#rematchGraceTimerHandle = null;
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
    const npcSlot = findNpcSlotForHuman(slots, preferredColor);
    if (!npcSlot) return null;

    npcSlot.kind = "human";
    npcSlot.connId = connId;
    // * COUNTDOWN-ABORT-1: continuous mode (quickplay) has no ready-up → seated = ready;
    // * other modes restore readiness if this connId was ready before a reseat blip (B).
    npcSlot.isReady = seatReadyState({
      continuousMode: this.#isContinuousMode(),
      connId,
      readyConnIds: this.#readyConnIds,
    });
    // * COUNTDOWN-ARM-1: warm signal is per seat — never inherit from the NPC slot.
    npcSlot.isPlayReady = false;
    // Keep npcSlot.name until client sends join with a name.
    // * Mid-round seat: scores are slot-keyed. The NPC's points must not become the
    // * joiner's. Zero before the next host_round — validateHostRound's monotonic
    // * clamp would otherwise reject a host decrease (NET-1 residual join).
    if (this.#round.phase === "running" || this.#round.phase === "countdown") {
      const sid = npcSlot.slotId;
      this.#round = {
        ...this.#round,
        scores: { ...this.#round.scores, [sid]: 0 },
      };
    }
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
    slot.isPlayReady = false;
    slot.name = this.#drawNpcName();
    // Reassign color to avoid collisions with other slots.
    slot.color = nextFreePaletteColor(slots, slot, PALETTE);
    slot.lookHex = null;
    slot.patternId = null;
    slot.sunglassesStyle = null;
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
      aiDifficulty: this.#currentAiDifficulty,
      round: this.#safeStructuredClone(this.#round),
    });
  }

  /**
   * Validates host_round payloads; returns sanitized server round or null to reject.
   * Delegates to the pure, unit-tested validator in ./roundValidation.
   */
  #validateHostRound(incoming: unknown, now: number): RoundState | null {
    return validateHostRound(this.#round, incoming, now);
  }

  #checkRateLimit(connId: string): boolean {
    const now = this.#serverNowMs();
    const { allowed, nextBucket } = advanceRateLimit(
      this.#rateLimitWindows.get(connId),
      now,
    );
    this.#rateLimitWindows.set(connId, nextBucket);
    return allowed;
  }

  /** @returns true if at least one stale pending picker was removed. */
  #reapStalePendingPickers(): boolean {
    const now = this.#serverNowMs();
    const staleIds = listStalePendingPickers(
      this.#pendingPickers,
      this.#pendingPickerAtMs,
      now,
    );
    let reapedAny = false;
    for (const id of staleIds) {
      reapedAny = true;
      this.#pendingPickers.delete(id);
      this.#pendingNames.delete(id);
      this.#pendingPickerAtMs.delete(id);
      const conn = this.#connections.get(id);
      this.#forgetConnectionTracking(id);
      try {
        conn?.close(4011, "Picker timeout");
      } catch {
        // ignore
      }
    }
    return reapedAny;
  }

  // * Cancels the game-start countdown (or pending rematch grace) if the "all
  // * ready" condition is no longer satisfied. Called after any human slot
  // * reverts to NPC / unready so we don't arm countdown with a thinner room.
  // *
  // * MUST use the same live-conn filter as #checkAllReady. Cap-56: abort ~0.5s
  // * into countdown then re-arm — orphan/stale human slots (isReady false, dead
  // * connId) were included here but ignored by arm, so a room that correctly
  // * armed would immediately cancel on the next ready/slots reconcile.
  // *
  // * Do not inspect isPlayReady here. Abort is COUNTDOWN-ABORT-1 / isReady-only.
  // * A clientPlayReady bit must never cancel an armed countdown.
  #cancelCountdownIfNeeded() {
    if (
      this.#countdownTimerHandle === null
      && !this.#countdownArmed
      && this.#rematchGraceTimerHandle === null
    ) {
      return;
    }
    if (!this.#slots) return;
    const liveConnIds = new Set<string>();
    for (const c of this.getConnections()) {
      liveConnIds.add(c.id);
    }
    const humanSlots = this.#slots.filter(
      (s) => s.kind === "human" && s.connId && liveConnIds.has(s.connId),
    );
    // * No live humans (or any live human unready) → abort. Empty every() is true
    // * in JS — do not treat "zero humans" as "all ready".
    if (humanSlots.length > 0 && humanSlots.every((s) => s.isReady)) {
      this.#clearCountdownAbortGrace();
      return;
    }
    // * COUNTDOWN-ABORT-1 (fix A): tolerate a transient unready (a reseat/orphan blip from a
    // * slow peer) — re-check after a short grace and abort only if STILL failing, instead of
    // * nuking the countdown on every roster flicker. Continuous mode never reaches here
    // * (seated humans are always ready), so this only guards friends/private READY rooms.
    if (this.#countdownAbortGraceHandle === null) {
      this.#countdownAbortGraceHandle = setTimeout(() => {
        this.#countdownAbortGraceHandle = null;
        this.#reevaluateCountdownAfterGrace();
      }, COUNTDOWN_ABORT_GRACE_MS);
    }
  }

  /** Continuous modes (quickplay) have no manual ready-up — a seated human is ready by
   *  definition. Friends/private rooms keep the explicit READY gate. */
  #isContinuousMode(): boolean {
    return isContinuousModeRoom(this.name);
  }

  #clearCountdownAbortGrace() {
    if (this.#countdownAbortGraceHandle !== null) {
      clearTimeout(this.#countdownAbortGraceHandle);
      this.#countdownAbortGraceHandle = null;
    }
  }

  /** Grace expired: abort the armed countdown only if a live human is STILL unready. */
  #reevaluateCountdownAfterGrace() {
    if (
      this.#countdownTimerHandle === null
      && !this.#countdownArmed
      && this.#rematchGraceTimerHandle === null
    ) {
      return;
    }
    if (!this.#slots) return;
    const liveConnIds = new Set<string>();
    for (const c of this.getConnections()) liveConnIds.add(c.id);
    const humanSlots = this.#slots.filter(
      (s) => s.kind === "human" && s.connId && liveConnIds.has(s.connId),
    );
    if (humanSlots.length > 0 && humanSlots.every((s) => s.isReady)) return; // recovered
    this.#abortArmedCountdown();
  }

  // * Notifies all clients when an armed game_start countdown is invalidated.
  // * Also drops rematch grace so unready mid-breathe doesn't still auto-arm.
  #abortArmedCountdown() {
    this.#clearCountdownAbortGrace();
    if (
      this.#countdownTimerHandle === null
      && !this.#countdownArmed
      && this.#rematchGraceTimerHandle === null
    ) {
      return;
    }
    const hadArmedCountdown =
      this.#countdownTimerHandle !== null || this.#countdownArmed;
    this.#clearCountdownTimer();
    this.#clearRematchGrace();
    this.#countdownArmed = false;
    // * Grace-only abort: no game_start was broadcast, so don't spam countdownCancel.
    if (!hadArmedCountdown) return;
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

  /**
   * Reject a pending picker and close the socket.
   * Cleanup is owned by {@link onClose} — do not clear #pendingPickers / IP maps here,
   * or onClose takes the human→NPC branch for a connection that never held a slot.
   *
   * QUICKPLAY-SHARD-1: a rejected joiner on a **public** shard is handed the next shard in
   * `retryRoom` so the client can hop instead of bouncing to the menu — the whole overflow
   * mechanism, and the reason no seat-finder endpoint or registry DO exists. Both full-reject
   * call sites funnel through here, so this is the single emission point.
   *
   * `retryRoom` is null for friends rooms, for `quickplay__*` harness rooms (a test asserting
   * a full room must not send its client chasing a shard), and once the chain hits
   * MAX_QUICKPLAY_SHARDS. Null or absent means "no hop" — a client that does not understand
   * the field, or one that has run out of shards, gets exactly today's behaviour.
   */
  #rejectPendingConn(conn: Connection, code: number, reason: string) {
    const retryRoom = isQuickplayRoom(this.name) ? nextQuickplayShard(this.name) : null;
    this.#sendJson(conn, { v: PROTOCOL_VERSION, type: MSG.joinRejected, retryRoom });
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

  // * Checks whether every human slot has toggled ready (and, in continuous mode,
  // * acknowledged play-ready / warm). If so, arms a pre-roll + countdown timer and
  // * broadcasts MSG.gameStart with a startsAtMs timestamp (CAM-PT-MP-1: the anchor
  // * includes FLYOVER_PREROLL_MS so every client shows the opening orbit first).
  // * The timer handle acts as the one-shot guard — re-entrant calls are no-ops
  // * until the timer fires and clears the handle. Rematch grace also blocks so
  // * host-migrate / ready-toggle cannot defeat the 2s post-playAgain breathe window.
  #checkAllReady() {
    if (
      this.#round.phase !== "lobby"
      || this.#countdownTimerHandle !== null
      || this.#rematchGraceTimerHandle !== null
    ) {
      return;
    }
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

    // * COUNTDOWN-ARM-1: continuous mode also needs clientPlayReady (or the 12s ceiling).
    if (this.#isContinuousMode() && !humanSlots.every((s) => s.isPlayReady)) {
      this.#schedulePlayReadyWait({ reset: false });
      return;
    }

    this.#armGameStart();
  }

  /** Mint a fresh absolute countdown window and broadcast MSG.gameStart. */
  #armGameStart() {
    if (
      this.#round.phase !== "lobby"
      || this.#countdownTimerHandle !== null
      || this.#rematchGraceTimerHandle !== null
    ) {
      return;
    }
    this.#clearPlayReadyWait();
    const startsAtMs = this.#serverNowMs() + FLYOVER_PREROLL_MS + COUNTDOWN_MS;
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
    }, FLYOVER_PREROLL_MS + COUNTDOWN_MS);
  }

  #clearPlayReadyWait() {
    if (this.#playReadyWaitHandle !== null) {
      clearTimeout(this.#playReadyWaitHandle);
      this.#playReadyWaitHandle = null;
    }
  }

  /**
   * Continuous lobby: start/reset the PLAY_READY_TIMEOUT_MS ceiling while waiting
   * for clientPlayReady. `reset: true` on new seat so a late joiner gets a full 12s.
   */
  #schedulePlayReadyWait(opts: { reset: boolean }) {
    if (!this.#isContinuousMode()) {
      this.#clearPlayReadyWait();
      return;
    }
    if (
      this.#round.phase !== "lobby"
      || this.#countdownTimerHandle !== null
      || this.#countdownArmed
      || this.#rematchGraceTimerHandle !== null
    ) {
      this.#clearPlayReadyWait();
      return;
    }
    if (!this.#slots) {
      this.#clearPlayReadyWait();
      return;
    }
    const liveConnIds = new Set<string>();
    for (const c of this.getConnections()) {
      liveConnIds.add(c.id);
    }
    const humanSlots = this.#slots.filter(
      (s) => s.kind === "human" && s.connId && liveConnIds.has(s.connId),
    );
    if (
      humanSlots.length === 0
      || !humanSlots.every((s) => s.isReady)
      || humanSlots.every((s) => s.isPlayReady)
    ) {
      this.#clearPlayReadyWait();
      return;
    }
    if (!opts.reset && this.#playReadyWaitHandle !== null) return;
    this.#clearPlayReadyWait();
    this.#playReadyWaitHandle = setTimeout(() => {
      this.#playReadyWaitHandle = null;
      // * Timeout A: arm a fresh full COUNTDOWN_MS window; Cap-200 handles stragglers.
      this.#armGameStart();
    }, getPlayReadyTimeoutMs());
  }

  #reconcileOrphanSlots(liveConnIds: Set<string>) {
    this.#ensureInitialized();
    if (!this.#slots) return false;
    const orphans = listOrphanHumanConnIds(this.#slots, liveConnIds);
    for (const connId of orphans) {
      this.#convertHumanSlotToNpc(connId);
    }
    return orphans.length > 0;
  }

  // * Removes connections that haven't sent a message in REAP_TIMEOUT_MS.
  // * Intended as a safety net for when onClose doesn't fire (crash, network
  // * drop, platform bug, phantom tabs). Host handoff is delegated to
  // * #ensureLiveHost() so we don't duplicate the migration broadcast logic.
  // * Stale-id selection is pure (./connectionReaper); close/delete stays here.
  #reapSilentConnections() {
    const now = this.#serverNowMs();
    const reapedIds = listSilentConnectionsToReap(
      this.#connections.keys(),
      this.#lastSeenAtMs,
      this.#pendingPickers,
      now,
      getReapTimeoutMs(),
    );

    this.#lastReapAtMs = now;
    const reapedPicker = this.#reapStalePendingPickers();
    if (reapedIds.length === 0) {
      // * A stale pending picker can BE the host: onConnect's empty-room fallback
      // * assigns #hostId to a connection that has not seated yet, and a later
      // * joiner can't displace it (#hostId is non-null, so the seat-time promote
      // * is skipped). Reaping it above removed the connection but left #hostId
      // * dangling at a closed socket — and because pending pickers are excluded
      // * from reapedIds, we'd return here without ever reaching the #ensureLiveHost
      // * repair below, stranding the remaining seated humans in a hostless room
      // * (no physics authority, round can't progress) until someone new connects.
      if (reapedPicker) this.#ensureLiveHost();
      return false;
    }

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
      this.#forgetConnectionTracking(id);
      if (this.#pendingPickers.has(id)) {
        this.#pendingPickers.delete(id);
        this.#pendingPickerAtMs.delete(id);
        this.#pendingNames.delete(id);
      } else {
        this.#convertHumanSlotToNpc(id);
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
    // * CONN-TRACK-LEAK-1: release platform-dead tracking BEFORE the cap decision.
    // * A leaked IP count (zombie prune never released it) would otherwise reject
    // * the only connection that could trigger cleanup — a permanent lockout.
    this.#prunePlatformDeadTracking();

    // Security: Enforce connection rate limit per IP
    const ip = ctx.request.headers.get("cf-connecting-ip") || "unknown";
    const currentConnections = this.#ipConnectionCounts.get(ip) ?? 0;
    if (currentConnections >= IP_CONNECTION_CAP) {
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
      this.#clearCountdownTimer();
      this.#clearRematchGrace();
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

    // * Platform-dead conns were already pruned pre-cap (#prunePlatformDeadTracking).
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
    this.#forgetConnectionTracking(conn.id);
    if (this.#pendingPickers.has(conn.id)) {
      this.#pendingPickers.delete(conn.id);
      this.#pendingPickerAtMs.delete(conn.id);
      this.#pendingNames.delete(conn.id);
    } else {
      this.#convertHumanSlotToNpc(conn.id);
    }
    // * Genuine departure: forget this connId's ready memory (a reconnect gets a new connId).
    this.#readyConnIds.delete(conn.id);
    this.#cancelCountdownIfNeeded();

    // * Host departure repair (pick successor + hostMigrated broadcast + countdown
    // * reset) is centralized in #ensureLiveHost — one handoff mechanism for
    // * close / reap / ghost-exorcism / snapshot repair alike. Carts continue from
    // * last-known transforms; no re-init.
    const wasHost = this.#hostId === conn.id;
    this.#ensureLiveHost();
    if (wasHost && this.#hostId === null) {
      // * No successor (last human left): remaining pending pickers must still
      // * learn the host is gone — #ensureLiveHost only broadcasts on success.
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostMigrated,
        serverNowMs: this.#serverNowMs(),
        hostId: null,
      });
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
    // * Size policy (shared/wsMessageLimits.js): drop oversized frames; only
    // * pathological bombs close the socket. Closing on a fat SDP used to kill
    // * the whole WebRTC handshake for a room mid-match.
    const pre = classifyWsMessagePreParse(message.length);
    if (pre === "close") {
      connection.close(4009, "Payload too large");
      return;
    }
    if (pre === "drop") {
      console.warn("[cart-rave] dropping oversized WS message", message.length);
      return;
    }

    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const type = data?.type;
    if (classifyWsMessagePostParse(message.length, type) === "drop") {
      console.warn("[cart-rave] dropping oversized WS message", type, message.length);
      return;
    }

    if (!this.#checkRateLimit(connection.id)) {
      connection.close(4028, "Rate limit exceeded");
      return;
    }

    const now = this.#serverNowMs();
    this.#lastSeenAtMs.set(connection.id, now);
    if (now - this.#lastReapAtMs >= getReapThrottleMs()) {
      this.#reapSilentConnections();
    }

    // * Keepalive: refresh lastSeenAtMs (above) and echo Party serverNowMs so clients
    // * can maintain a Party clock offset separate from host tHost (NET-CLK-1).
    if (type === MSG.keepalive) {
      this.#sendJson(connection, {
        v: PROTOCOL_VERSION,
        type: MSG.keepalive,
        serverNowMs: this.#serverNowMs(),
        tClient: typeof data?.tClient === "number" ? data.tClient : undefined,
      });
      return;
    }

    try {
      if (type === MSG.join) {
        // Optional client metadata; server already assigned a slot on connect.
        const name = typeof data?.name === "string" ? data.name.trim() : "";
        const clientId = typeof data?.clientId === "string" ? data.clientId.trim() : "";
        // * NH-HIT lever 3: host capability score for lobby rebalance.
        this.#setHostScoreFromPayload(connection.id, data);
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
            this.#forgetConnectionTracking(ghostConnId);

            try {
              ghostConn?.close(4010, "Replaced by new session");
            } catch {
              // ignore
            }

            // The ghost may have been the host — repair #hostId immediately instead
            // of stranding the room until the throttled reaper runs (NET-MIG-2:
            // sole-human refresh left the room hostless for several seconds).
            this.#ensureLiveHost();
            // * Residual: joiner is still a pending picker (no human slot yet), so
            // * #pickNextHostId returned null and #ensureLiveHost early-returns on
            // * null. Promote the reconnecting conn as host now — same fallthrough
            // * as onConnect when the room has no host — so physics authority is not
            // * gated on the colorPick race.
            if (this.#hostId === null) {
              this.#hostId = connection.id;
              this.#lastSeq = -1;
              this.#broadcastJson({
                v: PROTOCOL_VERSION,
                type: MSG.hostMigrated,
                serverNowMs: this.#serverNowMs(),
                hostId: this.#hostId,
              });
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

      if (type === MSG.hostAway) {
        this.#handleHostAway(connection.id, now);
        return;
      }

      if (type === MSG.hostPresent) {
        this.#handleHostPresent(connection.id, now);
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
        const patternId = this.#normalizeLookId(data?.patternId);
        if (patternId !== null) slot.patternId = patternId;
        const sunglassesStyle = this.#normalizeLookId(data?.sunglassesStyle);
        if (sunglassesStyle !== null) slot.sunglassesStyle = sunglassesStyle;

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
          // * NET-MIG-2 residual: join-time ghost exorcism (sole human crashed and
          // * reconnected with the same clientId) can null the host while the joiner
          // * is still a pending picker — no human slot yet, so #pickNextHostId()
          // * returned null, and #ensureLiveHost early-returns on null forever after.
          // * The first human to actually seat repairs the room here.
          if (this.#hostId === null) {
            this.#hostId = connection.id;
            this.#lastSeq = -1;
            this.#broadcastJson({
              v: PROTOCOL_VERSION,
              type: MSG.hostMigrated,
              serverNowMs: this.#serverNowMs(),
              hostId: this.#hostId,
            });
          }
          // * HOST-ROLE-1: after seating, prefer a clearly stronger peer as host.
          this.#maybeRebalanceHostForQuality();
          // * Publish zeroed mid-round seat score (see #assignHumanToSlot) so hello
          // * snapshots and peers don't keep showing the replaced NPC's points.
          if (this.#round.phase === "running" || this.#round.phase === "countdown") {
            this.#broadcastRound();
          }
        }

        this.#broadcastJson({
          v: PROTOCOL_VERSION,
          type: MSG.slots,
          serverNowMs: this.#serverNowMs(),
          slots: this.#slots,
        });
        // * Continuous-mode (quickplay) seats isReady:true, so the client's
        // * maybeAutoReadyLobby no-ops (already ready) and never sends readyToggle.
        // * COUNTDOWN-ARM-1: #checkAllReady no longer arms on seat alone — it starts
        // * the playReady wait (reset on new seater so joiners get a full 12s ceiling).
        if (assignedFromPending) {
          this.#schedulePlayReadyWait({ reset: true });
          this.#checkAllReady();
        }
        return;
      }

      if (type === MSG.clientPlayReady) {
        const slot = this.#slots?.find((s) => s.connId === connection.id);
        if (!slot || slot.kind !== "human") return;
        // * Idempotent — rematch lobby heartbeats may re-send.
        if (slot.isPlayReady) return;
        slot.isPlayReady = true;
        this.#checkAllReady();
        return;
      }

      if (type === MSG.cartLook) {
        const slot = this.#slots?.find((s) => s.connId === connection.id);
        if (!slot || slot.kind !== "human") return;
        const lookHex = this.#normalizeLookHex(data?.lookHex);
        const patternId = this.#normalizeLookId(data?.patternId);
        const sunglassesStyle = this.#normalizeLookId(data?.sunglassesStyle);
        // * NET-LOOK-ACC-1: any of the three cosmetics may change independently (e.g. a
        // * glasses-only pick sends a null lookHex) — broadcast if any parsed, not just color.
        let changed = false;
        if (lookHex !== null) {
          slot.lookHex = lookHex;
          changed = true;
        }
        if (patternId !== null) {
          slot.patternId = patternId;
          changed = true;
        }
        if (sunglassesStyle !== null) {
          slot.sunglassesStyle = sunglassesStyle;
          changed = true;
        }
        if (!changed) return;
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

        // * Additive protocol: `ready: boolean` = idempotent SET (quickplay/solo
        // * auto-ready reconcile), absent = legacy toggle (friends READY button).
        // * Toggle semantics race server-side auto-ready: a SET-less auto-ready sent
        // * while playAgain's ready-all was in flight flipped the sender back to
        // * unready and stalled the quickplay rematch lobby (07-20). A no-op SET
        // * must return before the broadcast/cancel path below — it changed nothing.
        const desired = typeof data?.ready === "boolean" ? data.ready : !slot.isReady;
        if (desired === slot.isReady) return;
        slot.isReady = desired;
        // * COUNTDOWN-ABORT-1 (B): remember ready connIds so a same-connId reseat after an
        // * orphan-reconcile blip restores readiness instead of dropping to unready.
        if (desired) this.#readyConnIds.add(connection.id);
        else this.#readyConnIds.delete(connection.id);

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
        this.#clearCountdownTimer();
        this.#clearRematchGrace();
        this.#round = this.#freshRoundLobby();
        this.#countdownArmed = false;
        this.#carts = [];
        // * Host-initiated rematch: auto-ready all humans so the next countdown can start.
        // * COUNTDOWN-ARM-1: clear playReady so clients re-signal (usually instant — carts warm).
        for (const slot of (this.#slots ?? [])) {
          if (slot.kind === "human") {
            slot.isReady = true;
            slot.isPlayReady = false;
            if (slot.connId) this.#readyConnIds.add(slot.connId);
          }
        }
        this.#clearPlayReadyWait();
        // * HOST-ROLE-1: re-evaluate host quality before the next countdown.
        this.#maybeRebalanceHostForQuality();
        this.#broadcastJson({
          v: PROTOCOL_VERSION,
          type: MSG.slots,
          serverNowMs: this.#serverNowMs(),
          slots: this.#slots,
        });
        this.#broadcastRound();
        // * 2s grace before arming countdown — kills the lobby-flash→instant-3-2-1
        // * feel; humans can still unready or leave during the window.
        // * #checkAllReady is blocked while this handle is set (ready-toggle /
        // * host-migrate cannot defeat the breathe window).
        this.#rematchGraceTimerHandle = setTimeout(() => {
          this.#rematchGraceTimerHandle = null;
          this.#checkAllReady();
        }, 2000);
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
        // * Top-level beside levelId — not inside round / roundValidation.
        const aiRaw = typeof data?.aiDifficulty === "string" ? data.aiDifficulty.trim().toLowerCase() : "";
        if (aiRaw === "easy" || aiRaw === "medium" || aiRaw === "hard") {
          this.#currentAiDifficulty = aiRaw;
        }
        const validated = this.#validateHostRound(data?.round, this.#serverNowMs());
        if (!validated) {
          // * Host already applied phase locally (optimistic podium/SD). Echo the
          // * authoritative round so the host rolls back instead of softlocking clients.
          this.#sendJson(connection, {
            v: PROTOCOL_VERSION,
            type: MSG.round,
            serverNowMs: this.#serverNowMs(),
            levelId: this.#currentLevelId,
            aiDifficulty: this.#currentAiDifficulty,
            round: this.#safeStructuredClone(this.#round),
            rejected: true,
          });
          return;
        }
        this.#round = validated;
        if (validated.phase === "countdown") this.#countdownArmed = false;
        this.#broadcastRound();
        return;
      }

      if (type === MSG.hostSpawn) {
        // * Reliable spawn/rematch poses — host-only, rebroadcast to the room.
        if (connection.id !== this.#hostId) return;
        const carts = data?.carts;
        if (!carts || typeof carts !== "object") return;
        const seq = typeof data.seq === "number" && Number.isFinite(data.seq) ? data.seq : 0;
        const tHost = typeof data.tHost === "number" && Number.isFinite(data.tHost) ? data.tHost : 0;
        // * Keep a copy for mid-round join hello snapshots when useful.
        if (Array.isArray(carts)) {
          this.#carts = carts as (CartState | undefined)[];
          this.#lastSeq = Math.max(this.#lastSeq, seq);
        }
        this.#broadcastJson({
          v: PROTOCOL_VERSION,
          type: MSG.hostSpawn,
          serverNowMs: this.#serverNowMs(),
          seq,
          tHost,
          carts,
        });
        return;
      }

    } catch (err) {
      console.error("[cart-rave] onMessage error:", err);
    }
  }
}

/**
 * Cache headers for static assets served via the ASSETS binding.
 * Policy lives in shared/assetCache.js (ASSET-CACHE-1) — hashed /assets/* stay
 * immutable; fixed-name models/sounds/fonts use 1h + 5m SWR.
 */
function withAssetCacheHeaders(request: Request, response: Response): Response {
  if (response.status !== 200 && response.status !== 206) return response;

  const path = new URL(request.url).pathname;
  const cacheControl = assetCacheControlForPath(path);
  if (!cacheControl) return response;

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Headers for a log-DO store call. Carries the caller IP inward — the DO enforces
 * the SEC-BEACON-1 per-IP budget and cannot see cf-connecting-ip on its own.
 * Coarse CF geo (country + regionCode / US state) is copied onto x-cc-* headers —
 * Durable Object subrequests strip most cf-* headers, so we must not forward geo as cf-*.
 * Never persist the raw IP into SQLite.
 */
function beaconHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-connecting-ip": request.headers.get("cf-connecting-ip") || UNKNOWN_IP,
  };
  // * Production Workers expose request.cf; tests may set inbound headers instead.
  const cf = (request as Request & { cf?: { country?: string; regionCode?: string } }).cf;
  const countryRaw = cf?.country || request.headers.get("cf-ipcountry") || request.headers.get("x-cc-country") || "";
  const country = String(countryRaw)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  // * XX = unknown, T1 = Tor — skip both so summary is not polluted.
  if (country && country !== "XX" && country !== "T1") {
    headers["x-cc-country"] = country;
  }
  const regionRaw =
    cf?.regionCode || request.headers.get("cf-region-code") || request.headers.get("x-cc-region") || "";
  const region = String(regionRaw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  if (region) {
    headers["x-cc-region"] = region;
  }
  return headers;
}

export default {
  async fetch(request: Request, env: Record<string, any>): Promise<Response> {
    const url = new URL(request.url);

    // * Client crash reports → persist into the ErrorLog SQLite DO (singleton
    // * instance "v1"). Bounded, queryable; replaces the old console.log-and-drop.
    //
    // * SEC-ROUTE-1: all four /api/* routes below match EXACTLY, not by prefix or
    // * substring. They have no sub-paths — options ride the query string
    // * (?id=, ?limit=, ?view=) and admin auth is Authorization: Bearer only
    // * (SEC-TOKEN-1 — never ?token=). Pathname `===` is the tightest correct rule.
    // * `includes()` here used to swallow any path CONTAINING the string (e.g.
    // * /x/api/errors) before the /parties/ check and before ASSETS. Do not loosen
    // * these back; `startsWith` at the isParty check below is different — that one
    // * really is a prefix route with sub-paths beneath it.
    if (url.pathname === "/api/log-error") {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      try {
        const body = await request.text();
        // * Cap the beacon body so a runaway client can't wedge the DO fetch.
        if (body.length <= 100_000 && env.ERROR_LOG) {
          const stub = env.ERROR_LOG.get(env.ERROR_LOG.idFromName("v1"));
          const res = await stub.fetch("https://do/store", {
            method: "POST",
            headers: beaconHeaders(request),
            body,
          });
          // * SEC-BEACON-1: the DO drops a flooding IP before it can evict real
          // * reports. Surface that instead of the usual silent 204.
          if (res.status === 429) return new Response(null, { status: 429 });
        } else if (!env.ERROR_LOG) {
          // * Binding not deployed yet — keep the old visibility so nothing is lost.
          console.log("[cart-rave] client error (no ERROR_LOG binding):", body.slice(0, 2000));
        }
      } catch {
        // Body may be empty or malformed; ignore — never fail the beacon.
      }
      return new Response(null, { status: 204 });
    }

    // * Read/clear the crash log. Token-gated (SEC-TOKEN-1: Authorization Bearer only,
    // * never ?token=). Only usable once ERROR_LOG_TOKEN is a Worker secret.
    if (url.pathname === "/api/errors") {
      const denied = requireAdminToken(request, env.ERROR_LOG_TOKEN);
      if (denied) return denied;
      const jsonError = (msg: string, status: number) =>
        new Response(JSON.stringify({ error: msg }), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (!env.ERROR_LOG) {
        return jsonError("ERROR_LOG binding not deployed", 500);
      }
      const stub = env.ERROR_LOG.get(env.ERROR_LOG.idFromName("v1"));
      if (request.method === "DELETE") {
        await stub.fetch("https://do/clear", { method: "POST" });
        return new Response(null, { status: 204 });
      }
      const limit = url.searchParams.get("limit") || "100";
      const res = await stub.fetch("https://do/list?limit=" + encodeURIComponent(limit));
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json" },
      });
    }

    // * Playtest capture bundles (F8 / ?diag). POST = unauthenticated size-capped upload
    // * (like /api/log-error). GET list/get + DELETE reuse ERROR_LOG_TOKEN.
    if (url.pathname === "/api/captures") {
      if (request.method === "POST") {
        try {
          const body = await request.text();
          // * Full F8 bundles are typically 5–40 KB; hard-cap well above that.
          if (body.length > 0 && body.length <= 350_000 && env.CAPTURE_LOG) {
            let parsed: Record<string, unknown> = {};
            try {
              parsed = JSON.parse(body) as Record<string, unknown>;
            } catch {
              return new Response(JSON.stringify({ ok: false, error: "bad_json" }), {
                status: 400,
                headers: { "content-type": "application/json" },
              });
            }
            // * Accept either a wrapped { label, body } envelope or a raw capture bundle
            // * (body = the whole JSON). Extract light metadata for the list index.
            const isWrapped = parsed && typeof parsed.body === "string";
            const bundle = isWrapped
              ? (() => {
                  try {
                    return JSON.parse(String(parsed.body)) as Record<string, unknown>;
                  } catch {
                    return null;
                  }
                })()
              : parsed;
            const snap = (bundle?.snapshot ?? null) as Record<string, unknown> | null;
            const runtime = (snap?.runtime ?? null) as Record<string, unknown> | null;
            const net = (snap?.net ?? null) as Record<string, unknown> | null;
            const buildObj = (bundle?.build ?? null) as Record<string, unknown> | null;
            const buildSha =
              (buildObj && typeof buildObj.sha === "string" && buildObj.sha) ||
              (typeof bundle?.build === "string" ? bundle.build : "") ||
              "";
            const storeBody = JSON.stringify({
              label: isWrapped ? parsed.label : (parsed.label ?? null),
              phase: bundle?.phase ?? null,
              build: buildSha,
              isHost: net?.isHost ?? null,
              qualityTier: runtime?.qualityTier ?? null,
              gpu: runtime?.gpuRenderer ?? runtime?.gpuClass ?? null,
              body: isWrapped ? parsed.body : body,
              userAgent: request.headers.get("user-agent") || "",
              url: typeof parsed.url === "string" ? parsed.url : url.origin,
              clientTs: typeof parsed.clientTs === "number" ? parsed.clientTs : Date.now(),
            });
            const stub = env.CAPTURE_LOG.get(env.CAPTURE_LOG.idFromName("v1"));
            // * Already forwards res.status, so the DO's 429 propagates as-is.
            const res = await stub.fetch("https://do/store", {
              method: "POST",
              headers: beaconHeaders(request),
              body: storeBody,
            });
            return new Response(res.body, {
              status: res.status,
              headers: { "content-type": "application/json" },
            });
          }
          if (!env.CAPTURE_LOG) {
            return new Response(JSON.stringify({ ok: false, error: "no_binding" }), {
              status: 503,
              headers: { "content-type": "application/json" },
            });
          }
        } catch {
          // never fail the capture path hard
        }
        return new Response(JSON.stringify({ ok: false, error: "rejected" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const denied = requireAdminToken(request, env.ERROR_LOG_TOKEN);
      if (denied) return denied;
      const jsonError = (msg: string, status: number) =>
        new Response(JSON.stringify({ error: msg }), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (!env.CAPTURE_LOG) return jsonError("CAPTURE_LOG binding not deployed", 500);
      const stub = env.CAPTURE_LOG.get(env.CAPTURE_LOG.idFromName("v1"));
      if (request.method === "DELETE") {
        await stub.fetch("https://do/clear", { method: "POST" });
        return new Response(null, { status: 204 });
      }
      const id = url.searchParams.get("id");
      if (id) {
        const res = await stub.fetch("https://do/get?id=" + encodeURIComponent(id));
        return new Response(res.body, {
          status: res.status,
          headers: { "content-type": "application/json" },
        });
      }
      const limit = url.searchParams.get("limit") || "40";
      const res = await stub.fetch("https://do/list?limit=" + encodeURIComponent(limit));
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json" },
      });
    }

    // * Gameplay analytics (see src/analytics/analytics.js → party/analyticsLog.ts).
    // * POST = the client beacon (unauthenticated by design, like /api/log-error, but body-
    // * capped and bounded in the DO). GET reads (summary/list) + DELETE reuse the same
    // * observability token as /api/errors so aggregates aren't world-readable.
    if (url.pathname === "/api/analytics") {
      if (request.method === "POST") {
        try {
          const body = await request.text();
          if (body.length <= 64_000 && env.ANALYTICS_LOG) {
            const stub = env.ANALYTICS_LOG.get(env.ANALYTICS_LOG.idFromName("v1"));
            const res = await stub.fetch("https://do/ingest", {
              method: "POST",
              headers: beaconHeaders(request),
              body,
            });
            // * SEC-BEACON-1: same as /api/log-error — a 429 must reach the client
            // * or the cap is invisible and untestable.
            if (res.status === 429) return new Response(null, { status: 429 });
          } else if (!env.ANALYTICS_LOG) {
            // * Binding not deployed yet — keep the old visibility so nothing is lost.
            console.log("[cart-rave] analytics (no ANALYTICS_LOG binding):", body.slice(0, 2000));
          }
        } catch {
          // Malformed/empty beacon — never fail the sender.
        }
        return new Response(null, { status: 204 });
      }
      const denied = requireAdminToken(request, env.ERROR_LOG_TOKEN);
      if (denied) return denied;
      const jsonError = (msg: string, status: number) =>
        new Response(JSON.stringify({ error: msg }), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (!env.ANALYTICS_LOG) return jsonError("ANALYTICS_LOG binding not deployed", 500);
      const stub = env.ANALYTICS_LOG.get(env.ANALYTICS_LOG.idFromName("v1"));
      if (request.method === "DELETE") {
        await stub.fetch("https://do/clear", { method: "POST" });
        return new Response(null, { status: 204 });
      }
      const view = url.searchParams.get("view") === "list" ? "list" : "summary";
      const limit = url.searchParams.get("limit") || "100";
      const res = await stub.fetch(`https://do/${view}?limit=${encodeURIComponent(limit)}`);
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json" },
      });
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

    // * routePartykitRequest returns null when nothing matches, and returning null
    // * from fetch() is a runtime TypeError — live prod 500s on any unknown path
    // * today (verified against /definitely-not-real-xyz, 07-30). SEC-ROUTE-1 makes
    // * that reachable for near-miss API paths like /api/errorsfoo, which used to be
    // * swallowed by the old substring match, so the fallback lands with it.
    return (await routePartykitRequest(request, env)) ?? new Response("not found", { status: 404 });
  },
};
