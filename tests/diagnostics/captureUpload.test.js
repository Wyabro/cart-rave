import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveDefaultLabel, menuReturnHref, uploadCaptureBundle } from "../../src/utils/captureUpload.js";

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
    const body = JSON.parse(init.body);
    expect(body.label).toBe("run7-A-host");
    expect(typeof body.body).toBe("string");
    expect(JSON.parse(body.body).phase).toBe("lobby");
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
