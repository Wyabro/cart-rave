#!/usr/bin/env node
/**
 * pull-captures.mjs — download F8 capture bundles from prod /api/captures into
 * `.diag-captures/playtest/` so the agent can read them without email hops.
 *
 * Auth (SEC-TOKEN-1): `Authorization: Bearer <ERROR_LOG_TOKEN>` — never `?token=`
 * (query tokens leak into logs/referrers). Provide the secret via:
 *   - env ERROR_LOG_TOKEN
 *   - or a line `ERROR_LOG_TOKEN=…` in `.env.local` / `.dev.vars` (gitignored)
 *
 * Usage:
 *   npm run captures:pull
 *   npm run captures:pull -- --limit 20
 *   npm run captures:pull -- --id 42
 *   npm run captures:pull -- --list
 *   npm run captures:pull -- --url https://cart-rave.wyabro.workers.dev
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".diag-captures", "playtest");
const DEFAULT_URL = "https://cart-rave.wyabro.workers.dev";

function parseArgs(argv) {
  const out = { limit: 20, id: null, list: false, url: DEFAULT_URL, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Number(argv[++i]) || 20;
    else if (a === "--id") out.id = Number(argv[++i]) || null;
    else if (a === "--list") out.list = true;
    else if (a === "--url") out.url = argv[++i] || DEFAULT_URL;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/pull-captures.mjs [--list] [--limit N] [--id N] [--url URL]
Needs ERROR_LOG_TOKEN in env or .env.local / .dev.vars
Writes full bundles to .diag-captures/playtest/`);
    process.exit(0);
  }

  const token = await loadToken();
  if (!token) {
    console.error(
      "Missing ERROR_LOG_TOKEN. Set env or add ERROR_LOG_TOKEN=… to .env.local (gitignored).",
    );
    process.exit(2);
  }

  const base = args.url.replace(/\/$/, "");
  const authHeaders = { Authorization: `Bearer ${token}` };

  if (args.id) {
    const res = await fetch(`${base}/api/captures?id=${encodeURIComponent(args.id)}`, {
      headers: authHeaders,
    });
    if (!res.ok) {
      console.error(`GET id=${args.id} failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const row = await res.json();
    await writeOne(row);
    console.log(`Wrote id=${row.id} → ${OUT_DIR}`);
    process.exit(0);
  }

  const listRes = await fetch(`${base}/api/captures?limit=${args.limit}`, {
    headers: authHeaders,
  });
  if (!listRes.ok) {
    console.error(`LIST failed: ${listRes.status} ${await listRes.text()}`);
    process.exit(1);
  }
  const list = await listRes.json();
  const rows = list.captures || [];
  if (args.list || rows.length === 0) {
    console.log(`count=${list.count ?? rows.length}`);
    for (const r of rows) {
      const when = r.received ? new Date(r.received).toISOString() : "?";
      console.log(
        `#${r.id}  ${when}  ${r.label || "-"}  phase=${r.phase}  host=${r.is_host}  tier=${r.quality_tier}  ${r.bytes}B  build=${r.build || "?"}`,
      );
    }
    if (args.list) process.exit(0);
    if (rows.length === 0) process.exit(0);
  }

  await mkdir(OUT_DIR, { recursive: true });
  let wrote = 0;
  for (const meta of rows) {
    const res = await fetch(`${base}/api/captures?id=${meta.id}`, { headers: authHeaders });
    if (!res.ok) {
      console.warn(`skip id=${meta.id}: ${res.status}`);
      continue;
    }
    const row = await res.json();
    await writeOne(row);
    wrote += 1;
  }
  console.log(`Pulled ${wrote} capture(s) → ${OUT_DIR}`);
}

/**
 * @param {Record<string, unknown>} row
 */
async function writeOne(row) {
  await mkdir(OUT_DIR, { recursive: true });
  const id = row.id ?? "x";
  const label = String(row.label || "capture")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 60);
  const name = `cap-${id}-${label}.json`;
  const dest = path.join(OUT_DIR, name);
  // * Prefer the original bundle JSON if body is a stringified bundle.
  let out = row.body;
  if (typeof out === "string") {
    try {
      out = JSON.stringify(JSON.parse(out), null, 2);
    } catch {
      // keep raw
    }
  } else {
    out = JSON.stringify(row, null, 2);
  }
  await writeFile(dest, out, "utf8");
  // * Also write a tiny sidecar with server metadata for triage.
  const meta = {
    id: row.id,
    received: row.received,
    client_ts: row.client_ts,
    label: row.label,
    phase: row.phase,
    build: row.build,
    is_host: row.is_host,
    quality_tier: row.quality_tier,
    gpu: row.gpu,
    bytes: row.bytes,
    file: name,
  };
  await writeFile(
    path.join(OUT_DIR, `cap-${id}-meta.json`),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
