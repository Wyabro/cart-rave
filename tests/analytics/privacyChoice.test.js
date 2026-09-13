// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const html = readFileSync("index.html", "utf8");
const loader = html.match(/<script id="cc-analytics-loader">([\s\S]*?)<\/script>/)[1];
const page = readFileSync("public/privacy/index.html", "utf8");
const choice = readFileSync("public/privacy-choice.js", "utf8");
const run = (source) => new Function(source)();

beforeEach(() => {
  window.happyDOM.settings.disableJavaScriptFileLoading = true;
  window.happyDOM.settings.disableCSSFileLoading = true;
  window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("privacy choice and optional provider loading", () => {
  it("loads both external providers by default", () => {
    run(loader);
    expect([...document.head.querySelectorAll("script")].map(s => s.src)).toEqual([
      "https://static.cloudflareinsights.com/beacon.min.js",
      "https://api.glitch.fun/js/game-analytics.js",
    ]);
  });
  it.each(["off", "0", "false"])("does not load either provider for analytics=%s", value => {
    window.history.replaceState({}, "", `/?analytics=${value}`);
    run(loader);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);
  });
  it("saves off, blocks providers on the next load, and can save on again", () => {
    document.body.innerHTML = page;
    run(choice);
    const button = document.getElementById("analytics-toggle");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    button.click();
    expect(localStorage.getItem("cartRaveAnalytics")).toBe("off");
    expect(document.getElementById("return-to-game").getAttribute("href")).toBe("/?analytics=off");
    run(loader);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);
    button.click();
    expect(localStorage.getItem("cartRaveAnalytics")).toBe("on");
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });
  it("shows a saved off choice when revisiting privacy", () => {
    localStorage.setItem("cartRaveAnalytics", "off");
    document.body.innerHTML = page;
    run(choice);
    expect(document.getElementById("analytics-toggle").getAttribute("aria-pressed")).toBe("false");
  });
  it("provides a working off link without claiming a save when storage is blocked", () => {
    document.body.innerHTML = page;
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("blocked"); } });
    run(choice);
    document.getElementById("analytics-toggle").click();
    expect(document.getElementById("analytics-status").textContent).toContain("could not save");
    expect(document.getElementById("return-to-game").getAttribute("href")).toBe("/?analytics=off");
  });
});
