// logUtil.ts — shared helpers for the log Durable Objects (errorLog / analyticsLog /
// captureLog). Each DO previously carried its own copy-pasted jsonResponse + clamp;
// one drifted (null vs "" for nullish), so both semantics live here explicitly.

/** JSON body + status — the only response shape the log DOs speak. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Truncates arbitrary input to at most `max` chars; null/undefined become "". */
export function clampStr(v: unknown, max: number): string {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) : s;
}

/** Like clampStr but preserves null/undefined as null (analytics rows store SQL NULL). */
export function clampStrOrNull(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) : s;
}
