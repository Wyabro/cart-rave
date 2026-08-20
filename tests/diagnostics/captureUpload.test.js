import { gunzipSync } from "node:zlib";
import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveDefaultLabel, menuReturnHref, uploadCaptureBundle } from "../../src/utils/captureUpload.js";

function readUploadedBundle(init) {
  const envelope = JSON.parse(init.body);
  if (envelope.encoding === "gzip-base64") {
    const json = gunzipSync(Buffer.from(envelope.body, "base64")).toString("utf8");
    return { envelope, bundle: JSON.parse(json) };
  }
  return { envelope, bundle: JSON.parse(envelope.body) };
}

describe("deriveDefaultLabel", () => {
  it("builds phase-role-tier", () => {
    expect(
      deriveDefaultLabel({
        phase: "running",
        snapshot: {
          net: { isHost: false },
          runtime: { qualityTier: "low" },
        },
      }),
    ).toBe("running-nonhost-low");
  });

  it("falls back safely", () => {
    expect(deriveDefaultLabel({})).toBe("nophase-role?-tier?");
  });
});

describe("uploadCaptureBundle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs an envelope and returns the server id", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, id: 17 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadCaptureBundle(
      { phase: "lobby", events: [], snapshot: { net: { isHost: true }, runtime: { qualityTier: "high" } } },
      { label: "run7-A-host" },
    );
    expect(result).toEqual({ ok: true, id: 17 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/captures");
    expect(init.method).toBe("POST");
    const { envelope, bundle } = readUploadedBundle(init);
    expect(envelope.label).toBe("run7-A-host");
    expect(envelope.encoding).toBe("gzip-base64");
    expect(bundle.phase).toBe("lobby");
  });

  it("gzip envelope stays under the Worker request cap for a 2.5 MB timeline bundle", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, id: 9 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const bulky = {
      phase: "running",
      events: Array.from({ length: 170 }, (_unused, i) => ({
        ch: "cart_pop",
        seq: i,
        supportTimeline: Array.from({ length: 60 }, (_s, t) => ({
          t, y: 0.375, radius: 15.8, vy: 0, recordPairs: 3, supportPairs: 1, supportPoints: 5,
        })),
      })),
    };
    await uploadCaptureBundle(bulky, { label: "wave-g" });
    const raw = fetchMock.mock.calls[0][1].body;
    expect(raw.length).toBeLessThan(350_000);
    const { envelope, bundle } = readUploadedBundle(fetchMock.mock.calls[0][1]);
    expect(envelope.encoding).toBe("gzip-base64");
    expect(bundle.events).toHaveLength(170);
    expect(bundle.events[0].supportTimeline).toHaveLength(60);
  });

  it("surfaces http failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ ok: false, error: "no_binding" }),
      })),
    );
    const result = await uploadCaptureBundle({ phase: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no_binding");
  });

  it("reports http_<status> when the Worker body is unparseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 413,
        json: async () => {
          throw new Error("not json");
        },
      })),
    );
    const result = await uploadCaptureBundle({ phase: "x" });
    expect(result).toEqual({ ok: false, error: "http_413" });
  });

  it("never sets keepalive (Chrome's 64 KiB cap silently dropped big bundles)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, id: 1 }) }));
    vi.stubGlobal("fetch", fetchMock);
    await uploadCaptureBundle({ phase: "lobby" });
    expect(fetchMock.mock.calls[0][1].keepalive).toBeUndefined();
  });
});

describe("menuReturnHref", () => {
  it("carries diag and captureLabel", () => {
    expect(menuReturnHref("https://x.dev/play?diag=1&captureLabel=run9-A")).toBe(
      "/play?diag=1&captureLabel=run9-A",
    );
  });

  it("keeps a bare ?diag flag", () => {
    expect(menuReturnHref("https://x.dev/?diag")).toBe("/?diag=");
  });

  it("never reattaches room (rejoin ghosts)", () => {
    expect(menuReturnHref("https://x.dev/?room=ABCD&diag=1")).toBe("/?diag=1");
    expect(menuReturnHref("https://x.dev/?room=ABCD")).toBe("/");
  });

  it("drops unrelated params and returns a bare pathname", () => {
    expect(menuReturnHref("https://x.dev/lobby?preset=low#frag")).toBe("/lobby");
  });

  it("falls back to the input on a malformed href", () => {
    expect(menuReturnHref("not a url")).toBe("not a url");
  });
});
