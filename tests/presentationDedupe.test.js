// presentationDedupe.test.js — NET-PRES-1 (seq, i) eid stamp + seen-set
import { describe, expect, it } from "vitest";
import { stampTailEventIds, markPresentationEid } from "../src/netcode/presentationDedupe.js";

describe("stampTailEventIds", () => {
  it("stamps f{seq}.{i} / c{seq}.{i} in place", () => {
    const falls = [{ slotId: 1 }, { slotId: 2 }];
    const collisions = [{ slotA: 0, slotB: 1 }, { slotA: 2, slotB: 3 }];
    stampTailEventIds(42, falls, collisions);
    expect(falls[0].eid).toBe("f42.0");
    expect(falls[1].eid).toBe("f42.1");
    expect(collisions[0].eid).toBe("c42.0");
    expect(collisions[1].eid).toBe("c42.1");
  });

  it("no-ops on non-finite seq or non-arrays", () => {
    const falls = [{ slotId: 0 }];
    stampTailEventIds(NaN, falls, []);
    expect(falls[0].eid).toBeUndefined();
    stampTailEventIds(1, null, undefined);
  });

  it("skips null holes in the arrays", () => {
    const falls = [null, { slotId: 1 }];
    stampTailEventIds(3, falls, null);
    expect(falls[1].eid).toBe("f3.1");
  });
});

describe("markPresentationEid", () => {
  it("returns false on first sight and true on duplicate", () => {
    const seen = new Map();
    expect(markPresentationEid(seen, "f10.0", 1000)).toBe(false);
    expect(markPresentationEid(seen, "f10.0", 1001)).toBe(true);
    expect(markPresentationEid(seen, "f10.1", 1002)).toBe(false);
  });

  it("treats missing eid as not-a-dup (legacy fallback path)", () => {
    const seen = new Map();
    expect(markPresentationEid(seen, undefined, 1000)).toBe(false);
    expect(markPresentationEid(seen, "", 1000)).toBe(false);
    expect(markPresentationEid(seen, 12, 1000)).toBe(false);
    expect(seen.size).toBe(0);
  });

  it("prunes stale entries when over maxSize", () => {
    const seen = new Map();
    markPresentationEid(seen, "a", 0, { maxSize: 2, ttlMs: 100 });
    markPresentationEid(seen, "b", 50, { maxSize: 2, ttlMs: 100 });
    // * Third insert triggers prune; "a" is past ttl relative to now=200
    markPresentationEid(seen, "c", 200, { maxSize: 2, ttlMs: 100 });
    expect(seen.has("a")).toBe(false);
    expect(seen.has("c")).toBe(true);
  });
});
