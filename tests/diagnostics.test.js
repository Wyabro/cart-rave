// @vitest-environment happy-dom
// diagnostics.test.js — the __ccDiag core: zero-cost when inactive, probe registry, and the
// bounded event ring buffer. Deterministic (no browser, no rAF) — the module is a pure hub.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  installDiagnostics,
  registerDiagProbe,
  recordDiagEvent,
  isDiagActive,
  diagUrlFlags,
  __resetDiagnosticsForTest,
} from "../src/utils/diagnostics.js";

// * Auto-capture now POSTs to /api/captures (ROUND-WEDGE-1). happy-dom ships a real fetch,
// * so without this every auto-capture test would open a live socket to the dev-server port
// * and fail noisily when nothing is listening. Stub globally; the upload describe below
// * replaces this with a recording version.
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, id: 1 }) });
  __resetDiagnosticsForTest();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("diagnostics — inactive (no ?diag)", () => {
  it("is inert before install: no events, no probes, no window handle", () => {
    expect(isDiagActive()).toBe(false);
    expect(recordDiagEvent("round", "phase", { to: "running" })).toBe(0);
    registerDiagProbe("round", () => ({ phase: "running" }));
    expect(window.__ccDiag).toBeUndefined();
    expect(window.__ccDiagActive).toBeUndefined();
  });
});

describe("diagnostics — active (?diag)", () => {
  beforeEach(() => {
    installDiagnostics({ flags: { enabled: true } });
  });

  it("installs the read-only hub on window", () => {
    expect(isDiagActive()).toBe(true);
    expect(window.__ccDiagActive).toBe(true);
    expect(window.__ccDiag.version).toBe(1);
    expect(window.__ccDiag.active).toBe(true);
    expect(window.__ccDiag.control).toBeNull();
  });

  it("records events with a monotonic seq and channel/type", () => {
    const s1 = recordDiagEvent("round", "phase", { from: "lobby", to: "countdown" });
    const s2 = recordDiagEvent("score", "change", { slot: 0, delta: 1 });
    expect(s2).toBe(s1 + 1);
    const events = window.__ccDiag.events();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ seq: s1, ch: "round", type: "phase", to: "countdown" });
    expect(events[1]).toMatchObject({ ch: "score", type: "change", slot: 0, delta: 1 });
    expect(typeof events[0].t).toBe("number");
  });

  it("events(sinceSeq) returns only newer records", () => {
    recordDiagEvent("a", "1");
    const cursor = window.__ccDiag.tail;
    recordDiagEvent("b", "2");
    recordDiagEvent("b", "3");
    const delta = window.__ccDiag.events(cursor);
    expect(delta.map((e) => e.ch)).toEqual(["b", "b"]);
  });

  it("bounds the ring buffer, dropping the oldest first", () => {
    for (let i = 0; i < 600; i += 1) recordDiagEvent("spam", String(i), { i });
    const events = window.__ccDiag.events();
    expect(events.length).toBe(512);
    // oldest surviving event is the (600-512)=88th, and seq keeps climbing.
    expect(events[0].i).toBe(600 - 512);
    expect(events[events.length - 1].i).toBe(599);
  });

  // * ROUND-WEDGE-1 / cap-217: 171 identical asserts at ~40ms filled a FIFO ring and evicted
  // * every other channel, so the one session that reproduced the storm carried no boot
  // * timeline, no perf spans and no warmupSettle. A storm must not destroy its own context.
  describe("per-channel floor under a storm", () => {
    // * Flooding the `assert` channel also SCHEDULES an auto-capture (setTimeout 0). Left
    // * pending, it fires during the next test — after beforeEach has reinstalled the hub —
    // * and pollutes that test's captures(). Drain inside our own test instead.
    const settleCaptures = () => new Promise((r) => setTimeout(r, 0));

    it("keeps quiet channels alive while one channel floods the ring", async () => {
      recordDiagEvent("boot", "start", { marker: "boot" });
      recordDiagEvent("round", "phase", { marker: "round" });
      recordDiagEvent("perf", "longframe", { marker: "perf" });

      // * Far more than the 512-slot ring, all on one channel — the cap-217 shape.
      for (let i = 0; i < 900; i += 1) recordDiagEvent("assert", "phase-transition", { i });

      const evs = window.__ccDiag.events();
      expect(evs).toHaveLength(512);
      // * Under plain FIFO all three of these would be long gone.
      expect(evs.filter((e) => e.ch === "boot")).toHaveLength(1);
      expect(evs.filter((e) => e.ch === "round")).toHaveLength(1);
      expect(evs.filter((e) => e.ch === "perf")).toHaveLength(1);
      // * ...and the storm still owns essentially the whole ring, so recent asserts survive.
      expect(evs.filter((e) => e.ch === "assert").length).toBeGreaterThan(500);
      expect(evs[evs.length - 1].i).toBe(899);
      await settleCaptures();
    });

    it("evicts the loudest channel, not whichever event happens to be oldest", async () => {
      // * 400 quiet events FIRST, so under FIFO they are exactly the ones that would die.
      for (let i = 0; i < 400; i += 1) recordDiagEvent("round", "phase", { i });
      for (let i = 0; i < 400; i += 1) recordDiagEvent("assert", "phase-transition", { i });

      const evs = window.__ccDiag.events();
      expect(evs).toHaveLength(512);
      const round = evs.filter((e) => e.ch === "round").length;
      const assert = evs.filter((e) => e.ch === "assert").length;
      // * Parity, not annihilation: 800 events into 512 slots costs both channels roughly
      // * equally once the loud one is the largest.
      expect(round).toBeGreaterThan(200);
      expect(assert).toBeGreaterThan(200);
      expect(round + assert).toBe(512);
      await settleCaptures();
    });
  });

  it("snapshot() runs all probes; snapshot(ns) runs one", () => {
    registerDiagProbe("round", () => ({ phase: "running" }));
    registerDiagProbe("score", () => ({ scores: { 0: 3 } }));
    const all = window.__ccDiag.snapshot();
    expect(all.round).toEqual({ phase: "running" });
    expect(all.score).toEqual({ scores: { 0: 3 } });
    expect(window.__ccDiag.snapshot("round")).toEqual({ phase: "running" });
    expect(window.__ccDiag.snapshot("missing")).toBeNull();
    expect(window.__ccDiag.probes().sort()).toEqual(["round", "score"]);
  });

  it("isolates a throwing probe as { error } instead of breaking the read", () => {
    registerDiagProbe("ok", () => ({ v: 1 }));
    registerDiagProbe("boom", () => {
      throw new Error("nope");
    });
    const all = window.__ccDiag.snapshot();
    expect(all.ok).toEqual({ v: 1 });
    expect(all.boom).toEqual({ error: "nope" });
  });

  it("attaches DEV-only control levers when provided", () => {
    __resetDiagnosticsForTest();
    const grantKos = () => {};
    installDiagnostics({ control: { grantKos } });
    expect(window.__ccDiag.control.grantKos).toBe(grantKos);
  });

  describe("captureBundle", () => {
    it("assembles a serializable bundle from probes + events", () => {
      registerDiagProbe("round", () => ({ phase: "podium", winnerSlotIndex: 1 }));
      registerDiagProbe("runtime", () => ({ userAgent: "test-ua", qualityTier: "high" }));
      recordDiagEvent("round", "phase", { from: "running", to: "podium" });
      recordDiagEvent("ko", "kill", { victim: 0, attacker: 1 });

      const bundle = window.__ccDiag.captureBundle({ scenario: "roundflow", reason: "unit" });
      expect(bundle.bundleVersion).toBe(2);
      // vite `define` applies to vitest too, so the build stamp is present here; tolerate
      // absence (tools importing the module without the define get null).
      expect(bundle.build === null || typeof bundle.build.sha === "string").toBe(true);
      expect(bundle.scenario).toBe("roundflow");
      expect(bundle.reason).toBe("unit");
      expect(bundle.phase).toBe("podium"); // pulled from the round probe snapshot
      expect(bundle.seed).toBeNull(); // no gameplay RNG seed exists to record
      expect(bundle.events).toHaveLength(2);
      expect(bundle.eventCounts).toEqual({ round: 1, ko: 1 });
      expect(bundle.snapshot.round).toEqual({ phase: "podium", winnerSlotIndex: 1 });
      expect(bundle.snapshot.runtime).toEqual({ userAgent: "test-ua", qualityTier: "high" });
      // The whole bundle must round-trip through JSON (it ships to disk / clipboard).
      expect(() => JSON.stringify(bundle)).not.toThrow();
    });

    it("survives a throwing probe (phase falls back, no throw)", () => {
      registerDiagProbe("round", () => {
        throw new Error("boom");
      });
      const bundle = window.__ccDiag.captureBundle({ scenario: "x" });
      expect(bundle.phase).toBeNull(); // degraded round probe → { error }, so no phase
      expect(bundle.snapshot.round).toEqual({ error: "boom" });
    });

    it("defaults scenario/reason to null when omitted", () => {
      const bundle = window.__ccDiag.captureBundle();
      expect(bundle.scenario).toBeNull();
      expect(bundle.reason).toBeNull();
      expect(Array.isArray(bundle.events)).toBe(true);
    });
  });

  describe("auto-capture (error/assert events)", () => {
    const settle = () => new Promise((r) => setTimeout(r, 0));

    it("assembles one bundle a tick after an error event lands", async () => {
      registerDiagProbe("round", () => ({ phase: "running" }));
      recordDiagEvent("error", "fatal", { message: "boom" });
      expect(window.__ccDiag.captures()).toHaveLength(0); // deferred, not synchronous
      await settle();
      const captures = window.__ccDiag.captures();
      expect(captures).toHaveLength(1);
      expect(captures[0].scenario).toBe("auto");
      expect(captures[0].reason).toBe("error/fatal");
      expect(captures[0].snapshot.round).toEqual({ phase: "running" });
    });

    it("captures on assert events too, but not on ordinary channels", async () => {
      recordDiagEvent("round", "phase", { from: "lobby", to: "countdown" });
      recordDiagEvent("assert", "phase-transition", { from: "lobby", to: "podium" });
      await settle();
      const captures = window.__ccDiag.captures();
      expect(captures).toHaveLength(1);
      expect(captures[0].reason).toBe("assert/phase-transition");
    });

    it("debounces an error burst into a single capture", async () => {
      for (let i = 0; i < 10; i += 1) recordDiagEvent("error", "step", { i });
      await settle();
      expect(window.__ccDiag.captures()).toHaveLength(1);
      // the bundle still carries the whole burst in its event log
      expect(window.__ccDiag.captures()[0].events.filter((e) => e.ch === "error")).toHaveLength(10);
    });

    it("never captures when the hub is inactive", async () => {
      __resetDiagnosticsForTest();
      recordDiagEvent("error", "fatal", { message: "boom" });
      await settle();
      expect(window.__ccDiag).toBeUndefined();
    });
  });

  // * ROUND-WEDGE-1: cap-217 only exists because a human pressed F8. Bundles assembled
  // * automatically were stranded in memory and lost with the tab, so the one session that
  // * reproduced the podium⇄running storm produced the least usable evidence.
  describe("auto-capture upload", () => {
    /** The upload runs behind a dynamic import + two .then hops — drain several turns. */
    const flush = async () => {
      for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
    };
    /** @type {Array<{url: string, envelope: any}>} */
    let posts = [];

    beforeEach(async () => {
      globalThis.fetch = async (url, init) => {
        posts.push({ url: String(url), envelope: JSON.parse(String(init?.body ?? "{}")) });
        return { ok: true, json: async () => ({ ok: true, id: 217 }) };
      };
      // * Uploads are deliberately fire-and-forget, so a chain started by an earlier test
      // * can still be mid-flight when this one begins and would land in our recording.
      // * Drain first, THEN clear — order matters.
      await flush();
      posts = [];
    });

    /**
     * Uploads are fire-and-forget by design, so a chain from another test can land in this
     * one's recording at any moment. Asserting on `posts.length` is therefore racy under
     * load (it flaked in the full suite while passing in isolation). Give every test its
     * own event `type` and select only its own upload — deterministic regardless of timing.
     * @param {string} type
     */
    const postsFor = (type) =>
      posts.filter((p) => {
        try {
          return JSON.parse(p.envelope.body)?.reason === `assert/${type}`;
        } catch {
          return false;
        }
      });

    it("posts an auto-captured bundle to the same endpoint F8 uses", async () => {
      registerDiagProbe("round", () => ({ phase: "podium" }));
      recordDiagEvent("assert", "upload-probe", { from: "podium", to: "running" });
      await flush();
      const mine = postsFor("upload-probe");
      expect(mine).toHaveLength(1);
      expect(mine[0].url).toContain("/api/captures");
      // * The bundle travels as a JSON string in `body` — same envelope shape as F8.
      const sent = JSON.parse(mine[0].envelope.body);
      expect(sent.scenario).toBe("auto");
      expect(sent.snapshot.round).toEqual({ phase: "podium" });
    });

    it("labels the upload so a pulled capture shows nobody pressed a key for it", async () => {
      recordDiagEvent("assert", "label-probe", { from: "podium", to: "running" });
      await flush();
      expect(postsFor("label-probe")[0]?.envelope.label).toMatch(/^auto-assert-/);
    });

    it("uploads nothing on ordinary channels — only error/assert auto-capture", async () => {
      recordDiagEvent("round", "quiet-probe", { from: "running", to: "podium" });
      recordDiagEvent("ko", "quiet-probe", { slot: 2 });
      await flush();
      const noisy = posts.filter((p) => String(p.envelope.body).includes("quiet-probe"));
      expect(noisy).toHaveLength(0);
    });

    it("does not upload when the hub was never installed (the ?diag=1 gate)", async () => {
      // * The gate is structural, not a flag: no install -> no apiRef -> no auto-capture,
      // * so ordinary players never upload. If a future change installs the hub
      // * unconditionally, this test is what fails.
      __resetDiagnosticsForTest();
      recordDiagEvent("assert", "uninstalled-probe", { from: "podium", to: "running" });
      await flush();
      expect(postsFor("uninstalled-probe")).toHaveLength(0);
    });

    it("survives an upload failure without losing the in-memory capture", async () => {
      globalThis.fetch = async () => {
        throw new Error("offline");
      };
      recordDiagEvent("error", "fatal", { message: "boom" });
      await flush();
      // * Evidence collection must never break the app it observes, and the local copy
      // * remains the fallback when the network is gone.
      expect(window.__ccDiag.captures()).toHaveLength(1);
    });
  });
});

describe("diagUrlFlags", () => {
  it("enables on ?diag / ?diag=1 and stays off otherwise", () => {
    expect(diagUrlFlags("?diag").enabled).toBe(true);
    expect(diagUrlFlags("?diag=1").enabled).toBe(true);
    expect(diagUrlFlags("?diag=0").enabled).toBe(false);
    expect(diagUrlFlags("?diag=off").enabled).toBe(false);
    expect(diagUrlFlags("?nettest=1").enabled).toBe(false);
    expect(diagUrlFlags("").enabled).toBe(false);
  });
});
