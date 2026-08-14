/**
 * FIX-F8CAP: the freshness probe is advisory — F8 awaits it before assembling anything,
 * so a hung `/` fetch used to mean the capture produced nothing at all. It must abort.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { refreshBuildFreshness } from "../../src/utils/buildFreshness.js";

describe("refreshBuildFreshness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("aborts a hung freshness fetch instead of hanging the caller", async () => {
    vi.useFakeTimers();
    let sawSignal = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            sawSignal = init?.signal ?? null;
            // * Never settles on its own — only the AbortController can end this.
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );

    const pending = refreshBuildFreshness();
    expect(sawSignal).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2500);

    const result = await pending;
    expect(result.checked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.live).toBeNull();
  });

  it("resolves with the live bundle hash on a normal response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => `<script type="module" src="/assets/index-AbCdEf12.js"></script>`,
      })),
    );
    const result = await refreshBuildFreshness();
    expect(result.checked).toBe(true);
    expect(result.live).toBe("AbCdEf12");
  });
});
