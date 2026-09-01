// @vitest-environment happy-dom
// SOFTGL-DISMISS-1: PLAY ANYWAY stamps a per-tab session flag so the software-GL
// modal does not return on reload / context-restore reload.
//
// WHAT THIS CANNOT SEE — read before trusting a green run:
//   ▸ It never boots createRenderer or paints #cr-softgl-notice.
//   ▸ It cannot prove isSoftwareRendererActive() on a live SwiftShader context.
//   ▸ A refactor that keeps the sessionGet/sessionSet strings but wires them to
//     the wrong boot path still passes here.
// The real verdict is SOFTGL-DISMISS-PT-1 (`npm run dev:local` + ?forcegpu=sw).

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SESSION_KEYS,
  sessionGet,
  sessionSet,
  sessionRemove,
} from "../../src/utils/storage.js";

const main = readFileSync(resolve(process.cwd(), "src/main.js"), "utf8");

const WRITE = /sessionSet\(\s*SESSION_KEYS\.softGlDismissed/;
const READ = /sessionGet\(\s*SESSION_KEYS\.softGlDismissed/;

function noticeBlock(src) {
  const start = src.indexOf("Software-WebGL notice");
  const marker = "document.body.appendChild(backdrop);";
  const end = src.indexOf(marker, start);
  expect(start, "software-GL notice comment missing").toBeGreaterThan(-1);
  expect(end, "notice append missing").toBeGreaterThan(start);
  return src.slice(start, end + marker.length);
}

beforeEach(() => {
  sessionRemove(SESSION_KEYS.softGlDismissed);
});

describe("SOFTGL-DISMISS-1 — software-GL modal is one-shot per tab", () => {
  it("registers a session key, not a persistent key", () => {
    expect(SESSION_KEYS.softGlDismissed).toBe("cartRaveSoftGlDismissed");
  });

  it("round-trips the dismissed flag through sessionStorage", () => {
    expect(sessionGet(SESSION_KEYS.softGlDismissed)).toBe(null);
    expect(sessionSet(SESSION_KEYS.softGlDismissed, "1")).toBe(true);
    expect(sessionGet(SESSION_KEYS.softGlDismissed)).toBe("1");
  });

  it("gates the notice on software GL and an unread session flag", () => {
    const block = noticeBlock(main);
    expect(block).toMatch(
      /if \(isSoftwareRendererActive\(\) && sessionGet\(SESSION_KEYS\.softGlDismissed\) !== "1"\)/,
    );
    expect(block).toMatch(READ);
  });

  it("does not stamp the flag while creating the notice", () => {
    const block = noticeBlock(main);
    const clickAt = block.indexOf('addEventListener("click"');
    expect(clickAt, "PLAY ANYWAY click handler missing").toBeGreaterThan(-1);
    expect(block.slice(0, clickAt)).not.toMatch(WRITE);
  });

  it("PLAY ANYWAY writes the flag before it removes the backdrop", () => {
    const block = noticeBlock(main);
    const clickAt = block.indexOf('addEventListener("click"');
    const click = block.slice(clickAt);
    const write = click.search(WRITE);
    const remove = click.indexOf("backdrop.remove()");
    expect(write, "click handler does not sessionSet").toBeGreaterThan(-1);
    expect(remove, "click handler does not remove the backdrop").toBeGreaterThan(-1);
    expect(write).toBeLessThan(remove);
  });
});
