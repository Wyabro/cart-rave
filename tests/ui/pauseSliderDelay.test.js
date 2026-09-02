// @vitest-environment happy-dom
// PAUSE-SLIDER-DELAY-1: pause AUDIO sliders must be visible on first panel paint.
//
// WHAT THIS CANNOT SEE — read before trusting a green run:
//   ▸ It never boots the game or paints a real Esc overlay over a frozen arena.
//   ▸ Parent panel still fades 0→1 over 300 ms; this only proves the body cards
//     are not themselves opacity-0 / stagger-revealed.
// The real verdict is PAUSE-SLIDER-DELAY-PT-1 (Esc mid-solo: sliders lag the panel?).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hide,
  init as initPauseOverlay,
  show,
} from "../../src/ui/pauseOverlay.js";

const overlaySrc = readFileSync(resolve(process.cwd(), "src/ui/pauseOverlay.js"), "utf8");

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** @param {Record<string, any>} refs */
function audioSection(refs) {
  return refs.escSections.find((s) => s.classList.contains("esc-section--audio"));
}

/** @param {HTMLElement | undefined} section */
function volLabels(section) {
  return [...(section?.querySelectorAll(".esc-vol-label") ?? [])].map((el) => el.textContent);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("PAUSE-SLIDER-DELAY-1 pause sliders on first panel paint", () => {
  it("resetEscOverlayAnimState snaps body cards to visible, not opacity 0", () => {
    const resetSrc = sliceBetween(
      overlaySrc,
      "function resetEscOverlayAnimState",
      "function animateEscOverlayShow",
    );
    const sectionLoop = sliceBetween(
      resetSrc,
      "for (const section of elements.escSections)",
      "// * Opacity ONLY on the action slabs",
    );
    expect(sectionLoop).toMatch(/section\.style\.opacity = "1"/);
    expect(sectionLoop).not.toMatch(/opacity = "0"/);
    expect(sectionLoop).toMatch(/section\.style\.transform = ""/);
  });

  it("non-reduced show path does not stagger-reveal escSections", () => {
    const motionSrc = sliceBetween(
      overlaySrc,
      "if (backdrop) fadeIn(backdrop",
      "function syncPostFxButtonState",
    );
    expect(motionSrc).not.toMatch(/escSections/);
    expect(motionSrc).not.toMatch(/animateMenuReveal\(\s*section/);
    expect(motionSrc).not.toMatch(/fadeIn\(\s*section/);
  });

  it("show() paints AUDIO sliders at opacity 1 before and after the 16 ms timer", () => {
    vi.useFakeTimers();
    const refs = initPauseOverlay({});
    const audio = audioSection(refs);
    expect(audio).toBeTruthy();
    expect(volLabels(audio)).toEqual(["MUSIC", "SFX", "VOICE"]);
    expect(audio.querySelectorAll('[role="slider"]')).toHaveLength(3);

    show();
    expect(audio.style.opacity).toBe("1");

    vi.advanceTimersByTime(16);
    expect(audio.style.opacity).toBe("1");
  });

  it("hide then show still leaves AUDIO at opacity 1 after the 16 ms timer", () => {
    vi.useFakeTimers();
    const refs = initPauseOverlay({});
    const audio = audioSection(refs);

    show();
    vi.advanceTimersByTime(16);
    hide();
    show();
    expect(audio.style.opacity).toBe("1");
    vi.advanceTimersByTime(16);
    expect(audio.style.opacity).toBe("1");
  });
});
