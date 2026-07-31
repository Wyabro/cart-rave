// Beacon harness helpers for the SEC-BEACON-1 party-do tests.
//
// Sibling of wsClient.js, and it exists for the same reason: the
// `cloudflare:workers` import lives in a helper, not in the .test.js file.
// POSTs go through the real Worker fetch entry; readback goes straight to the
// log DO's internal /list, because GET /api/errors is gated on the
// ERROR_LOG_TOKEN secret, which CI does not have.

import { env, exports } from "cloudflare:workers";

const LOG_BINDINGS = ["ERROR_LOG", "CAPTURE_LOG", "ANALYTICS_LOG"];

/** Singleton "v1" stub for one log DO binding. */
export function logStub(binding) {
  const ns = env[binding];
  return ns.get(ns.idFromName("v1"));
}

/**
 * Reset every log DO — SQLite ring AND the in-memory beacon limiter, which
 * /clear resets together. Required in beforeEach: the "v1" singletons outlive
 * any one test and isolatedStorage does not reach instance memory.
 */
export async function clearAllLogs() {
  for (const binding of LOG_BINDINGS) {
    await logStub(binding).fetch("https://do/clear", { method: "POST" });
  }
}

/**
 * POST a beacon through the Worker.
 * @param {string} path e.g. "/api/log-error"
 * @param {unknown} body JSON-serializable payload.
 * @param {string|null} ip cf-connecting-ip, or null to omit it entirely.
 */
export function postBeacon(path, body, ip) {
  const headers = { "content-type": "application/json" };
  if (ip) headers["cf-connecting-ip"] = ip;
  return exports.default.fetch(`http://example.com${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Send an arbitrary request through the Worker — SEC-ROUTE-1 route-matching tests
 * need GETs and odd paths that `postBeacon` does not cover. Same reason this lives
 * here rather than in the .test.js: the `cloudflare:workers` import must stay out of
 * test files or knip reads it as an unlisted `cloudflare` dependency.
 *
 * @param {string} path Path + optional query, e.g. "/api/errorsfoo".
 * @param {RequestInit} [init]
 */
export function requestPath(path, init) {
  return exports.default.fetch(`http://example.com${path}`, init);
}

/**
 * Read rows back from a log DO's internal /list.
 * @returns {Promise<{ count: number, rows: Record<string, unknown>[] }>}
 */
export async function listFrom(binding, key, limit = 1000) {
  const res = await logStub(binding).fetch(`https://do/list?limit=${limit}`);
  const json = await res.json();
  return { count: json.count, rows: json[key] };
}
