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
  isReady: boolean;
};

type RoundState = {
  phase: "lobby" | "countdown" | "running" | "podium";
  // Intentionally minimal for now; host drives transitions.
  winnerSlotId: SlotId | "draw" | null;
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
} as const;

const PROTOCOL_VERSION = 2;
const PALETTE = ["pink", "blue", "green", "yellow", "neonOrange"] as const;
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
  #carts: Record<string, CartState> = {};
  #round: RoundState = { phase: "lobby", winnerSlotId: null };
  #lastSeq: number = 0;
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

  #assignHumanToSlot(connId: string): Slot | null {
    this.#ensureInitialized();
    const slots = this.#slots!;

    // Already assigned?
    const existing = slots.find((s) => s.connId === connId);
    if (existing) return existing;

    // Replace an NPC if possible.
    const npcSlot = slots.find((s) => s.kind === "npc");
    if (!npcSlot) return null;

    npcSlot.kind = "human";
    npcSlot.connId = connId;
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
  }

  #getAvailableColors(): string[] {
    const humanColors = new Set(
      this.#slots
        ?.filter((s) => s.kind === "human")
        .map((s) => s.color) ?? []
    );
    return PALETTE.filter((c) => !humanColors.has(c));
  }

  #gameMode(): "solo" | "quickplay" | "friends" {
    if (this.room.id.startsWith("solo")) return "solo";
    if (this.room.id === "quickplay") return "quickplay";
    return "friends";
  }

  // * Cancels the game-start countdown if the "all ready" condition is no
  // * longer satisfied. Called after any human slot reverts to NPC to
  // * prevent a countdown from firing with fewer players than intended.
  #cancelCountdownIfNeeded() {
    if (this.#countdownTimerHandle === null) return;
    const humanSlots = this.#slots!.filter((s) => s.kind === "human");
    if (humanSlots.every((s) => s.isReady)) return;
    clearTimeout(this.#countdownTimerHandle);
    this.#countdownTimerHandle = null;
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
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.gameStart,
      serverNowMs: this.#serverNowMs(),
      startsAtMs,
    });
    this.#countdownTimerHandle = setTimeout(() => {
      this.#countdownTimerHandle = null;
    }, 3000);
  }

  #reconcileOrphanSlots(liveConnIds: Set<string>) {
    this.#ensureInitialized();
    let changed = false;
    for (const slot of this.#slots!) {
      if (slot.kind === "human" && slot.connId && !liveConnIds.has(slot.connId)) {
        slot.kind = "npc";
        slot.connId = null;
        slot.isReady = false;
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
      this.#convertHumanSlotToNpc(id);
      
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
      this.#round = { phase: "lobby", winnerSlotId: null };
      this.#carts = {}; // Nuke the stale physical positions
      if (this.#countdownTimerHandle) {
        clearTimeout(this.#countdownTimerHandle);
        this.#countdownTimerHandle = null;
      }
    }

    if (!this.#assignHumanToSlot(conn.id)) {
      this.#sendJson(conn, { v: PROTOCOL_VERSION, type: MSG.joinRejected });
      return;
    }

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
    this.#convertHumanSlotToNpc(conn.id);
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
    }

    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.slots,
      serverNowMs: this.#serverNowMs(),
      slots: this.#slots,
    });
  }

  onMessage(message: string, conn: Party.Connection) {
    // Security: Block massive payload bombs before trying to parse
    if (message.length > 4096) {
      conn.close(4009, "Payload too large");
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
        const slot = this.#slots!.find((s) => s.connId === conn.id);
        if (slot) slot.name = name.slice(0, 24);
      }

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
          this.#convertHumanSlotToNpc(ghostConnId);
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

      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.slots,
        serverNowMs: this.#serverNowMs(),
        slots: this.#slots,
      });
      return;
    }

    if (type === MSG.colorPick) {
      const color = data?.color;
      if (
        typeof color === "string" &&
        this.#getAvailableColors().includes(color)
      ) {
        const slot = this.#slots?.find((s) => s.connId === conn.id);
        if (slot) {
          const oldColor = slot.color;
          slot.color = color;

          // Displace any NPC holding the picked color to the unused 5th color.
          const npcWithColor = this.#slots!.find(
            (s) => s !== slot && s.kind === "npc" && s.color === color
          );
          if (npcWithColor) {
            const allUsed = new Set(this.#slots!.map((s) => s.color));
            const unused = PALETTE.find((c) => !allUsed.has(c)) ?? oldColor;
            npcWithColor.color = unused;
          }

          this.#broadcastJson({
            v: PROTOCOL_VERSION,
            type: MSG.slots,
            serverNowMs: this.#serverNowMs(),
            slots: this.#slots,
          });
        }
      }
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
            s.kind = "npc";
            s.connId = null;
            s.isReady = false;
          }
        }

        this.#broadcastJson({
          v: PROTOCOL_VERSION,
          type: MSG.slots,
          serverNowMs: this.#serverNowMs(),
          slots: this.#slots,
        });
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
      this.#round = { phase: "lobby", winnerSlotId: null };
      this.#carts = {};
      const shouldAutoReady = this.#gameMode() === "quickplay";
      for (const slot of this.#slots!) {
        if (slot.kind === "human") slot.isReady = shouldAutoReady;
      }
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.slots,
        serverNowMs: this.#serverNowMs(),
        slots: this.#slots,
      });
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.round,
        serverNowMs: this.#serverNowMs(),
        round: this.#round,
      });
      if (shouldAutoReady) this.#checkAllReady();
      return;
    }

    if (type === MSG.clientInput) {
      // Security: prevent connId spoofing by forcing sender id.
      data.connId = conn.id;
      // Clamp inputs before relaying to host.
      const throttle = this.#clamp(data?.input?.throttle, -1, 1);
      const steer = this.#clamp(data?.input?.steer, -1, 1);
      const nitro = Boolean(data?.input?.nitro);
      // Relay to host only. Do not broadcast.
      this.#sendJsonToHost({
        v: PROTOCOL_VERSION,
        type: MSG.clientInput,
        serverNowMs: this.#serverNowMs(),
        connId: data.connId,
        seq: typeof data?.seq === "number" ? data.seq : null,
        tClient: typeof data?.tClient === "number" ? data.tClient : null,
        input: { throttle, steer, nitro },
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
      if (carts && typeof carts === "object" && !Array.isArray(carts)) {
        const keys = Object.keys(carts);
        if (keys.length <= 4) {
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

          /** @type {Record<string, CartState>} */
          const sanitized: Record<string, CartState> = { ...this.#carts };
          for (const id of keys) {
            const c = (carts as any)[id];
            const ok =
              c &&
              typeof c === "object" &&
              validateNumberArray((c as any).p, 3, -500, 500) &&
              validateNumberArray((c as any).q, 4, -1.5, 1.5) &&
              validateNumberArray((c as any).lv, 3, -200, 200) &&
              validateNumberArray((c as any).av, 3, -200, 200);
            if (!ok) continue;
            sanitized[id] = c as CartState;
          }
          this.#carts = sanitized;
        }
      }

      // Relay authoritative state to all clients (including host for confirmation).
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.state,
        serverNowMs: this.#serverNowMs(),
        seq: this.#lastSeq,
        tHost: typeof data?.tHost === "number" ? data.tHost : null,
        carts: this.#safeStructuredClone(this.#carts),
      });
      return;
    }

    if (type === MSG.hostRound) {
      // Security: host-only.
      if (conn.id !== this.#hostId) return;
      const round = data?.round;
      if (round && typeof round === "object") {
        this.#round = round as RoundState;
      }
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.round,
        serverNowMs: this.#serverNowMs(),
        round: this.#round,
      });
      return;
    }

    if (type === MSG.hostEventCollision) {
      if (conn.id !== this.#hostId) return;
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostEventCollision,
        serverNowMs: this.#serverNowMs(),
        slotA: data?.slotA ?? null,
        slotB: data?.slotB ?? null,
        intensity: data?.intensity ?? 0,
        midpoint: data?.midpoint ?? null,
      });
      return;
    }

    if (type === MSG.hostEventFall) {
      // Security: host-only.
      if (conn.id !== this.#hostId) return;
      // Placeholder: keep for diagnostics/telemetry; clients can infer via cart flags.
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostEventFall,
        serverNowMs: this.#serverNowMs(),
        tHost: typeof data?.tHost === "number" ? data.tHost : null,
        slotId: data?.slotId ?? null,
        victimSlotIndex: data?.victimSlotIndex ?? null,
        attackerSlot: data?.attackerSlot ?? null,
        attackerSlotIndex: data?.attackerSlotIndex ?? null,
        verb: data?.verb ?? null,
        reason: data?.reason ?? null,
      });
    }
  }
}

Server satisfies Party.Worker;
