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
};

type RoundState = {
  phase: "lobby" | "countdown" | "running" | "podium";
  // Intentionally minimal for now; host drives transitions.
  winnerSlotId: SlotId | null;
};

const MSG = {
  // Client -> server
  join: "join",
  hostTransform: "host_transform",
  clientInput: "client_input",
  hostEventFall: "host_event_fall",
  hostRound: "host_round",

  // Server -> client
  hello: "hello",
  hostAssigned: "host_assigned",
  hostMigrated: "host_migrated",
  slots: "slots",
  state: "state",
  round: "round",
} as const;

const PROTOCOL_VERSION = 1;

export default class Server implements Party.Server {
  readonly #connections = new Map<string, Party.Connection>();
  readonly #joinOrder: string[] = [];

  #hostId: string | null = null;
  #slots: Slot[] | null = null;
  #carts: Record<string, CartState> = {};
  #round: RoundState = { phase: "lobby", winnerSlotId: null };
  #lastSeq: number = 0;

  constructor(readonly room: Party.Room) {}

  #serverNowMs() {
    return Date.now();
  }

  #ensureInitialized() {
    if (this.#slots) return;

    const colors = ["hotPink", "electricBlue", "limeGreen", "neonYellow"];
    const npcNames = ["CartGPT", "RollBot", "WheelE", "PushPop"];

    this.#slots = ([0, 1, 2, 3] as SlotId[]).map((slotId) => ({
      slotId,
      kind: "npc",
      connId: null,
      name: npcNames[slotId] ?? `NPC-${slotId}`,
      color: colors[slotId] ?? `slot-${slotId}`,
    }));
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
    return {
      v: PROTOCOL_VERSION,
      roomId: this.room.id,
      serverNowMs: this.#serverNowMs(),
      hostId: this.#hostId,
      slots: this.#slots,
      round: this.#round,
      carts: this.#carts,
      seq: this.#lastSeq,
    };
  }

  #pickNextHostId(): string | null {
    // Oldest still-connected human wins.
    for (const id of this.#joinOrder) {
      if (this.#connections.has(id)) return id;
    }
    return null;
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
    // Keep last known name/color for continuity; name can be replaced later by NPC naming.
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    this.#ensureInitialized();

    this.#connections.set(conn.id, conn);
    this.#joinOrder.push(conn.id);

    if (!this.#hostId) {
      this.#hostId = conn.id;
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostAssigned,
        serverNowMs: this.#serverNowMs(),
        hostId: this.#hostId,
      });
    }

    // Reconcile: any slot marked "human" whose connId is not in the platform's live
    // connection list is orphaned. Use room.getConnections() rather than #connections
    // because WebSocket close events are not guaranteed to fire (tab crash, incognito
    // close, network drop) and #connections can hold zombies.
    if (this.#slots) {
      const liveConnIds = new Set<string>();
      for (const c of this.room.getConnections()) {
        liveConnIds.add(c.id);
      }
      // The new connection itself is not yet in getConnections() during onConnect, so add it.
      liveConnIds.add(conn.id);
      for (const slot of this.#slots) {
        if (slot.kind === "human" && slot.connId && !liveConnIds.has(slot.connId)) {
          console.log(`reconcile: orphan slot ${slot.slotId} connId=${slot.connId} -> npc`);
          slot.kind = "npc";
          slot.connId = null;
        }
      }
    }

    // Prune zombies from #connections to match platform reality.
    for (const staleId of [...this.#connections.keys()]) {
      if (!this.room.getConnections().some((c) => c.id === staleId) && staleId !== conn.id) {
        console.log(`reconcile: pruning zombie connection ${staleId}`);
        this.#connections.delete(staleId);
      }
    }

    this.#assignHumanToSlot(conn.id);

    console.log("connected to party");
    console.log(
      `party client id=${conn.id} room=${this.room.id} path=${new URL(ctx.request.url).pathname}`,
    );

    // Late-join snapshot: send full room state immediately.
    const helloPayload = {
      v: PROTOCOL_VERSION,
      type: MSG.hello,
      ...this.#snapshot(),
      youConnId: conn.id,
      path: new URL(ctx.request.url).pathname,
    };
    console.log(
      `sending hello to conn=${conn.id} hostId=${this.#hostId} slots=${this.#slots?.length ?? 0} cartsKeys=${Object.keys(this.#carts).length} payload=${JSON.stringify(
        helloPayload,
      )}`,
    );
    this.#sendJson(conn, helloPayload);

    // Also broadcast current slot mapping so all clients stay consistent.
    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.slots,
      serverNowMs: this.#serverNowMs(),
      slots: this.#slots,
    });
  }

  onClose(conn: Party.Connection) {
    this.#connections.delete(conn.id);
    this.#convertHumanSlotToNpc(conn.id);

    const wasHost = this.#hostId === conn.id;
    if (wasHost) {
      const prevHostId = this.#hostId;
      this.#hostId = this.#pickNextHostId();
      console.log(`host disconnected: prevHostId=${prevHostId} newHostId=${this.#hostId}`);
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostMigrated,
        serverNowMs: this.#serverNowMs(),
        hostId: this.#hostId,
      });
      // * Carts continue from last-known transforms. No re-init.
    } else {
      console.log(`client disconnected: connId=${conn.id} hostId=${this.#hostId}`);
    }

    this.#broadcastJson({
      v: PROTOCOL_VERSION,
      type: MSG.slots,
      serverNowMs: this.#serverNowMs(),
      slots: this.#slots,
    });
  }

  onMessage(message: string, conn: Party.Connection) {
    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const type = data?.type;
    if (type === "debug_log") {
      console.log(`[DEBUG ${conn.id.slice(0,8)}] ${data?.label ?? ""}:`, JSON.stringify(data?.payload ?? null));
      return;
    }

    if (type === MSG.join) {
      // Optional client metadata; server already assigned a slot on connect.
      const name = typeof data?.name === "string" ? data.name.trim() : "";
      if (name) {
        this.#ensureInitialized();
        const slot = this.#slots!.find((s) => s.connId === conn.id);
        if (slot) slot.name = name.slice(0, 24);
      }

      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.slots,
        serverNowMs: this.#serverNowMs(),
        slots: this.#slots,
      });
      return;
    }

    if (type === MSG.clientInput) {
      data.connId = conn.id;
      // Relay to host only. Do not broadcast.
      this.#sendJsonToHost({
        v: PROTOCOL_VERSION,
        type: MSG.clientInput,
        serverNowMs: this.#serverNowMs(),
        connId: data.connId,
        seq: typeof data?.seq === "number" ? data.seq : null,
        tClient: typeof data?.tClient === "number" ? data.tClient : null,
        input: data?.input ?? null,
      });
      return;
    }

    if (type === MSG.hostTransform) {
      if (conn.id !== this.#hostId) return;
      const seq = typeof data?.seq === "number" ? data.seq : null;
      if (seq === null) return;
      if (seq <= this.#lastSeq) return;
      this.#lastSeq = seq;

      const carts = data?.carts;
      if (carts && typeof carts === "object") {
        this.#carts = carts;
      }

      // Relay authoritative state to all clients (including host for confirmation).
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.state,
        serverNowMs: this.#serverNowMs(),
        seq: this.#lastSeq,
        tHost: typeof data?.tHost === "number" ? data.tHost : null,
        carts: this.#carts,
      });
      return;
    }

    if (type === MSG.hostRound) {
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

    if (type === MSG.hostEventFall) {
      if (conn.id !== this.#hostId) return;
      // Placeholder: keep for diagnostics/telemetry; clients can infer via cart flags.
      this.#broadcastJson({
        v: PROTOCOL_VERSION,
        type: MSG.hostEventFall,
        serverNowMs: this.#serverNowMs(),
        tHost: typeof data?.tHost === "number" ? data.tHost : null,
        slotId: data?.slotId ?? null,
        reason: data?.reason ?? null,
      });
    }
  }
}

Server satisfies Party.Worker;
