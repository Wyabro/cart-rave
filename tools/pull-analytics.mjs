#!/usr/bin/env node
/**
 * pull-analytics.mjs — fetch prod /api/analytics summary into
 * `.diag-captures/analytics-summary.json` for agents + Command Center.
 *
 * Auth (SEC-TOKEN-1): `Authorization: Bearer <ERROR_LOG_TOKEN>` — never `?token=`
 * (query tokens leak into logs/referrers). Provide the secret via:
 *   - env ERROR_LOG_TOKEN
 *   - or a line `ERROR_LOG_TOKEN=…` in `.env.local` / `.dev.vars` (gitignored)
 *
 * Exit codes (match pull-captures.mjs): 0 ok · 2 missing token · 1 HTTP/other failure.
 *
 * Usage:
 *   npm run analytics:pull
 *   npm run analytics:pull -- --list
 *   npm run analytics:pull -- --limit 50
 *   npm run analytics:pull -- --url https://cart-rave.wyabro.workers.dev
 *   npm run analytics   # alias
 */

import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".diag-captures");
const CACHE_NAME = "analytics-summary.json";
const CACHE_PATH = path.join(OUT_DIR, CACHE_NAME);
const CACHE_TMP = path.join(OUT_DIR, "analytics-summary.tmp.json");
const DEFAULT_URL = "https://cart-rave.wyabro.workers.dev";

/**
 * @param {string[]} argv
 * @returns {{ limit: number, list: boolean, url: string, help: boolean }}
 */
export function parseArgs(argv) {
  const out = { limit: 100, list: false, url: DEFAULT_URL, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Number(argv[++i]) || 100;
    else if (a === "--list") out.list = true;
    else if (a === "--url") out.url = argv[++i] || DEFAULT_URL;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

// * Intentional copy of pull-captures loadToken — extract on a third consumer.
async function loadToken() {
  if (process.env.ERROR_LOG_TOKEN) return process.env.ERROR_LOG_TOKEN.trim();
  for (const rel of [".env.local", ".dev.vars", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!existsSync(p)) continue;
    const text = await readFile(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*ERROR_LOG_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (v) return v;
      }
    }
  }
  return null;
}

/**
 * Cache schema written to disk / read by projectHealth:
 * `{ pulledAt: string, url: string, summary: object }`
 * `summary.window` may be undefined when the DO has zero rows.
 *
 * @param {{ url: string, summary: Record<string, unknown>, pulledAt?: string }} opts
 * @returns {{ pulledAt: string, url: string, summary: Record<string, unknown> }}
 */
export function buildCachePayload({ url, summary, pulledAt }) {
  return {
    pulledAt: pulledAt ?? new Date().toISOString(),
    url: String(url),
    summary: summary && typeof summary === "object" ? summary : {},
  };
}

/**
 * Human-readable summary for stdout. Null-guards `window` (empty DO).
 * @param {Record<string, unknown> | null | undefined} summary
 * @returns {string}
 */
export function formatSummary(summary) {
  const s = summary && typeof summary === "object" ? summary : {};
  const w = s.window && typeof s.window === "object" ? /** @type {Record<string, unknown>} */ (s.window) : null;
  const lines = [];
  if (w) {
    lines.push(
      `window: rows=${w.rows ?? "?"}  oldest=${w.oldest ?? "?"}  newest=${w.newest ?? "?"}`,
    );
  } else {
    lines.push("window: (no data yet — empty DO or zero rows)");
  }
  lines.push(`sessions=${s.sessions ?? 0}  clients=${s.clients ?? 0}`);
  lines.push(formatNamedCounts("byName", s.byName));
  lines.push(formatArenaRows(s.matchesByArena));
  lines.push(formatNamedCounts("matchesByMode", s.matchesByMode, "mode"));
  lines.push(formatNamedCounts("resultSplit", s.resultSplit, "result"));
  lines.push(formatQuitRows(s.quitsByPhase));
  lines.push(formatNamedCounts("errorsByContext", s.errorsByContext, "context"));
  return lines.filter(Boolean).join("\n");
}

/**
 * @param {string} label
 * @param {unknown} rows
 * @param {string} [keyField]
 */
function formatNamedCounts(label, rows, keyField = "name") {
  if (!Array.isArray(rows) || rows.length === 0) return `${label}: (none)`;
  const parts = rows.map((r) => {
    const key = r?.[keyField] ?? r?.name ?? r?.context ?? "?";
    return `${key}=${r?.n ?? 0}`;
  });
  return `${label}: ${parts.join("  ")}`;
}

/** @param {unknown} rows */
function formatArenaRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "matchesByArena: (none)";
  const parts = rows.map((r) => {
    const arena = r?.arena ?? "?";
    return `${arena}:n=${r?.n ?? 0},avgMs=${r?.avgDurationMs ?? "?"},avgKos=${r?.avgKos ?? "?"}`;
  });
  return `matchesByArena: ${parts.join("  ")}`;
}

/** @param {unknown} rows */
function formatQuitRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "quitsByPhase: (none)";
  const parts = rows.map((r) => `${r?.phase ?? "?"}/${r?.reason ?? "?"}=${r?.n ?? 0}`);
  return `quitsByPhase: ${parts.join("  ")}`;
}

/**
 * Fetch summary (or list) from the analytics API.
 * @param {{
 *   url: string,
 *   token: string,
 *   list?: boolean,
 *   limit?: number,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<{ ok: true, data: unknown } | { ok: false, status: number, body: string }>}
 */
export async function pullAnalytics({ url, token, list = false, limit = 100, fetchImpl = fetch }) {
  const base = String(url).replace(/\/$/, "");
  const pathAndQuery = list
    ? `/api/analytics?view=list&limit=${limit}`
    : `/api/analytics`;
  const res = await fetchImpl(`${base}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = typeof res.text === "function" ? await res.text() : "";
    return { ok: false, status: res.status, body };
  }
  const data = await res.json();
  return { ok: true, data };
}

/**
 * Atomic write: tmp then rename.
 * @param {{ pulledAt: string, url: string, summary: Record<string, unknown> }} payload
 * @param {{ outDir?: string }} [opts]
 */
export async function writeAnalyticsCache(payload, opts = {}) {
  const outDir = opts.outDir ?? OUT_DIR;
  const dest = path.join(outDir, CACHE_NAME);
  const tmp = path.join(outDir, "analytics-summary.tmp.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmp, dest);
  return dest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/pull-analytics.mjs [--list] [--limit N] [--url URL]
Needs ERROR_LOG_TOKEN in env or .env.local / .dev.vars
Writes summary cache to .diag-captures/analytics-summary.json
Exit: 0 ok · 2 missing token · 1 HTTP/other failure`);
    process.exit(0);
  }

  const token = await loadToken();
  if (!token) {
    console.error(
      "Missing ERROR_LOG_TOKEN. Set env or add ERROR_LOG_TOKEN=… to .env.local (gitignored).",
    );
    process.exit(2);
  }

  const result = await pullAnalytics({
    url: args.url,
    token,
    list: args.list,
    limit: args.limit,
  });
  if (!result.ok) {
    console.error(`GET /api/analytics failed: ${result.status} ${result.body}`);
    process.exit(1);
  }

  if (args.list) {
    const data = /** @type {{ count?: number, events?: unknown[] }} */ (result.data);
    const events = data.events ?? [];
    console.log(`count=${data.count ?? events.length}`);
    for (const ev of events.slice(0, args.limit)) {
      const row = /** @type {Record<string, unknown>} */ (ev);
      console.log(
        `#${row.id ?? "?"}  ${row.name ?? "?"}  arena=${row.arena ?? "-"}  mode=${row.mode ?? "-"}  result=${row.result ?? "-"}`,
      );
    }
    process.exit(0);
  }

  const summary = /** @type {Record<string, unknown>} */ (result.data);
  const payload = buildCachePayload({ url: args.url, summary });
  const dest = await writeAnalyticsCache(payload);
  console.log(formatSummary(summary));
  console.log(`Wrote ${dest}`);
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
