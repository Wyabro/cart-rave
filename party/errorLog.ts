// errorLog.ts — Durable Object that persists client error reports in SQLite.
//
// Why this exists: the client (src/utils/errorReporter.js + the boot handlers in
// index.html) beacons every uncaught error / rejection / boot failure to
// /api/log-error with the user-agent and URL attached. Before this, the Worker
// only console.log'd those and dropped them, so a friend's "it won't run" crash
// was generated and thrown away unless someone happened to be `wrangler tail`-ing.
// This DO gives that firehose a bottom: a bounded, queryable ring buffer you can
// read back at /api/errors (see party/index.ts) to find the exact throw.
//
// Isolated from CartRaveServer on purpose — no game state, no connections, one
// singleton instance ("v1"). Uses the SQLite storage backend declared for this
// class in wrangler.jsonc (migration tag v2). Written as a plain DO class with a
// minimal structural type for ctx.storage.sql so it needs no `cloudflare:workers`
// ambient types (this repo types its Worker through partyserver, not workers-types).

import { denyLogAdminIfConfigured } from "./adminAuth";
import { type BeaconBucket, UNKNOWN_IP, checkBeaconLimit } from "./beaconLimit";
import { clampStr as clamp, jsonResponse } from "./logUtil";

/** Ring-buffer cap — oldest rows are pruned past this so the DO can't grow unbounded. */
const MAX_ROWS = 2000;

/** Per-field truncation so a hostile or runaway client can't bloat storage. */
const CAP = { message: 2000, stack: 8000, context: 4000, ua: 300, url: 600 };

/** Just the slice of the Durable Object SQLite API this file uses. */
interface SqlCursor {
  toArray(): Record<string, unknown>[];
}
interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): SqlCursor;
}
interface DoStorage {
  sql: SqlStorage;
}
interface DoState {
  storage: DoStorage;
}

type ErrorPayload = {
  message?: unknown;
  stack?: unknown;
  context?: unknown;
  timestamp?: unknown;
  userAgent?: unknown;
  url?: unknown;
};

export class ErrorLog {
  #ctx: DoState;
  #env: { ERROR_LOG_TOKEN?: string };
  #ready = false;
  /** SEC-BEACON-1: per-IP beacon budget defending this DO's ring. */
  readonly #beaconIps = new Map<string, BeaconBucket>();

  constructor(ctx: DoState, env: { ERROR_LOG_TOKEN?: string }) {
    this.#ctx = ctx;
    this.#env = env;
  }

  #ensureSchema(): void {
    if (this.#ready) return;
    this.#ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS errors (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ts INTEGER,
         received INTEGER,
         message TEXT,
         stack TEXT,
         context TEXT,
         ua TEXT,
         url TEXT
       )`,
    );
    this.#ready = true;
  }

  /** Insert one report and prune the ring buffer back down to MAX_ROWS. */
  #store(p: ErrorPayload): void {
    this.#ensureSchema();
    const ts = typeof p.timestamp === "number" ? p.timestamp : Date.now();
    this.#ctx.storage.sql.exec(
      `INSERT INTO errors (ts, received, message, stack, context, ua, url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ts,
      Date.now(),
      clamp(p.message, CAP.message),
      clamp(p.stack, CAP.stack),
      clamp(p.context, CAP.context),
      clamp(p.userAgent, CAP.ua),
      clamp(p.url, CAP.url),
    );
    this.#ctx.storage.sql.exec(
      `DELETE FROM errors WHERE id NOT IN
         (SELECT id FROM errors ORDER BY id DESC LIMIT ?)`,
      MAX_ROWS,
    );
  }

  #list(limit: number): Record<string, unknown>[] {
    this.#ensureSchema();
    const n = Math.max(1, Math.min(1000, (limit | 0) || 100));
    return this.#ctx.storage.sql
      .exec(`SELECT * FROM errors ORDER BY id DESC LIMIT ?`, n)
      .toArray();
  }

  #clear(): void {
    this.#ensureSchema();
    this.#ctx.storage.sql.exec(`DELETE FROM errors`);
    // * Resetting the ring resets its guard too — also the lever party-do tests
    // * use to isolate, since the "v1" singleton outlives any one test.
    this.#beaconIps.clear();
  }

  // Internal-only HTTP surface — reached exclusively from the Worker fetch handler
  // (party/index.ts), which owns auth for the public /api/errors route.
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const denied = denyLogAdminIfConfigured(request, this.#env.ERROR_LOG_TOKEN);
    if (denied) return denied;
    if (request.method === "POST" && url.pathname === "/store") {
      // * SEC-BEACON-1: cap before the INSERT, or a flood prunes real reports out
      // * of the ring. index.ts forwards the caller IP; unknown IPs are exempt.
      const ip = request.headers.get("cf-connecting-ip") || UNKNOWN_IP;
      if (!checkBeaconLimit(this.#beaconIps, ip, Date.now())) {
        return new Response(null, { status: 429 });
      }
      try {
        const body = (await request.json()) as ErrorPayload;
        this.#store(body);
      } catch {
        // Malformed body — drop it rather than 500 the beacon path.
      }
      return new Response(null, { status: 204 });
    }
    if (request.method === "POST" && url.pathname === "/clear") {
      this.#clear();
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/list") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const rows = this.#list(limit);
      return jsonResponse({ count: rows.length, errors: rows });
    }
    return new Response("not found", { status: 404 });
  }
}
