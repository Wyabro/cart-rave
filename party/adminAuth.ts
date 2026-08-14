// adminAuth.ts — token gate for /api/errors | /api/captures | /api/analytics admin reads.
//
// SEC-TOKEN-1: auth is Authorization: Bearer only — never ?token= (leaks into logs/referrers).
// requireAdminToken(request, expected) → Response | null — null means ok, proceed with the handler.

/**
 * Extract Bearer token from Authorization. Query params are ignored on purpose.
 */
export function bearerToken(request: Request): string | null {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)/i.exec(h);
  if (!m) return null;
  const t = m[1].trim();
  return t.length > 0 ? t : null;
}

/**
 * Constant-time string equality (UTF-8 bytes).
 * Length mismatch still runs a full XOR pass so we don't early-return on the first differing char.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length, 1);
  let diff = aa.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const x = i < aa.length ? aa[i]! : 0;
    const y = i < bb.length ? bb[i]! : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

/**
 * @param expected Worker secret ERROR_LOG_TOKEN (undefined if unset)
 * @returns Response to return immediately, or null if the request is authorized
 */
export function requireAdminToken(
  request: Request,
  expected: string | undefined,
): Response | null {
  if (!expected) {
    return new Response(
      JSON.stringify({
        error:
          "read endpoint disabled — set the ERROR_LOG_TOKEN secret (wrangler secret put ERROR_LOG_TOKEN)",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  const provided = bearerToken(request);
  if (!provided || !timingSafeEqualString(provided, expected)) {
    return new Response("forbidden", { status: 403 });
  }
  return null;
}

/**
 * Last path segment — `/parties/analytics-log/v1/summary` and `https://do/summary`
 * both resolve to `summary`.
 */
export function logRouteTail(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

export function isLogAdminRoute(pathname: string): boolean {
  const tail = logRouteTail(pathname);
  return tail === "list" || tail === "get" || tail === "summary" || tail === "clear";
}

/**
 * Gate public `/parties/<log-do>/...` admin tails. Worker stub fetches use
 * `https://do/list` and stay Worker-gated (SEC-TOKEN-1).
 */
export function denyLogAdminIfConfigured(
  request: Request,
  expected: string | undefined,
): Response | null {
  const path = new URL(request.url).pathname;
  if (!path.includes("/parties/")) return null;
  if (!isLogAdminRoute(path)) return null;
  if (!expected) return null;
  return requireAdminToken(request, expected);
}
