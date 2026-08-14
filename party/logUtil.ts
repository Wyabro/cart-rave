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

const PROPS_PRIORITY = ["kos", "country", "region", "returning"] as const;

/**
 * JSON-encode an object in at most `max` chars. Never slices mid-string.
 * Keeps priority keys first.
 */
export function clampJsonObject(obj: Record<string, unknown>, max: number): string {
  const raw = JSON.stringify(obj);
  if (raw.length <= max) return raw;
  const kept: Record<string, unknown> = {};
  for (const k of PROPS_PRIORITY) {
    if (k in obj) kept[k] = obj[k];
  }
  let s = JSON.stringify(kept);
  if (s.length > max) {
    for (const k of [...Object.keys(kept)].reverse()) {
      delete kept[k];
      s = JSON.stringify(kept);
      if (s.length <= max) return s;
    }
    return "{}";
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k in kept) continue;
    const next = { ...kept, [k]: v };
    const ns = JSON.stringify(next);
    if (ns.length > max) continue;
    kept[k] = v;
    s = ns;
  }
  return s;
}
