import { describe, expect, it, vi } from "vitest";
import { applyPauseInputLifecycle } from "../../src/orchestration/pauseInputLifecycle.js";

function deps(overrides = {}) {
  return {
    open: true,
    mode: "solo",
    localCart: { id: "local" },
    setUiActive: vi.fn(),
    stopChargeSfxForCart: vi.fn(),
    stopAllChargeSfx: vi.fn(),
    ...overrides,
  };
}

describe("pause input lifecycle", () => {
  it.each(["solo", "testdrive"])("enters UI mode and stops every frozen charge in %s", (mode) => {
    const state = deps({ mode });
    applyPauseInputLifecycle(state);
    expect(state.setUiActive).toHaveBeenCalledWith(true);
    expect(state.stopAllChargeSfx).toHaveBeenCalledOnce();
    expect(state.stopChargeSfxForCart).not.toHaveBeenCalled();
  });

  it("stops only the local charge during online pause", () => {
    const state = deps({ mode: "quickplay" });
    applyPauseInputLifecycle(state);
    expect(state.setUiActive).toHaveBeenCalledWith(true);
    expect(state.stopChargeSfxForCart).toHaveBeenCalledWith(state.localCart);
    expect(state.stopAllChargeSfx).not.toHaveBeenCalled();
  });

  it("restores gameplay ownership without changing charge state on resume", () => {
    const state = deps({ open: false });
    applyPauseInputLifecycle(state);
    expect(state.setUiActive).toHaveBeenCalledWith(false);
    expect(state.stopChargeSfxForCart).not.toHaveBeenCalled();
    expect(state.stopAllChargeSfx).not.toHaveBeenCalled();
  });
});
