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

import { MIN_MATCH_DURATION_MS } from "../shared/analyticsConstants.js";
import { ANALYTICS_MAX_PER_WINDOW } from "./constants";
import { type BeaconBucket, UNKNOWN_IP, checkBeaconLimit } from "./beaconLimit";
import { denyLogAdminIfConfigured } from "./adminAuth";
import { clampJsonObject, clampStrOrNull as clampStr, jsonResponse } from "./logUtil";

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

const MAX_DURATION_MS = 30 * 60 * 1000;
const MAX_KOS = 1000;

function clampDurationMs(v: unknown): number | null {
  const n = asIntOrNull(v);
  if (n == null) return null;
  return Math.max(0, Math.min(MAX_DURATION_MS, n));
}

type LogEnv = { ERROR_LOG_TOKEN?: string };

export class AnalyticsLog {
  #ctx: DoState;
  #env: LogEnv;
  #ready = false;
  /** SEC-BEACON-1: per-IP beacon budget defending this DO's ring. */
  readonly #beaconIps = new Map<string, BeaconBucket>();

  constructor(ctx: DoState, env: LogEnv) {
    this.#ctx = ctx;
    this.#env = env;
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

  /**
   * Insert one batch (bounded) and prune the ring buffer back down to MAX_ROWS.
   * @param geo Coarse CF geo from the Worker (country + region / US state). Merged into
   *   props — never stored as columns, never includes IP.
   */
  #ingest(
    batch: AnalyticsBatch,
    geo: { country?: string | null; region?: string | null } = {},
  ): number {
    this.#ensureSchema();
    const events = Array.isArray(batch.events) ? batch.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
    const received = Date.now();
    const session = clampStr(batch.sessionId, CAP.session);
    const client = clampStr(batch.clientId, CAP.client);
    const build = clampStr(batch.build, CAP.build);
    const country = clampStr(geo.country, 2);
    const region = clampStr(geo.region, 6);

    let stored = 0;
    for (const raw of events) {
      const e = (raw ?? {}) as AnalyticsEvent;
      const name = clampStr(e.name, CAP.name);
      if (!name) continue;
      // * Known dimensions become columns; the whole event is kept in props for anything else.
      const { name: _n, t: _t, ...rest } = e;
      // * Server geo wins over any client-supplied country/region (do not trust the browser).
      const propsObj: Record<string, unknown> = { ...rest };
      if (country) propsObj.country = country;
      else delete propsObj.country;
      if (region) propsObj.region = region;
      else delete propsObj.region;
      // * Returning = this clientId already has a prior session_start in the ring.
      if (name === "session_start" && client) {
        const prior =
          this.#ctx.storage.sql
            .exec(
              `SELECT COUNT(*) AS n FROM events WHERE client = ? AND name = 'session_start'`,
              client,
            )
            .toArray()[0]?.n ?? 0;
        propsObj.returning = Number(prior) > 0 ? 1 : 0;
      }
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
        clampDurationMs(e.durationMs),
        asIntOrNull(e.t),
        clampJsonObject(
          {
            ...propsObj,
            ...(typeof propsObj.kos === "number" && Number.isFinite(propsObj.kos)
              ? { kos: Math.max(0, Math.min(MAX_KOS, Math.round(propsObj.kos))) }
              : {}),
          },
          CAP.props,
        ),
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

  /**
   * Aggregates that answer the design questions without exporting raw rows.
   *
   * ANLX-BULK-1 P-A: byName + window stay RAW (event volume / ring size). Product match
   * metrics (matchesByArena / matchesByMode / resultSplit) only count match_ended rows
   * with duration_ms >= MIN_MATCH_DURATION_MS and non-null duration — null and sub-floor
   * ends stay in the list for forensics but do not poison avgs/splits. Dirty byName after
   * deploy is expected until the ring ages; it is not an L1 failure.
   */
  #summary(): Record<string, unknown> {
    this.#ensureSchema();
    const sql = this.#ctx.storage.sql;
    // * Product match_ended filter (shared/analyticsConstants.js). Bound once so the three
    // * queries stay in lockstep; byName deliberately does NOT use this.
    const productEnded = `name = 'match_ended' AND duration_ms IS NOT NULL AND duration_ms >= ${MIN_MATCH_DURATION_MS}`;
    const byName = sql.exec(`SELECT name, COUNT(*) AS n FROM events GROUP BY name ORDER BY n DESC`).toArray();
    const sessions = sql.exec(`SELECT COUNT(DISTINCT session) AS n FROM events`).toArray()[0]?.n ?? 0;
    const clients = sql.exec(`SELECT COUNT(DISTINCT client) AS n FROM events WHERE client IS NOT NULL`).toArray()[0]?.n ?? 0;
    const matchesByArena = sql
      .exec(
        `SELECT arena, COUNT(*) AS n, ROUND(AVG(duration_ms)) AS avgDurationMs, ROUND(AVG(kos), 2) AS avgKos
           FROM (SELECT arena, duration_ms, CAST(json_extract(props, '$.kos') AS REAL) AS kos
                   FROM events WHERE ${productEnded})
          GROUP BY arena ORDER BY n DESC`,
      )
      .toArray();
    const matchesByMode = sql
      .exec(
        `SELECT mode, COUNT(*) AS n FROM events WHERE ${productEnded} GROUP BY mode ORDER BY n DESC`,
      )
      .toArray();
    const resultSplit = sql
      .exec(`SELECT result, COUNT(*) AS n FROM events WHERE ${productEnded} GROUP BY result`)
      .toArray();
    const quitsByPhase = sql
      .exec(`SELECT phase, reason, COUNT(*) AS n FROM events WHERE name = 'player_quit' GROUP BY phase, reason ORDER BY n DESC`)
      .toArray();
    const errorsByContext = sql
      .exec(`SELECT reason AS context, COUNT(*) AS n FROM events WHERE name = 'client_error' GROUP BY reason ORDER BY n DESC`)
      .toArray();
    // * Wave A: geo + session length rollups from props / session_end (old rows lack geo).
    const byCountry = sql
      .exec(
        `SELECT json_extract(props, '$.country') AS country, COUNT(*) AS n
           FROM events
          WHERE name = 'session_start' AND json_extract(props, '$.country') IS NOT NULL
          GROUP BY country ORDER BY n DESC`,
      )
      .toArray();
    const byRegion = sql
      .exec(
        `SELECT json_extract(props, '$.country') AS country,
                json_extract(props, '$.region') AS region,
                COUNT(*) AS n
           FROM events
          WHERE name = 'session_start' AND json_extract(props, '$.region') IS NOT NULL
          GROUP BY country, region ORDER BY n DESC`,
      )
      .toArray();
    const avgSessionMs =
      sql
        .exec(
          `SELECT ROUND(AVG(duration_ms)) AS avgSessionMs
             FROM events
            WHERE name = 'session_end' AND duration_ms IS NOT NULL AND duration_ms > 0`,
        )
        .toArray()[0]?.avgSessionMs ?? null;
    const returningRow = sql
      .exec(
        `SELECT
            SUM(CASE WHEN CAST(json_extract(props, '$.returning') AS INTEGER) = 1 THEN 1 ELSE 0 END) AS ret_n,
            SUM(CASE WHEN CAST(json_extract(props, '$.returning') AS INTEGER) = 0 THEN 1 ELSE 0 END) AS first_n
           FROM events WHERE name = 'session_start'`,
      )
      .toArray()[0];
    const returningSessions = {
      returning: Number(returningRow?.ret_n ?? 0),
      first: Number(returningRow?.first_n ?? 0),
    };
    const window = sql
      .exec(`SELECT MIN(received) AS oldest, MAX(received) AS newest, COUNT(*) AS rows FROM events`)
      .toArray()[0];
    return {
      window,
      sessions,
      clients,
      byName,
      matchesByArena,
      matchesByMode,
      resultSplit,
      quitsByPhase,
      errorsByContext,
      byCountry,
      byRegion,
      avgSessionMs,
      returningSessions,
    };
  }

  #list(limit: number): Record<string, unknown>[] {
    this.#ensureSchema();
    const n = Math.max(1, Math.min(1000, (limit | 0) || 100));
    return this.#ctx.storage.sql.exec(`SELECT * FROM events ORDER BY id DESC LIMIT ?`, n).toArray();
  }

  #clear(): void {
    this.#ensureSchema();
    this.#ctx.storage.sql.exec(`DELETE FROM events`);
    // * Resetting the ring resets its guard too — also the lever party-do tests
    // * use to isolate, since the "v1" singleton outlives any one test.
    this.#beaconIps.clear();
  }

  // Internal-only HTTP surface — reached exclusively from the Worker fetch handler
  // (party/index.ts), which owns auth for the public /api/analytics routes.
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const denied = denyLogAdminIfConfigured(request, this.#env.ERROR_LOG_TOKEN);
    if (denied) return denied;
    if (request.method === "POST" && url.pathname === "/ingest") {
      // * SEC-BEACON-1: cap before the INSERT so a flood can't prune the ring.
      // * CAPTURE-RING-LIMIT-1: analytics POSTs run their own tighter per-IP budget
      // * (analytics events feed product aggregates; captures/errors just need depth).
      const ip = request.headers.get("cf-connecting-ip") || UNKNOWN_IP;
      if (!checkBeaconLimit(this.#beaconIps, ip, Date.now(), ANALYTICS_MAX_PER_WINDOW)) {
        return new Response(null, { status: 429 });
      }
      try {
        const body = (await request.json()) as AnalyticsBatch;
        this.#ingest(body, {
          country: request.headers.get("x-cc-country"),
          region: request.headers.get("x-cc-region"),
        });
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
