// captureLog.ts — Durable Object that persists F8 / ?diag capture bundles in SQLite.
//
// Sibling of errorLog + analyticsLog. Playtest machines both POST on F8 so the Intel
// box no longer needs email-a-JSON-to-myself; the agent pulls with tools/pull-captures.mjs
// (token-gated GET, same ERROR_LOG_TOKEN as /api/errors).
//
// Singleton instance "v1". Ring-buffered. Internal-only HTTP surface — party/index.ts
// owns public auth.

import { clampStr as clamp, jsonResponse } from "./logUtil";

/** Ring-buffer cap — full bundles are ~5–40 KB; keep the last N. */
const MAX_ROWS = 80;

/** Hard ceiling on stored JSON body (chars). Hostile / runaway clients get dropped. */
const MAX_BODY_CHARS = 350_000;

/** Metadata field caps. */
const CAP = { label: 80, phase: 40, build: 80, gpu: 160, tier: 16, ua: 300, url: 600 };

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

type StorePayload = {
  label?: unknown;
  phase?: unknown;
  build?: unknown;
  isHost?: unknown;
  qualityTier?: unknown;
  gpu?: unknown;
  body?: unknown;
  userAgent?: unknown;
  url?: unknown;
  clientTs?: unknown;
};


export class CaptureLog {
  #ctx: DoState;
  #ready = false;

  constructor(ctx: DoState, _env: unknown) {
    this.#ctx = ctx;
  }

  #ensureSchema(): void {
    if (this.#ready) return;
    this.#ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS captures (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         received INTEGER,
         client_ts INTEGER,
         label TEXT,
         phase TEXT,
         build TEXT,
         is_host INTEGER,
         quality_tier TEXT,
         gpu TEXT,
         ua TEXT,
         url TEXT,
         body TEXT,
         bytes INTEGER
       )`,
    );
    this.#ready = true;
  }

  /** Insert one capture and prune the ring. Returns the new row id, or 0 on reject. */
  #store(p: StorePayload): number {
    this.#ensureSchema();
    const body =
      typeof p.body === "string"
        ? p.body
        : p.body != null
          ? JSON.stringify(p.body)
          : "";
    if (!body || body.length > MAX_BODY_CHARS) return 0;

    const clientTs = typeof p.clientTs === "number" && Number.isFinite(p.clientTs)
      ? Math.round(p.clientTs)
      : Date.now();
    const isHost =
      p.isHost === true || p.isHost === 1 || p.isHost === "true" || p.isHost === "1"
        ? 1
        : 0;

    this.#ctx.storage.sql.exec(
      `INSERT INTO captures
         (received, client_ts, label, phase, build, is_host, quality_tier, gpu, ua, url, body, bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Date.now(),
      clientTs,
      clamp(p.label, CAP.label),
      clamp(p.phase, CAP.phase),
      clamp(p.build, CAP.build),
      isHost,
      clamp(p.qualityTier, CAP.tier),
      clamp(p.gpu, CAP.gpu),
      clamp(p.userAgent, CAP.ua),
      clamp(p.url, CAP.url),
      body,
      body.length,
    );

    this.#ctx.storage.sql.exec(
      `DELETE FROM captures WHERE id NOT IN
         (SELECT id FROM captures ORDER BY id DESC LIMIT ?)`,
      MAX_ROWS,
    );

    const rows = this.#ctx.storage.sql
      .exec(`SELECT id FROM captures ORDER BY id DESC LIMIT 1`)
      .toArray();
    const id = rows[0]?.id;
    return typeof id === "number" ? id : Number(id) || 0;
  }

  #list(limit: number): Record<string, unknown>[] {
    this.#ensureSchema();
    const n = Math.max(1, Math.min(200, (limit | 0) || 40));
    return this.#ctx.storage.sql
      .exec(
        `SELECT id, received, client_ts, label, phase, build, is_host, quality_tier, gpu, ua, url, bytes
         FROM captures ORDER BY id DESC LIMIT ?`,
        n,
      )
      .toArray();
  }

  #get(id: number): Record<string, unknown> | null {
    this.#ensureSchema();
    if (!(id > 0)) return null;
    const rows = this.#ctx.storage.sql
      .exec(`SELECT * FROM captures WHERE id = ? LIMIT 1`, id)
      .toArray();
    return rows[0] ?? null;
  }

  #clear(): void {
    this.#ensureSchema();
    this.#ctx.storage.sql.exec(`DELETE FROM captures`);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/store") {
      try {
        const body = (await request.json()) as StorePayload;
        const id = this.#store(body);
        if (!id) return jsonResponse({ ok: false, error: "rejected" }, 400);
        return jsonResponse({ ok: true, id });
      } catch {
        return jsonResponse({ ok: false, error: "bad_json" }, 400);
      }
    }
    if (request.method === "POST" && url.pathname === "/clear") {
      this.#clear();
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/list") {
      const limit = Number(url.searchParams.get("limit") ?? "40");
      const rows = this.#list(limit);
      return jsonResponse({ count: rows.length, captures: rows });
    }
    if (url.pathname === "/get") {
      const id = Number(url.searchParams.get("id") ?? "0");
      const row = this.#get(id);
      if (!row) return jsonResponse({ error: "not_found" }, 404);
      return jsonResponse(row);
    }
    return new Response("not found", { status: 404 });
  }
}
