// analyticsLog.ts — Durable Object that persists gameplay analytics events in SQLite.
//
// The sibling of errorLog.ts, same design: one singleton instance ("v1"), a bounded
// SQLite ring buffer, an internal-only HTTP surface reached exclusively from the Worker
// fetch handler (party/index.ts), which owns auth for the public routes. The client
// batches events (src/analytics/analytics.js) and beacons them to POST /api/analytics.
//
// Frequently-queried dimensions (name, arena, mode, phase, reason, result, durationMs)
// are extracted into real columns at ingest so /summary is plain GROUP BY SQL — no JSON
// parsing at read time. Everything else stays in the props JSON column.

import { clampStrOrNull as clampStr, jsonResponse } from "./logUtil";

/** Ring-buffer cap — oldest rows pruned past this so the DO can't grow unbounded. */
const MAX_ROWS = 20_000;

/** Max events accepted per batch — a hostile client can't bulk-insert. */
const MAX_EVENTS_PER_BATCH = 50;

/** Per-field truncation. */
const CAP = { name: 40, str: 80, session: 64, client: 64, build: 120, props: 512 };

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

type AnalyticsEvent = {
  name?: unknown;
  t?: unknown;
  [k: string]: unknown;
};

type AnalyticsBatch = {
  v?: unknown;
  sessionId?: unknown;
  clientId?: unknown;
  build?: unknown;
  sentAt?: unknown;
  events?: unknown;
};

function asIntOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

export class AnalyticsLog {
  #ctx: DoState;
  #ready = false;

  constructor(ctx: DoState, _env: unknown) {
    this.#ctx = ctx;
  }

  #ensureSchema(): void {
    if (this.#ready) return;
    this.#ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         received INTEGER,
         session TEXT,
         client TEXT,
         build TEXT,
         name TEXT,
         arena TEXT,
         mode TEXT,
         phase TEXT,
         reason TEXT,
         result TEXT,
         duration_ms INTEGER,
         t INTEGER,
         props TEXT
       )`,
    );
    this.#ready = true;
  }

  /** Insert one batch (bounded) and prune the ring buffer back down to MAX_ROWS. */
  #ingest(batch: AnalyticsBatch): number {
    this.#ensureSchema();
    const events = Array.isArray(batch.events) ? batch.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
    const received = Date.now();
    const session = clampStr(batch.sessionId, CAP.session);
    const client = clampStr(batch.clientId, CAP.client);
    const build = clampStr(batch.build, CAP.build);

    let stored = 0;
    for (const raw of events) {
      const e = (raw ?? {}) as AnalyticsEvent;
      const name = clampStr(e.name, CAP.name);
      if (!name) continue;
      // * Known dimensions become columns; the whole event is kept in props for anything else.
      const { name: _n, t: _t, ...rest } = e;
      this.#ctx.storage.sql.exec(
        `INSERT INTO events (received, session, client, build, name, arena, mode, phase, reason, result, duration_ms, t, props)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        received,
        session,
        client,
        build,
        name,
        clampStr(e.arena, CAP.str),
        clampStr(e.mode, CAP.str),
        clampStr(e.phase, CAP.str),
        clampStr(e.reason, CAP.str),
        clampStr(e.result, CAP.str),
        asIntOrNull(e.durationMs),
        asIntOrNull(e.t),
        clampStr(rest, CAP.props),
      );
      stored += 1;
    }
    if (stored > 0) {
      this.#ctx.storage.sql.exec(
        `DELETE FROM events WHERE id NOT IN
           (SELECT id FROM events ORDER BY id DESC LIMIT ?)`,
        MAX_ROWS,
      );
    }
    return stored;
  }

  /** Aggregates that answer the design questions without exporting raw rows. */
  #summary(): Record<string, unknown> {
    this.#ensureSchema();
    const sql = this.#ctx.storage.sql;
    const byName = sql.exec(`SELECT name, COUNT(*) AS n FROM events GROUP BY name ORDER BY n DESC`).toArray();
    const sessions = sql.exec(`SELECT COUNT(DISTINCT session) AS n FROM events`).toArray()[0]?.n ?? 0;
    const clients = sql.exec(`SELECT COUNT(DISTINCT client) AS n FROM events WHERE client IS NOT NULL`).toArray()[0]?.n ?? 0;
    const matchesByArena = sql
      .exec(
        `SELECT arena, COUNT(*) AS n, ROUND(AVG(duration_ms)) AS avgDurationMs, ROUND(AVG(kos), 2) AS avgKos
           FROM (SELECT arena, duration_ms, CAST(json_extract(props, '$.kos') AS REAL) AS kos
                   FROM events WHERE name = 'match_ended')
          GROUP BY arena ORDER BY n DESC`,
      )
      .toArray();
    const matchesByMode = sql
      .exec(`SELECT mode, COUNT(*) AS n FROM events WHERE name = 'match_ended' GROUP BY mode ORDER BY n DESC`)
      .toArray();
    const resultSplit = sql
      .exec(`SELECT result, COUNT(*) AS n FROM events WHERE name = 'match_ended' GROUP BY result`)
      .toArray();
    const quitsByPhase = sql
      .exec(`SELECT phase, reason, COUNT(*) AS n FROM events WHERE name = 'player_quit' GROUP BY phase, reason ORDER BY n DESC`)
      .toArray();
    const errorsByContext = sql
      .exec(`SELECT reason AS context, COUNT(*) AS n FROM events WHERE name = 'client_error' GROUP BY reason ORDER BY n DESC`)
      .toArray();
    const window = sql
      .exec(`SELECT MIN(received) AS oldest, MAX(received) AS newest, COUNT(*) AS rows FROM events`)
      .toArray()[0];
    return { window, sessions, clients, byName, matchesByArena, matchesByMode, resultSplit, quitsByPhase, errorsByContext };
  }

  #list(limit: number): Record<string, unknown>[] {
    this.#ensureSchema();
    const n = Math.max(1, Math.min(1000, (limit | 0) || 100));
    return this.#ctx.storage.sql.exec(`SELECT * FROM events ORDER BY id DESC LIMIT ?`, n).toArray();
  }

  #clear(): void {
    this.#ensureSchema();
    this.#ctx.storage.sql.exec(`DELETE FROM events`);
  }

  // Internal-only HTTP surface — reached exclusively from the Worker fetch handler
  // (party/index.ts), which owns auth for the public /api/analytics routes.
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/ingest") {
      try {
        const body = (await request.json()) as AnalyticsBatch;
        this.#ingest(body);
      } catch {
        // Malformed body — drop it rather than 500 the beacon path.
      }
      return new Response(null, { status: 204 });
    }
    if (request.method === "POST" && url.pathname === "/clear") {
      this.#clear();
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/summary") {
      return jsonResponse(this.#summary());
    }
    if (url.pathname === "/list") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const rows = this.#list(limit);
      return jsonResponse({ count: rows.length, events: rows });
    }
    return new Response("not found", { status: 404 });
  }
}
